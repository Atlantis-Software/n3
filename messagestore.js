var debug = require('debug')('n3-messagestore');
var Message = require('./message');

// Message handling per session

function MessageStore(user) {
    debug('MessageStore created', user);
    var self = this;
    this.user = user;
    var curtime = new Date().toLocaleString();
    this.messages = [];
    if (typeof this.registerHook === "function") {
        this.registerHook(function () {
            self.didLoadHook = true;
            self.onLoadHook();
        });
    }
}

MessageStore.prototype.registerHook = null;
MessageStore.prototype.didLoadHook = false;
MessageStore.prototype.onLoadHook = function noopOnLoadHook() {};
MessageStore.prototype.messages = [];
MessageStore.prototype.deletedMessages = [];

MessageStore.prototype.addMessage = function (message, uid) {
    this.messages.push(
        new Message(message, uid)
    );
    debug('addMessage', message.length, uid, this.user);
};

MessageStore.prototype.stat = function (callback) {
    const size = this.messages.reduce((a, b) => {
        return a + b.length;
    }, 0);
    debug('stat', this.user, size);
    callback(null, this.messages.length, size);
};

MessageStore.prototype.list = function (_msg, callback) {
    debug('list', this.user, _msg);
    var msg = _msg - 1;
    if (msg >= 0 && typeof msg === 'number') {
        if (!this.messages[msg]) {
            return callback(null, null);
        }
        return callback(_msg + ' ' + this.messages[msg].length);
    }
    var result = this.messages.map(
        (m, index) => (index + 1) + ' ' + m.length
    );
    callback(null, result);
};

MessageStore.prototype.uidl = function (_msg, callback) {
    debug('uidl', this.user, _msg);
    var msg = _msg - 1;
    if (msg >= 0 && typeof msg === 'number') {
        if (!this.messages[msg]) {
            return callback(null, null);
        }
        return callback(null, _msg + ' ' + this.messages[msg].uid);
    }
    var result = this.messages.map(
        (m, index) => (index + 1) + ' ' + m.uid
    );
    callback(null, result);
};

MessageStore.prototype.retr = function (_msg, callback) {
    debug('retr', this.user, _msg);
    var msg = _msg - 1;
    callback(null, this.messages[msg]);
};
MessageStore.prototype.dele = function (_msg, callback) {
    var msg = _msg - 1;
    debug('dele', this.user, msg);
    var invalidIndex = isNaN(msg) || !this.messages[msg];
    if (invalidIndex) {
        return callback(null, false);
    }
    var deleted = this.messages.splice(msg, 1);
    if (deleted) {
        this.deletedMessages.push(deleted);
    }
    return callback(null, true);
};

MessageStore.prototype.rset = function () {
    debug('rset', this.user);
    this.messages = this.messages.concat(this.deletedMessages);
};

MessageStore.prototype.removeDeleted = function () {
    debug('removeDeleted has not been overridden by your implementation', this.user);
};

exports.MessageStore = MessageStore;
