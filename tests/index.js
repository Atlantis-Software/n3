var expect = require('chai').expect;
var net = require('net');
var	POP3Client = require('mailx/lib/poplib');
var	POP3Server = require('../');
var mailx = require('mailx');
var mailcomposer = require("mailcomposer");
var	PORT = 5050;

describe('POP3 server', function(){
	var pop3Server;
	var uids = ['msg_1', 'msg_2', 'msg_3'];

	before(function(done){
		var messageStore = {}, authHandler = {};
		pop3Server = new POP3Server({
			tls: {
				key: '-----BEGIN RSA PRIVATE KEY-----\n' +
						'MIIEpAIBAAKCAQEA6Z5Qqhw+oWfhtEiMHE32Ht94mwTBpAfjt3vPpX8M7DMCTwHs\n' +
						'1xcXvQ4lQ3rwreDTOWdoJeEEy7gMxXqH0jw0WfBx+8IIJU69xstOyT7FRFDvA1yT\n' +
						'RXY2yt9K5s6SKken/ebMfmZR+03ND4UFsDzkz0FfgcjrkXmrMF5Eh5UXX/+9YHeU\n' +
						'xlp0gMAt+/SumSmgCaysxZLjLpd4uXz+X+JVxsk1ACg1NoEO7lWJC/3WBP7MIcu2\n' +
						'wVsMd2XegLT0gWYfT1/jsIH64U/mS/SVXC9QhxMl9Yfko2kx1OiYhDxhHs75RJZh\n' +
						'rNRxgfiwgSb50Gw4NAQaDIxr/DJPdLhgnpY6UQIDAQABAoIBAE+tfzWFjJbgJ0ql\n' +
						's6Ozs020Sh4U8TZQuonJ4HhBbNbiTtdDgNObPK1uNadeNtgW5fOeIRdKN6iDjVeN\n' +
						'AuXhQrmqGDYVZ1HSGUfD74sTrZQvRlWPLWtzdhybK6Css41YAyPFo9k4bJ2ZW2b/\n' +
						'p4EEQ8WsNja9oBpttMU6YYUchGxo1gujN8hmfDdXUQx3k5Xwx4KA68dveJ8GasIt\n' +
						'd+0Jd/FVwCyyx8HTiF1FF8QZYQeAXxbXJgLBuCsMQJghlcpBEzWkscBR3Ap1U0Zi\n' +
						'4oat8wrPZGCblaA6rNkRUVbc/+Vw0stnuJ/BLHbPxyBs6w495yBSjBqUWZMvljNz\n' +
						'm9/aK0ECgYEA9oVIVAd0enjSVIyAZNbw11ElidzdtBkeIJdsxqhmXzeIFZbB39Gd\n' +
						'bjtAVclVbq5mLsI1j22ER2rHA4Ygkn6vlLghK3ZMPxZa57oJtmL3oP0RvOjE4zRV\n' +
						'dzKexNGo9gU/x9SQbuyOmuauvAYhXZxeLpv+lEfsZTqqrvPUGeBiEQcCgYEA8poG\n' +
						'WVnykWuTmCe0bMmvYDsWpAEiZnFLDaKcSbz3O7RMGbPy1cypmqSinIYUpURBT/WY\n' +
						'wVPAGtjkuTXtd1Cy58m7PqziB7NNWMcsMGj+lWrTPZ6hCHIBcAImKEPpd+Y9vGJX\n' +
						'oatFJguqAGOz7rigBq6iPfeQOCWpmprNAuah++cCgYB1gcybOT59TnA7mwlsh8Qf\n' +
						'bm+tSllnin2A3Y0dGJJLmsXEPKtHS7x2Gcot2h1d98V/TlWHe5WNEUmx1VJbYgXB\n' +
						'pw8wj2ACxl4ojNYqWPxegaLd4DpRbtW6Tqe9e47FTnU7hIggR6QmFAWAXI+09l8y\n' +
						'amssNShqjE9lu5YDi6BTKwKBgQCuIlKGViLfsKjrYSyHnajNWPxiUhIgGBf4PI0T\n' +
						'/Jg1ea/aDykxv0rKHnw9/5vYGIsM2st/kR7l5mMecg/2Qa145HsLfMptHo1ZOPWF\n' +
						'9gcuttPTegY6aqKPhGthIYX2MwSDMM+X0ri6m0q2JtqjclAjG7yG4CjbtGTt/UlE\n' +
						'WMlSZwKBgQDslGeLUnkW0bsV5EG3AKRUyPKz/6DVNuxaIRRhOeWVKV101claqXAT\n' +
						'wXOpdKrvkjZbT4AzcNrlGtRl3l7dEVXTu+dN7/ZieJRu7zaStlAQZkIyP9O3DdQ3\n' +
						'rIcetQpfrJ1cAqz6Ng0pD0mh77vQ13WG1BBmDFa2A9BuzLoBituf4g==\n' +
						'-----END RSA PRIVATE KEY-----',
				cert: '-----BEGIN CERTIFICATE-----\n' +
						'MIICpDCCAYwCCQCuVLVKVTXnAjANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDEwls\n' +
						'b2NhbGhvc3QwHhcNMTUwMjEyMTEzMjU4WhcNMjUwMjA5MTEzMjU4WjAUMRIwEAYD\n' +
						'VQQDEwlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDp\n' +
						'nlCqHD6hZ+G0SIwcTfYe33ibBMGkB+O3e8+lfwzsMwJPAezXFxe9DiVDevCt4NM5\n' +
						'Z2gl4QTLuAzFeofSPDRZ8HH7wgglTr3Gy07JPsVEUO8DXJNFdjbK30rmzpIqR6f9\n' +
						'5sx+ZlH7Tc0PhQWwPOTPQV+ByOuReaswXkSHlRdf/71gd5TGWnSAwC379K6ZKaAJ\n' +
						'rKzFkuMul3i5fP5f4lXGyTUAKDU2gQ7uVYkL/dYE/swhy7bBWwx3Zd6AtPSBZh9P\n' +
						'X+OwgfrhT+ZL9JVcL1CHEyX1h+SjaTHU6JiEPGEezvlElmGs1HGB+LCBJvnQbDg0\n' +
						'BBoMjGv8Mk90uGCeljpRAgMBAAEwDQYJKoZIhvcNAQELBQADggEBABXm8GPdY0sc\n' +
						'mMUFlgDqFzcevjdGDce0QfboR+M7WDdm512Jz2SbRTgZD/4na42ThODOZz9z1AcM\n' +
						'zLgx2ZNZzVhBz0odCU4JVhOCEks/OzSyKeGwjIb4JAY7dh+Kju1+6MNfQJ4r1Hza\n' +
						'SVXH0+JlpJDaJ73NQ2JyfqELmJ1mTcptkA/N6rQWhlzycTBSlfogwf9xawgVPATP\n' +
						'4AuwgjHl12JI2HVVs1gu65Y3slvaHRCr0B4+Kg1GYNLLcbFcK+NEHrHmPxy9TnTh\n' +
						'Zwp1dsNQU+Xkylz8IUANWSLHYZOMtN2e5SKIdwTtl5C8YxveuY8YKb1gDExnMraT\n' +
						'VGXQDqPleug=\n' +
						'-----END CERTIFICATE-----'		
			},
			auth: function(user, checkPassword) {
        var password = false;
        if (user === 'jdoe' || user === 'jdoe2') {
            password = 'correct_password';
        }
        return checkPassword(password);
      },
			store: {
				register: function(cb) {
					if (this.user === "jdoe") {
						var self = this;
						uids.forEach(function(uid) {
							self.addMessage(uid, 40);
						});
					}
					cb();
				},
				read: function(uid, cb) {
					var message =  mailx.message();
					message.setFrom('me', 'me@example.net');
					message.addTo('you', 'you@example.net');
					message.setSubject('hello');
					message.setText('hi ! how are u?'); 
					message.setHtml('hi ! how are u? <b>hugs</b>');
					mailcomposer(message).build(cb);
				},
				removeDeleted: function(deleted, cb) {
					deleted.forEach(function(uid) {
						var index = uids.indexOf(uid);
						if (index > -1) {
							uids.splice(index, 1);
						}
					});
					cb();
				}
			}
		});
		pop3Server.listen(PORT, done);
	});

	it('It should be listening on the appropriate port', function(done){
		var client = net.connect(PORT, function(){
			done();
		});
		client.on('error', function(err){
			done(err);
		});
	});

	it('It should Respond with banner on new Connection', function(done){
		var client = net.connect(PORT, function(){});
		client.on('error', function(err){
			done(err);
		});
		client.on('data', function(chunk){
			expect(chunk.toString('ascii')).to.match(/^\+OK/);
			return done();
		});
	});
	it('Should support QUIT command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.quit(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).equal('+OK POP3 Server signing off\r\n');
				done();
			});
		});
	});

	it('Should Accept valid Login credentials via USER-PASS sequence', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).equal('+OK You are now logged in\r\n');
				client.quit(function(err, raw) {
					if (err) {
						return done(err);
					}
					done();
				});
			});
		});
	});

	it('Should Reject invalid Login credentials via USER-PASS sequence', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'wrong_password', function(err, raw) {
				client.quit();
				if (!err) {
					return done('should reject invalid Login credentials');
				}
				done();
			});
		});
	});

	it('Should support CAPA command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('USER');
				client.quit();
				done();
			});
		});
	});

	it('Should support PLAIN Auth', function(done){
		var client = new POP3Client(PORT, 'localhost', {ignoretlserrs: true});
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('PLAIN');
				client.auth('PLAIN', 'jdoe', 'correct_password', function(err, raw) {
					if (err) {
						return done(err);
					}
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Reject invalid Login credentials via Plain AUTH', function(done){
	  var client = new POP3Client(PORT, 'localhost', {ignoretlserrs: true});
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('PLAIN');
				client.auth('PLAIN', 'jdoe', 'wrong_password', function(err, raw) {
					client.quit();
					if (!err) {
						return done('should reject invalid Login credentials');
					}
					done();
				});
			});
		});
	});

	it('Should support CRAM-MD5 Auth', function(done){
		var client = new POP3Client(PORT, 'localhost', {ignoretlserrs: true});
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('CRAM-MD5');
				client.auth('CRAM-MD5', 'jdoe', 'correct_password', function(err, raw) {
					if (err) {
						return done(err);
					}
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Reject invalid Login credentials via CRAM-MD5 AUTH', function(done){
	  var client = new POP3Client(PORT, 'localhost', {ignoretlserrs: true});
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('CRAM-MD5');
				client.auth('CRAM-MD5', 'jdoe', 'wrong_password', function(err, raw) {
					client.quit();
					if (!err) {
						return done('should reject invalid Login credentials');
					}
					done();
				});
			});
		});
	});

	it('Should Reject multiple active connections', function(done){
		var client1 = new POP3Client(PORT, 'localhost');
		client1.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client1.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).equal('+OK You are now logged in\r\n');
				var client2 = new POP3Client(PORT, 'localhost');
				client2.connect(function(err, raw) {
					if (err) {
						return done(err);
					}
					client2.login('jdoe', 'correct_password', function(err, raw) {
						client1.quit();
						client2.quit();
						if (!err) {
							return done('server should refuse second connection.');
						}
						done();
					});
				});
			});
		});
	});

	it('Should Accept multiple connections from different users', function(done){
		var client1 = new POP3Client(PORT, 'localhost');
		client1.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client1.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).equal('+OK You are now logged in\r\n');
				var client2 = new POP3Client(PORT, 'localhost');
				client2.connect(function(err, raw) {
					if (err) {
						return done(err);
					}
					client2.login('jdoe2', 'correct_password', function(err, raw) {
						client1.quit();
						client2.quit();
						if (err) {
							return done(err);
						}
						done();
					});
				});
			});
		});
	});

	it('Should Properly support the NOOP command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client.noop(function(err) {
					if (err) {
						done(err);
					}
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Properly support the STAT command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client.stat(function(err, stat) {
					if (err) {
						done(err);
					}
					expect(stat.count).to.equal('3');
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Properly support the LIST command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client.list(function(err, list) {
					if (err) {
						done(err);
					}
					expect(Object.keys(list).length).to.equal(3);
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Properly support the UIDL command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client.uidl(function(err, uidl) {
					if (err) {
						done(err);
					}
					expect(Object.keys(uidl).length).to.equal(3);
					expect(uidl['1']).to.equal('msg_1');
					expect(uidl['2']).to.equal('msg_2');
					expect(uidl['3']).to.equal('msg_3');
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Properly support the RETR command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client.retr(2, function(err, msg_2) {
					if (err) {
						done(err);
					}
					expect(msg_2).to.have.string('me@example.net');
					client.quit();
					done();
				});
			});
		});
	});

	it('Should Properly support the DELE and RSET command', function(done){
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client.dele(1, function(err, dele) {
					if (err) {
						return done(err);
					}
					expect(dele).to.equal(1);
					client.stat(function(err, stat) {
						if (err) {
							return done(err);
						}
						expect(stat.count).to.equal('2');
						client.rset(function(err, rset) {
					  	if (err) {
								return done(err);
							}
							client.stat(function(err, stat) {
								if (err) {
									return done(err);
								}
								expect(stat.count).to.equal('3');
								client.quit();
								done();
							});
						});
					});
				});
			});
		});
	});

	it('Should have persistent Deletions', function(done){
		var client1 = new POP3Client(PORT, 'localhost');
		client1.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client1.login('jdoe', 'correct_password', function(err, raw) {
				if (err) {
					return done(err);
				}
				client1.dele(1, function(err, dele) {
					if (err) {
						return done(err);
					}
					client1.quit(function(err) {
						if (err) {
							return done(err);
						}

						var client2 = new POP3Client(PORT, 'localhost');
						client2.connect(function(err, raw) {
							if (err) {
								return done(err);
							}
							client2.login('jdoe', 'correct_password', function(err, raw) {
								if (err) {
									return done(err);
								}
								client2.stat(function(err, stat) {
									if (err) {
										return done(err);
									}
									expect(stat.count).to.equal('2');
									client2.quit();
									done();
								});
							});
						});
					});
				});
			});
		});
	});
});