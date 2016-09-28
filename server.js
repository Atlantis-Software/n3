'use strict';
const States = require('./states');
const crypto = require('crypto');
const debug = require('debug')('pop3-server');
const os = require('os')
const net = require('net');
const tls = require('tls');
var MessageStore = require("./messagestore");
var POP3Connnection = require("./connection");
var SASL = require("./sasl");


function md5(str) {
    const hash = crypto.createHash('md5');
    hash.update(str);
    return hash.digest("hex").toLowerCase();
}

var POP3Server = module.exports = function(options) {
    var self = this;
    this.options = options = options || {};
    this.server_name = options.serverName || os.hostname() || 'localhost';
    this.COUNTER = 0;
    this.connected_users = {};

    this.authMethods = SASL.AUTHMethods;

    Object.keys(options.authMethods || {}).forEach(function(k){
        self.authMethods[k] = options.authMethods[k];
    });

    this.authCallback = options.auth || function(checkFn) { checkFn(); };

    // once we have the user name, this will be instantiated to `this.store`
    this.MsgStore = MessageStore;
    if (options.store) {
        if (options.store.register) {
            this.MsgStore.prototype.register = options.store.register;
        }
        if (options.store.read) {
            this.MsgStore.prototype.read = options.store.read;
        }
        if (options.store.removeDeleted) {
            this.MsgStore.prototype.removeDeleted = options.store.removeDeleted;
        }                
    }

    this.connection_secured = false;
    this.tlsOptions = 
    this.capabilities = {
        // AUTHENTICATION
        1: ["UIDL", "USER", "RESP-CODES", "AUTH-RESP-CODE"],
        // TRANSACTION
        2: ["UIDL", "EXPIRE NEVER", "LOGIN-DELAY 0", "IMPLEMENTATION node.js POP3 server"],
        // UPDATE
        3: []
    };
};

POP3Server.prototype.listen = function(port, callback){
    var self = this;
    this.socket = net.createServer(function(socket){
      var connection_id = ++self.COUNTER;
      var cnx = new POP3Connnection(self, socket, connection_id);
      socket.on('data', function (data) {
          self.onData(cnx, data);
      });
      socket.on('end', function (data) {
          self.onEnd(cnx, data);
      });
      socket.on('error', function (err) {
          self.onError(cnx, err);
      });
    }).listen(port, callback);
};

POP3Server.prototype.afterLogin = function (connection, callback) {
    var self = this;

    if (connection.user && this.connected_users[connection.user]) {
        return callback(null, "-ERR [IN-USE] You already have a POP session running");
    }

    if (connection.user) {
        connection.store = new this.MsgStore(connection);
        connection.store.register(function(err) {
            if (err) {
                return callback(err);
            }
            self.connected_users[connection.user.trim().toLowerCase()] = true;
            return callback(null, true);
        });
    } else {
        callback(new Error('no user'));
    }
};

POP3Server.prototype.onData = function (connection, data) {
    const request = data.toString("ascii", 0, data.length);
    this.onCommand(connection, request);
};

POP3Server.prototype.onEnd = function (connection, data) {
    if (connection.state === null) {
        return;
    }
    connection.state = States.UPDATE;
    connection.destroy();
};

POP3Server.prototype.onError = function (connection, err) {
    debug('socket error', connection.user, err.message);
    connection.destroy();
};

POP3Server.prototype.onCommand = function (connection, request) {
    const cmd = request.match(/^[A-Za-z]+/);
    let params = cmd && request.substr(cmd[0].length + 1);

    debug('onCommand', cmd, 'authState=', connection.authState);

    connection.updateTimeout();

    if (connection.authState) {
        params = request.trim();
        return this.cmdAUTHNext(connection, params);
    }

    if (!cmd) {
        return connection.response("-ERR");
    }

    if (typeof this["cmd" + cmd[0].toUpperCase()] == "function") {
        return this["cmd" + cmd[0].toUpperCase()](connection, params && params.trim());
    }

    connection.response("-ERR");
}

// Universal commands

// CAPA - Reveals server capabilities to the client
POP3Server.prototype.cmdCAPA = function (connection, params) {

    if (params && params.length) {
        return connection.response("-ERR Try: CAPA");
    }

    params = (params || "").split(" ");
    connection.response("+OK Capability list follows");
    for (var i = 0; i < this.capabilities[connection.state].length; i++) {
        connection.response(this.capabilities[connection.state][i]);
    }
    if (this.authMethods) {
        var methods = [];
        for (var i in this.authMethods) {
            if (this.authMethods.hasOwnProperty(i))
                methods.push(i);
        }
        if (methods.length && connection.state == States.AUTHENTICATION)
            connection.response("SASL " + methods.join(" "));
    }
    connection.response(".");
}

// QUIT - Closes the connection
POP3Server.prototype.cmdQUIT = function (connection) {
    var end = function() {
        connection.response("+OK POP3 Server signing off");
        connection.socket.end();
    };
    if (connection.state == States.TRANSACTION) {
        connection.state = States.UPDATE;
        var deleted = [];
        connection.store.messages.forEach(function(msg) {
            if (msg.deleted) {
                deleted.push(msg.uid);
            }
        });
        connection.store.removeDeleted(deleted, end);
    } else {
        end();
    }
}

POP3Server.prototype.cmdSTLS = function (connection) {
    var self = this;

    if (connection.state != States.AUTHENTICATION) {
      return connection.response("-ERR Only allowed in authentication mode");
    }
    if (!this.options.tls) {
      return connection.response("-ERR invalid command");
    }
    connection.response("+OK begin TLS negotiation");
    connection.socket.removeAllListeners();
    var socketOptions = {
      secureContext: tls.createSecureContext(self.options.tls),
      isServer: true
    };
    connection.socket = new tls.TLSSocket(connection.socket, socketOptions);

    connection.socket.on('secure', function () {
      connection.socket.on('data', function (data) {
          self.onData(connection, data);
      });
      connection.socket.on('end', function (data) {
          self.onEnd(connection, data);
      });
      connection.socket.on('error', function (err) {
          self.onError(connection, err);
      });
    });
}

// AUTHENTICATION commands

// AUTH auth_engine - initiates an authentication request
POP3Server.prototype.cmdAUTH = function (connection, auth) {
    if (connection.state != States.AUTHENTICATION) {
        return connection.response("-ERR Only allowed in authentication mode");
    }

    if (!auth) {
        return connection.response("-ERR Invalid authentication method");
    }

    var parts = auth.split(" ");
    var method = parts.shift().toUpperCase().trim();
    var params = parts.join(" ");
    var response;

    connection.authObj = {
        wait: false,
        params: params,
        history: [],
        connection: connection,
        check: this.cmdAUTHCheck.bind(this)
    };

    // check if the asked auth methid exists and if so, then run it for the first time
    if (typeof this.authMethods[method] == "function") {
        response = this.authMethods[method](connection.authObj);
        if (response) {
            if (connection.authObj.wait) {
                connection.authState = method;
                connection.authObj.history.push(params);
            } else if (response === true) {
                return this.cmdDoAUTH(connection);
            }
            connection.response(response);
        } else {
            connection.authObj = false;
            connection.response("-ERR [AUTH] Invalid authentication");
        }
    } else {
        connection.authObj = false;
        connection.response("-ERR Unrecognized authentication type");
    }
}

/**
 * [cmdDoAUTH description]
 * @return {string} response
 */
POP3Server.prototype.cmdDoAUTH = function (connection) {
    connection.user = connection.authObj.user.trim().toLowerCase();
    connection.authState = false;
    connection.authObj = false;
    this.afterLogin(connection, function(err, isAfterLogin){
        if (err) {
            return connection.response('-ERR [SYS] Error with initializing');
        }
        if (isAfterLogin === true) {
            connection.state = States.TRANSACTION;
            return connection.response('+OK You are now logged in');
        }
        connection.response(isAfterLogin);
    });
}

POP3Server.prototype.cmdAUTHNext = function (connection, params) {
    if (connection.state != States.AUTHENTICATION) {
        return connection.response("-ERR Only allowed in authentication mode");
    }
    connection.authObj.wait = false;
    connection.authObj.params = params;
    debug('cmdAUTHNext', connection.authState, this.authObj);
    var response = this.authMethods[connection.authState](connection.authObj);
    if (!response) {
        connection.authState = false;
        connection.authObj = false;
        return connection.response("-ERR [AUTH] Invalid authentication");
    }
    if (connection.authObj.wait) {
        connection.authObj.history.push(params);
        connection.response(response);

    } else if (response === true) {
        this.cmdDoAUTH(connection);
    }
}

POP3Server.prototype.cmdAUTHCheck = function (user, passFn) {
    if (typeof this.authCallback == "function") {
        if (typeof passFn == "function") {
            return !!this.authCallback(user, passFn);
        } else if (typeof passFn == "string" || typeof passFn == "number") {
            return !!this.authCallback(user, function (pass) {
                return pass == passFn;
            });
        } else {
            return false;
        }
    }
    return true;
}

// APOP username hash - Performs an APOP authentication
// http://www.faqs.org/rfcs/rfc1939.html #7

// USAGE:
//   CLIENT: APOP user MD5(salt+pass)
//   SERVER: +OK You are now logged in
POP3Server.prototype.cmdAPOP = function (connection, params) {
    params = params.split(" ");
    var self = this;
    var user = params[0] && params[0].trim();
    var hash = params[1] && params[1].trim().toLowerCase();
    var salt = "<" + connection.UID + "@" + self.server_name + ">";
    var response;

    function handle() {
        self.afterLogin(connection, function(err, isAfterLogin) {
            if (err) {
                return connection.response("-ERR [SYS] Error with initializing");
            }
            if (isAfterLogin !== true) {
                return connection.response(response);
            }
            connection.user = user;
            connection.state = States.TRANSACTION;
            connection.response("+OK You are now logged in");
        });
    }

    if (connection.state != States.AUTHENTICATION) {
        connection.response("-ERR Only allowed in authentication mode");
        return;
    }

    if (typeof self.authCallback == "function") {
        self.authCallback(user, function (foundPassword) {
            if (md5(salt + foundPassword) != hash)
                return connection.response("-ERR [AUTH] Invalid login");
        })
        handle();
        return;
    }
    handle();
}

// USER username - Performs basic authentication, PASS follows
POP3Server.prototype.cmdUSER = function (connection, username) {
    if (connection.state != States.AUTHENTICATION) {
        return connection.response("-ERR Only allowed in authentication mode");
    }

    connection.user = username.trim().toLowerCase();
    if (!connection.user) {
        return connection.response("-ERR User not set, try: USER <username>");
    }

    return connection.response("+OK User accepted");
}

// PASS - Performs basic authentication, runs after USER
POP3Server.prototype.cmdPASS = function (connection, password) {
    var self = this;
    function handle() {
        let response;
        self.afterLogin(connection, function(err, response) {
            if (err) {
                return connection.response("-ERR [SYS] Error with initializing");
            }
            if (response === true) {
                connection.state = States.TRANSACTION;
                return connection.response("+OK You are now logged in");
            }
            connection.response(response);
        });
    }

    if (connection.state != States.AUTHENTICATION) {
        return connection.response("-ERR Only allowed in authentication mode");
    }
    if (!connection.user) {
        return connection.response("-ERR USER not yet set");
    }

    if (typeof self.authCallback == "function") {
        self.authCallback(connection.user, function (foundPassword) {
            if (foundPassword !== password) {
                connection.response("-ERR [AUTH] Invalid login");
                delete connection.user;
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
POP3Server.prototype.cmdNOOP = function (connection) {
    if (connection.state != States.TRANSACTION) {
        return connection.response("-ERR Only allowed in transaction mode");
    }
    connection.response("+OK");
}

// STAT Lists the total count and bytesize of the messages
POP3Server.prototype.cmdSTAT = function (connection) {
    if (connection.state != States.TRANSACTION) {
        return connection.response("-ERR Only allowed in transaction mode");
    }

    connection.store.stat(function(err, length, size) {
        if (err) {
            connection.response("-ERR STAT failed");
        } else {
            connection.response("+OK " + length + " " + size);
        }
    });
};

// LIST [msg] lists all messages
POP3Server.prototype.cmdLIST = function (connection, msg) {
    if (connection.state != States.TRANSACTION) {
        return connection.response("-ERR Only allowed in transaction mode");
    }

    connection.store.list(msg, function (err, list) {
        if (err) {
            debug('LIST failed internally', err);
            return connection.response("-ERR LIST command failed")
        }
        if (!list) {
            debug('LIST failed no message', msg);
            return connection.response("-ERR Invalid message ID");
        }

        if (typeof list == "string") {
            connection.response("+OK " + list);
        } else {
            connection.response("+OK");
            for (var i = 0; i < list.length; i++) {
                connection.response(list[i]);
            }
            connection.response(".");
        }
    });
};

// UIDL - lists unique identifiers for stored messages
POP3Server.prototype.cmdUIDL = function (connection, msg) {
    if (connection.state != States.TRANSACTION) {
        return connection.response("-ERR Only allowed in transaction mode");
    }

    connection.store.uidl(msg, (function (err, list) {
        if (err) {
            return connection.response("-ERR UIDL command failed")
        }

        if (!list)
            return connection.response("-ERR Invalid message ID", msg);

        if (typeof list == "string") {
            connection.response("+OK " + list);
        } else {
            connection.response("+OK");
            for (var i = 0; i < list.length; i++) {
                connection.response(list[i]);
            }
            connection.response(".");
        }
    }).bind(this));
}

// RETR msg - outputs a selected message
POP3Server.prototype.cmdRETR = function (connection, msg) {
    if (connection.state != States.TRANSACTION) {
        return connection.response("-ERR Only allowed in transaction mode");
    }

    connection.store.retr(msg, (function (err, message) {
        if (err) {
            return connection.response("-ERR RETR command failed")
        }
        if (!message) {
            return connection.response("-ERR Invalid message ID " + msg);
        }
        connection.response("+OK " + message.length + " octets");
        connection.response(message);
        connection.response(".");
    }).bind(this));

}

// DELE msg - marks selected message for deletion
POP3Server.prototype.cmdDELE = function (connection, msg) {
    if (connection.state != States.TRANSACTION) {
        return connection.response("-ERR Only allowed in transaction mode");
    }

    connection.store.dele(msg, (function (err, success) {
        if (err) {
            return connection.response("-ERR RETR command failed")
        }
        if (!success) {
            return connection.response("-ERR Invalid message ID " + msg);
        } else {
            connection.response("+OK msg deleted");
        }
    }).bind(this));

}

// RSET - resets DELE'ted message flags
POP3Server.prototype.cmdRSET = function (connection) {
    if (connection.state != States.TRANSACTION) return connection.response("-ERR Only allowed in transaction mode");
    connection.store.rset();
    connection.response("+OK");
}
