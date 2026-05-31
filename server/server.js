const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const KILLER_ROLES = [
  {
    id: 'killer',
    name: 'The Killer',
    type: 'villain',
    description: 'You are the secret killer! Wink at players one by one to silently eliminate them. Stay cool — if the police catches your wink, you lose!',
    team: 'evil',
    color: '#c0392b'
  },
  {
    id: 'police',
    name: 'The Police',
    type: 'hero',
    description: 'You are the detective! Watch everyone\'s eyes very carefully. When you spot the killer winking, point at them and shout your accusation!',
    team: 'good',
    color: '#2980b9'
  },
  {
    id: 'civilian',
    name: 'Civilian',
    type: 'neutral',
    description: 'You are an innocent bystander! If the killer winks at you, dramatically announce you\'ve been eliminated. Help the police find the killer!',
    team: 'neutral',
    color: '#27ae60'
  }
];

function assignKillerRoles(playerCount) {
  const roles = [];
  roles.push('killer');
  roles.push('police');
  for (let i = 2; i < playerCount; i++) roles.push('civilian');
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('create_room', ({ username, game }) => {
    let code;
    do { code = genCode(); } while (rooms[code]);

    rooms[code] = {
      code,
      game,
      host: socket.id,
      players: [{ id: socket.id, username, ready: false }],
      status: 'lobby'
    };

    socket.join(code);
    socket.roomCode = code;
    socket.username = username;

    socket.emit('room_created', { code, room: rooms[code] });
    io.to(code).emit('room_updated', rooms[code]);
    console.log(`Room ${code} created by ${username}`);
  });

  socket.on('join_room', ({ username, code }) => {
    const room = rooms[code];
    if (!room) return socket.emit('error', { message: 'Room not found. Check the code and try again.' });
    if (room.status !== 'lobby') return socket.emit('error', { message: 'Game already started. Wait for the next round.' });
    if (room.players.length >= 15) return socket.emit('error', { message: 'Room is full (max 15 players).' });

    room.players.push({ id: socket.id, username, ready: false });
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;

    socket.emit('room_joined', { code, room });
    io.to(code).emit('room_updated', room);
    console.log(`${username} joined room ${code}`);
  });

  socket.on('start_game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 3) return socket.emit('error', { message: 'Need at least 3 players to start.' });

    room.status = 'playing';
    const roleIds = assignKillerRoles(room.players.length);

    room.players.forEach((player, i) => {
      const roleData = KILLER_ROLES.find(r => r.id === roleIds[i]);
      player.role = roleData;
      io.to(player.id).emit('role_assigned', { role: roleData });
    });

    io.to(code).emit('game_started', { room });
    console.log(`Game started in room ${code}`);
  });

  socket.on('eliminate_player', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const target = room.players.find(p => p.id === targetId);
    if (target) {
      target.eliminated = true;
      io.to(code).emit('player_eliminated', { playerId: targetId, username: target.username });
      io.to(targetId).emit('you_were_eliminated');
    }
  });

  socket.on('accuse_player', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const accuser = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id === targetId);
    if (!accuser || !target) return;

    const correct = target.role?.id === 'killer';
    io.to(code).emit('accusation_result', {
      accuserId: socket.id,
      accuserName: accuser.username,
      targetId,
      targetName: target.username,
      correct,
      killerRole: correct ? target.role : null
    });
  });

  socket.on('restart_game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    room.status = 'lobby';
    room.players.forEach(p => { p.role = null; p.eliminated = false; });
    io.to(code).emit('game_restarted', { room });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    const room = rooms[code];
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[code];
      console.log(`Room ${code} deleted (empty)`);
      return;
    }

    if (room.host === socket.id) {
      room.host = room.players[0].id;
      io.to(room.host).emit('you_are_host');
    }

    io.to(code).emit('room_updated', room);
    io.to(code).emit('player_left', { username: socket.username });
    console.log(`${socket.username} left room ${code}`);
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`ALT F4 Games server running on port ${PORT}`));
