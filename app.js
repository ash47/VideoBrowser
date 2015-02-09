// Include dependencies
var express = require('express');
var ftp = require('ftp');
var fs = require('fs');
var http = require('http');
var cheerio = require('cheerio');

var serverSettings = require('./serverSettings');
var dirSettings = require('./dirSettings');

var imdbSearchURL = 'http://www.imdb.com/xml/find?json=1&nr=1&tt=on&q=';
var imdbQueryURL = 'http://www.omdbapi.com/?i=';

var movieStore = 'static/movies/';

// How long before an FTP connection times out
var timeOut = 1000;

// Creates a directory if it doesn't exist
function dirExists(dir) {
	// Ensure directories exist
	if(!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}
}

// Ensure all our directories exist
dirExists('static');
dirExists('static/movies');
dirExists('static/movies/ratings');
dirExists('static/movies/posters');

// Build list of servers
var serverList = new Array();

for(var i=0;i<serverSettings.length;i++) {
	serverList.push(serverSettings[i].name);
}

// Create the web server
var app = express();

app.configure(function() {
	app.use(express.static(__dirname + '/static'));
});

// Start listening
var server = app.listen(process.env.PORT || 3000);
var io = require('socket.io').listen(server, {log: false });

// Handle connections
io.sockets.on('connection', function (socket) {
	socket.path = '';
	socket.cdLocked = -1;
	socket.dirLocked = {};

	// Send server list
	socket.emit('serverList', serverList);

	// Client wants to change directories
	socket.on('cd', function (path) {
		// Check if the command is locked
		if(socket.cdLocked != -1) return;

		// Lock the CD command
		socket.cdLocked = 0;

		// List of files in this directory
		socket.cdList = new Array();

		// List to say if each lane is legit
		socket.cdLegit = new Array();

		if(path == '..') {
			// Find last /
			var pos = socket.path.lastIndexOf('/');

			// Store the path
			socket.path = socket.path.substr(0, pos);
		} else {
			socket.path = socket.path+'/'+path;
		}

		// Remove slashes from the start
		while(socket.path.indexOf('/') == 0) {
			socket.path = socket.path.substr(1, socket.path.length);
		}

		// Remove ..s
		socket.path = socket.path.replace(/\.\./g, '');

		// Check for special directories
		if(dirSettings[socket.path]) {
			socket.specialdir = dirSettings[socket.path];
		} else {
			socket.specialdir = false;
		}

		// Process each server
		for(var i=0;i<serverSettings.length;i++) {
			cdProcessServer(socket, i);
		}
	});

	// Client wants the contents of a sub dir
	socket.on('dir', function (path) {
		// Remove ..s
		path.replace(/\.\./g, '');

		// Check if the command is locked
		if(socket.dirLocked[path] != null) return;

		// Lock the DIR command
		socket.dirLocked[path] = {
			num: 0,
			list: new Array(),
			legit: new Array()
		};

		// Process each sub dir
		for(var i=0;i<serverSettings.length;i++) {
			dirProcessServer(path, socket, i);
		}
	});

	socket.on('disconnect', function() {
		// Temp
		console.log('Client has disconnected!');
	});
});

// cd command has finished on a single server
function cdFinishServer(socket) {
	// Increase number of finished servers
	socket.cdLocked += 1;

	// Check if CD command is done
	if(socket.cdLocked >= serverList.length) {
		// Send file list
		socket.emit('cd', {
			path: socket.path,
			files: socket.cdList,
			special: socket.specialdir,
			legit: socket.cdLegit
		});

		// Unlock CD command
		socket.cdLocked = -1;
	}
}

// dir command has finished on a single server
function dirFinishServer(socket, title) {
	// Increase number of finished servers
	socket.dirLocked[title].num += 1;

	// Check if CD command is done
	if(socket.dirLocked[title].num >= serverList.length) {
		// Send file list
		socket.emit('dir', {
			title: title,
			files: socket.dirLocked[title].list,
			legit: socket.dirLocked[title].legit
		});

		// Unlock CD command
		socket.dirLocked[title] = null;
	}
}

function cdProcessServer(socket, i) {
	// Grab current server
	var s = serverSettings[i];

	// Check which sort it is
	if(s.sort == 'local') {
		// Store that it is legit
		socket.cdLegit[i] = true;

		// Check if the path exists
		if(!fs.existsSync(s.root+'/'+socket.path)) {
			// Command has finished
			cdFinishServer(socket);
			return;
		}

		// Local server
		fs.readdir(s.root+'/'+socket.path, function(err, files) {
			if (err) throw err;

			// Cycle each file
			for(var j=0;j<files.length;j++) {
				var file = files[j];

				var exists = -1;

				// Check if this file is already in our list
				for(var k=0;k<socket.cdList.length;k++) {
					if(socket.cdList[k].name == file) {
						exists = k;
						break;
					}
				}

				if(exists != -1) {
					// File already exsits
					socket.cdList[exists].has[i] = true;
				} else {
					var has = {};
					has[i] = true;

					socket.cdList.push({
						name: file,
						has: has
					});
				}
			}

			// Command has finished
			cdFinishServer(socket);
		});
	} else if(s.sort == 'remote') {
		// Remote server
		var sFtp = new ftp();

		sFtp.on('ready', function() {
			// Load root dir
			sFtp.list(s.root+socket.path, function(err, list) {
				if (err) {
					if(err.code == 550) {
						// Store that it is legit
						socket.cdLegit[i] = true;
					}

					// Close the conneciton
					sFtp.end()

					// Command has finished
					cdFinishServer(socket);

					return;
				}

				// Store that it is legit
				socket.cdLegit[i] = true;

				for(var j=0; j<list.length;j++) {
					var file = list[j].name;

					var exists = -1;

					// Check if this file is already in our list
					for(var k=0;k<socket.cdList.length;k++) {
						if(socket.cdList[k].name == file) {
							exists = k;
							break;
						}
					}

					if(exists != -1) {
						// File already exsits
						socket.cdList[exists].has[i] = true;
					} else {
						var has = {};
						has[i] = true;

						socket.cdList.push({
							name: file,
							has: has
						});
					}
				}

				// Close connection
				sFtp.end()

				// Command has finished
				cdFinishServer(socket);
			});
		});

		sFtp.on('error', function(err) {
			// A command has finished
			cdFinishServer(socket);
		})

		// Connect ftp
		sFtp.connect({host: s.ip, user:s.user, password:s.password, connTimeout:timeOut, pasvTimeout:timeOut});
	}
}

// Process a dir for a single server
function dirProcessServer(title, socket, i) {
	// Grab current server
	var s = serverSettings[i];

	// Check which sort it is
	if(s.sort == 'local') {
		// Store that it is a legit result
		socket.dirLocked[title].legit[i] = true;

		// Check if the path exists
		if(!fs.existsSync(s.root+'/'+socket.path+'/'+title)) {
			// Command has finished
			dirFinishServer(socket, title);
			return;
		}

		// Grab stats on dir
		var dirStats = fs.statSync(s.root+'/'+socket.path+'/'+title);

		if(!dirStats.isDirectory()) {
			dirFinishServer(socket, title);
			return;
		}

		// Local server
		fs.readdir(s.root+'/'+socket.path+'/'+title, function(err, files) {
			if (err) throw err;

			// Cycle each file
			for(var j=0;j<files.length;j++) {
				var file = files[j];

				var exists = -1;

				// Check if this file is already in our list
				for(var k=0;k<socket.dirLocked[title].list.length;k++) {
					if(socket.dirLocked[title].list[k].name == file) {
						exists = k;
						break;
					}
				}

				// Grab file stats
				var stats = fs.statSync(s.root+socket.path+'/'+title+'/'+file);

				if(exists != -1) {
					// File already exsits
					socket.dirLocked[title].list[exists].has[i] = true;
					socket.dirLocked[title].list[exists].size[i] = stats.size;
				} else {
					var has = {};
					has[i] = true;

					var size = {};
					size[i] = stats.size;

					socket.dirLocked[title].list.push({
						name: file,
						has: has,
						size: size
					});
				}
			}

			// Command has finished
			dirFinishServer(socket, title);
		});
	} else if(s.sort == 'remote') {
		// Remote server
		var sFtp = new ftp();

		sFtp.on('ready', function() {
			// Load root dir
			sFtp.list(s.root+socket.path+'/'+title, function(err, list) {
				if (err) {
					// Store that the results are legit
					if(err.code == 550) {
						socket.dirLocked[title].legit[i] = true;
					}

					// Close the conneciton
					sFtp.end()

					// Command has finished
					dirFinishServer(socket, title);

					return;
				}

				// Store that the results are legit
				socket.dirLocked[title].legit[i] = true;

				for(var j=0; j<list.length;j++) {
					var file = list[j].name;

					var exists = -1;

					// Check if this file is already in our list
					for(var k=0;k<socket.dirLocked[title].list.length;k++) {
						if(socket.dirLocked[title].list[k].name == file) {
							exists = k;
							break;
						}
					}

					if(exists != -1) {
						// File already exsits
						socket.dirLocked[title].list[exists].has[i] = true;
						socket.dirLocked[title].list[exists].size[i] = list[j].size;
					} else {
						var has = {};
						has[i] = true;

						var size = {};
						size[i] = list[j].size;

						socket.dirLocked[title].list.push({
							name: file,
							has: has,
							size: size
						});
					}
				}

				// Close connection
				sFtp.end()

				// Command has finished
				dirFinishServer(socket, title);
			});
		});

		sFtp.on('error', function(err) {
			// A command has finished
			dirFinishServer(socket, title);
		})

		// Connect ftp
		sFtp.connect({host: s.ip, user:s.user, password:s.password, connTimeout:timeOut, pasvTimeout:timeOut});
	}
}

// Handle movie rating queries
app.get('/movies/ratings/:title.json', function (req, res) {
	var title = req.params.title;

	// Pull the website
	http.get('http://www.classification.gov.au/Pages/Results.aspx?q='+title.replace(/ /g, '+'), function(httpRes) {
		var html_data = '';

		httpRes.on('data', function (chunk) {
			html_data += chunk;
		});

		httpRes.on('end', function () {
			// Pull rating
			var $ = cheerio.load(html_data);
			var rateImg = $('img', $('.item-rating'));
			var rating = JSON.stringify({rating: rateImg.attr('alt')});

			// Store the data
			fs.writeFileSync(movieStore+'ratings/'+title+'.json', rating);

			// Send back to client
			res.writeHead(200, {"Content-Type": "application/json"});
			res.write(rating);
			res.end();
		});
	}).on('error', function(e) {
		console.log("Rating got error: " + e.message);
		res.end('');
	});
});

// Handle movie queries
app.get('/movies/:title.json', function (req, res) {
	var title = req.params.title;

	console.log('Searching for '+title);

	var html_data = '';

	http.get(imdbSearchURL+title.replace(/ /g, '+'), function(httpRes) {
		// Check if everything is ok
		if(httpRes.statusCode == 200) {
			httpRes.setEncoding('utf8');
			httpRes.on('data', function (chunk) {
				html_data += chunk;
			});

			httpRes.on('end', function () {
				// Grab json data
				var data = JSON.parse(html_data);

				// Reset html_data
				html_data = '';

				var id = '';
				var realTitle = '';

				// Grab the ID
				if(data.title_popular && data.title_popular.length > 0) {
					// Grab real title and ID
					id = data.title_popular[0].id;
					realTitle = data.title_popular[0].title;
				}else if(data.title_exact && data.title_exact.length > 0) {
					// Grab real title and ID
					id = data.title_exact[0].id;
					realTitle = data.title_exact[0].title;
				}else if(data.title_approx && data.title_approx.length > 0) {
					// Grab real title and ID
					id = data.title_approx[0].id;
					realTitle = data.title_approx[0].title;
				}

				if(id != '') {
					// Make a request for the info
					http.get(imdbQueryURL+id, function(httpRes) {
						// Check if everything is ok
						if(httpRes.statusCode == 200) {
							httpRes.setEncoding('utf8');
							httpRes.on('data', function (chunk) {
								html_data += chunk;
							});

							httpRes.on('end', function () {
								// Store the data
								fs.writeFileSync(movieStore+title+'.json', html_data);

								// Send back to client
								res.writeHead(200, {"Content-Type": "application/json"});
								res.write(html_data);
								res.end();
							});
						} else {
							res.end('');
						}
					}).on('error', function(e) {
						console.log("IMDB Search Got error: " + e.message);
						res.end('');
					});
				} else {
					res.end('');
				}
			});
		} else {
			res.end('');
		}
	}).on('error', function(e) {
		console.log("Query Got error: " + e.message);
		res.end('');
	});
});

// Handle poster requests
app.get('/movies/posters/:title.png', function (req, res) {
	var title = req.params.title;

	// Check if we have the info needed to grab the poster
	fs.exists(movieStore+title+'.json', function (exists) {
		if(exists) {
			// Yes
			var data = require('./'+movieStore+title);

			var html_data = '';

			// Does this movie have a poster
			if(data.Poster) {
				// No poster
				if(data.Poster == 'N/A') {
					res.end('');
					return;
				}

				// Log to server
				console.log('Getting Movie Poster '+title);

				http.get(data.Poster, function(httpRes) {
					httpRes.setEncoding('binary')
					httpRes.on('data', function (chunk) {
						html_data += chunk;
					});

					httpRes.on('end', function () {
						// Store the data
						fs.writeFileSync(movieStore+'posters/'+title+'.png', html_data, 'binary');

						var img = fs.readFileSync(movieStore+'posters/'+title+'.png');
						res.writeHead(200, {'Content-Type': 'image/gif' });
						res.end(img, 'binary');
					});
				}).on('error', function(e) {
					console.log("Poster Got error: " + e.message);
					res.end('');
				});
			} else {
				// No
				req.end('');
			}
		} else {
			// no
			res.end('');
		}
	});
});

app.get('/', function (req, res) {
	res.sendfile('static/index.htm');
});