var socket;					// Contains a connection to the web server
var serverList;				// List of servers to query for files
var path;					// The current working directory
var fileList = new Array();	// List of files in the current directory
var hash;					// The current www.www.com# value
var specialDir = false;		// Are we in a special directory, if so, which one?
var cdLegit = new Array();	// Tells if the info from a server is legit, or not

var serverIP = '192.168.1.10';	// IP of the node.js server

var videoList = {};			// Caches video data
var ratingList = {};		// Caches rating data
var quickLink = {};			// quickLink[title] = A td link from createLink
var posterLinkList = {};	// Links to the poster TD of the given name

// List of special folders with custom heights
var specialHeights = new Array('movies');

// Create a link
function createLink(txt) {
	var link = $('<td class="linkContainer">'+txt+'</td>')
	
	link.click(function() {
		socket.emit('cd', txt);
	});
	
	// Is this a special dir?
	if(specialDir) {
		// Store a quick link
		quickLink[txt] = link;
		
		// Grab the special info for this
		getSpecial(txt, specialDir);
	}
	
	return link;
}

// Attempt to get info on a special video
function getSpecial(title, sort) {
	// IMDB Stuff
	if(videoList[title]) {
		processSpecial(title, sort);
	} else {
		// Attempt to load in the special info
		$.getJSON(sort+'/'+title+'.json', function(data) {
			videoList[title] = data;
			processSpecial(title, sort);
		});
	}
	
	// Rating stuff
	if(ratingList[title]) {
		processSpecial(title, sort);
	} else {
		// Attempt to load rating
		$.getJSON(sort+'/ratings/'+title+'.json', function(data) {
			ratingList[title] = data;
			processSpecial(title, sort);
		});
	}
}

// Does something with the special info
function processSpecial(title, sort) {
	// Grab link
	var l = quickLink[title];
	
	// Reset link
	l.html(title);
	
	var ratingCon = $('<span class="rating"></span>');
	l.append(ratingCon);
	
	// Push the title on
	if(ratingList[title]) {
		// Grab the data
		var data = ratingList[title];
		
		// Validate the data
		if(data && data.rating) {
			// Push rating in
			var img = $('<img src="ratings/'+data.rating+'.png">');
			ratingCon.append(img);
			ratingCon.append('<br>');
		}
	}
	
	// Push the rating IMAGE on
	if(videoList[title]) {
		// Grab the data
		var data = videoList[title];
		
		// Validate the data
		if(data && data.Title) {
			// Add plot
			if(data.Plot && data.Plot != 'N/A') {
				l.append('<div class="plot">'+data.Plot+'</div>');
			}
			
			// Aussie Rating
			if(data.Poster && data.Poster != 'N/A') {
				var p = posterLinkList[title];
				p.html('');
				
				// Add poster
				var img = $('<img src="'+sort+'/posters/'+title+'.png">');
				p.append(img);
				
				// Allow poster to load directly from imdb
				img.error(function() {
					img.attr("src", data.Poster);
				});
			}
			
			// IMDB Rating
			if(data.imdbRating && data.imdbRating != 'N/A') {
				ratingCon.append(data.imdbRating+'/10');
			}
		}
	}
}

// Grabs the list of files in a dir and sticks it after the file
function fileList(title) {
	divName = friendlyDiv(title);
}

// Removes a file from the file list
function removeFile(file) {
	for(var i=0;i<fileList.length;i++) {
		if(fileList[i].name == file) {
			fileList.splice(i, 1);
			break;
		}
	}
}

function processFileList() {
	// Remove shit
	removeFile('$RECYCLE.BIN');
	removeFile('desktop.ini');
	removeFile('System Volume Information');
	
	var sl = $('#movieSortList');	// Sort List
	
	var order = new Array();
	
	$('li', sl).each(function() {
		order.push({
			num: $(this).data('num'),
			up:$(this).data('up')
		});
	});
	
	// Sort the array
	fileList.sort(function(a, b) {
		// Apply each filter in order
		for(var i=0;i<order.length;i++) {
			// Try this filter:
			var r = filters[order[i].num].fnc(a, b, order[i].up);
			
			// If it isn't the same:
			if(r != 0) {
				// Return the number:
				return r;
			}
		}
		
		// They must be the same
		return 0;
	});
}

function AccendButton(buttonStore) {
	// Add a toggle button:
	var btn = $('<img src="icons/arrow_up.png"/ style="margin-right:8px;float:left;">');
	buttonStore.prepend(btn);
	
	// Initially enabled:
	buttonStore.data("up", true);
	
	// Allow button to toggle:
	btn.click(function() {
		// Toggle build state:
		buttonStore.data("up", !buttonStore.data("up"));
		
		// Toggle icon:
		if(buttonStore.data("up")) {
			btn.attr('src', 'icons/arrow_up.png');
		} else {
			btn.attr('src', 'icons/arrow_down.png');
		}
	});
	
	// Return the button:
	return btn;
}

// List of filters
var filters = new Array();

filters.push({
	txt:'Title',
	fnc:function(a, b, up) {
		if(up) {
			if(a.name < b.name) return -1;
			if(a.name > b.name) return 1;
		} else {
			if(a.name < b.name) return 1;
			if(a.name > b.name) return -1;
		}
		return 0;
	}
});

var ratingOrder = new Array('G', 'PG', 'CAT 1', 'CAT 2', 'Likely M', 'M', 'MA', 'MA 15+', 'R', 'R 18+', 'X', 'X 18+', 'CTC');

filters.push({
	txt:'Classification',
	fnc:function(a, b, up) {
		// Grab ratings
		var dataa = ratingList[a.name];
		var datab = ratingList[b.name];
		
		// Check if scores exist for each movie
		if(dataa && dataa.rating) {
			if(datab && datab.rating) {
				// Do the filter
				if(up) {
					return (ratingOrder.indexOf(dataa.rating)) - (ratingOrder.indexOf(datab.rating));
				} else {
					return (ratingOrder.indexOf(datab.rating)) - (ratingOrder.indexOf(dataa.rating));
				}
			} else {
				return -1;
			}
		} else {
			if(datab && datab.rating) {
				return 1;
			} else {
				return 0;
			}
		}
	}
});

filters.push({
	txt:'Rating',
	fnc:function(a, b, up) {
		// Grab where scores would be stored
		var dataa = videoList[a.name];
		var datab = videoList[b.name];
		
		// Check if scores exist for each movie
		if(dataa && dataa.imdbRating != 'N/A') {
			if(datab && datab.imdbRating != 'N/A') {
				// Grab score of each movie
				var a = parseFloat(dataa.imdbRating);
				var b = parseFloat(datab.imdbRating);
				
				// Do the filter
				if(up) {
					return a - b;
				} else {
					return b - a;
				}
			} else {
				return -1;
			}
		} else {
			if(datab && datab.imdbRating != 'N/A') {
				return 1;
			} else {
				return 0;
			}
		}
	}
});

function friendlyDiv(name) {
	// Replace shit
	name = name.replace(/ /g, '_');
	name = name.replace(/\'/g, '');
	name = name.replace(/\&/g, '');
	name = name.replace(/\(/g, '');
	name = name.replace(/\)/g, '');
	
	return 'fd_'+name;
}

function buildFileList() {
	// Reset our file list
	var l = $('#fileList');
	l.html('');
	
	/* Create floating headers*/
	var t = $('<table id="fileListTableHeadings" cellspacing="1"></table>');
	l.append(t);
	
	var tr = $('<tr class="odd"></tr>');
	t.append(tr);
	
	// Put server headings
	for(var i=0;i<serverList.length;i++) {
		tr.append('<th>'+serverList[i]+'</th>');
	}
	
	/* Create table for file list */
	var t = $('<table id="fileListTable" cellspacing="1"></table>');
	l.append(t);
	
	// Create tr
	var tr = $('<tr class="odd"></tr>');
	t.append(tr);
	
	// Put server headings
	tr.append('<th></th><th class="filenameHeader">Filename</th>');
	
	for(var i=0;i<serverList.length;i++) {
		tr.append('<th>'+serverList[i]+'</th>');
	}
	
	// If the row is odd or not
	var odd = false;
	
	if(path != '') {
		// Create ..
		var tr = $('<tr class="even"></tr>');
		t.append(tr);
		
		// blank cell
		tr.append('<td></td>');
		
		var td = $('<td>..</td>');
		tr.append(td);
		td.click(function() {
			socket.emit('cd', '..');
		});
		for(var i=0;i<serverList.length;i++) {
			tr.append('<td></td>');
		}
	} else {
		odd = true;
	}
	
	for(var i=0;i<fileList.length;i++) {
		// Grab the current file
		var file = fileList[i];
		
		// Change odd
		odd = !odd;
		
		// Get a div friendly title
		ffile = friendlyDiv(file.name);
		
		// Create new tr
		var tr = $('<tr id="'+ffile+'"></tr>');
		t.append(tr);
		
		// Make it an odd or even row
		if(odd) {
			tr.attr('class', 'odd');
		} else {
			tr.attr('class', 'even');
		}
		
		// Append section for poster
		var posterTD = $('<td class="posterContainer"></td>');
		posterLinkList[file.name] = posterTD;
		tr.append(posterTD);
		posterTD.html('<img src="icons/folder.png">');
		
		// Check if this is a special folder
		if(specialHeights.indexOf(specialDir) != -1) {
			// Add custom height class
			posterTD.attr('class', posterTD.attr('class')+' '+specialDir+'Height')
			
			// Remove folder
			posterTD.html('');
		}
		
		// Append filename
		var link = createLink(file.name);
		tr.append(link);
		
		// Append which servers own it
		for(var j=0;j<serverList.length;j++) {
			if(file.has[j]) {
				if(odd) {
					tr.append('<td class="serverHasOdd">&nbsp;</td>');
				} else {
					tr.append('<td class="serverHasEven">&nbsp;</td>');
				}
			} else if(cdLegit[j]) {
				if(odd) {
					tr.append('<td class="serverDoesntHaveOdd">&nbsp;</td>');
				} else {
					tr.append('<td class="serverDoesntHaveEven">&nbsp;</td>');
				}
			} else {
				if(odd) {
					tr.append('<td class="serverDoesntKnowOdd">&nbsp;</td>');
				} else {
					tr.append('<td class="serverDoesntKnowEven">&nbsp;</td>');
				}
			}
		}
	}
}

$(document).ready(function(){
	// Create the socket:
	socket = io.connect('http://'+serverIP+':1337');
	
	// Server sent list of servers over
	socket.on('serverList', function (data) {
		// Store the server list
		serverList = data;
		
		// Ask for the root directory
		socket.emit('cd', '');
	});
	
	// Server sent current directory over
	socket.on('cd', function (data) {
		// Store the data
		path = data.path;
		fileList = data.files;
		specialDir = data.special;
		cdLegit = data.legit;
		
		// Update browser url
		window.location.hash = '#'+path;
		hash = window.location.hash
		
		processFileList();
		buildFileList();
	});
	
	// Server sent the contents of a dir over
	socket.on('dir', function (data) {
		// Grab the friendly div
		var fdiv = $('#'+friendlyDiv(data.title));
		
		for(var i=0;i<data.files.length;i++) {
			// Grab the file
			var f = data.files[i];
			
			var l = '<td class="subFile"></td><td class="subFile">'+f.name+'</td>';
			
			var size = -1;
			
			for(var j=0;j<serverList.length;j++) {
				// Check if this server has the file
				if(f.has[j]) {
					// Check file size
					if(size != -1 && size != f.size[j]) {
						l = l+'<td class="serverHasWrongSize"></td>';
					} else {
						l = l+'<td class="serverHas"></td>';
					}
					
					// Store size
					size = f.size[j];
				} else {
					console.log(data);
					if(data.legit[j]) {
						l = l+'<td class="serverDoesntHave"></td>';
					} else {
						l = l+'<td class="serverDoesntKnow"></td>';
					}
				}
			}
			
			// Append the new row
			fdiv.after('<tr>'+l+'</tr>')
		}
	});
	
	// Hook into backs
	$(window).bind('hashchange', function() {
		if(hash != window.location.hash) {
			socket.emit('cd', '..');
		}
	});
	
	// Build menu
	var m = $('#menu');
	
	var cm = $('<div id="menuContent"></div>');
	m.append(cm);
	
	/* MENU CONTENT */
	var sa = $('<ul id="movieSortList"></ul>');
	cm.append(sa);
	
	for(var i=0;i<filters.length;i++) {
		var f = $('<li>'+filters[i].txt+'</li>');
		f.data('num', i);
		sa.append(f);
		
		// Add a accend/decend button:
		AccendButton(f);
	}
	
	// Enable the sorting:
	sa.sortable();
	
	// Add sort button
	var sortButton = $('<input type="button" value="Sort">');
	cm.append(sortButton);
	sortButton.click(function() {
		// Do it
		processFileList();
		buildFileList();
	});
	
	// Add list button
	var listButton = $('<input type="button" value="File List">');
	cm.append(listButton);
	listButton.click(function() {
		// Request all files
		for(var i=0;i<fileList.length;i++) {
			socket.emit('dir', fileList[i].name);
		}
	});
	
	/* Toggle button */
	var sm = $('<div id="slideMenu"></div>');
	m.append(sm);
	
	sm.click(function() {
		// Toggle the content
		cm.toggle();
		
		// Move file list over
		var fl = $('#fileList');
		if(cm.css('display') == 'none') {
			fl.css('margin-left', '16px');
		} else {
			fl.css('margin-left', '172px');
		}
	});
});
