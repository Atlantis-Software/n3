'use strict';
const debug = require('debug')('pop3-connection');
const TEN_MINUTES = 10 * 60 * 1000;
const States = require('./states');

var POP3Connnection = module.exports = function(server, socket, connection_id) {
    debug('connection ' + connection_id, socket.remoteAddress);
    var self = this;
    this.socket = socket;
    this.server = server;
    this.connection_id = connection_id;
    this.state = States.AUTHENTICATION;
    this.UID = this.connection_id + "." + (+new Date());
    this.response("+OK POP3 Server ready <" + self.UID + "@" + self.server_name + ">");
}

POP3Connnection.prototype.response = function response(message) {
    let resBuffer;
    if (message.toString) {
        message = message.toString();
    }
    if (typeof message == "string") {
        debug('responding', this.user, message.substring(0, 60));
        resBuffer = new Buffer(message + "\r\n", "utf-8");
    } else {
        resBuffer = Buffer.concat([message, new Buffer("\r\n", "utf-8")]);
    }

    this.socket.write(resBuffer);
}

/**
 * POP3Server#destroy() -> undefined
 *
 * Clears the used variables just in case (garbage collector should
 * do this by itself)
 **/
POP3Connnection.prototype.destroy = function destroy() {
    const remoteAddress = this.socket ? this.socket.remoteAddress : null;
    debug('destroying connection', this.user, this.connection_id, remoteAddress);

    if (this.timer) {
        clearTimeout(this.timer);
    }
    this.timer = null;

    if (this.server.connected_users[this.user]) {
        delete this.server.connected_users[this.user];
    }

    if (this.socket && this.socket.end) {
        this.socket.end();
    }
}

// kill client after inactivity
POP3Connnection.prototype.updateTimeout = function () {
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