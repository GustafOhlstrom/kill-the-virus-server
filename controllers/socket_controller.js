/**
 * Socket Controller
 */

const debug = require('debug')('kill-the-virus-server:socket_controller');
let io = null;

const users = {};
let waitingForOpponent = [];

const rooms = [
	// {
	// 	name: 1,
	// 	players: {},
	// 	rounds: [
	// 		{
	// 			readyPlayer: 0,
	// 			time: {
	// 				player1: "00:01.412",
	// 				player2: "00:01.413"
	// 			}
	// 		},
	// 	]
	// },
];

/**
 * Handle a new user connecting
 */
function handleUserRegistration(username, callback) {
    debug("User '%s' connected to the chat", username);
    console.log("user registered!");

	// Save username and mark socket as waiting for opponent
	users[this.id] = username;
	this.username = username;
	waitingForOpponent.push(this)

	// Callback indicating registration to client
	callback("User registered");
	
	// Broadcast to all connected sockets EXCEPT ourselves
	this.broadcast.emit('new-user-connected', username);
    
	// Check if two players are connected and if so broadcast to them
	if(Object.keys(users).length === 2) {

		// Save new data for the room
		rooms.push({
			name: rooms.length,
			players: {},
			rounds: [
				{
					readyPlayer: 2,
					time: {
						player1: "00:01.412",
						player2: "00:01.413"
					}
				},
			]
		});

		// Join the new room
		waitingForOpponent.forEach(socket => {
			socket.join(rooms.length - 1)
			rooms[rooms.length - 1].players[socket.id] = socket.username;
		});

		// Tell client an opponent was found and return the room beings used to play in
		io.in(rooms.length - 1).emit('opponent-found',  rooms[rooms.length - 1]);

		// Clear waitingForOpponent
		waitingForOpponent = [];

		// Start first round
		startNewRound({ room: rooms[rooms.length - 1].name, countdown: 2 })
	}

	console.log("rooms", rooms)
}

/**
 * Start new round
 */
function startNewRound(data) {
	const { room, countdown } = data;
	const round = rooms[room].rounds.length - 1;
	
	console.log("new round");
	
	// Mark one player as ready
	// rooms[room].rounds[round].readyPlayer++;

	// Check if both players are ready
	if(rooms[room].rounds[round ].readyPlayer >= 2) {

		// Calc random delay to show virus icon
		const randomTarget = Math.floor(Math.random() * 5) + 1;
		let counter = 0;

		// Send virus cordinates after a random time
		const counterId = setInterval(() => {
			console.log(counter, randomTarget, countdown)
			
			// Send countdown to client 
			if(counter <= countdown) {
				io.in(room).emit('countdown', countdown - counter);
			}
			// Wait for random delay before sending vrius cordinates to clients
			else if(counter >= randomTarget + countdown) {
				clearInterval(counterId);
				
				io.in(room).emit('display-virus', {
					top: Math.floor(Math.random() * 100),
					left: Math.floor(Math.random() * 100),
				})

				console.log("virus icon to be displayed")
			}
			counter++;
		}, 1000);
	}
}

/**
 * Handle user disconnecting
 */
function handleUserDisconnect() {
    debug(`Socket ${this.id} left the chat :(`);
    console.log("user disconnected!");

	// Broadcast to all connected sockets that this user has left the chat
	if (users[this.id]) {
		this.broadcast.emit('user-disconnected', users[this.id]);
	}
	
	// Remove user from list of connected users
	delete users[this.id];
}

module.exports = function(socket) {
	// this = io
	io = this;
	debug(`Client ${socket.id} connected!`);
	console.log("New client connected", socket.id);

	socket.on('disconnect', handleUserDisconnect);
	socket.on('user-register', handleUserRegistration);
}