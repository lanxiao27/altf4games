const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── KILLER ROLES ────────────────────────────────────────────────
const CIVILIAN_VARIANTS = [
  { variant: 'cheerful', color: '#27ae60', accent: '#2ecc71', letter: 'C', suit: '♣' },
  { variant: 'mystic',   color: '#8e44ad', accent: '#c39bd3', letter: 'C', suit: '♣' },
  { variant: 'noble',    color: '#d4a017', accent: '#f1c40f', letter: 'C', suit: '♣' },
  { variant: 'rebel',    color: '#e67e22', accent: '#f39c12', letter: 'C', suit: '♣' },
  { variant: 'scholar',  color: '#2471a3', accent: '#5dade2', letter: 'C', suit: '♣' },
];

const KILLER_ROLES = [
  { id: 'killer',   name: 'The Killer', game: 'killer', team: 'evil',    color: '#c0392b', accent: '#e74c3c', letter: 'K', suit: '♠', description: 'You are the secret killer! Wink at players one by one to silently eliminate them. Stay cool — if the police catches your wink, you lose!' },
  { id: 'police',   name: 'The Police', game: 'killer', team: 'good',    color: '#2980b9', accent: '#4fc3f7', letter: 'P', suit: '♦', description: "You are the detective! Watch everyone's eyes very carefully. When you spot the killer winking, point at them and shout your accusation!" },
  { id: 'civilian', name: 'Civilian',   game: 'killer', team: 'neutral', color: '#27ae60', accent: '#2ecc71', letter: 'C', suit: '♣', description: "You are an innocent bystander! If the killer winks at you, dramatically announce you've been eliminated. Help the police find the killer!" },
];

function assignKillerRoles(playerCount) {
  const roles = [{ ...KILLER_ROLES[0] }, { ...KILLER_ROLES[1] }];
  const sv = [...CIVILIAN_VARIANTS].sort(() => Math.random() - 0.5);
  for (let i = 2; i < playerCount; i++) roles.push({ ...KILLER_ROLES[2], ...sv[(i-2) % sv.length] });
  for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [roles[i],roles[j]]=[roles[j],roles[i]]; }
  return roles;
}

// ─── WEREWOLF ROLES ──────────────────────────────────────────────
const WW_ROLES = {
  werewolf:     { id: 'werewolf',     name: 'Werewolf',     game: 'werewolf', team: 'wolves', color: '#8B0000', accent: '#c0392b', letter: 'W', suit: '☽', nightAction: 'kill',    description: 'Each night, choose a villager to devour. By day, blend in and avoid suspicion. Win when wolves equal villagers.' },
  alpha:        { id: 'alpha',        name: 'Alpha Wolf',   game: 'werewolf', team: 'wolves', color: '#5a0000', accent: '#922b21', letter: 'A', suit: '☽', nightAction: 'kill',    description: 'Leader of the pack. You can choose the kill target each night. Your identity is hidden even from other wolves.' },
  minion:       { id: 'minion',       name: 'Minion',       game: 'werewolf', team: 'wolves', color: '#6c3483', accent: '#9b59b6', letter: 'M', suit: '☽', nightAction: null,      description: 'You serve the wolves but they do not know you. Protect them during voting. You win if the wolves win.' },
  seer:         { id: 'seer',         name: 'Seer',         game: 'werewolf', team: 'village',color: '#1a5276', accent: '#2e86c1', letter: 'S', suit: '★', nightAction: 'inspect', description: 'Each night, choose a player to investigate. The app will reveal their alignment (or exact role if host enabled it).' },
  doctor:       { id: 'doctor',       name: 'Doctor',       game: 'werewolf', team: 'village',color: '#117a65', accent: '#1abc9c', letter: 'D', suit: '★', nightAction: 'save',    description: 'Each night, choose one player to protect from the wolves. You may protect yourself once per game.' },
  hunter:       { id: 'hunter',       name: 'Hunter',       game: 'werewolf', team: 'village',color: '#7d6608', accent: '#d4ac0d', letter: 'H', suit: '★', nightAction: null,      description: 'When you die, you may immediately eliminate one player of your choice as your dying act.' },
  witch:        { id: 'witch',        name: 'Witch',        game: 'werewolf', team: 'village',color: '#4a235a', accent: '#8e44ad', letter: 'W', suit: '★', nightAction: 'potion',  description: 'You have two potions: one to save the night victim, one to poison a player. Each potion can only be used once.' },
  bodyguard:    { id: 'bodyguard',    name: 'Bodyguard',    game: 'werewolf', team: 'village',color: '#1f618d', accent: '#2980b9', letter: 'B', suit: '★', nightAction: 'guard',   description: 'Each night, protect one player from wolf attacks. You cannot protect the same player twice in a row.' },
  villager:     { id: 'villager',     name: 'Villager',     game: 'werewolf', team: 'village',color: '#7d5a3c', accent: '#c8a97e', letter: 'V', suit: '✦', nightAction: null,      description: 'You are a simple villager. Observe, discuss, and vote wisely. Your voice matters — find and eliminate the wolves.' },
};

const WW_MODE_ROLES = {
  basic:  ['werewolf','seer','villager'],
  medium: ['werewolf','seer','doctor','hunter','villager'],
  full:   ['werewolf','alpha','seer','doctor','hunter','witch','bodyguard','minion','villager'],
};

function assignWerewolfRoles(players, settings) {
  const { mode, numWolves, wolvesKnowEachOther, minionKnowsWolves, seerRevealType } = settings;
  const count = players.length;
  const pool = [];

  let wolfRole = 'werewolf';
  let extraWolves = numWolves - 1;

  if (mode === 'full' && extraWolves > 0) { pool.push('alpha'); extraWolves--; }
  for (let i = 0; i < numWolves - (pool.filter(r=>r==='alpha').length); i++) pool.push('werewolf');

  const availableSpecials = (WW_MODE_ROLES[mode] || WW_MODE_ROLES.basic).filter(r => r !== 'werewolf' && r !== 'alpha' && r !== 'villager');
  for (const r of availableSpecials) { if (pool.length < count - 1) pool.push(r); }

  while (pool.length < count) pool.push('villager');
  const trimmed = pool.slice(0, count);
  for (let i = trimmed.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [trimmed[i],trimmed[j]]=[trimmed[j],trimmed[i]]; }

  const wolfIds = [];
  const assigned = trimmed.map((rid, i) => {
    const role = { ...WW_ROLES[rid], seerRevealType };
    if (role.team === 'wolves') wolfIds.push(players[i].id);
    return role;
  });

  return { assigned, wolfIds, wolvesKnowEachOther, minionKnowsWolves };
}

// ─── NIGHT ACTION ORDER ──────────────────────────────────────────
// Slots group roles that share a turn; key = action stored in nightActions
const NIGHT_SLOTS = [
  { slot: 'wolves',    roles: ['werewolf','alpha'], actionKey: 'kill'    },
  { slot: 'seer',      roles: ['seer'],             actionKey: 'inspect' },
  { slot: 'doctor',    roles: ['doctor'],            actionKey: 'save'    },
  { slot: 'witch',     roles: ['witch'],             actionKey: 'witch'   },
  { slot: 'bodyguard', roles: ['bodyguard'],         actionKey: 'guard'   },
];

function getNextNightRole(nightActions, roles) {
  for (const { slot, roles: slotRoles, actionKey } of NIGHT_SLOTS) {
    const hasRole = roles.some(r => slotRoles.includes(r.id));
    const actionDone = nightActions[actionKey] !== undefined;
    if (hasRole && !actionDone) return slot;
  }
  return null;
}

// ─── RESOLVE NIGHT ───────────────────────────────────────────────
function resolveNight(room) {
  const ww = room.werewolf;
  const na = ww.nightActions;
  let killed = na.kill || null;
  let saved = false;
  let poisoned = na.poison || null;

  if (na.save && na.save === killed) { killed = null; saved = true; }
  if (na.guard && na.guard === killed) { killed = null; saved = true; }

  const results = { killed: null, poisoned: null, saved };

  if (killed) {
    const p = room.players.find(p => p.id === killed);
    if (p) { p.alive = false; results.killed = { id: p.id, username: p.username, role: p.role }; }
  }
  if (poisoned && poisoned !== killed) {
    const p = room.players.find(p => p.id === poisoned);
    if (p) { p.alive = false; results.poisoned = { id: p.id, username: p.username, role: p.role }; }
  }

  return results;
}

function checkWinCondition(room) {
  const alive = room.players.filter(p => p.alive);
  const wolves = alive.filter(p => p.role?.team === 'wolves').length;
  const village = alive.filter(p => p.role?.team !== 'wolves').length;
  if (wolves === 0) return 'village';
  if (wolves >= village) return 'wolves';
  return null;
}

// ─── SOCKET ──────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // CREATE ROOM
  socket.on('create_room', ({ username, game }) => {
    let code; do { code = genCode(); } while (rooms[code]);
    rooms[code] = { code, game, host: socket.id, players: [{ id: socket.id, username, ready: false, alive: true }], status: 'lobby', werewolf: null };
    socket.join(code); socket.roomCode = code; socket.username = username;
    socket.emit('room_created', { code, room: rooms[code] });
    io.to(code).emit('room_updated', rooms[code]);
  });

  // JOIN ROOM
  socket.on('join_room', ({ username, code }) => {
    const room = rooms[code];
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.status !== 'lobby') return socket.emit('error', { message: 'Game already started.' });
    if (room.players.length >= 15) return socket.emit('error', { message: 'Room is full.' });
    room.players.push({ id: socket.id, username, ready: false, alive: true });
    socket.join(code); socket.roomCode = code; socket.username = username;
    socket.emit('room_joined', { code, room });
    io.to(code).emit('room_updated', room);
  });

  // ── KILLER START ─────────────────────────────────────────────
  socket.on('start_game', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 3) return socket.emit('error', { message: 'Need at least 3 players.' });
    room.status = 'playing';
    const roles = assignKillerRoles(room.players.length);
    room.players.forEach((p, i) => { p.role = roles[i]; io.to(p.id).emit('role_assigned', { role: roles[i] }); });
    io.to(code).emit('game_started', { room });
  });

  socket.on('accuse_player', ({ targetId }) => {
    const code = socket.roomCode; const room = rooms[code]; if (!room) return;
    const accuser = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id === targetId);
    if (!accuser || !target) return;
    const correct = target.role?.id === 'killer';
    io.to(code).emit('accusation_result', { accuserId: socket.id, accuserName: accuser.username, targetId, targetName: target.username, correct });
  });

  socket.on('restart_game', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    room.status = 'lobby'; room.werewolf = null;
    room.players.forEach(p => { p.role = null; p.eliminated = false; p.alive = true; });
    io.to(code).emit('game_restarted', { room });
  });

  // ── WEREWOLF START ───────────────────────────────────────────
  socket.on('start_werewolf', ({ settings }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 4) return socket.emit('error', { message: 'Need at least 4 players.' });

    const { assigned, wolfIds, wolvesKnowEachOther, minionKnowsWolves } = assignWerewolfRoles(room.players, settings);

    room.players.forEach((p, i) => { p.role = assigned[i]; p.alive = true; p.eliminated = false; });
    room.status = 'playing';
    const aliveWolfCount = room.players.filter(p => ['werewolf','alpha'].includes(p.role?.id)).length;
    room.werewolf = {
      phase: 'role_reveal',
      dayNumber: 0,
      settings,
      wolfIds,
      nightActions: {},
      wolfKillVotes: {},
      aliveWolfCount,
      votes: {},
      currentNightRole: null,
      witchPotions: { save: true, poison: true },
      lastGuarded: null,
      dayTimer: null,
    };

    room.players.forEach(p => {
      const extra = {};
      if (wolvesKnowEachOther && p.role.team === 'wolves' && p.role.id !== 'minion') {
        extra.wolfTeam = room.players.filter(x => wolfIds.includes(x.id)).map(x => x.username);
      }
      if (minionKnowsWolves && p.role.id === 'minion') {
        extra.wolfTeam = room.players.filter(x => wolfIds.includes(x.id)).map(x => x.username);
      }
      io.to(p.id).emit('ww_role_assigned', { role: p.role, ...extra });
    });

    io.to(code).emit('ww_game_started', { room: sanitizeRoom(room) });
  });

  // BEGIN NIGHT
  socket.on('ww_begin_night', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.host !== socket.id || !room.werewolf) return;
    const ww = room.werewolf;
    ww.phase = 'night';
    ww.dayNumber++;
    ww.nightActions = {};
    ww.wolfKillVotes = {};
    ww.aliveWolfCount = room.players.filter(p => p.alive && ['werewolf','alpha'].includes(p.role?.id)).length;
    ww.currentNightRole = null;

    const alivePlayers = room.players.filter(p => p.alive);
    const aliveRoles = alivePlayers.map(p => p.role);
    const firstRole = getNextNightRole(ww.nightActions, aliveRoles);
    ww.currentNightRole = firstRole;

    io.to(code).emit('ww_night_started', {
      dayNumber: ww.dayNumber,
      currentNightRole: firstRole,
      narration: nightNarration(ww.dayNumber),
    });

    if (firstRole) notifyNightRole(code, room, firstRole);
  });

  // NIGHT ACTION SUBMIT
  socket.on('ww_night_action', ({ action, targetId }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || !room.werewolf) return;
    const ww = room.werewolf;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    const roleId = player.role?.id;
    if (roleId === 'werewolf' || roleId === 'alpha') {
      // Collect each wolf's vote — majority wins, or last vote if tied
      ww.wolfKillVotes[socket.id] = targetId;
      const allWolvesVoted = Object.keys(ww.wolfKillVotes).length >= ww.aliveWolfCount;
      if (allWolvesVoted) {
        // Pick most-voted target; tie = last vote
        const tally = {};
        Object.values(ww.wolfKillVotes).forEach(id => { tally[id] = (tally[id]||0)+1; });
        const max = Math.max(...Object.values(tally));
        const top = Object.keys(tally).filter(id => tally[id] === max);
        ww.nightActions.kill = top[top.length - 1];
      } else {
        // Not all wolves voted yet — don't advance
        return;
      }
    }
    if (roleId === 'seer')      ww.nightActions.inspect = targetId;
    if (roleId === 'doctor')    ww.nightActions.save = targetId;
    if (roleId === 'bodyguard') ww.nightActions.guard = targetId;
    if (roleId === 'witch') {
      ww.nightActions.witch = action;
      if (action === 'save')   ww.nightActions.save = targetId;
      if (action === 'poison') ww.nightActions.poison = targetId;
    }

    // Send seer result privately
    if (roleId === 'seer' && targetId) {
      const target = room.players.find(p => p.id === targetId);
      if (target) {
        const reveal = ww.settings.seerRevealType === 'exact' ? target.role.name : (target.role.team === 'wolves' ? 'a Werewolf' : 'Not a Werewolf');
        socket.emit('ww_seer_result', { targetName: target.username, reveal });
      }
    }

    // Witch gets extra info
    if (roleId === 'witch') {
      const killed = ww.nightActions.kill ? room.players.find(p => p.id === ww.nightActions.kill) : null;
      socket.emit('ww_witch_info', { victim: killed ? killed.username : null, potions: ww.witchPotions });
    }

    // Advance night
    const alivePlayers = room.players.filter(p => p.alive);
    const aliveRoles = alivePlayers.map(p => p.role);
    const next = getNextNightRole(ww.nightActions, aliveRoles);
    ww.currentNightRole = next;

    if (next) {
      io.to(code).emit('ww_night_role_changed', { currentNightRole: next });
      notifyNightRole(code, room, next);
    } else {
      // All night actions done — resolve
      setTimeout(() => resolveNightAndStartDay(code), 1500);
    }
  });

  // SKIP NIGHT ACTION (host skips a role that has no action)
  socket.on('ww_skip_night_role', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || !room.werewolf || room.host !== socket.id) return;
    const ww = room.werewolf;
    // Mark current slot as done with a sentinel so getNextNightRole advances
    const currentSlot = ww.currentNightRole;
    if (currentSlot) {
      const slotDef = NIGHT_SLOTS.find(s => s.slot === currentSlot);
      if (slotDef) ww.nightActions[slotDef.actionKey] = '__skipped__';
    }
    const alivePlayers = room.players.filter(p => p.alive);
    const aliveRoles = alivePlayers.map(p => p.role);
    const next = getNextNightRole(ww.nightActions, aliveRoles);
    ww.currentNightRole = next;
    if (next) { io.to(code).emit('ww_night_role_changed', { currentNightRole: next }); notifyNightRole(code, room, next); }
    else setTimeout(() => resolveNightAndStartDay(code), 1500);
  });

  // DAY VOTE
  socket.on('ww_vote', ({ targetId }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || !room.werewolf) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;
    room.werewolf.votes[socket.id] = targetId;
    const aliveCount = room.players.filter(p => p.alive).length;
    const voteCount = Object.keys(room.werewolf.votes).length;
    io.to(code).emit('ww_vote_update', { votes: anonymizeVotes(room), voteCount, aliveCount });
    if (voteCount >= aliveCount) resolveVotes(code);
  });

  // HOST FORCE RESOLVE VOTES
  socket.on('ww_force_resolve_votes', () => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    resolveVotes(code);
  });

  // HUNTER REVENGE
  socket.on('ww_hunter_revenge', ({ targetId }) => {
    const code = socket.roomCode; const room = rooms[code];
    if (!room || !room.werewolf) return;
    const target = room.players.find(p => p.id === targetId);
    if (target) {
      target.alive = false;
      io.to(code).emit('ww_hunter_killed', { targetName: target.username, role: room.werewolf.settings.revealOnDeath ? target.role : null });
      const win = checkWinCondition(room);
      if (win) endGame(code, win);
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const code = socket.roomCode; if (!code || !rooms[code]) return;
    const room = rooms[code];
    if (room.status === 'lobby') {
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) { delete rooms[code]; return; }
      if (room.host === socket.id) { room.host = room.players[0].id; io.to(room.host).emit('you_are_host'); }
    }
    io.to(code).emit('room_updated', sanitizeRoom(room));
    io.to(code).emit('player_left', { username: socket.username });
  });
});

// ─── HELPERS ─────────────────────────────────────────────────────
function notifyNightRole(code, room, slot) {
  const alivePlayers = room.players.filter(p => p.alive);
  const slotDef = NIGHT_SLOTS.find(s => s.slot === slot);
  const slotRoles = slotDef ? slotDef.roles : [slot];
  alivePlayers.forEach(p => {
    if (slotRoles.includes(p.role?.id)) {
      io.to(p.id).emit('ww_your_turn', {
        slot,
        roleId: p.role.id,
        targets: alivePlayers.filter(t => t.id !== p.id).map(t => ({ id: t.id, username: t.username })),
      });
    } else {
      io.to(p.id).emit('ww_waiting', { currentSlot: slot });
    }
  });
}

function resolveNightAndStartDay(code) {
  const room = rooms[code]; if (!room || !room.werewolf) return;
  const ww = room.werewolf;
  const results = resolveNight(room);
  ww.phase = 'day';
  ww.votes = {};

  const alivePlayers = room.players.filter(p => p.alive);
  const win = checkWinCondition(room);

  io.to(code).emit('ww_day_started', {
    dayNumber: ww.dayNumber,
    results,
    alivePlayers: alivePlayers.map(p => ({ id: p.id, username: p.username })),
    narration: dayNarration(results),
    revealOnDeath: ww.settings.revealOnDeath,
    timerSeconds: ww.settings.dayTimer || 0,
  });

  if (win) { setTimeout(() => endGame(code, win), 2000); return; }

  // Check hunter
  if (results.killed?.role?.id === 'hunter' || results.poisoned?.role?.id === 'hunter') {
    const hunterId = results.killed?.id || results.poisoned?.id;
    if (hunterId) io.to(hunterId).emit('ww_hunter_activate');
  }
}

function resolveVotes(code) {
  const room = rooms[code]; if (!room || !room.werewolf) return;
  const ww = room.werewolf;
  const tally = {};
  Object.values(ww.votes).forEach(id => { tally[id] = (tally[id]||0) + 1; });
  const max = Math.max(...Object.values(tally));
  const tied = Object.keys(tally).filter(id => tally[id] === max);

  let eliminated = null;
  if (tied.length === 1) {
    eliminated = room.players.find(p => p.id === tied[0]);
  } else {
    const tie = ww.settings.tieBehavior || 'nobody';
    if (tie === 'random') eliminated = room.players.find(p => p.id === tied[Math.floor(Math.random()*tied.length)]);
    // 'nobody' or 'host' defaults to nobody for now
  }

  if (eliminated) {
    eliminated.alive = false;
    const isHunter = eliminated.role?.id === 'hunter';
    io.to(code).emit('ww_eliminated', {
      playerId: eliminated.id, username: eliminated.username,
      role: ww.settings.revealOnDeath ? eliminated.role : null,
      isHunter,
    });
    if (isHunter) io.to(eliminated.id).emit('ww_hunter_activate');
  } else {
    io.to(code).emit('ww_no_elimination', { reason: 'Tie vote — nobody was eliminated.' });
  }

  ww.votes = {};
  const win = checkWinCondition(room);
  if (win) { setTimeout(() => endGame(code, win), 2000); return; }
  io.to(code).emit('ww_vote_resolved', { eliminated: eliminated ? { id: eliminated.id, username: eliminated.username } : null });
}

function endGame(code, winner) {
  const room = rooms[code]; if (!room) return;
  room.status = 'finished';
  const rolesReveal = room.players.map(p => ({ id: p.id, username: p.username, role: p.role, alive: p.alive }));
  io.to(code).emit('ww_game_ended', { winner, rolesReveal, narration: winner === 'village' ? 'The final beast has fallen. Peace returns to the village.' : 'The village has fallen. The werewolves rule the night.' });
}

function anonymizeVotes(room) {
  if (!room.werewolf?.settings?.anonymousVoting) {
    return room.werewolf.votes;
  }
  const counts = {};
  Object.values(room.werewolf.votes).forEach(id => { counts[id] = (counts[id]||0)+1; });
  return counts;
}

function sanitizeRoom(room) {
  return { ...room, players: room.players.map(p => ({ id: p.id, username: p.username, alive: p.alive, ready: p.ready })) };
}

function nightNarration(day) {
  const lines = ['Night falls over the cursed village...','Darkness swallows the village whole...','The candles flicker and die, one by one...','Shadows stir between the old oak trees...'];
  return lines[(day-1) % lines.length];
}

function dayNarration(results) {
  if (!results.killed && !results.poisoned) return 'Dawn breaks. The village stirs. Somehow, everyone survived the night.';
  const name = results.killed?.username || results.poisoned?.username;
  const lines = [`Dawn breaks. ${name} was found lifeless at dawn.`,`The village awakens to horror. ${name} is gone.`,`Morning light reveals the worst. ${name} did not survive the night.`];
  return lines[Math.floor(Math.random()*lines.length)];
}

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`ALT F4 Games server running on port ${PORT}`));
