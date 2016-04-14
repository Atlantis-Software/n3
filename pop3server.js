'use strict';
const States = require('./states');
const crypto = require('crypto');

function md5(str) {
    const hash = crypto.createHash('md5');
    hash.update(str);
    return hash.digest("hex").toLowerCase();
}

/**
 * new POP3Server(socket, server_name, auth, MsgStore)
 *
 * Creates a dedicated pop3 instance for every separate connection. Run by
 * N3.createInstance after a user tries to connect to the selected port.
 * @constructor
 **/
function POP3Server(socket, server_name, auth, MsgStore, N3) {
    this.server_name = server_name || N3.server_name;
    this.socket = socket;
    this.state = States.AUTHENTICATION;
    this.connection_id = ++N3.COUNTER;
    this.UID = this.connection_id + "." + (+new Date());
    this.authCallback = auth;
    // once we have the user name, this will be instantiated to `this.store`
    this.MsgStore = MsgStore;
    this.connection_secured = false;
    this.N3 = N3;

    // Copy N3 capabilities info into the current object
    this.capabilities = {
        1: Object.create(N3.capabilities[1]),
        2: Object.create(N3.capabilities[2]),
        3: Object.create(N3.capabilities[3])
    };

    debug('connection ' + this.connection_id, socket.remoteAddress);
    this.response("+OK POP3 Server ready <" + this.UID + "@" + this.server_name + ">");

    socket.on("data", this.onData.bind(this));
    socket.on("end", this.onEnd.bind(this));
}

/**
 * POP3Server#destroy() -> undefined
 *
 * Clears the used variables just in case (garbage collector should
 * do this by itself)
 **/
POP3Server.prototype.destroy = function destroy() {
    debug('destroying connection', this.user);
    if (this.timer) {
        clearTimeout(this.timer);
    }
    this.timer = null;

    if (this.socket && this.socket.end) {
        this.socket.end();
    }

    if (connected_users[this.user]) {
        delete this.N3.connected_users[this.user];
    }
}

// kill client after inactivity
POP3Server.prototype.updateTimeout = function () {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout((function () {
        if (!this.socket)
            return;
        if (this.state == States.TRANSACTION) {
            this.state = States.UPDATE;
        }
        debug("Connection closed for client inactivity", this.user);
        this.destroy();
    }).bind(this), TEN_MINUTES);
}

POP3Server.prototype.response = function response(message) {
    let resBuffer;
    if (message.toString) {
        message = message.toString();
    }
    if (typeof message == "string") {
        resBuffer = new Buffer(message + "\r\n", "utf-8");
    } else {
        resBuffer = Buffer.concat([message, new Buffer("\r\n", "utf-8")]);
    }

    this.socket.write(resBuffer);
}

POP3Server.prototype.afterLogin = function () {
    if (this.user && this.N3.connected_users[this.user]) {
        return "-ERR [IN-USE] You already have a POP session running";
    }

    if (this.user) {
        this.store = new this.MsgStore(this.user);
        this.N3.connected_users[this.user.trim().toLowerCase()] = true;
        return true;
    }
    return false;
}

POP3Server.prototype.onData = function (data) {
    const request = data.toString("ascii", 0, data.length);
    this.onCommand(request);
}

POP3Server.prototype.onEnd = function (data) {
    if (this.state === null)
        return;
    this.state = States.UPDATE;
    if (this.user) {
        debug('closing connection', this.user);
    }
    if (this.user && this.N3.connected_users[this.user]) {
        delete this.N3.connected_users[this.user];
    }
    this.destroy();
}

POP3Server.prototype.onCommand = function (request) {
    const cmd = request.match(/^[A-Za-z]+/);
    let params = cmd && request.substr(cmd[0].length + 1);

    debug('onCommand', cmd);

    this.updateTimeout();

    if (this.authState) {
        params = request.trim();
        return this.cmdAUTHNext(params);
    }

    if (!cmd) {
        return this.response("-ERR");
    }

    if (typeof this["cmd" + cmd[0].toUpperCase()] == "function") {
        return this["cmd" + cmd[0].toUpperCase()](params && params.trim());
    }

    this.response("-ERR");
}

// Universal commands

// CAPA - Reveals server capabilities to the client
POP3Server.prototype.cmdCAPA = function (params) {

    if (params && params.length) {
        return this.response("-ERR Try: CAPA");
    }

    params = (params || "").split(" ");
    this.response("+OK Capability list follows");
    for (var i = 0; i < this.capabilities[this.state].length; i++) {
        this.response(this.capabilities[this.state][i]);
    }
    if (this.N3.authMethods) {
        var methods = [];
        for (var i in this.N3.authMethods) {
            if (this.N3.authMethods.hasOwnProperty(i))
                methods.push(i);
        }
        if (methods.length && this.state == States.AUTHENTICATION)
            this.response("SASL " + methods.join(" "));
    }
    this.response(".");
}

// QUIT - Closes the connection
POP3Server.prototype.cmdQUIT = function () {
    if (this.state == States.TRANSACTION) {
        this.state = States.UPDATE;
        this.store.removeDeleted();
    }
    this.response("+OK N3 POP3 Server signing off");
    this.socket.end();
}

// AUTHENTICATION commands

// AUTH auth_engine - initiates an authentication request
POP3Server.prototype.cmdAUTH = function (auth) {
    if (this.state != States.AUTHENTICATION) return this.response("-ERR Only allowed in authentication mode");

    if (!auth)
        return this.response("-ERR Invalid authentication method");

    var parts = auth.split(" "),
        method = parts.shift().toUpperCase().trim(),
        params = parts.join(" "),
        response;

    this.authObj = {
        wait: false,
        params: params,
        history: [],
        check: this.cmdAUTHCheck.bind(this),
        n3: this
    };

    // check if the asked auth methid exists and if so, then run it for the first time
    if (typeof this.N3.authMethods[method] == "function") {
        response = this.N3.authMethods[method](this.authObj);
        if (response) {
            if (this.authObj.wait) {
                this.authState = method;
                this.authObj.history.push(params);
            } else if (response === true) {
                response = this.cmdDoAUTH();
            }
            this.response(response);
        } else {
            this.authObj = false;
            this.response("-ERR [AUTH] Invalid authentication");
        }
    } else {
        this.authObj = false;
        this.response("-ERR Unrecognized authentication type");
    }
}

/**
 * [cmdDoAUTH description]
 * @return {string} response
 */
POP3Server.prototype.cmdDoAUTH = function () {
    this.user = this.authObj.user.trim().toLowerCase();
    const isAfterLogin = this.afterLogin();
    if (typeof isAfterLogin === 'string') {
        return isAfterLogin;
    }
    if (isAfterLogin === true) {
        this.state = States.TRANSACTION;
        return '+OK You are now logged in';
    }
    this.authState = false;
    this.authObj = false;
    return '-ERR [SYS] Error with initializing';
}

POP3Server.prototype.cmdAUTHNext = function (params) {
    if (this.state != States.AUTHENTICATION) return this.response("-ERR Only allowed in authentication mode");
    this.authObj.wait = false;
    this.authObj.params = params;
    this.authObj.n3 = this;
    var response = this.N3.authMethods[this.authState](this.authObj);
    if (!response) {
        this.authState = false;
        this.authObj = false;
        return this.response("-ERR [AUTH] Invalid authentication");
    }
    if (this.authObj.wait) {
        this.authObj.history.push(params);
    } else if (response === true) {
        response = this.cmdDoAUTH();
    }
    this.response(response);
}

POP3Server.prototype.cmdAUTHCheck = function (user, passFn) {
    if (user) this.authObj.user = user;
    if (typeof this.authCallback == "function") {
        if (typeof passFn == "function")
            return !!this.authCallback(user, passFn);
        else if (typeof passFn == "string" || typeof passFn == "number")
            return !!this.authCallback(user, function (pass) {
                return pass == passFn
            });
        else return false;
    }
    return true;
}

// APOP username hash - Performs an APOP authentication
// http://www.faqs.org/rfcs/rfc1939.html #7

// USAGE:
//   CLIENT: APOP user MD5(salt+pass)
//   SERVER: +OK You are now logged in
POP3Server.prototype.cmdAPOP = function (params) {
    params = params.split(" ");
    var self = this;
    var user = params[0] && params[0].trim();
    var hash = params[1] && params[1].trim().toLowerCase();
    var salt = "<" + self.UID + "@" + self.server_name + ">";
    var response;

    function handle() {
        if ((response = self.afterLogin()) !== true) {
            self.response(response || "-ERR [SYS] Error with initializing");
            return;
        }
        self.user = user;
        self.state = States.TRANSACTION;
        self.response("+OK You are now logged in");
    }

    if (self.state != States.AUTHENTICATION) {
        self.response("-ERR Only allowed in authentication mode");
        return;
    }

    if (typeof self.authCallback == "function") {
        self.authCallback(user, function (foundPassword) {
            if (md5(salt + foundPassword) != hash)
                return self.response("-ERR [AUTH] Invalid login");
        })
        handle();
        return;
    }
    handle();
}

// USER username - Performs basic authentication, PASS follows
POP3Server.prototype.cmdUSER = function (username) {
    if (this.state != States.AUTHENTICATION) {
        return this.response("-ERR Only allowed in authentication mode");
    }

    this.user = username.trim().toLowerCase();
    if (!this.user) {
        return this.response("-ERR User not set, try: USER <username>");
    }

    return this.response("+OK User accepted");
}

// PASS - Performs basic authentication, runs after USER
POP3Server.prototype.cmdPASS = function (password) {
    var self = this;

    function handle() {
        if ((response = self.afterLogin()) === true) {
            self.state = States.TRANSACTION;
            return self.response("+OK You are now logged in");
        } else {
            return self.response(response || "-ERR [SYS] Error with initializing");
        }
    }

    if (self.state != States.AUTHENTICATION) return self.response("-ERR Only allowed in authentication mode");
    if (!self.user) return self.response("-ERR USER not yet set");

    if (typeof self.authCallback == "function") {
        self.authCallback(self.user, function (foundPassword) {
            if (foundPassword !== password) {
                this.response("-ERR [AUTH] Invalid login");
                delete self.user;
                return;
            }
            handle();
        });
        return;
    }

    handle();
}

// TRANSACTION commands

// NOOP - always responds with +OK
POP3Server.prototype.cmdNOOP = function () {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");
    this.response("+OK");
}

// STAT Lists the total count and bytesize of the messages
POP3Server.prototype.cmdSTAT = function () {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");

    var self = this;

    function stat() {
        self.store.stat((function (err, length, size) {
            if (err) {
                self.response("-ERR STAT failed")
            } else {
                self.response("+OK " + length + " " + size);
            }
        }).bind(self));
    }

    if (!self.store.didLoadHook) {
        self.store.onLoadHook = stat;
    } else {
        stat();
    }
}

// LIST [msg] lists all messages
POP3Server.prototype.cmdLIST = function (msg) {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");

    var self = this;

    function list() {
        self.store.list(msg, (function (err, list) {
            if (err) {
                return self.response("-ERR LIST command failed")
            }
            if (!list) {
                return self.response("-ERR Invalid message ID");
            }

            if (typeof list == "string") {
                self.response("+OK " + list);
            } else {
                self.response("+OK");
                for (var i = 0; i < list.length; i++) {
                    self.response(list[i]);
                }
                self.response(".");
            }
        }).bind(self));
    }

    if (!self.store.didLoadHook) {
        self.store.onLoadHook = list;
    } else {
        list();
    }
}

// UIDL - lists unique identifiers for stored messages
POP3Server.prototype.cmdUIDL = function (msg) {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");

    this.store.uidl(msg, (function (err, list) {
        if (err) {
            return this.response("-ERR UIDL command failed")
        }

        if (!list)
            return this.response("-ERR Invalid message ID");

        if (typeof list == "string") {
            this.response("+OK " + list);
        } else {
            this.response("+OK");
            for (var i = 0; i < list.length; i++) {
                this.response(list[i]);
            }
            this.response(".");
        }
    }).bind(this));
}

// RETR msg - outputs a selected message
POP3Server.prototype.cmdRETR = function (msg) {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");

    this.store.retr(msg, (function (err, message) {
        if (err) {
            return this.response("-ERR RETR command failed")
        }
        if (!message) {
            return this.response("-ERR Invalid message ID");
        }
        this.response("+OK " + message.length + " octets");
        this.response(message);
        this.response(".");
    }).bind(this));

}

// DELE msg - marks selected message for deletion
POP3Server.prototype.cmdDELE = function (msg) {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");

    this.store.dele(msg, (function (err, success) {
        if (err) {
            return this.response("-ERR RETR command failed")
        }
        if (!success) {
            return this.response("-ERR Invalid message ID");
        } else {
            this.response("+OK msg deleted");
        }
    }).bind(this));

}

// RSET - resets DELE'ted message flags
POP3Server.prototype.cmdRSET = function () {
    if (this.state != States.TRANSACTION) return this.response("-ERR Only allowed in transaction mode");
    this.store.rset();
    this.response("+OK");
}
