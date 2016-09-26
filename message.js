function Message(raw, uid) {
    this.raw = raw;
    this.uid = uid;
    this.length = raw.length;
};

Message.prototype.toString = function customToString() {
    return this.raw;
};

module.exports = Message;
