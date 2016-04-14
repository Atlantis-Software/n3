/**
 * Constants for different states of the current connection. Every state has
 * different possibilities, ie. APOP is allowed only in AUTHENTICATION state
 * @type {object}
 **/
module.exports = {
    AUTHENTICATION: 1,
    TRANSACTION: 2,
    UPDATE: 3
};
