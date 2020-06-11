/**
 * Socket Controller
 */

const debug = require('debug')('kill-the-virus-server:socket_controller');
const users = {};

/**
 * Handle a new user connecting
 */
function handleUserRegistration(username, callback) {
    debug("User '%s' connected to the chat", username);
    console.log("user registered!");

	users[this.id] = username;
	callback({
		joinGame: true,
		usernameInUse: false,
		// onlineUsers: getOnlineUsers(),
	});

	// // broadcast to all connected sockets EXCEPT ourselves
	this.broadcast.emit('new-user-connected', username);
    
	// // broadcast online users to all connected sockets EXCEPT ourselves
	// this.broadcast.emit('online-users', getOnlineUsers());
}


/**
 * Handle user disconnecting
 */
function handleUserDisconnect() {
    debug(`Socket ${this.id} left the chat :(`);
    console.log("user disconnected!");

	// broadcast to all connected sockets that this user has left the chat
	if (users[this.id]) {
		this.broadcast.emit('user-disconnected', users[this.id]);
	}
	
	// remove user from list of connected users
	delete users[this.id];
}

module.exports = function(socket) {
	// this = io
	debug(`Client ${socket.id} connected!`);
    console.log("New client connected");

	socket.on('disconnect', handleUserDisconnect);
	socket.on('user-register', handleUserRegistration);
}