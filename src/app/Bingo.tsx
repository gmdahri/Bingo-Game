'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Settings, Play, RotateCcw, Trophy, Copy, Check, Volume2, VolumeX } from 'lucide-react';

const BINGOGame = () => {
  // WebSocket connection
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const isConnecting = useRef(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  // Game state
  const [gameState, setGameState] = useState('landing'); // 'landing', 'room', 'game'
  const [matrixSize, setMatrixSize] = useState(5);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [bingoCard, setBingoCard] = useState([]);
  const [markedNumbers, setMarkedNumbers] = useState(new Set());
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [availableNumbers, setAvailableNumbers] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showCopied, setShowCopied] = useState(false);
  const [currentCaller, setCurrentCaller] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastCaller, setLastCaller] = useState(null);
  const [winningCriteria, setWinningCriteria] = useState('standard'); // 'standard', 'multiple'

  // Generate room code
  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Generate player ID
  const generatePlayerId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  // Sound effects - moved up before other functions use it
  const playSound = useCallback((type) => {
    if (!soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      switch (type) {
        case 'click':
          // Quick click sound
          const clickOsc = audioContext.createOscillator();
          const clickGain = audioContext.createGain();
          clickOsc.connect(clickGain);
          clickGain.connect(audioContext.destination);
          clickOsc.frequency.setValueAtTime(800, audioContext.currentTime);
          clickGain.gain.setValueAtTime(0.15, audioContext.currentTime);
          clickGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          clickOsc.start(audioContext.currentTime);
          clickOsc.stop(audioContext.currentTime + 0.1);
          break;
          
        case 'your-turn':
          // Exciting notification melody
          const turnTimes = [0, 0.1, 0.2];
          const turnFreqs = [523, 659, 784]; // C, E, G chord
          
          turnTimes.forEach((time, index) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.setValueAtTime(turnFreqs[index], audioContext.currentTime + time);
            gain.gain.setValueAtTime(0.2, audioContext.currentTime + time);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.3);
            osc.start(audioContext.currentTime + time);
            osc.stop(audioContext.currentTime + time + 0.3);
          });
          break;
          
        case 'number-called':
          // Pleasant notification sound
          const numOsc = audioContext.createOscillator();
          const numGain = audioContext.createGain();
          numOsc.connect(numGain);
          numGain.connect(audioContext.destination);
          numOsc.frequency.setValueAtTime(440, audioContext.currentTime);
          numOsc.frequency.setValueAtTime(550, audioContext.currentTime + 0.1);
          numGain.gain.setValueAtTime(0.2, audioContext.currentTime);
          numGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
          numOsc.start(audioContext.currentTime);
          numOsc.stop(audioContext.currentTime + 0.25);
          break;
          
        case 'bingo':
          // Victory fanfare - much more exciting!
          const bingoMelody = [
            { freq: 523, time: 0,    duration: 0.2 }, // C
            { freq: 659, time: 0.2,  duration: 0.2 }, // E
            { freq: 784, time: 0.4,  duration: 0.2 }, // G
            { freq: 1047, time: 0.6, duration: 0.3 }, // C (higher)
            { freq: 1319, time: 0.9, duration: 0.4 }, // E (higher)
            { freq: 1047, time: 1.3, duration: 0.2 }, // C (higher)
            { freq: 784, time: 1.5,  duration: 0.2 }, // G
            { freq: 1047, time: 1.7, duration: 0.5 }, // C (higher) - finale
          ];
          
          bingoMelody.forEach(({ freq, time, duration }) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.setValueAtTime(freq, audioContext.currentTime + time);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime + time);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + duration);
            osc.start(audioContext.currentTime + time);
            osc.stop(audioContext.currentTime + time + duration);
          });
          
          // Add some bass notes for richness
          const bassTimes = [0, 0.6, 1.2, 1.7];
          const bassFreqs = [131, 165, 196, 262]; // Bass notes
          
          bassTimes.forEach((time, index) => {
            const bassOsc = audioContext.createOscillator();
            const bassGain = audioContext.createGain();
            bassOsc.connect(bassGain);
            bassGain.connect(audioContext.destination);
            bassOsc.frequency.setValueAtTime(bassFreqs[index], audioContext.currentTime + time);
            bassGain.gain.setValueAtTime(0.15, audioContext.currentTime + time);
            bassGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.4);
            bassOsc.start(audioContext.currentTime + time);
            bassOsc.stop(audioContext.currentTime + time + 0.4);
          });
          break;
          
        case 'join-room':
          // Welcome sound
          const joinOsc = audioContext.createOscillator();
          const joinGain = audioContext.createGain();
          joinOsc.connect(joinGain);
          joinGain.connect(audioContext.destination);
          joinOsc.frequency.setValueAtTime(392, audioContext.currentTime);
          joinOsc.frequency.setValueAtTime(523, audioContext.currentTime + 0.15);
          joinGain.gain.setValueAtTime(0.2, audioContext.currentTime);
          joinGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          joinOsc.start(audioContext.currentTime);
          joinOsc.stop(audioContext.currentTime + 0.3);
          break;
          
        case 'game-start':
          // Game start fanfare
          const startMelody = [
            { freq: 262, time: 0 },    // C
            { freq: 330, time: 0.1 },  // E
            { freq: 392, time: 0.2 },  // G
            { freq: 523, time: 0.3 },  // C (higher)
          ];
          
          startMelody.forEach(({ freq, time }) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.setValueAtTime(freq, audioContext.currentTime + time);
            gain.gain.setValueAtTime(0.25, audioContext.currentTime + time);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.2);
            osc.start(audioContext.currentTime + time);
            osc.stop(audioContext.currentTime + time + 0.2);
          });
          break;
      }
      
    } catch (error) {
      console.log('Audio not supported or blocked');
    }
  }, [soundEnabled]);

  // Generate BINGO card
  const generateBingoCard = useCallback((size) => {
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
  }, []);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data) => {
    console.log('Processing message:', data.type);
    
    switch (data.type) {
      case 'connected':
        console.log('Server connection confirmed');
        break;
        
      case 'room_joined':
        console.log('Successfully joined room, players:', data.players?.length);
        setPlayers(data.players || []);
        setGameStarted(data.gameStarted || false);
        setCurrentCaller(data.currentCaller || null);
        if (data.calledNumbers) {
          setCalledNumbers(data.calledNumbers);
        }
        if (data.availableNumbers) {
          setAvailableNumbers(data.availableNumbers);
        }
        playSound('join-room');
        break;
        
      case 'player_joined':
        console.log('Player joined, total players:', data.players?.length);
        setPlayers(data.players || []);
        break;
        
      case 'player_left':
        console.log('Player left, remaining players:', data.players?.length);
        setPlayers(data.players || []);
        if (data.newHost === playerId) {
          setIsHost(true);
        }
        break;
        
      case 'game_started':
        console.log('Game started, current caller:', data.currentCaller);
        setGameStarted(true);
        setCalledNumbers([]);
        setMarkedNumbers(new Set());
        setWinner(null);
        setCurrentCaller(data.currentCaller);
        setAvailableNumbers(data.availableNumbers || []);
        playSound('game-start');
        break;
        
      case 'number_called':
        console.log('Number called:', data.number, 'Next caller:', data.nextCaller);
        setCalledNumbers(data.calledNumbers || []);
        setAvailableNumbers(data.availableNumbers || []);
        setCurrentCaller(data.nextCaller);
        playSound('number-called');
        break;
        
      case 'game_won':
        console.log('Game won by:', data.winner);
        setWinner(data.winner);
        break;
        
      case 'error':
        console.error('Server error:', data.message);
        alert('Error: ' + data.message);
        if (data.message.includes('Room not found') || data.message.includes('room code')) {
          setGameState('landing');
          setRoomCode('');
        }
        break;
        
      case 'pong':
        // Keepalive response
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
  }, [playerId]);

  const getWebSocketURL = () => {
    // Check if we're in development or production
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      // Development mode - use localhost
      return 'ws://localhost:8080';
    } else {
      // Production mode - use the same domain but with WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.hostname}:8080`;
    }
  };

  // WebSocket connection setup - simplified
  const connectWebSocket = useCallback(() => {
    // Prevent multiple connection attempts
    if (isConnecting.current || (ws.current && ws.current.readyState === WebSocket.OPEN)) {
      return;
    }
    
    isConnecting.current = true;
    setConnectionStatus('connecting');
    console.log('Creating WebSocket connection...');

    try {
      // Close existing connection
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }

      ws.current = new WebSocket(getWebSocketURL());
      
      ws.current.onopen = () => {
        console.log('✅ WebSocket connected');
        setConnectionStatus('connected');
        isConnecting.current = false;
        
        // Clear any reconnect timer
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };
      
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.current.onclose = (event) => {
        console.log(`❌ WebSocket closed: ${event.code} - ${event.reason || 'No reason'}`);
        setConnectionStatus('disconnected');
        isConnecting.current = false;
        
        // Auto-reconnect unless it was intentional closure
        if (event.code !== 1000 && !reconnectTimer.current) {
          console.log('🔄 Scheduling reconnection...');
          reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = null;
            connectWebSocket();
          }, 2000);
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionStatus('error');
        isConnecting.current = false;
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      setConnectionStatus('error');
      isConnecting.current = false;
    }
  }, [handleWebSocketMessage]);

  // Send WebSocket message
  const sendMessage = useCallback((data) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('📤 Sending:', data.type, data.roomCode || '');
      ws.current.send(JSON.stringify(data));
      return true;
    } else {
      console.warn('❌ Cannot send message, WebSocket not connected:', data.type);
      return false;
    }
  }, []);

  // Effect to play sound when it becomes user's turn
  useEffect(() => {
    if (currentCaller && currentCaller === playerId && lastCaller !== currentCaller) {
      console.log('🎯 It\'s your turn to call!');
      playSound('your-turn');
    }
    setLastCaller(currentCaller);
  }, [currentCaller, playerId, lastCaller, playSound]);

  // Initialize WebSocket connection once
  useEffect(() => {
    connectWebSocket();
    
    // Cleanup function
    return () => {
      console.log('🧹 Component cleanup');
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnection
        ws.current.close(1000, 'Component unmount');
      }
    };
  }, []); // Only run once

  // Create room
  const createRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    if (connectionStatus !== 'connected') {
      alert('Please wait for connection to be established');
      connectWebSocket();
      return;
    }
    
    playSound('click');
    
    const newRoomCode = generateRoomCode();
    const newPlayerId = generatePlayerId();
    const card = generateBingoCard(matrixSize);
    
    console.log('🏠 Creating room:', { newRoomCode, newPlayerId, playerName, matrixSize });
    
    setRoomCode(newRoomCode);
    setPlayerId(newPlayerId);
    setIsHost(true);
    setBingoCard(card);
    
    const success = sendMessage({
      type: 'create_room',
      roomCode: newRoomCode,
      playerName,
      playerId: newPlayerId,
      matrixSize,
      bingoCard: card,
      winningCriteria
    });
    
    if (success) {
      setGameState('room');
    }
  };

  // Join room
  const joinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) {
      alert('Please enter your name and room code');
      return;
    }
    
    if (connectionStatus !== 'connected') {
      alert('Please wait for connection to be established');
      connectWebSocket();
      return;
    }
    
    playSound('click');
    
    const newPlayerId = generatePlayerId();
    const card = generateBingoCard(matrixSize);
    
    console.log('🚪 Joining room:', { roomCode, newPlayerId, playerName });
    
    setPlayerId(newPlayerId);
    setBingoCard(card);
    
    const success = sendMessage({
      type: 'join_room',
      roomCode: roomCode.toUpperCase(),
      playerName,
      playerId: newPlayerId,
      bingoCard: card
    });
    
    if (success) {
      setGameState('room');
    }
  };

  // Start game
  const startGame = () => {
    if (!isHost) return;
    
    playSound('click');
    
    const maxNumber = matrixSize * matrixSize;
    const available = Array.from({ length: maxNumber }, (_, i) => i + 1);
    
    setGameStarted(true);
    setCalledNumbers([]);
    setMarkedNumbers(new Set());
    setWinner(null);
    setAvailableNumbers(available);
    setCurrentCaller(players[0]?.id);
    
    sendMessage({
      type: 'start_game',
      roomCode,
      availableNumbers: available,
      currentCaller: players[0]?.id
    });
  };

  // Call number
  const callNumber = (number) => {
    if (currentCaller !== playerId || calledNumbers.includes(number)) return;
    
    playSound('click');
    
    const newCalledNumbers = [...calledNumbers, number];
    const newAvailableNumbers = availableNumbers.filter(n => n !== number);
    
    // Find next caller (rotate through players)
    const currentIndex = players.findIndex(p => p.id === currentCaller);
    const nextIndex = (currentIndex + 1) % players.length;
    const nextCaller = players[nextIndex]?.id;
    
    setCalledNumbers(newCalledNumbers);
    setAvailableNumbers(newAvailableNumbers);
    setCurrentCaller(nextCaller);
    
    sendMessage({
      type: 'call_number',
      roomCode,
      number,
      calledNumbers: newCalledNumbers,
      availableNumbers: newAvailableNumbers,
      nextCaller
    });
  };

  // Mark number on card
  const markNumber = (number) => {
    if (!calledNumbers.includes(number)) return;
    
    playSound('click');
    
    const newMarkedNumbers = new Set(markedNumbers);
    if (newMarkedNumbers.has(number)) {
      newMarkedNumbers.delete(number);
    } else {
      newMarkedNumbers.add(number);
    }
    setMarkedNumbers(newMarkedNumbers);
    
    // Check for BINGO
    setTimeout(() => checkBingo(newMarkedNumbers), 100);
  };


  // Check for BINGO - improved logic with configurable winning criteria
  const checkBingo = useCallback((marked) => {
    const size = matrixSize;
    const card = bingoCard;
    let completedLines = [];
    let winningPatterns = [];
    
    console.log('🔍 Checking BINGO for card:', card);
    console.log('🔍 Marked numbers:', Array.from(marked));
    console.log('🔍 Matrix size:', size);
    
    // Check rows
    for (let row = 0; row < size; row++) {
      let rowComplete = true;
      const rowNumbers = [];
      
      for (let col = 0; col < size; col++) {
        const number = card[row * size + col];
        rowNumbers.push(number);
        if (!marked.has(number)) {
          rowComplete = false;
        }
      }
      
      console.log(`🔍 Row ${row + 1}:`, rowNumbers, 'Complete:', rowComplete);
      
      if (rowComplete) {
        completedLines.push(`Row ${row + 1}`);
        winningPatterns.push({ type: 'row', index: row, numbers: rowNumbers });
      }
    }
    
    // Check columns
    for (let col = 0; col < size; col++) {
      let colComplete = true;
      const colNumbers = [];
      
      for (let row = 0; row < size; row++) {
        const number = card[row * size + col];
        colNumbers.push(number);
        if (!marked.has(number)) {
          colComplete = false;
        }
      }
      
      console.log(`🔍 Column ${col + 1}:`, colNumbers, 'Complete:', colComplete);
      
      if (colComplete) {
        completedLines.push(`Column ${col + 1}`);
        winningPatterns.push({ type: 'column', index: col, numbers: colNumbers });
      }
    }
    
    // Check diagonal (top-left to bottom-right)
    let diagonal1Complete = true;
    const diagonal1Numbers = [];
    
    for (let i = 0; i < size; i++) {
      const number = card[i * size + i];
      diagonal1Numbers.push(number);
      if (!marked.has(number)) {
        diagonal1Complete = false;
      }
    }
    
    console.log('🔍 Diagonal 1 (\\):', diagonal1Numbers, 'Complete:', diagonal1Complete);
    
    if (diagonal1Complete) {
      completedLines.push('Diagonal (\\)');
      winningPatterns.push({ type: 'diagonal1', numbers: diagonal1Numbers });
    }
    
    // Check diagonal (top-right to bottom-left)
    let diagonal2Complete = true;
    const diagonal2Numbers = [];
    
    for (let i = 0; i < size; i++) {
      const number = card[i * size + (size - 1 - i)];
      diagonal2Numbers.push(number);
      if (!marked.has(number)) {
        diagonal2Complete = false;
      }
    }
    
    console.log('🔍 Diagonal 2 (/):', diagonal2Numbers, 'Complete:', diagonal2Complete);
    
    if (diagonal2Complete) {
      completedLines.push('Diagonal (/)');
      winningPatterns.push({ type: 'diagonal2', numbers: diagonal2Numbers });
    }
    
    // Determine if player wins based on completed lines
    const totalCompletedLines = completedLines.length;
    console.log(`🔍 Total completed lines: ${totalCompletedLines}`);
    console.log(`🔍 Completed lines:`, completedLines);
    
    // WINNING CRITERIA - configurable based on user selection
    let requiredLines;
    switch (winningCriteria) {
      case 'multiple':
        requiredLines = size + 1; // For 5x5: need 6 lines, for 6x6: need 7 lines
        break;
      case 'all-lines':
        requiredLines = (size * 2) + 2; // All rows + all columns + both diagonals
        break;
      case 'standard':
      default:
        requiredLines = 1; // Standard BINGO: need 1 line to win
        break;
    }
    
    if (totalCompletedLines >= requiredLines) {
      const winMessage = totalCompletedLines === 1 
        ? completedLines[0] 
        : `${totalCompletedLines} lines: ${completedLines.join(', ')}`;
      
      console.log(`🎉 BINGO DETECTED! ${winMessage}`);
      playSound('bingo');
      setWinner(`${playerName} (${winMessage})`);
      sendMessage({
        type: 'claim_bingo',
        roomCode,
        winner: `${playerName} (${winMessage})`,
        playerId,
        winningPattern: winMessage,
        completedLines: totalCompletedLines
      });
    } else {
      console.log(`❌ Need ${requiredLines} completed lines to win, only have ${totalCompletedLines}`);
    }
  }, [matrixSize, bingoCard, playerName, roomCode, playerId, sendMessage, playSound, winningCriteria]);

  // Copy room code
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.log('Failed to copy room code');
    }
  };

  // Reset game
  const resetGame = () => {
    console.log('🔄 Resetting game...');
    
    if (playerId && roomCode) {
      sendMessage({
        type: 'leave_room',
        roomCode,
        playerId
      });
    }
    
    setGameState('landing');
    setRoomCode('');
    setPlayerName('');
    setPlayerId('');
    setIsHost(false);
    setPlayers([]);
    setBingoCard([]);
    setMarkedNumbers(new Set());
    setCalledNumbers([]);
    setAvailableNumbers([]);
    setGameStarted(false);
    setWinner(null);
    setMatrixSize(5);
    setCurrentCaller(null);
    setWinningCriteria('standard');
  };

  // Get current caller name
  const getCurrentCallerName = () => {
    const caller = players.find(p => p.id === currentCaller);
    return caller ? caller.name : '';
  };

  // Landing Page
  if (gameState === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-teal-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">BINGO</h1>
            <p className="text-gray-600">Multiplayer Game</p>
            <div className={`text-sm mt-2 font-medium ${
              connectionStatus === 'connected' ? 'text-green-600' : 
              connectionStatus === 'connecting' ? 'text-yellow-600' :
              connectionStatus === 'error' ? 'text-red-600' : 'text-gray-600'
            }`}>
              ● {connectionStatus}
            </div>
            {connectionStatus !== 'connected' && (
              <button
                onClick={connectWebSocket}
                className="text-xs text-blue-600 hover:text-blue-800 underline mt-2"
              >
                Retry Connection
              </button>
            )}
            <div className="mt-4">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs transition-colors ${
                  soundEnabled 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {soundEnabled ? 'Sound On' : 'Sound Off'}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Matrix Size</label>
              <select
                value={matrixSize}
                onChange={(e) => setMatrixSize(parseInt(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={3}>3x3 (Numbers 1-9)</option>
                <option value={4}>4x4 (Numbers 1-16)</option>
                <option value={5}>5x5 (Numbers 1-25)</option>
                <option value={6}>6x6 (Numbers 1-36)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Winning Criteria</label>
              <select
                value={winningCriteria}
                onChange={(e) => setWinningCriteria(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="standard">Standard: 1 Line (Traditional BINGO)</option>
                <option value="multiple">Challenge: {matrixSize } Lines (Hard Mode)</option>
                <option value="all-lines">Extreme: All {(matrixSize * 2) + 2} Lines (Expert Mode)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {winningCriteria === 'standard' && 'Win by completing 1 row, column, or diagonal'}
                {winningCriteria === 'multiple' && `Win by completing ${matrixSize} different lines`}
                {winningCriteria === 'all-lines' && `Win by completing all ${(matrixSize * 2) + 2} possible lines`}
              </p>
            </div>

            <button
              onClick={createRoom}
              disabled={connectionStatus !== 'connected'}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Users size={20} />
              Create Room
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">OR</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter room code"
              />
            </div>

            <button
              onClick={joinRoom}
              disabled={connectionStatus !== 'connected'}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Play size={20} />
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game Room
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">BINGO Game</h1>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Room:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">{roomCode}</span>
                  <button
                    onClick={copyRoomCode}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                    title="Copy room code"
                  >
                    {showCopied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  </button>
                </div>
                <div className="text-sm text-gray-600">
                  Matrix: {matrixSize}x{matrixSize}
                </div>
                <div className="text-sm text-gray-600">
                  Win: {
                    winningCriteria === 'standard' ? '1 line' :
                    winningCriteria === 'multiple' ? `${matrixSize + 1} lines` :
                    `All ${(matrixSize * 2) + 2} lines`
                  }
                </div>
                <div className={`text-xs font-medium ${
                  connectionStatus === 'connected' ? 'text-green-600' : 
                  connectionStatus === 'connecting' ? 'text-yellow-600' :
                  connectionStatus === 'error' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  ● {connectionStatus}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg transition-colors ${
                  soundEnabled 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={soundEnabled ? 'Turn sound off' : 'Turn sound on'}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              {isHost && !gameStarted && players.length > 1 && (
                <button
                  onClick={startGame}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Play size={16} />
                  Start Game
                </button>
              )}
              <button
                onClick={resetGame}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <RotateCcw size={16} />
                Exit
              </button>
            </div>
          </div>

          {/* Players */}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Players ({players.length})
              {gameStarted && currentCaller && (
                <span className="ml-2 text-blue-600">
                  • Current Caller: {getCurrentCallerName()}
                </span>
              )}
            </h3>
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
                    player.isHost ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                  } ${
                    currentCaller === player.id ? 'ring-2 ring-orange-400' : ''
                  }`}
                >
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  {player.name} 
                  {player.isHost && ' (Host)'}
                  {currentCaller === player.id && ' 🎯'}
                </div>
              ))}
            </div>
            {!gameStarted && players.length === 1 && (
              <p className="text-sm text-gray-500 mt-2">
                Waiting for other players to join...
              </p>
            )}
          </div>
        </div>

        {/* Winner Announcement */}
        {winner && (
          <div className="bg-green-100 border border-green-400 rounded-xl p-6 mb-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="text-green-600" size={24} />
              <h2 className="text-xl font-bold text-green-800">BINGO!</h2>
            </div>
            <p className="text-green-700">{winner} wins the game!</p>
          </div>
        )}

        {/* Current Turn Indicator */}
        {gameStarted && !winner && currentCaller && (
          <div className={`rounded-xl p-4 mb-6 text-center ${
            currentCaller === playerId 
              ? 'bg-orange-100 border border-orange-400' 
              : 'bg-blue-100 border border-blue-400'
          }`}>
            <p className={`font-medium ${
              currentCaller === playerId ? 'text-orange-800' : 'text-blue-800'
            }`}>
              {currentCaller === playerId 
                ? '🎯 Your turn to call a number!' 
                : `Waiting for ${getCurrentCallerName()} to call a number...`
              }
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* BINGO Card */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Your BINGO Card</h2>
              <div
                className="grid gap-2 mb-4"
                style={{ gridTemplateColumns: `repeat(${matrixSize}, 1fr)` }}
              >
                {bingoCard.map((number, index) => (
                  <button
                    key={index}
                    onClick={() => markNumber(number)}
                    disabled={!gameStarted || !calledNumbers.includes(number)}
                    className={`
                      aspect-square flex items-center justify-center text-lg font-bold rounded-lg border-2 transition-all
                      ${markedNumbers.has(number)
                        ? 'bg-green-500 text-white border-green-500'
                        : calledNumbers.includes(number)
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                      }
                      ${gameStarted && calledNumbers.includes(number) && !markedNumbers.has(number)
                        ? 'cursor-pointer'
                        : 'cursor-default'
                      }
                    `}
                  >
                    {number}
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-600 text-center">
                <strong>Click on called numbers (yellow) to mark them on your card!</strong><br/>
                Yellow = Called but not marked | Green = Marked by you
              </p>
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      console.log('🔧 Debug: Force checking BINGO with current marked numbers');
                      checkBingo(markedNumbers);
                    }}
                    className="w-full bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600 transition-colors"
                  >
                    🔧 Debug: Check BINGO Now
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Game Controls & Called Numbers */}
          <div className="space-y-6">
            {/* Called Numbers */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">
                Called Numbers ({calledNumbers.length})
              </h3>
              {calledNumbers.length > 0 ? (
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {calledNumbers.slice(-15).map((number, index) => (
                    <div
                      key={index}
                      className={`
                        aspect-square flex items-center justify-center text-sm font-bold rounded border-2
                        ${index === calledNumbers.length - 1
                          ? 'bg-blue-500 text-white border-blue-500 animate-pulse'
                          : 'bg-blue-100 text-blue-800 border-blue-200'
                        }
                      `}
                    >
                      {number}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  {gameStarted ? 'Waiting for numbers...' : 'Game not started'}
                </p>
              )}
              {calledNumbers.length > 15 && (
                <p className="text-xs text-gray-500 text-center">
                  Showing last 15 numbers
                </p>
              )}
            </div>

            {/* Call Number Controls */}
            {gameStarted && currentCaller === playerId && !winner && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4">
                  🎯 Call a Number
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {availableNumbers.map((number) => (
                    <button
                      key={number}
                      onClick={() => callNumber(number)}
                      className="aspect-square flex items-center justify-center text-sm font-bold rounded border-2 bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100 hover:border-orange-400 transition-colors"
                    >
                      {number}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Click a number to call it
                </p>
              </div>
            )}

            {/* Game Status */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Game Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Connection:</span>
                  <span className={`font-medium ${
                    connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {connectionStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={`font-medium ${
                    winner ? 'text-green-600' : gameStarted ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {winner ? 'Finished' : gameStarted ? 'In Progress' : 'Waiting'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Win Condition:</span>
                  <span className="font-medium text-purple-600">
                    {
                      winningCriteria === 'standard' ? '1 Line' :
                      winningCriteria === 'multiple' ? `${matrixSize + 1} Lines` :
                      `All ${(matrixSize * 2) + 2} Lines`
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Numbers Called:</span>
                  <span className="font-medium">{calledNumbers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Numbers Remaining:</span>
                  <span className="font-medium">{availableNumbers.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your Marks:</span>
                  <span className="font-medium">{markedNumbers.size}</span>
                </div>
                {gameStarted && currentCaller && (
                  <div className="flex justify-between">
                    <span>Current Caller:</span>
                    <span className="font-medium text-orange-600">
                      {currentCaller === playerId ? 'You' : getCurrentCallerName()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BINGOGame;