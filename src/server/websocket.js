const { WebSocketServer } = require('ws');

// In-memory storage for rooms and players
const rooms = new Map();
const players = new Map(); // playerId -> { ws, roomCode, playerData }

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
  const { roomCode, playerName, playerId, matrixSize, bingoCard } = message;
  
  console.log(`Creating room ${roomCode} for player ${playerName}`);
  
  // Check if room already exists
  if (rooms.has(roomCode)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room already exists. Please choose a different room code.'
    }));
    return;
  }
  
  // Create new room
  rooms.set(roomCode, {
    players: [],
    host: playerId,
    matrixSize,
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
    bingoCard,
    roomInfo: {
      matrixSize: room.matrixSize,
      createdAt: room.createdAt
    }
  }));
};

const handleJoinRoom = (ws, message) => {
  const { roomCode, playerName, playerId, bingoCard } = message;
  
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

  // Notify new player
  ws.send(JSON.stringify({
    type: 'room_joined',
    players: room.players,
    gameStarted: room.gameStarted,
    currentCaller: room.currentCaller,
    calledNumbers: room.calledNumbers,
    availableNumbers: room.availableNumbers,
    bingoCard,
    roomInfo: {
      matrixSize: room.matrixSize,
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

  broadcastToRoom(roomCode, {
    type: 'game_started',
    currentCaller,
    availableNumbers,
    gameStartedAt: new Date()
  });
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

  broadcastToRoom(roomCode, {
    type: 'number_called',
    number,
    calledNumbers,
    availableNumbers,
    nextCaller,
    calledAt: new Date()
  });
};

const handleClaimBingo = (message) => {
  const { roomCode, winner, playerId } = message;
  const room = rooms.get(roomCode);
  
  if (!room) {
    console.log(`Cannot claim BINGO: Room ${roomCode} not found`);
    return;
  }

  console.log(`BINGO claimed by ${winner} in room ${roomCode}!`);

  room.winner = winner;
  room.gameStarted = false;

  broadcastToRoom(roomCode, {
    type: 'game_won',
    winner,
    wonAt: new Date()
  });
};

const handleLeaveRoom = (message) => {
  const { playerId } = message;
  console.log(`Player ${playerId} leaving room`);
  handlePlayerDisconnect(playerId);
};

const handlePlayerDisconnect = (playerId) => {
  const playerData = players.get(playerId);
  if (!playerData) return;

  const { roomCode } = playerData;
  const room = rooms.get(roomCode);
  
  if (room) {
    const leavingPlayer = room.players.find(p => p.id === playerId);
    console.log(`Player ${leavingPlayer?.name || playerId} disconnected from room ${roomCode}`);
    
    // Remove player from room
    room.players = room.players.filter(p => p.id !== playerId);
    
    // If host left, assign new host
    let newHost = null;
    if (room.host === playerId && room.players.length > 0) {
      room.host = room.players[0].id;
      room.players[0].isHost = true;
      newHost = room.players[0].id;
      console.log(`New host assigned: ${room.players[0].name}`);
    }

    // If room is empty, delete it
    if (room.players.length === 0) {
      console.log(`Room ${roomCode} is empty, deleting...`);
      rooms.delete(roomCode);
    } else {
      // Notify remaining players
      broadcastToRoom(roomCode, {
        type: 'player_left',
        players: room.players,
        newHost,
        leftPlayer: leavingPlayer
      });
    }
  }

  players.delete(playerId);
};

const broadcastToRoom = (roomCode, message, excludePlayerId = null) => {
  const room = rooms.get(roomCode);
  if (!room) return;

  let successCount = 0;
  let failCount = 0;

  room.players.forEach(player => {
    if (player.id === excludePlayerId) return;
    
    const playerData = players.get(player.id);
    if (playerData && playerData.ws && playerData.ws.readyState === 1) {
      try {
        playerData.ws.send(JSON.stringify(message));
        successCount++;
      } catch (error) {
        console.error(`Error sending message to player ${player.name}:`, error);
        failCount++;
      }
    } else {
      failCount++;
    }
  });

  if (message.type !== 'ping') {
    console.log(`Broadcasted ${message.type} to room ${roomCode}: ${successCount} success, ${failCount} failed`);
  }
};

// Cleanup inactive connections
const cleanupInactiveConnections = () => {
  console.log('Cleaning up inactive connections...');
  let cleaned = 0;
  
  for (const [playerId, playerData] of players.entries()) {
    if (!playerData.ws || playerData.ws.readyState !== 1) {
      handlePlayerDisconnect(playerId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} inactive connections`);
  }
};

// Run cleanup every 30 seconds
setInterval(cleanupInactiveConnections, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down WebSocket server...');
  wss.close((err) => {
    if (err) {
      console.error('Error closing WebSocket server:', err);
    } else {
      console.log('WebSocket server closed successfully');
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  wss.close();
});

// Log server stats every minute
setInterval(() => {
  console.log(`Server stats - Rooms: ${rooms.size}, Active players: ${players.size}`);
}, 60000);