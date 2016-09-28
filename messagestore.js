var debug = require('debug')('messagestore');

/**
 * One MessageStore is created per socket / user connection and is used to handle
 * the intermediate steps between the pop3 server and the database.
 * register, read and removeDeleted should be overriden on pop3server store option.
 */
var MessageStore = module.exports = function(connection) {
    debug('MessageStore created', connection.user);
    this.user = connection.user;
    this.messages = [];
    this.deletedMessages = [];
    this.connection = connection;
};

MessageStore.prototype.register = function noopRegister(cb) {
    debug('register has not been overridden by your implementation of MessageStore');
    cb();
};

MessageStore.prototype.read = function noopRead(uid, cb) {
    debug('read has not been overridden by your implementation of MessageStore');
    cb(null, '');
};

MessageStore.prototype.removeDeleted = function noopRemoveDeleted(deleted, cb) {
    debug('removeDeleted has not been overridden by your implementation of MessageStore');
    cb();
};

MessageStore.prototype.addMessage = function (uid, length) {
    this.messages.push({uid: uid, length: length});
    debug('addMessage', length, uid, this.user);
};

MessageStore.prototype.stat = function (callback) {
    var count = 0;
    var size = 0;
    this.messages.forEach(function(msg){
        if (!msg.deleted) {
            count++;
            size += msg.length;
        }
        
    });
    debug('stat', this.user, size);
    callback(null, count, size);
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
    var msg = _msg - 1;
    debug('retr', this.user, _msg);
    var invalidIndex = isNaN(msg) || !this.messages[msg];
    if (invalidIndex) {
        return callback(null, false);
    }
    this.read(this.messages[msg].uid, callback);
};

MessageStore.prototype.dele = function dele(_msg, callback) {
    var msg = _msg - 1;
    debug('dele', this.user, msg);
    var invalidIndex = isNaN(msg) || !this.messages[msg];
    if (invalidIndex) {
        return callback(null, false);
    }
    // not actually removed at this time - will be removed when connection closes
    this.messages[msg].deleted = true;
    return callback(null, true);
};

MessageStore.prototype.rset = function () {
    debug('rset', this.user);
    this.messages.forEach(function(msg, index){
        delete msg.deleted;
    });
};
