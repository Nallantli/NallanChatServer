var url = require("./secret-url.js").url;

const express = require("express");
const app = express();
const mongo = require("mongodb");

function getMessages(dbchat, dbmain, channel, count, callback) {
	let cache = {};
	let promises = [];
	dbchat.collection(channel)
		.find({})
		.sort({ _id: -1 })
		.limit(count)
		.toArray((err, res) => {
			if (err) throw err;
			let r = res.map(e => {
				if (!cache[e.user.user]) {
					cache[e.user.user] = "#ffffff";
					promises.push(dbmain.collection("users").find({ user: e.user.user }).toArray().then(u => {
						if (u.length > 0)
							cache[e.user.user] = u[0].color;
					}, (err2) => {
						throw err2;
					}));
				}
				e.content.data = undefined;
				return e;
			});
			Promise.all(promises).then(() => {
				callback(cache, r)
			});
		});
}

function getFile(dbchat, channel, id, callback) {
	dbchat.collection(channel).find({ _id: mongo.ObjectId(id) })
		.toArray((err, res) => {
			if (err) throw err;
			if (res.length > 0)
				callback(res[0].content.data);
			else
				callback(`<h2>FILE NOT FOUND`);
		});
}

function sendMessage(dbchat, user, channel, content, callback) {
	if (!user) {
		callback(undefined);
		return;
	}
	var message = {
		user: user,
		content: content,
		timestamp: Date.now()
	};
	if (content.length == 0) if (callback) callback(message);
	dbchat.collection(channel).insertOne(message, err => {
		if (err) throw err;
		if (callback) callback(message);
	});
}

function addUser(dbmain, user, callback) {
	let collection = dbmain.collection("users");
	collection.find({ user: user.user }).toArray((err, res) => {
		if (err) throw err;
		if (res.length == 0) {
			collection.insertOne({ user: user.user, password: user.password, color: user.color });
			if (callback) callback(res);
		} else {
			if (callback) callback();
		}
	});
}

function userExists(dbmain, user, callback) {
	dbmain.collection("users")
		.find({ user: user.user })
		.toArray((err, res) => {
			if (err) throw err;
			if (res.length > 0) {
				if (res[0].password === user.password) {
					callback(res[0]);
				} else {
					callback(1);
				}
			} else {
				callback(2);
			}
		});
}

function register(dbmain, username, password, color, callback) {
	if (!(/^#[0-9A-F]{6}$/i.test(color))) {
		color = "#ffffff"
	}
	userExists(dbmain, { user: username, password: password }, res => {
		switch (res) {
			case 2:
				addUser(dbmain, {
					user: username,
					password: password,
					color: color
				}, () => callback(true));
				break;
			default:
				console.log("User exists already: " + username);
				callback(false);
				break;
		}
	});
}

function login(dbmain, username, password, callback) {
	userExists(dbmain, { user: username, password: password }, res => {
		switch (res) {
			case 1: {
				console.log("Incorrect password for user " + username);
				callback();
				break;
			}
			case 2: {
				console.log("User does not exist: " + username);
				callback();
				break;
			}
			default: {
				console.log(username + " logged in.");
				callback(res);
				break;
			}
		}
	});
}

mongo.MongoClient.connect(url, { useNewUrlParser: true }, (err, db) => {
	if (err) throw err;

	var dbchat = db.db("chat");
	var dbmain = db.db("main");

	app.get("/", function (req, res) {
		res.send(`
			<body>
				<p>
					Go to <a href="https://www.npmjs.com/package/nallanchat">nallanchat</a> for information; there exists no webclient as of now.
				</p>
			</body>
		`);
	});

	app.get("/read", function (req, res) {
		getMessages(
			dbchat,
			dbmain,
			req.headers.channel,
			parseInt(req.headers.count),
			(colors, history) => {
				res.send(encodeURIComponent(JSON.stringify({ colors: colors, history: history })));
			}
		);
	});

	app.get("/file", function (req, res) {
		getFile(
			dbchat,
			req.query.channel,
			req.query.id,
			value => {
				res.send(value);
			}
		);
	});

	app.get("/register", function (req, res) {
		let data = JSON.parse(decodeURIComponent(req.headers.data));
		console.log(data);
		register(dbmain, data.user, data.password, data.color, e => res.send(e));
	});

	app.get("/send", function (req, res) {
		let data = JSON.parse(decodeURIComponent(req.headers.data));
		console.log(data);
		login(
			dbmain,
			data.user.user,
			data.user.password,
			user => {
				sendMessage(
					dbchat,
					user,
					data.channel,
					data.content,
					out => {
						res.send(out);
					}
				);
			}
		);
	});

	app.listen(3000, function () {
		console.log("Running NallanChat Server, port 3000");
	});
});
