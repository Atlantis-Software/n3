// SASL AUTH methods

var crypto = require("crypto");

/**
 * sasl.AUTHMethods -> Object
 * 
 * object containing information about the authentication functions
 * Struncture: {name: authentication_function(authObject)}
 * 
 * authObject has the following structure:
 *   - wait (Boolean): initially false. If set to TRUE, then the next response from
 *                     the client will be forwarded directly back to the function
 *   - user (String): initially false. Set this value with the user name of the logging user
 *   - params (String): Authentication parameters from the client
 *   - connection (object): object containing information about the user connection
 *   - history (Array): an array of previous params if .wait was set to TRUE
 *   - check (Function): function to validate the user, has two params:
 *     - user (String): username of the logging user
 *     - pass (Function | String): password or function(pass){return pass==pass}
 *     returns TRUE if successful or FALSE if not
 **/
exports.AUTHMethods = {
    "PLAIN": PLAIN,
    "CRAM-MD5": CRAM_MD5
};

// AUTH PLAIN

// SCENARIO 1:
// STEP 1
//   CLIENT: AUTH PLAIN
//   SERVER: +
// STEP 2 
//   CLIENT: BASE64(<NULL>username<NULL>password)
//   SERVER: +OK logged in

// SCENARIO 2:
// STEP 1
//   CLIENT: AUTH PLAIN BASE64(<NULL>username<NULL>password)
//   SERVER: +OK logged in

function PLAIN(authObj){

    // Step 1
    if(!authObj.params){
        authObj.wait = true;
        return "+ ";
    }

    // Step 2
    var login = new Buffer(authObj.params, 'base64');
    var parts = login.toString('ascii').split("\u0000");


    if (parts.length!=3 || !parts[1]) {
        return "-ERR Invalid authentication data";
    }
      
    if (parts[0] != parts[1]) { // try to log in in behalf of some other user
        return "-ERR [AUTH] Not authorized to requested authorization identity";
    }

    authObj.user = parts[1];
    return authObj.check(parts[1], parts[2]);
}

// AUTH CRAM-MD5

// STEP 1
//   CLIENT: AUTH CRAM-MD5
//   SERVER: + BASE64(secret)
// STEP 2
//   CLIENT: BASE64(user HMAC-MD5(secret, password))
//   SERVER: +OK Logged in

function CRAM_MD5(authObj){

    var salt = "<"+authObj.connection.UID+"@"+authObj.connection.server.server_name+">";

    // Step 1
    if(!authObj.params){
        authObj.wait = true;
        return "+ " + new Buffer(salt).toString("base64");
    }

    // Step 2
    var params = new Buffer(authObj.params, 'base64').toString('ascii').split(" ");
    var user = params && params[0];
    var challenge = params && params[1];
    if (!user || !challenge) {
        return "-ERR Invalid authentication";
    }
    return authObj.check(user, function(pass){
        var hmac = crypto.createHmac("md5", pass), digest;
        hmac.update(salt);
        digest = hmac.digest("hex");
        if (digest == challenge) {
            authObj.user = user;
            return true;
        }
        return false;
    });
}