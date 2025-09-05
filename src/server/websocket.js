const { WebSocketServer } = require('ws');

// In-memory storage for rooms and players
const rooms = new Map();
const players = new Map(); // playerId -> { ws, roomCode, playerData }
const turnTimers = new Map(); // roomCode -> timerId

console.log('Starting WebSocket server on port 8080...');

const wss = new WebSocketServer({ 
  port: 8080,
  perMessageDeflate: false,
});

console.log('WebSocket server started successfully on ws://localhost:8080');

wss.on('connection', (ws, req) => {
  console.log('New client connected from:', req.socket.remoteAddress);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message.type, message.roomCode);
      handleMessage(ws, message);
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    // Find and remove player
    for (const [playerId, playerData] of players.entries()) {
      if (playerData.ws === ws) {
        handlePlayerDisconnect(playerId);
        break;
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to BINGO WebSocket server'
  }));
});

const handleMessage = (ws, message) => {
  switch (message.type) {
    case 'create_room':
      handleCreateRoom(ws, message);
      break;
    case 'join_room':
      handleJoinRoom(ws, message);
      break;
    case 'start_game':
      handleStartGame(message);
      break;
    case 'call_number':
      handleCallNumber(message);
      break;
    case 'skip_turn':
      handleSkipTurn(message);
      break;
    case 'claim_bingo':
      handleClaimBingo(message);
      break;
    case 'leave_room':
      handleLeaveRoom(message);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      console.log('Unknown message type:', message.type);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type'
      }));
  }
};

const handleCreateRoom = (ws, message) => {
  const { roomCode, playerName, playerId, matrixSize, bingoCard, winningCriteria } = message;
  
  console.log(`Creating room ${roomCode} for player ${playerName}`);
  
  // Check if room already exists
  if (rooms.has(roomCode)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room already exists. Please choose a different room code.'
    }));
    return;
  }
  
  // Create new room with settings
  const roomSettings = {
    matrixSize,
    winningCriteria,
    turnTimeLimit: 10 // 10 seconds per turn
  };
  
  rooms.set(roomCode, {
    players: [],
    host: playerId,
    settings: roomSettings, // Store room settings
    gameStarted: false,
    calledNumbers: [],
    availableNumbers: Array.from({ length: matrixSize * matrixSize }, (_, i) => i + 1),
    currentCaller: null,
    winner: null,
    createdAt: new Date()
  });

  // Add player to room
  const playerData = {
    ws,
    roomCode,
    playerData: {
      id: playerId,
      name: playerName,
      isHost: true,
      isOnline: true,
      bingoCard,
      joinedAt: new Date()
    }
  };

  players.set(playerId, playerData);
  
  const room = rooms.get(roomCode);
  room.players.push(playerData.playerData);

  console.log(`Room ${roomCode} created successfully with ${room.players.length} players`);

  // Send confirmation to creator
  ws.send(JSON.stringify({
    type: 'room_joined',
    players: room.players,
    gameStarted: room.gameStarted,
    currentCaller: room.currentCaller,
    calledNumbers: room.calledNumbers || [],
    availableNumbers: room.availableNumbers || [],
    bingoCard,
    roomSettings: room.settings,
    roomInfo: {
      matrixSize: room.settings.matrixSize,
      createdAt: room.createdAt,
      winningCriteria: room.settings.winningCriteria
    },
    // Add player identification for the client
    playerId: playerId,
    isHost: true
  }));
};

const handleJoinRoom = (ws, message) => {
  const { roomCode, playerName, playerId } = message;
  
  console.log(`Player ${playerName} trying to join room ${roomCode}`);
  
  const room = rooms.get(roomCode);
  if (!room) {
    console.log(`Room ${roomCode} not found`);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room not found. Please check the room code.'
    }));
    return;
  }

  // Check if player name already exists in room
  const existingPlayer = room.players.find(p => p.name === playerName);
  if (existingPlayer) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'A player with this name already exists in the room. Please choose a different name.'
    }));
    return;
  }

  // Generate BINGO card based on room's matrix size
  const generateBingoCard = (size) => {
    const maxNumber = size * size;
    const numbers = [];
    const usedNumbers = new Set();
    
    for (let i = 0; i < maxNumber; i++) {
      let num;
      do {
        num = Math.floor(Math.random() * maxNumber) + 1;
      } while (usedNumbers.has(num));
      usedNumbers.add(num);
      numbers.push(num);
    }
    
    return numbers;
  };

  const bingoCard = generateBingoCard(room.settings.matrixSize);

  // Add player to room
  const playerData = {
    ws,
    roomCode,
    playerData: {
      id: playerId,
      name: playerName,
      isHost: false,
      isOnline: true,
      bingoCard,
      joinedAt: new Date()
    }
  };

  players.set(playerId, playerData);
  room.players.push(playerData.playerData);

  console.log(`Player ${playerName} joined room ${roomCode}. Total players: ${room.players.length}`);

  // Notify new player with room settings
  ws.send(JSON.stringify({
    type: 'room_joined',
    players: room.players,
    gameStarted: room.gameStarted,
    currentCaller: room.currentCaller,
    calledNumbers: room.calledNumbers,
    availableNumbers: room.availableNumbers,
    bingoCard,
    roomSettings: room.settings, // Include room settings for joiners
    roomInfo: {
      matrixSize: room.settings.matrixSize,
      createdAt: room.createdAt
    }
  }));

  // Notify all other players in room
  broadcastToRoom(roomCode, {
    type: 'player_joined',
    players: room.players,
    newPlayer: playerData.playerData
  }, playerId);
};

const startTurnTimer = (roomCode) => {
  // Clear existing timer if any
  if (turnTimers.has(roomCode)) {
    clearTimeout(turnTimers.get(roomCode));
  }
  
  const room = rooms.get(roomCode);
  if (!room || !room.gameStarted || room.winner) return;
  
  console.log(`Starting 10-second timer for room ${roomCode}`);
  
  const timerId = setTimeout(() => {
    console.log(`Timer expired for room ${roomCode}, auto-skipping turn`);
    autoSkipTurn(roomCode);
  }, 10000); // 10 seconds
  
  turnTimers.set(roomCode, timerId);
};

const clearTurnTimer = (roomCode) => {
  if (turnTimers.has(roomCode)) {
    clearTimeout(turnTimers.get(roomCode));
    turnTimers.delete(roomCode);
  }
};

const autoSkipTurn = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room || !room.gameStarted || room.winner) return;
  
  // Find next caller (rotate through players)
  const currentIndex = room.players.findIndex(p => p.id === room.currentCaller);
  const nextIndex = (currentIndex + 1) % room.players.length;
  const nextCaller = room.players[nextIndex]?.id;
  
  console.log(`Auto-skipping turn in room ${roomCode}. Next caller: ${nextCaller}`);
  
  room.currentCaller = nextCaller;
  
  broadcastToRoom(roomCode, {
    type: 'turn_skipped',
    nextCaller,
    reason: 'timeout',
    skippedAt: new Date()
  });
  
  // Start timer for next player
  if (nextCaller && room.gameStarted && !room.winner) {
    startTurnTimer(roomCode);
  }
};

const handleStartGame = (message) => {
  const { roomCode, availableNumbers, currentCaller } = message;
  const room = rooms.get(roomCode);
  
  if (!room) {
    console.log(`Cannot start game: Room ${roomCode} not found`);
    return;
  }

  console.log(`Starting game in room ${roomCode}`);

  room.gameStarted = true;
  room.calledNumbers = [];
  room.availableNumbers = availableNumbers;
  room.currentCaller = currentCaller;
  room.winner = null;

  // Clear any existing timers and start fresh
  clearTurnTimer(roomCode);

  broadcastToRoom(roomCode, {
    type: 'game_started',
    currentCaller,
    availableNumbers,
    gameStartedAt: new Date()
  });
  
  // Start timer for first caller
  if (currentCaller) {
    startTurnTimer(roomCode);
  }
};

const handleCallNumber = (message) => {
  const { roomCode, number, calledNumbers, availableNumbers, nextCaller } = message;
  const room = rooms.get(roomCode);
  
  if (!room) {
    console.log(`Cannot call number: Room ${roomCode} not found`);
    return;
  }

  console.log(`Number ${number} called in room ${roomCode}. Next caller: ${nextCaller}`);

  room.calledNumbers = calledNumbers;
  room.availableNumbers = availableNumbers;
  room.currentCaller = nextCaller;

  // Clear current timer and start new one for next player
  clearTurnTimer(roomCode);

  broadcastToRoom(roomCode, {
    type: 'number_called',
    number,
    calledNumbers,
    availableNumbers,
    nextCaller,
    calledAt: new Date()
  });
  
  // Start timer for next caller if game is still active
  if (nextCaller && room.gameStarted && !room.winner) {
    startTurnTimer(roomCode);
  }
};

const handleSkipTurn = (message) => {
  const { roomCode, nextCaller } = message;
  const room = rooms.get(roomCode);
  
  if (!room) {
    console.log(`Cannot skip turn: Room ${roomCode} not found`);
    return;
  }

  console.log(`Turn skipped in room ${roomCode}. Next caller: ${nextCaller}`);

  room.currentCaller = nextCaller;

  // Clear current timer and start new one for next player
  clearTurnTimer(roomCode);

  broadcastToRoom(roomCode, {
    type: 'turn_skipped',
    nextCaller,
    reason: 'manual',
    skippedAt: new Date()
  });
  
  // Start timer for next caller if game is still active
  if (nextCaller && room.gameStarted && !room.winner) {
    startTurnTimer(roomCode);
  }
};

const handleClaimBingo = (message) => {
  const { roomCode, winner, playerId, winningPattern, completedLines } = message;
  const room = rooms.get(roomCode);
  
  if (!room) {
    console.log(`Cannot claim BINGO: Room ${roomCode} not found`);
    return;
  }

  console.log(`BINGO claimed in room ${roomCode} by ${winner}`);

  // Stop the game immediately
  room.winner = winner;
  room.gameStarted = false;
  
  // Clear turn timer since game is over
  clearTurnTimer(roomCode);

  broadcastToRoom(roomCode, {
    type: 'game_won',
    winner,
    playerId,
    winningPattern,
    completedLines,
    wonAt: new Date()
  });
};

const handleLeaveRoom = (message) => {
  const { roomCode, playerId } = message;
  
  console.log(`Player ${playerId} leaving room ${roomCode}`);
  
  const playerData = players.get(playerId);
  if (!playerData) {
    console.log(`Player ${playerId} not found`);
    return;
  }

  const room = rooms.get(roomCode);
  if (!room) {
    console.log(`Room ${roomCode} not found`);
    return;
  }

  // Remove player from room
  room.players = room.players.filter(p => p.id !== playerId);
  players.delete(playerId);

  // If this was the host, assign new host
  let newHost = null;
  if (room.host === playerId && room.players.length > 0) {
    newHost = room.players[0].id;
    room.host = newHost;
    room.players[0].isHost = true;
    
    // Update the player data in the players map
    const newHostPlayerData = players.get(newHost);
    if (newHostPlayerData) {
      newHostPlayerData.playerData.isHost = true;
    }
  }

  console.log(`Player left room ${roomCode}. Remaining players: ${room.players.length}`);

  // If no players left, clean up room and timer
  if (room.players.length === 0) {
    clearTurnTimer(roomCode);
    rooms.delete(roomCode);
    console.log(`Room ${roomCode} deleted (no players remaining)`);
    return;
  }

  // If current caller left, advance to next player
  if (room.currentCaller === playerId && room.gameStarted && !room.winner) {
    const nextIndex = 0; // Start with first remaining player
    const nextCaller = room.players[nextIndex]?.id;
    room.currentCaller = nextCaller;
    
    clearTurnTimer(roomCode);
    if (nextCaller) {
      startTurnTimer(roomCode);
    }
    
    broadcastToRoom(roomCode, {
      type: 'caller_changed',
      nextCaller,
      reason: 'player_left'
    });
  }

  // Notify remaining players
  broadcastToRoom(roomCode, {
    type: 'player_left',
    players: room.players,
    leftPlayer: playerData.playerData,
    newHost
  });
};

const handlePlayerDisconnect = (playerId) => {
  console.log(`Handling disconnect for player ${playerId}`);
  
  const playerData = players.get(playerId);
  if (!playerData) {
    console.log(`Player ${playerId} not found in players map`);
    return;
  }

  const roomCode = playerData.roomCode;
  handleLeaveRoom({ roomCode, playerId });
};

const broadcastToRoom = (roomCode, message, excludePlayerId = null) => {
  const room = rooms.get(roomCode);
  if (!room) {
    console.log(`Cannot broadcast to room ${roomCode}: room not found`);
    return;
  }

  console.log(`Broadcasting to room ${roomCode}:`, message.type);

  room.players.forEach(player => {
    if (excludePlayerId && player.id === excludePlayerId) return;
    
    const playerConnection = players.get(player.id);
    if (playerConnection && playerConnection.ws.readyState === playerConnection.ws.OPEN) {
      try {
        playerConnection.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to player ${player.id}:`, error);
      }
    }
  });
};

// Cleanup function for when server shuts down
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Clear all turn timers
  for (const [roomCode, timerId] of turnTimers.entries()) {
    clearTimeout(timerId);
  }
  turnTimers.clear();
  
  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1000, 'Server shutting down');
  });
  
  process.exit(0);
});

console.log('BINGO WebSocket server is running with turn timers enabled!');