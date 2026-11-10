const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const ANIMALS = ['🐶', '🐱', '🦁', '🐼', '🐸', '🐵', '🦊', '🐧'];
const rooms = {};

function newBoard() {
  const cards = [...ANIMALS, ...ANIMALS];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.map((animal) => ({ animal, matched: false }));
}

function getRoom(id) {
  if (!rooms[id]) rooms[id] = { players: [null, null], scores: [0, 0], turn: 0, board: newBoard(), flipped: [], busy: false };
  return rooms[id];
}

function stateOf(room) {
  return {
    cards: room.board.map((c, i) => {
      const up = c.matched || room.flipped.includes(i);
      return { up, matched: c.matched, animal: up ? c.animal : null };
    }),
    scores: room.scores,
    turn: room.turn,
    busy: room.busy,
    bothHere: room.players.every(Boolean),
    over: room.board.every((c) => c.matched),
  };
}

const app = express();
app.use(express.static(__dirname + '/public'));
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  let roomId, room, seat = -1;
  const send = () => io.to(roomId).emit('state', stateOf(room));

  socket.on('join', (id) => {
    roomId = String(id).slice(0, 40);
    room = getRoom(roomId);
    seat = room.players.indexOf(null);
    if (seat !== -1) room.players[seat] = socket.id;
    socket.join(roomId);
    socket.emit('seat', seat);
    send();
  });

  socket.on('flip', (i) => {
    if (!room || seat !== room.turn || room.busy || !room.players.every(Boolean)) return;
    const card = room.board[i];
    if (!card || card.matched || room.flipped.includes(i)) return;
    room.flipped.push(i);
    if (room.flipped.length < 2) return send();

    const [a, b] = room.flipped;
    if (room.board[a].animal === room.board[b].animal) {
      room.board[a].matched = room.board[b].matched = true;
      room.scores[seat]++;
      room.flipped = [];
      send();
    } else {
      room.busy = true;
      send();
      setTimeout(() => {
        room.flipped = [];
        room.busy = false;
        room.turn = 1 - room.turn;
        send();
      }, 1000);
    }
  });

  socket.on('restart', () => {
    if (!room || seat === -1 || room.busy) return;
    Object.assign(room, { scores: [0, 0], turn: 0, board: newBoard(), flipped: [] });
    send();
  });

  socket.on('disconnect', () => {
    if (!room) return;
    if (seat !== -1) room.players[seat] = null;
    if (!room.players.some(Boolean)) delete rooms[roomId];
    else send();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Game is running on port ' + PORT));
