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
	// 	winner: false,
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
	if(Object.keys(waitingForOpponent).length >= 2) {
		startNewGame();
	}
}

/**
 * Start new game with private roomName
 */
function startNewGame() {
	const roomName = rooms.length

	// Save new roomName with base data
	rooms.push({
		name: roomName,
		players: {},
		winner: null,
		rounds: [],
		scores: {}
	});

	// Two first players join the new roomName 
	// Two first players are saved with the score 0 to the new roomName in rooms array
	const playerSockets = waitingForOpponent.splice(0,2);
	playerSockets.forEach(socket => {
		socket.join(roomName);
		rooms[roomName].players[socket.id] = socket.username;
		rooms[roomName].scores[socket.id] = 0;
	});

	// Tell client an opponent was found and return the roomName beings used to play in
	io.in(roomName).emit('opponent-found',  rooms[roomName]);

	// Clear waitingForOpponent
	waitingForOpponent = [];

	// Start first round
	if(!rooms[roomName].winner) {
		startNewRound({ roomName, countdown: 2 });
	}
}

/**
 * Start new round
 */
function startNewRound(data) {
	const { roomName, countdown } = data;
	
	// Add starting data for new round
	rooms[roomName].rounds.push({
		counterId: [],
		startTime: 0,
		times: {},
	});

	const roundNr = getCurrentRoundNr(roomName);
	const round = getRound(roomName, roundNr);
	debug("New round '%s' for roomName '%s'", roundNr, roomName);

	// Send new round to players
	if(!rooms[roomName].winner) {
		io.in(roomName).emit('newRound', roundNr);
	}

	// Calc random delay to show virus icon
	const randomTarget = Math.floor(Math.random() * 5) + 1;

	// Send virus cordinates after a random time
	let counter = 0;
	const counterId = setInterval(() => {
		// Save counterId to clearInterval at a later stage
		if(counter === 0) {
			round.counterId.push(counterId);
		}
		
		// Send countdown to client 
		if(counter <= countdown) {
			if(!rooms[roomName].winner) io.in(roomName).emit('countdown', countdown - counter);
		}
		// Wait for random delay before sending virus cordinates to clients
		else if(counter === randomTarget + countdown) {
			// Save time virus was displayed and sent
			const startTime = new Date().getTime();
			round.startTime = startTime;

			if(!rooms[roomName].winner) {
				io.in(roomName).emit('display-virus', {
					top: Math.floor(Math.random() * 100),
					left: Math.floor(Math.random() * 100),
					startTime,
				});
			}
		}
		// Conced round if no response after 10seconds 
		else if(counter === randomTarget + countdown + 10) {
			clearRoundCounter(roomName, roundNr);
			if(!rooms[roomName].winner) {
				handleRoundTimeOut(roomName, roundNr);
			}
		}
		counter++;
	}, 1000);
	
}

/**
 * Clear the rounds two counters
 */
function clearRoundCounter(roomName, roundNr) {
	getRound(roomName, roundNr).counterId.forEach(id => clearInterval(id));
}

/**
 * Handle round timing out
 */
function handleRoundTimeOut(roomName, roundNr) {
	const round = getRound(roomName, roundNr);

	// Save timed out time for player
	Object.keys(rooms[roomName].players).forEach(id => {
		if(!round.times[id]) {
			round.times[id] = 10000;
		}
		debug("Round timed out after 10sec for: %s,", id);
	});

	// Update all players with scoreboard
	if(!rooms[roomName].winner) {
		io.in(roomName).emit('scoreboard-update', round.times);
	}

	// Handle winner if both player have clicked virus icon
	if(Object.values(round.times).length === 2) {
		handleRoundWinner(roomName);
	}
}

/**
 * Get the current round being played in the room
 */
function getCurrentRoundNr(roomName) {
	return rooms[roomName].rounds.length - 1;
}

/**
 * Get the round object itself with roomName and roundNr
 */
function getRound(roomName, roundNr) {
	return rooms[roomName].rounds[roundNr];
}

/**
 * Handle user clicking virus
 */
function handleClickVirus(data) {
	const { clickTime, roomName } = data;
	const roundNr = getCurrentRoundNr(roomName);
	const round = getRound(roomName, roundNr);
	const time = clickTime - round.startTime;

	debug("Virus clicked after %s milliseconds by user '%s'", clickTime - round.startTime, this.username);

	// Save time it took to click vurs and update all rooms 
	round.times[this.id] = time;
	if(!rooms[roomName].winner) {
		io.in(roomName).emit('scoreboard-update', round.times);
	}

	// Handle winner if both player have clicked virus icon
	if(Object.values(round.times).length === 2) {
		clearRoundCounter(roomName, roundNr);
		if(!rooms[roomName].winner) {
			handleRoundWinner(roomName);
		}
	}
}

/**
 * Handle round winner
 */
function handleRoundWinner(roomName) {
	const roundNr = getCurrentRoundNr(roomName);
	const round = getRound(roomName, roundNr);

	// Calc lowest time and save it to data
	// Null if a draw occurred
	if(Object.values(round.times)[0] === Object.values(round.times)[1]) {
		round.winner = null;
	} else if(Object.values(round.times)[0] < Object.values(round.times)[1]) {
		const playerId = Object.keys(round.times)[0];
		round.winner = playerId;
		rooms[roomName].scores[playerId]++;
	} else {
		const playerId = Object.keys(round.times)[1];
		round.winner = playerId;
		rooms[roomName].scores[playerId]++;
	}

	// Update player with the winner and the scores
	if(!rooms[roomName].winner) {
		io.in(roomName).emit('round-winner', { winner: round.winner, scores: rooms[roomName].scores });
	}

	// Check if it was the final round
	if(roundNr + 1 === 2) {
		// Calc most wins and send to players
		let winner;
		if(Object.values(rooms[roomName].scores)[0] === Object.values(rooms[roomName].scores)[1]) {
			winner = "Draw";
		} else if(Object.values(rooms[roomName].scores)[0] > Object.values(rooms[roomName].scores)[1]) {
			winner = Object.keys(rooms[roomName].scores)[0];
		} else {
			winner = Object.keys(rooms[roomName].scores)[1];
		}
		
		// Set winner and inform players
		if(!rooms[roomName].winner) {
			rooms[roomName].winner = winner;
			io.in(roomName).emit('winner', winner);
		}
		return;
	}

	// Delay 2 seconds before starting next round
	let sec = 0;
	const delayId = setInterval(() => {
		if(sec === 2) {
			clearInterval(delayId);
			if(!rooms[roomName].winner) {
				startNewRound({ roomName, countdown: 2 });
			}
		}
		sec++;
	}, 1000);
}

/**
 * Surrender game
 */
function surrenderGame(room, id) {
	// Set winner, this will also stop all opperations currently taking place
	room.winner = Object.keys(room.players).find(player => player !== id);
	debug(`User: '%s' surrendered game in roomName %s`, id, room);

	// Clear counters and tell player left that they won
	clearRoundCounter(room.name, getCurrentRoundNr(room.name));
	io.in(room.name).emit('surrender', room.winner);
}

/**
 * Handle user disconnecting
 */
function handleUserDisconnect() {
    debug(`User: '%s' with socket %s disconnected`, this.username, this.id);
	
	// Find rooms player disconnected from
	const disconnectedRoom = rooms.find(room => room.players.hasOwnProperty(this.id));

	// Surrender games in rooms and delete player from waiting for opponent
	delete waitingForOpponent[this.id];
	if(disconnectedRoom && ! disconnectedRoom.winner) {
		surrenderGame(disconnectedRoom, this.id);
	}
}

module.exports = function(socket) {
	// this = io
	io = this;
	debug(`Client ${socket.id} connected!`);

	socket.on('disconnect', handleUserDisconnect);
	socket.on('user-register', handleUserRegistration);

	socket.on('click-virus', handleClickVirus);
}