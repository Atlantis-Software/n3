var debug = require('debug')('n3-messagestore');
var Message = require('./message');

var sum = (a, b) => (a + b.length);

/**
 * One MessageStore is created per socket / user connection and is used to handle
 * the intermediate steps between the N3 pop3 server and the database.
 * In particular, onLoadHook can be overriden on the prototype of MessageStore,
 * to preload messages.
 * @constructor
 * @param {string} user - email address
 */
function MessageStore(user) {
    debug('MessageStore created', user);
    this.user = user;
    this.messages = [];
    this.deletedMessages = [];
    this.didLoadHook = false;

    if (typeof this.registerHook === "function") {
        this.registerHook(() => {
            this.didLoadHook = true;
            this.onLoadHook();
        });
    }
}

MessageStore.prototype.registerHook = null;

MessageStore.prototype.onLoadHook = function noopOnLoadHook() {};

MessageStore.prototype.removeDeleted = function noopRemoveDeleted() {
    debug('removeDeleted has not been overridden by your implementation of MessageStore');
};

MessageStore.prototype.addMessage = function (message, uid) {
    this.messages.push(
        new Message(message, uid)
    );
    debug('addMessage', message.length, uid, this.user);
};

MessageStore.prototype.stat = function (callback) {
    const size = this.messages.reduce(sum, 0);
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
/**
 * Unique ID List
 * @param  {int} _msg - index +1, optional to only respond with one
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
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
/**
 * Retrieve the message
 * @param  {int} _msg - index +1 of the message (0 is not allowed in pop3 protocol)
 * @param  {Function} callback (err, Message)
 */
MessageStore.prototype.retr = function retr(_msg, callback) {
    debug('retr', this.user, _msg);
    var msg = _msg - 1;
    callback(null, this.messages[msg]);
};
MessageStore.prototype.dele = function dele(_msg, callback) {
    var msg = _msg - 1;
    debug('dele', this.user, msg);
    var invalidIndex = isNaN(msg) || !this.messages[msg];
    if (invalidIndex) {
        return callback(null, false);
    }
    // not actually removed at this time - will be removed when connection closes
    var deletedMsg = this.messages.slice(msg, 1);
    if (deletedMsg.length) {
        this.deletedMessages.push(deletedMsg);
    }
    return callback(null, true);
};

MessageStore.prototype.rset = function () {
    debug('rset', this.user);
    this.messages = this.messages.concat(this.deletedMessages);
};

exports.MessageStore = MessageStore;
