/**
 * Socket Controller
 */

const debug = require('debug')('kill-the-virus-server:socket_controller');
let io = null;

let waitingForOpponent = [];

const rooms = [
	// {
	// 	name: 1,
	// 	players: {},
	// 	scores: {
	// 		player1: 3,
	// 		player2: 1,
	// 	},
	// 	rounds: [
	// 		{
	// 			counterId: [],
	// 			startTime: 0,
	// 			times: {
	// 				player1: "00:01.412",
	// 				player2: "00:01.413"
	// 			}
	// 			winner: playerId
	// 		},
	// 	]
	// },
];


/**
 * Validate username
 * Return false if no error
 */
function validateUsername(username) {
	let error = false;
	let usernameRegEx = /^[a-z0-9]+$/i;

    if (username == "") {
        error = "Please enter a username";
    } else if ( (username.length < 2) || (username.length > 10) ) {
        error = "Username must have 2-10 characters";
    } else if ( !usernameRegEx.test(username) ) {
        error = "Invalid username, use only letters and numbers";
    } else {
        error = "";
    }
    return error;
}

/**
 * Handle a new user connecting
 */
function handleUserRegistration(username, callback) {
    debug("User '%s' connected to the chat", username);

	// Check if username failed validation
	const validationErr = validateUsername(username)
	if(validateUsername(username)) {
		debug("User '%s' failed validation: %s", username, validationErr);
		callback({ error: validationErr });
		return;
	}

	// Save username to socket and mark socket as waiting for opponent
	this.username = username;
	waitingForOpponent.push(this);

	// Callback indicating registration to client
	callback({ id: this.id, name: username });
    
	// Check if two players are connected and start a new game
	if(Object.keys(waitingForOpponent).length >= 2) startNewGame();
}

/**
 * Start new game with private room
 */
function startNewGame() {
	// Save new room with base data
	rooms.push({
		name: rooms.length,
		players: {},
		rounds: [],
		scores: {}
	});

	// Two first players join the new room 
	// Two first players are saved with the score 0 to the new room in rooms array
	const playerSockets = waitingForOpponent.splice(0,2);
	playerSockets.forEach(socket => {
		socket.join(rooms.length - 1);
		rooms[rooms.length - 1].players[socket.id] = socket.username;
		rooms[rooms.length - 1].scores[socket.id] = 0;
	});

	// Tell client an opponent was found and return the room beings used to play in
	io.in(rooms.length - 1).emit('opponent-found',  rooms[rooms.length - 1]);

	// Clear waitingForOpponent
	waitingForOpponent = [];

	// Start first round
	startNewRound({ room: rooms[rooms.length - 1].name, countdown: 2 });
}

/**
 * Start new round
 */
function startNewRound(data) {
	const { room, countdown } = data;
	
	// Add starting data for new round
	rooms[room].rounds.push({
		counterId: [],
		startTime: 0,
		times: {},
	});

	let roundNr = rooms[room].rounds.length - 1;
	debug("New round '%s' for room '%s'", roundNr, room);

	// Send new round to players
	io.in(room).emit('newRound', roundNr);

	// Calc random delay to show virus icon
	const randomTarget = Math.floor(Math.random() * 5) + 1;

	// Send virus cordinates after a random time
	let counter = 0;
	const counterId = setInterval(() => {
		// Save counterId to clearInterval at a later stage
		rooms[room].rounds[roundNr].counterId.push(counterId);
		
		// Send countdown to client 
		if(counter <= countdown) {
			io.in(room).emit('countdown', countdown - counter);
		}
		// Wait for random delay before sending vrius cordinates to clients
		else if(counter === randomTarget + countdown) {
			// Save time virus was displayed and sent
			const startTime = new Date().getTime();
			rooms[room].rounds[roundNr].startTime = startTime;

			io.in(room).emit('display-virus', {
				top: Math.floor(Math.random() * 100),
				left: Math.floor(Math.random() * 100),
				startTime,
			});
		}
		// Conced round if no response after 10seconds 
		else if(counter === randomTarget + countdown + 10) {
			clearRoundCounter(room, roundNr);
			handleRoundTimeOut(room, roundNr);
		}
		counter++;
	}, 1000);
	
}

/**
 * Clear the rounds two counters
 */
function clearRoundCounter(room, roundNr) {
	rooms[room].rounds[roundNr].counterId.forEach(id => clearInterval(id));
}

/**
 * Handle round timing out
 */
function handleRoundTimeOut(room, roundNr) {
	const round = rooms[room].rounds[roundNr];

	Object.keys(rooms[room].players).forEach(id => {
		if(!round.times[id]) round.times[id] = 10000;
		debug("Round timed out after 10sec for: %s,", id);
	});

	// Update all players with scoreboard
	io.in(room).emit('scoreboard-update', round.times);

	// Handle winner if both player have clicked virus icon
	if(Object.values(round.times).length === 2) handleRoundWinner(room);
}


/**
 * Handle user clicking virus
 */
function handleClickVirus(data) {
	const { clickTime, room } = data;
	const roundNr = rooms[room].rounds.length - 1;
	const round = rooms[room].rounds[roundNr];
	const time = clickTime - round.startTime;

	debug("Virus clicked after %s milliseconds by user '%s'", clickTime - round.startTime, this.username);

	// Save time it took to click vurs and update all rooms 
	round.times[this.id] = time;
	io.in(room).emit('scoreboard-update', round.times);

	// Handle winner if both player have clicked virus icon
	if(Object.values(round.times).length === 2) {
		clearRoundCounter(room, roundNr);
		handleRoundWinner(room);
	}
}

/**
 * Handle round winner
 */
function handleRoundWinner(room) {
	const roundNr = rooms[room].rounds.length - 1;
	const round = rooms[room].rounds[roundNr];

	// Calc lowest time and save it to data and update score than tell users
	// Null if a draw occurred
	if(Object.values(round.times)[0] === Object.values(round.times)[1]) {
		round.winner = null;
	} else if(Object.values(round.times)[0] < Object.values(round.times)[1]) {
		const playerId = Object.keys(round.times)[0];
		round.winner = playerId;
		rooms[room].scores[playerId]++;
	} else {
		const playerId = Object.keys(round.times)[1];
		round.winner = playerId;
		rooms[room].scores[playerId]++;
	}
	io.in(room).emit('round-winner', { winner: round.winner, scores: rooms[room].scores });

	// Check if it was the final round 
	if(rooms[room].rounds.length === 2) {
		// Calc most wins and send to players
		let winner;
		if(Object.values(rooms[room].scores)[0] === Object.values(rooms[room].scores)[1]) {
			winner = "Draw";
		} else if(Object.values(rooms[room].scores)[0] > Object.values(rooms[room].scores)[1]) {
			winner = Object.keys(rooms[room].scores)[0];
		} else {
			winner = Object.keys(rooms[room].scores)[1];
		}
		
		// let winner = Object.keys(rooms[room].scores).reduce((score, id) => rooms[room].scores[id] > score ? rooms[room].scores[id] : score) 
		io.in(room).emit('winner', winner);
		return;
	}

	// Delay 2 seconds before starting next round
	let sec = 0;
	const delayId = setInterval(() => {
		if(sec === 2) {
			clearInterval(delayId);
			startNewRound({ room, countdown: 2 });
		}
		sec++;
	}, 1000);
}

/**
 * Handle user disconnecting
 */
function handleUserDisconnect() {
    debug(`User: '%s' with socket %s disconnected`, this.username, this.id);
	delete waitingForOpponent[this.id];
}

module.exports = function(socket) {
	// this = io
	io = this;
	debug(`Client ${socket.id} connected!`);

	socket.on('disconnect', handleUserDisconnect);
	socket.on('user-register', handleUserRegistration);

	socket.on('click-virus', handleClickVirus);
}