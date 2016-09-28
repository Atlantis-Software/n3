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
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('PLAIN');
				client.data.stls = true;	//skip stls
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
	  var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('PLAIN');
				client.data.stls = true;	//skip stls
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
		var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('CRAM-MD5');
				client.data.stls = true;	//skip stls
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
	  var client = new POP3Client(PORT, 'localhost');
		client.connect(function(err, raw) {
			if (err) {
				return done(err);
			}
			client.capa(function(err, raw) {
				if (err) {
					return done(err);
				}
				expect(raw).contain('CRAM-MD5');
				client.data.stls = true;	//skip stls
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