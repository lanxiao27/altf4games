import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

const SCREENS = {
  HOME:"home", USERNAME:"username", GAME_SELECT:"game_select",
  LOBBY:"lobby", WW_SETTINGS:"ww_settings",
  ROLE_REVEAL:"role_reveal", WW_ROLE_REVEAL:"ww_role_reveal",
  WW_NIGHT:"ww_night", WW_DAY:"ww_day", WW_VOTE:"ww_vote",
  WW_DEAD:"ww_dead", WW_SPECTATE:"ww_spectate",
  GAME_OVER:"game_over", WW_END:"ww_end",
};

const GAMES = [
  { id:"killer",     name:"Killer",         tagline:"Blink. Eliminate. Survive.",        description:"The killer winks to eliminate players. The police must catch them in the act.",  minPlayers:3,  maxPlayers:15, accent:"#e63946", available:true },
  { id:"werewolf",   name:"Werewolf",        tagline:"The village holds its breath.",      description:"A haunted village stalked by wolves. Trust no one. Survive until dawn.",         minPlayers:4,  maxPlayers:15, accent:"#c8a97e", available:true },
  { id:"spyfall",    name:"Spyfall",         tagline:"One spy. One location. Find them.",  description:"Everyone knows the location except the spy.",                                    minPlayers:4,  maxPlayers:12, accent:"#7c4dff", available:false },
  { id:"resistance", name:"The Resistance",  tagline:"Missions will be sabotaged.",        description:"Spies vs resistance fighters on secret missions.",                               minPlayers:5,  maxPlayers:10, accent:"#e9a000", available:false },
  { id:"coup",       name:"Coup",            tagline:"Bluff. Betray. Rule.",               description:"Bluff your way to power. Last card wins.",                                      minPlayers:3,  maxPlayers:10, accent:"#c77dff", available:false },
];

let socket = null;

export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [room, setRoom] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState("");
  const [gameResult, setGameResult] = useState(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [wolfTeam, setWolfTeam] = useState(null);
  // WW state
  const [wwPhase, setWwPhase] = useState(null);
  const [wwNarration, setWwNarration] = useState("");
  const [wwDayNumber, setWwDayNumber] = useState(0);
  const [wwCurrentNightRole, setWwCurrentNightRole] = useState(null);
  const [wwIsMyTurn, setWwIsMyTurn] = useState(false);
  const [wwTargets, setWwTargets] = useState([]);
  const [wwResults, setWwResults] = useState(null);
  const [wwAlivePlayers, setWwAlivePlayers] = useState([]);
  const [wwVotes, setWwVotes] = useState({});
  const [wwVoteCount, setWwVoteCount] = useState(0);
  const [wwMyVote, setWwMyVote] = useState(null);
  const [wwEndData, setWwEndData] = useState(null);
  const [wwHunterActive, setWwHunterActive] = useState(false);
  const [wwSeerResult, setWwSeerResult] = useState(null);
  const [wwWitchInfo, setWwWitchInfo] = useState(null);
  const [wwWitchAction, setWwWitchAction] = useState(null);
  const [wwSettings, setWwSettings] = useState({
    mode: 'medium', numWolves: 1, wolvesKnowEachOther: true,
    minionKnowsWolves: true, seerRevealType: 'alignment',
    revealOnDeath: true, anonymousVoting: false,
    tieBehavior: 'nobody', dayTimer: 60, nightTimer: 30,
  });

  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3500);
  }, []);

  const showError = useCallback((msg) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }, []);

  useEffect(() => {
    socket = io(SERVER_URL, { transports: ["websocket"] });

    socket.on("room_created", ({ code, room }) => { setRoomCode(code); setRoom(room); setIsHost(true); setScreen(SCREENS.LOBBY); });
    socket.on("room_joined",  ({ code, room }) => { setRoomCode(code); setRoom(room); setIsHost(false); setScreen(SCREENS.LOBBY); });
    socket.on("room_updated", (r) => setRoom({ ...r }));
    socket.on("you_are_host", () => { setIsHost(true); showNotification("You are now the host!"); });
    socket.on("player_left",  ({ username }) => showNotification(`${username} left`));
    socket.on("error",        ({ message }) => showError(message));

    // KILLER events
    socket.on("game_started", () => setCardFlipped(false));
    socket.on("role_assigned", ({ role }) => { setMyRole(role); setTimeout(() => setScreen(SCREENS.ROLE_REVEAL), 200); });
    socket.on("accusation_result", ({ accuserName, targetName, correct }) => { setGameResult({ accuserName, targetName, correct }); setScreen(SCREENS.GAME_OVER); });
    socket.on("game_restarted", ({ room }) => { setRoom({...room}); setMyRole(null); setGameResult(null); setCardFlipped(false); setWwPhase(null); setScreen(SCREENS.LOBBY); });

    // WEREWOLF events
    socket.on("ww_game_started",   ({ room }) => { setRoom({...room}); });
    socket.on("ww_role_assigned",  ({ role, wolfTeam: wt }) => { setMyRole(role); if (wt) setWolfTeam(wt); setTimeout(() => setScreen(SCREENS.WW_ROLE_REVEAL), 200); });
    socket.on("ww_night_started",  ({ dayNumber, currentNightRole, narration }) => {
      setWwDayNumber(dayNumber); setWwCurrentNightRole(currentNightRole);
      setWwNarration(narration); setWwIsMyTurn(false); setWwSeerResult(null);
      setWwWitchInfo(null); setWwWitchAction(null);
      setScreen(SCREENS.WW_NIGHT);
    });
    socket.on("ww_night_role_changed", ({ currentNightRole }) => { setWwCurrentNightRole(currentNightRole); setWwIsMyTurn(false); setWwSeerResult(null); });
    socket.on("ww_your_turn",   ({ roleId, targets }) => { setWwIsMyTurn(true); setWwTargets(targets); });
    socket.on("ww_waiting",     () => { setWwIsMyTurn(false); });
    socket.on("ww_seer_result", ({ targetName, reveal }) => { setWwSeerResult({ targetName, reveal }); });
    socket.on("ww_witch_info",  ({ victim, potions }) => { setWwWitchInfo({ victim, potions }); });
    socket.on("ww_day_started", ({ dayNumber, results, alivePlayers, narration, timerSeconds }) => {
      setWwDayNumber(dayNumber); setWwResults(results); setWwNarration(narration);
      setWwAlivePlayers(alivePlayers); setWwMyVote(null); setWwVotes({}); setWwVoteCount(0);
      setScreen(SCREENS.WW_DAY);
    });
    socket.on("ww_vote_update",    ({ votes, voteCount, aliveCount }) => { setWwVotes(votes); setWwVoteCount(voteCount); });
    socket.on("ww_vote_resolved",  ({ eliminated }) => { if (eliminated) showNotification(`${eliminated.username} was eliminated!`); });
    socket.on("ww_eliminated",     ({ username, role, isHunter }) => { showNotification(`${username} eliminated${role ? ` — was ${role.name}` : ''}`); });
    socket.on("ww_no_elimination", ({ reason }) => showNotification(reason));
    socket.on("ww_hunter_activate",() => { setWwHunterActive(true); });
    socket.on("ww_hunter_killed",  ({ targetName }) => showNotification(`Hunter took ${targetName} with them!`));
    socket.on("ww_game_ended",     ({ winner, rolesReveal, narration }) => { setWwEndData({ winner, rolesReveal, narration }); setScreen(SCREENS.WW_END); });

    return () => socket.disconnect();
  }, [showNotification, showError]);

  const handleSetUsername = () => {
    const name = usernameInput.trim();
    if (!name || name.length < 2) return showError("Name must be at least 2 characters");
    if (name.length > 16) return showError("Name must be under 16 characters");
    setUsername(name); setError(""); setScreen(SCREENS.GAME_SELECT);
  };

  const handleCreateRoom = () => socket.emit("create_room", { username, game: selectedGame.id });
  const handleJoinRoom   = () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 4) return showError("Enter a valid 4-letter code");
    socket.emit("join_room", { username, code });
  };
  const handleStartKiller   = () => { if (room?.players?.length < 3) return showError("Need at least 3 players"); socket.emit("start_game"); };
  const handleStartWerewolf = () => socket.emit("start_werewolf", { settings: wwSettings });
  const handleAccuse        = (targetId) => socket.emit("accuse_player", { targetId });
  const handleRestart       = () => socket.emit("restart_game");
  const handleNightAction   = (action, targetId) => { socket.emit("ww_night_action", { action, targetId }); setWwIsMyTurn(false); };
  const handleVote          = (targetId) => { socket.emit("ww_vote", { targetId }); setWwMyVote(targetId); };
  const handleBeginNight    = () => socket.emit("ww_begin_night");
  const handleForceVote     = () => socket.emit("ww_force_resolve_votes");
  const handleSkipNightRole = () => socket.emit("ww_skip_night_role");
  const handleHunterRevenge = (targetId) => { socket.emit("ww_hunter_revenge", { targetId }); setWwHunterActive(false); };

  const currentGame = selectedGame || GAMES.find(g => g.id === room?.game);

  return (
    <div className={`app theme-${currentGame?.id || 'default'}`}>
      {notification && <div className="notification">{notification}</div>}
      {error        && <div className="error-toast">{error}</div>}

      {screen === SCREENS.HOME        && <HomeScreen onNext={() => setScreen(SCREENS.USERNAME)} />}
      {screen === SCREENS.USERNAME    && <UsernameScreen value={usernameInput} onChange={setUsernameInput} onSubmit={handleSetUsername} error={error} />}
      {screen === SCREENS.GAME_SELECT && <GameSelectScreen games={GAMES} selectedGame={selectedGame} onSelect={setSelectedGame} isJoining={isJoining} setIsJoining={setIsJoining} joinCode={joinCodeInput} setJoinCode={setJoinCodeInput} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} error={error} username={username} />}
      {screen === SCREENS.LOBBY       && <LobbyScreen room={room} roomCode={roomCode} isHost={isHost} username={username} game={currentGame} onStartKiller={handleStartKiller} onGoSettings={() => setScreen(SCREENS.WW_SETTINGS)} error={error} />}
      {screen === SCREENS.WW_SETTINGS && <WwSettingsScreen settings={wwSettings} onChange={setWwSettings} room={room} onStart={handleStartWerewolf} onBack={() => setScreen(SCREENS.LOBBY)} error={error} />}
      {screen === SCREENS.ROLE_REVEAL && <RoleRevealScreen role={myRole} room={room} username={username} cardFlipped={cardFlipped} setCardFlipped={setCardFlipped} onAccuse={handleAccuse} onBack={() => { setMyRole(null); setScreen(SCREENS.LOBBY); }} />}
      {screen === SCREENS.WW_ROLE_REVEAL && <WwRoleRevealScreen role={myRole} wolfTeam={wolfTeam} cardFlipped={cardFlipped} setCardFlipped={setCardFlipped} isHost={isHost} onBeginNight={handleBeginNight} />}
      {screen === SCREENS.WW_NIGHT    && <WwNightScreen role={myRole} narration={wwNarration} currentNightRole={wwCurrentNightRole} isMyTurn={wwIsMyTurn} targets={wwTargets} onAction={handleNightAction} seerResult={wwSeerResult} witchInfo={wwWitchInfo} witchAction={wwWitchAction} setWitchAction={setWwWitchAction} isHost={isHost} onSkip={handleSkipNightRole} />}
      {screen === SCREENS.WW_DAY      && <WwDayScreen role={myRole} narration={wwNarration} dayNumber={wwDayNumber} results={wwResults} alivePlayers={wwAlivePlayers} votes={wwVotes} voteCount={wwVoteCount} myVote={wwMyVote} onVote={handleVote} isHost={isHost} onBeginNight={handleBeginNight} onForceVote={handleForceVote} hunterActive={wwHunterActive} onHunterRevenge={handleHunterRevenge} room={room} username={username} />}
      {screen === SCREENS.GAME_OVER   && <GameOverScreen result={gameResult} myRole={myRole} isHost={isHost} onRestart={handleRestart} onHome={() => { setScreen(SCREENS.HOME); setSelectedGame(null); setMyRole(null); setRoom(null); setRoomCode(""); }} />}
      {screen === SCREENS.WW_END      && <WwEndScreen data={wwEndData} myRole={myRole} isHost={isHost} onRestart={handleRestart} onHome={() => { setScreen(SCREENS.HOME); setSelectedGame(null); setMyRole(null); setRoom(null); setRoomCode(""); setWwEndData(null); }} />}
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────
function HomeScreen({ onNext }) {
  return (
    <div className="screen home-screen">
      <div className="home-bg"><div className="home-grid" /></div>
      <div className="home-content">
        <div className="home-logo">
          <div className="logo-key"><span>Alt</span><span>F4</span></div>
          <div className="logo-text"><h1>ALT F4</h1><p>GAMES</p></div>
        </div>
        <div className="home-tagline">
          <p>Party games that end friendships.</p>
          <p className="home-sub">5 to 15 players · Any device · Free</p>
        </div>
        <button className="btn-primary" onClick={onNext}>Play now</button>
        <div className="home-games-list">
          {["Killer","Werewolf","Spyfall","Resistance","Coup"].map((g,i) => (
            <span key={g} className={`home-game-pill ${i > 1 ? "locked" : ""}`}>{g}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── USERNAME ─────────────────────────────────────────────────────
function UsernameScreen({ value, onChange, onSubmit, error }) {
  return (
    <div className="screen center-screen">
      <div className="screen-card">
        <div className="screen-icon">👤</div>
        <h2>What's your name?</h2>
        <p className="screen-sub">How other players will see you</p>
        <input className="text-input" placeholder="Enter your name..." value={value} maxLength={16}
          onChange={e => onChange(e.target.value)} onKeyDown={e => e.key==="Enter" && onSubmit()} autoFocus />
        {error && <p className="inline-error">{error}</p>}
        <button className="btn-primary" onClick={onSubmit}>Continue</button>
      </div>
    </div>
  );
}

// ─── GAME SELECT ──────────────────────────────────────────────────
function GameSelectScreen({ games, selectedGame, onSelect, isJoining, setIsJoining, joinCode, setJoinCode, onCreateRoom, onJoinRoom, error, username }) {
  return (
    <div className="screen game-select-screen">
      <div className="screen-header"><h2>Hey {username}!</h2><p>Choose a game to play</p></div>
      <div className="games-list">
        {games.map(game => (
          <div key={game.id} className={`game-row ${selectedGame?.id===game.id?"selected":""} ${!game.available?"locked":""}`}
            onClick={() => game.available && onSelect(game)} style={{"--accent":game.accent}}>
            <div className="game-row-info">
              <div className="game-row-name">{game.name}</div>
              <div className="game-row-tagline">{game.tagline}</div>
            </div>
            <div className="game-row-right">
              {game.available ? <div className={`game-row-check ${selectedGame?.id===game.id?"checked":""}`} /> : <span className="soon-badge">Soon</span>}
            </div>
          </div>
        ))}
      </div>
      {selectedGame && (
        <div className="game-actions">
          <div className="game-desc-box" style={{"--accent":selectedGame.accent}}>
            <p>{selectedGame.description}</p>
            <span>{selectedGame.minPlayers}–{selectedGame.maxPlayers} players</span>
          </div>
          {!isJoining ? (
            <><button className="btn-primary" onClick={onCreateRoom}>Create room</button>
              <button className="btn-secondary" onClick={() => setIsJoining(true)}>Join a room</button></>
          ) : (
            <><input className="text-input code-input" placeholder="Enter room code..." value={joinCode} maxLength={4}
                onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => e.key==="Enter" && onJoinRoom()} autoFocus />
              {error && <p className="inline-error">{error}</p>}
              <button className="btn-primary" onClick={onJoinRoom}>Join room</button>
              <button className="btn-ghost" onClick={() => setIsJoining(false)}>Back</button></>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LOBBY ────────────────────────────────────────────────────────
function LobbyScreen({ room, roomCode, isHost, username, game, onStartKiller, onGoSettings, error }) {
  const players = room?.players || [];
  const isWerewolf = game?.id === "werewolf";
  const minP = game?.minPlayers || 3;
  return (
    <div className="screen lobby-screen" style={{"--accent": game?.accent||"#e63946"}}>
      <div className="lobby-header">
        <div className="lobby-game-name">{game?.name||"Game"}</div>
        <div className="lobby-code-wrap">
          <span className="lobby-code-label">Room code</span>
          <span className="lobby-code">{roomCode}</span>
        </div>
      </div>
      <div className="lobby-body">
        <div className="lobby-status">{isHost ? "Waiting for players to join..." : "Waiting for host to start..."}</div>
        <div className="player-list">
          {players.map((p,i) => (
            <div key={p.id} className={`player-row ${p.username===username?"me":""}`}>
              <div className="player-avatar">{p.username[0].toUpperCase()}</div>
              <span className="player-name">{p.username}{p.username===username?" (you)":""}</span>
              {p.id===room?.host && <span className="host-badge">host</span>}
            </div>
          ))}
        </div>
        <div className="player-count">{players.length} / {game?.maxPlayers||15} players{players.length < minP && <span className="count-warn"> · need {minP-players.length} more</span>}</div>
        {error && <p className="inline-error">{error}</p>}
        {isHost && !isWerewolf && <button className="btn-primary" onClick={onStartKiller} disabled={players.length < minP}>Start game ({players.length} players)</button>}
        {isHost && isWerewolf  && <button className="btn-primary" onClick={onGoSettings}  disabled={players.length < minP}>Configure & Start ›</button>}
      </div>
    </div>
  );
}

// ─── WW SETTINGS ─────────────────────────────────────────────────
function WwSettingsScreen({ settings, onChange, room, onStart, onBack, error }) {
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v }));
  const players = room?.players?.length || 0;
  return (
    <div className="screen ww-settings-screen">
      <div className="ww-settings-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Werewolf Setup</h2>
        <p>{players} players</p>
      </div>
      <div className="ww-settings-body">

        <div className="settings-section">
          <div className="settings-label">Game Mode</div>
          <div className="settings-pills">
            {['basic','medium','full'].map(m => (
              <button key={m} className={`pill ${settings.mode===m?"active":""}`} onClick={() => set('mode',m)}>{m}</button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Number of Werewolves</div>
          <div className="settings-pills">
            {[1,2,3].map(n => (
              <button key={n} className={`pill ${settings.numWolves===n?"active":""}`} onClick={() => set('numWolves',n)}>{n}</button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Seer Reveals</div>
          <div className="settings-pills">
            <button className={`pill ${settings.seerRevealType==='alignment'?"active":""}`} onClick={() => set('seerRevealType','alignment')}>Alignment only</button>
            <button className={`pill ${settings.seerRevealType==='exact'?"active":""}`} onClick={() => set('seerRevealType','exact')}>Exact role</button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Tie Vote</div>
          <div className="settings-pills">
            {['nobody','random'].map(t => (
              <button key={t} className={`pill ${settings.tieBehavior===t?"active":""}`} onClick={() => set('tieBehavior',t)}>{t==='nobody'?'Nobody dies':'Random'}</button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Day Timer (seconds)</div>
          <div className="settings-pills">
            {[0,30,60,90,120].map(t => (
              <button key={t} className={`pill ${settings.dayTimer===t?"active":""}`} onClick={() => set('dayTimer',t)}>{t===0?'Off':t+'s'}</button>
            ))}
          </div>
        </div>

        <div className="settings-toggles">
          {[
            ['wolvesKnowEachOther','Wolves know each other'],
            ['minionKnowsWolves',  'Minion knows wolves'],
            ['revealOnDeath',      'Reveal role on death'],
            ['anonymousVoting',    'Anonymous voting'],
          ].map(([key, label]) => (
            <div key={key} className="settings-toggle-row" onClick={() => set(key, !settings[key])}>
              <span>{label}</span>
              <div className={`toggle ${settings[key]?"on":""}`} />
            </div>
          ))}
        </div>

        {error && <p className="inline-error">{error}</p>}
        <button className="btn-ww-primary" onClick={onStart}>Start Werewolf</button>
      </div>
    </div>
  );
}

// ─── ROLE ART ─────────────────────────────────────────────────────
function RoleArt({ role }) {
  // KILLER — Jason mask + knife
  if (role?.id === "killer") return (
    <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
      <rect x="46" y="94" width="13" height="32" rx="5" fill="#1a0a0a"/>
      <rect x="101" y="94" width="13" height="32" rx="5" fill="#1a0a0a"/>
      <circle cx="48" cy="124" r="6" fill="#2a1a1a"/>
      <circle cx="112" cy="124" r="6" fill="#2a1a1a"/>
      <rect x="58" y="88" width="44" height="44" rx="10" fill="#1a0a0a"/>
      <rect x="66" y="100" width="12" height="28" rx="5" fill="#110808"/>
      <rect x="82" y="100" width="12" height="28" rx="5" fill="#110808"/>
      <circle cx="80" cy="60" r="26" fill="#e8e0d0" stroke="#b0a898" strokeWidth="1.5"/>
      <circle cx="80" cy="60" r="26" fill="none" stroke="#c8c0b0" strokeWidth="1"/>
      <ellipse cx="68" cy="57" rx="7" ry="5" fill="#111"/>
      <ellipse cx="92" cy="57" rx="7" ry="5" fill="#111"/>
      <ellipse cx="68" cy="57" rx="5" ry="3.5" fill="#c0392b"/>
      <ellipse cx="92" cy="57" rx="5" ry="3.5" fill="#c0392b"/>
      <ellipse cx="69" cy="56" rx="1.5" ry="1.5" fill="#ff8888" opacity="0.8"/>
      <ellipse cx="93" cy="56" rx="1.5" ry="1.5" fill="#ff8888" opacity="0.8"/>
      <line x1="80" y1="44" x2="80" y2="76" stroke="#b0a898" strokeWidth="0.8"/>
      <line x1="54" y1="60" x2="106" y2="60" stroke="#b0a898" strokeWidth="0.8"/>
      <ellipse cx="68" cy="68" rx="4" ry="3" fill="#c8c0b0" opacity="0.5"/>
      <ellipse cx="92" cy="68" rx="4" ry="3" fill="#c8c0b0" opacity="0.5"/>
      <rect x="76" y="57" rx="1" width="8" height="2.5" fill="#b8b0a0"/>
      <rect x="54" y="42" width="52" height="5" rx="2" fill="#d0c8b8"/>
      <rect x="56" y="44" width="48" height="42" rx="5" fill="none" stroke="#b0a890" strokeWidth="1.2"/>
      <rect x="77" y="78" width="6" height="6" rx="1" fill="#c0b8a8"/>
      <g transform="translate(102,38) rotate(30)">
        <rect x="-3" y="0" width="6" height="22" rx="1" fill="#3a3a3a"/>
        <rect x="-2.5" y="0" width="5" height="4" rx="0" fill="#555"/>
        <polygon points="0,-22 -3.5,0 3.5,0" fill="#d0d0d0"/>
        <polygon points="0,-22 0,0 3.5,0" fill="#b8b8b8"/>
        <line x1="-1" y1="-18" x2="1" y2="-4" stroke="#e8e8e8" strokeWidth="0.5" opacity="0.6"/>
      </g>
    </svg>
  );

  // POLICE
  if (role?.id === "police") return (
    <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="60" r="32" fill="#0a1a2a"/>
      <ellipse cx="80" cy="58" rx="22" ry="24" fill="#fad7a0"/>
      <rect x="62" y="34" width="36" height="20" rx="5" fill="#154360"/>
      <rect x="60" y="44" width="40" height="10" rx="3" fill="#0d2b40"/>
      <rect x="66" y="34" width="28" height="5" rx="3" fill="#2980b9"/>
      <polygon points="80,28 88,36 72,36" fill="#2980b9"/>
      <rect x="74" y="26" width="12" height="5" rx="2" fill="#f0c040"/>
      <ellipse cx="70" cy="59" rx="5" ry="4" fill="#fff"/>
      <ellipse cx="90" cy="59" rx="5" ry="4" fill="#fff"/>
      <ellipse cx="71" cy="60" rx="3" ry="3" fill="#0d2b40"/>
      <ellipse cx="91" cy="60" rx="3" ry="3" fill="#0d2b40"/>
      <ellipse cx="72" cy="59" rx="1" ry="1" fill="#fff"/>
      <ellipse cx="92" cy="59" rx="1" ry="1" fill="#fff"/>
      <path d="M66 55 Q70 52 74 55" fill="none" stroke="#0d2b40" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M76 68 Q80 73 84 68" fill="none" stroke="#c8906a" strokeWidth="1.5" strokeLinecap="round"/>
      <ellipse cx="65" cy="66" rx="4" ry="2.5" fill="#f0a88a" opacity="0.5"/>
      <ellipse cx="95" cy="66" rx="4" ry="2.5" fill="#f0a88a" opacity="0.5"/>
      <rect x="58" y="88" width="44" height="42" rx="10" fill="#154360"/>
      <rect x="66" y="94" width="28" height="5" rx="2" fill="#f0c040"/>
      <circle cx="80" cy="96" r="3" fill="#154360"/>
      <rect x="66" y="102" width="12" height="24" rx="5" fill="#0d2b40"/>
      <rect x="82" y="102" width="12" height="24" rx="5" fill="#0d2b40"/>
      <rect x="66" y="120" width="9" height="10" rx="3" fill="#091820"/>
      <rect x="85" y="120" width="9" height="10" rx="3" fill="#091820"/>
      <rect x="46" y="94" width="13" height="30" rx="5" fill="#154360"/>
      <rect x="101" y="94" width="13" height="30" rx="5" fill="#154360"/>
      <circle cx="48" cy="96" r="5" fill="#fad7a0"/>
      <circle cx="112" cy="96" r="5" fill="#fad7a0"/>
      <rect x="104" y="104" width="12" height="7" rx="2" fill="#f0c040"/>
      <circle cx="110" cy="108" r="2" fill="#154360"/>
      <circle cx="48" cy="122" r="6" fill="#fad7a0"/>
      <circle cx="112" cy="122" r="6" fill="#fad7a0"/>
    </svg>
  );

  // CIVILIAN variants
  if (role?.game === 'killer' || role?.id === 'civilian') {
    const vc = { cheerful:{skin:"#fad7a0",body:"#27ae60",dark:"#1e8449",hair:"#c0392b",cheek:"#f4a77e"}, mystic:{skin:"#f5cba7",body:"#8e44ad",dark:"#6c3483",hair:"#4a235a",cheek:"#f0a88a"}, noble:{skin:"#fae5d3",body:"#b7950b",dark:"#9a7d0a",hair:"#1a1a1a",cheek:"#f0a88a"}, rebel:{skin:"#fad7a0",body:"#e67e22",dark:"#ca6f1e",hair:"#1a1a1a",cheek:"#f4a77e"}, scholar:{skin:"#faebd7",body:"#2471a3",dark:"#1a5276",hair:"#5d4037",cheek:"#f0a88a"} };
    const c = vc[role?.variant] || vc.cheerful;
    return (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#111"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill={c.skin}/>
        <path d="M58 50 Q60 34 80 32 Q100 34 102 50 Q96 38 80 36 Q64 38 58 50Z" fill={c.hair}/>
        <ellipse cx="70" cy="58" rx="5" ry="4" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="5" ry="4" fill="#fff"/>
        <ellipse cx="71" cy="59" rx="3" ry="3" fill="#2c3e50"/>
        <ellipse cx="91" cy="59" rx="3" ry="3" fill="#2c3e50"/>
        <path d="M75 68 Q80 74 85 68" fill="none" stroke="#c8906a" strokeWidth="1.8" strokeLinecap="round"/>
        <ellipse cx="65" cy="66" rx="5" ry="3" fill={c.cheek} opacity="0.6"/>
        <ellipse cx="95" cy="66" rx="5" ry="3" fill={c.cheek} opacity="0.6"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill={c.body}/>
        <rect x="64" y="96" width="32" height="10" rx="0" fill={c.dark}/>
        <rect x="66" y="108" width="12" height="18" rx="5" fill={c.dark}/>
        <rect x="82" y="108" width="12" height="18" rx="5" fill={c.dark}/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill={c.body}/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill={c.body}/>
        <circle cx="48" cy="122" r="6" fill={c.skin}/>
        <circle cx="112" cy="122" r="6" fill={c.skin}/>
      </svg>
    );
  }

  // WEREWOLF ROLES
  const wwArt = {
    werewolf: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="65" r="35" fill="#2a0a0a"/>
        <ellipse cx="80" cy="62" rx="26" ry="28" fill="#6b4226"/>
        <path d="M54 50 Q58 26 80 24 Q102 26 106 50 Q98 34 80 30 Q62 34 54 50Z" fill="#3d1a0a"/>
        <polygon points="62,40 56,22 70,36" fill="#3d1a0a"/>
        <polygon points="98,40 104,22 90,36" fill="#3d1a0a"/>
        <polygon points="62,40 56,22 70,36" fill="#5a2a0a" opacity="0.7"/>
        <polygon points="98,40 104,22 90,36" fill="#5a2a0a" opacity="0.7"/>
        <ellipse cx="68" cy="60" rx="7" ry="6" fill="#1a0a0a"/>
        <ellipse cx="92" cy="60" rx="7" ry="6" fill="#1a0a0a"/>
        <ellipse cx="68" cy="60" rx="5" ry="4" fill="#8B0000"/>
        <ellipse cx="92" cy="60" rx="5" ry="4" fill="#8B0000"/>
        <ellipse cx="69" cy="59" rx="1.5" ry="1.5" fill="#ff4444" opacity="0.8"/>
        <ellipse cx="93" cy="59" rx="1.5" ry="1.5" fill="#ff4444" opacity="0.8"/>
        <path d="M68 72 Q74 68 80 72 Q86 68 92 72" fill="none" stroke="#3d1a0a" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M72 76 Q76 82 80 76" fill="none" stroke="#5a2a0a" strokeWidth="2" strokeLinecap="round"/>
        <ellipse cx="64" cy="70" rx="5" ry="3" fill="#8B4513" opacity="0.4"/>
        <ellipse cx="96" cy="70" rx="5" ry="3" fill="#8B4513" opacity="0.4"/>
        <path d="M72 80 L68 88" stroke="#3d1a0a" strokeWidth="2" strokeLinecap="round"/>
        <path d="M88 80 L92 88" stroke="#3d1a0a" strokeWidth="2" strokeLinecap="round"/>
        <rect x="56" y="90" width="48" height="46" rx="12" fill="#3d1a0a"/>
        <rect x="64" y="100" width="14" height="32" rx="6" fill="#2a0a0a"/>
        <rect x="82" y="100" width="14" height="32" rx="6" fill="#2a0a0a"/>
        <rect x="64" y="124" width="10" height="12" rx="3" fill="#1a0505"/>
        <rect x="86" y="124" width="10" height="12" rx="3" fill="#1a0505"/>
        <rect x="42" y="96" width="15" height="34" rx="6" fill="#3d1a0a"/>
        <rect x="103" y="96" width="15" height="34" rx="6" fill="#3d1a0a"/>
        <circle cx="44" cy="128" r="7" fill="#6b4226"/>
        <circle cx="116" cy="128" r="7" fill="#6b4226"/>
        <path d="M44 122 L40 116 L44 118 L48 112" fill="none" stroke="#8B4513" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M116 122 L112 116 L116 118 L120 112" fill="none" stroke="#8B4513" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    seer: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#0a0e1a"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#f0d9c0"/>
        <path d="M58 48 Q60 30 80 28 Q100 30 102 48" fill="#1a1a3a"/>
        <path d="M58 48 Q60 34 68 30 L80 28 L92 30 Q100 34 102 48" fill="#2e2e6a"/>
        <path d="M62 36 Q80 30 98 36" stroke="#4040aa" strokeWidth="2" fill="none"/>
        <circle cx="80" cy="30" r="5" fill="#5555cc"/>
        <ellipse cx="70" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="58" rx="4" ry="4" fill="#1a1a3a"/>
        <ellipse cx="90" cy="58" rx="4" ry="4" fill="#1a1a3a"/>
        <ellipse cx="71" cy="57" rx="1.5" ry="1.5" fill="#8888ff" opacity="0.9"/>
        <ellipse cx="91" cy="57" rx="1.5" ry="1.5" fill="#8888ff" opacity="0.9"/>
        <path d="M75 68 Q80 73 85 68" fill="none" stroke="#c8906a" strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="65" cy="66" rx="4" ry="2.5" fill="#f0a88a" opacity="0.4"/>
        <ellipse cx="95" cy="66" rx="4" ry="2.5" fill="#f0a88a" opacity="0.4"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill="#1a1a3a"/>
        <circle cx="80" cy="98" r="7" fill="#2e2e6a"/>
        <circle cx="80" cy="98" r="4" fill="#5555cc"/>
        <circle cx="81" cy="97" r="1.5" fill="#aaaaff"/>
        <rect x="66" y="108" width="12" height="18" rx="5" fill="#111130"/>
        <rect x="82" y="108" width="12" height="18" rx="5" fill="#111130"/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill="#1a1a3a"/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill="#1a1a3a"/>
        <circle cx="48" cy="122" r="6" fill="#f0d9c0"/>
        <circle cx="112" cy="122" r="6" fill="#f0d9c0"/>
        <circle cx="46" cy="96" r="4" fill="#5555cc" opacity="0.7"/>
        <circle cx="114" cy="96" r="4" fill="#5555cc" opacity="0.7"/>
      </svg>
    ),
    doctor: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#0a1a10"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#e8d5b0"/>
        <path d="M58 50 Q60 32 80 30 Q100 32 102 50" fill="#1a3a1a"/>
        <rect x="66" y="28" width="28" height="10" rx="4" fill="#f0f0f0"/>
        <rect x="70" y="26" width="20" height="6" rx="3" fill="#e0e0e0"/>
        <ellipse cx="70" cy="59" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="59" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="59" rx="4" ry="4" fill="#1a3a1a"/>
        <ellipse cx="90" cy="59" rx="4" ry="4" fill="#1a3a1a"/>
        <ellipse cx="71" cy="58" rx="1.5" ry="1.5" fill="#aaffaa" opacity="0.8"/>
        <ellipse cx="91" cy="58" rx="1.5" ry="1.5" fill="#aaffaa" opacity="0.8"/>
        <path d="M75 69 Q80 74 85 69" fill="none" stroke="#c8906a" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M68 55 Q70 52 74 55" fill="none" stroke="#1a3a1a" strokeWidth="1.2" strokeLinecap="round"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill="#f0f0f0"/>
        <rect x="77" y="94" width="6" height="16" rx="2" fill="#1abc9c"/>
        <rect x="70" y="100" width="20" height="6" rx="2" fill="#1abc9c"/>
        <rect x="66" y="108" width="12" height="18" rx="5" fill="#e0e0e0"/>
        <rect x="82" y="108" width="12" height="18" rx="5" fill="#e0e0e0"/>
        <rect x="66" y="122" width="9" height="10" rx="3" fill="#c8c8c8"/>
        <rect x="85" y="122" width="9" height="10" rx="3" fill="#c8c8c8"/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill="#f0f0f0"/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill="#f0f0f0"/>
        <circle cx="48" cy="122" r="6" fill="#e8d5b0"/>
        <circle cx="112" cy="122" r="6" fill="#e8d5b0"/>
        <rect x="100" y="100" width="16" height="10" rx="3" fill="#1abc9c" opacity="0.7"/>
        <circle cx="108" cy="105" r="3" fill="#0e8e6e"/>
      </svg>
    ),
    villager: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#1a1208"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#d4a574"/>
        <path d="M58 50 Q60 32 80 30 Q100 32 102 50 Q94 38 80 35 Q66 38 58 50Z" fill="#5d3a1a"/>
        <rect x="58" y="40" width="44" height="10" rx="4" fill="#4a2e10"/>
        <ellipse cx="70" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="58" rx="4" ry="4" fill="#5d3a1a"/>
        <ellipse cx="90" cy="58" rx="4" ry="4" fill="#5d3a1a"/>
        <ellipse cx="71" cy="57" rx="1.5" ry="1.5" fill="#fff"/>
        <ellipse cx="91" cy="57" rx="1.5" ry="1.5" fill="#fff"/>
        <path d="M66 54 Q70 51 74 54" fill="none" stroke="#5d3a1a" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M75 68 Q80 73 85 68" fill="none" stroke="#a06030" strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="64" cy="66" rx="5" ry="3" fill="#c8906a" opacity="0.5"/>
        <ellipse cx="96" cy="66" rx="5" ry="3" fill="#c8906a" opacity="0.5"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill="#7d5a3c"/>
        <rect x="64" y="96" width="32" height="8" rx="0" fill="#5d3a1a"/>
        <rect x="66" y="106" width="12" height="20" rx="5" fill="#5d3a1a"/>
        <rect x="82" y="106" width="12" height="20" rx="5" fill="#5d3a1a"/>
        <rect x="66" y="120" width="9" height="10" rx="3" fill="#4a2e10"/>
        <rect x="85" y="120" width="9" height="10" rx="3" fill="#4a2e10"/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill="#7d5a3c"/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill="#7d5a3c"/>
        <circle cx="48" cy="122" r="6" fill="#d4a574"/>
        <circle cx="112" cy="122" r="6" fill="#d4a574"/>
        <g transform="translate(100,85)">
          <rect x="0" y="-6" width="3" height="26" rx="1" fill="#5d3a1a"/>
          <path d="M1.5,-6 Q8,-10 6,-2 Q4,4 1.5,2" fill="#4a7a2a"/>
          <path d="M1.5,-2 Q-5,-6 -3,2 Q-1,6 1.5,4" fill="#3a6a1a"/>
        </g>
      </svg>
    ),
    hunter: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#1a1208"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#c8a070"/>
        <path d="M58 50 Q62 28 80 26 Q98 28 102 50" fill="#2a1a08"/>
        <polygon points="80,20 88,34 72,34" fill="#2a1a08"/>
        <rect x="68" y="26" width="24" height="8" rx="3" fill="#3a2a10"/>
        <path d="M64 30 Q72 24 80 22 Q88 24 96 30" stroke="#4a3a18" strokeWidth="1.5" fill="none"/>
        <ellipse cx="70" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="58" rx="4" ry="4" fill="#2a1a08"/>
        <ellipse cx="90" cy="58" rx="4" ry="4" fill="#2a1a08"/>
        <ellipse cx="71" cy="57" rx="1.5" ry="1.5" fill="#d4ac0d" opacity="0.8"/>
        <ellipse cx="91" cy="57" rx="1.5" ry="1.5" fill="#d4ac0d" opacity="0.8"/>
        <path d="M75 68 Q80 73 85 68" fill="none" stroke="#a06030" strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill="#2a1a08"/>
        <rect x="64" y="96" width="32" height="8" rx="0" fill="#3a2a10"/>
        <rect x="66" y="106" width="12" height="20" rx="5" fill="#1a0e04"/>
        <rect x="82" y="106" width="12" height="20" rx="5" fill="#1a0e04"/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill="#2a1a08"/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill="#2a1a08"/>
        <circle cx="48" cy="122" r="6" fill="#c8a070"/>
        <circle cx="112" cy="122" r="6" fill="#c8a070"/>
        <g transform="translate(96,72)">
          <rect x="-2" y="-30" width="4" height="30" rx="1" fill="#5d3a1a"/>
          <polygon points="0,-30 -3,-20 3,-20" fill="#c8c8c8"/>
          <polygon points="0,-30 0,-20 3,-20" fill="#a8a8a8"/>
          <rect x="-6" y="-22" width="12" height="3" rx="1" fill="#3a2a10"/>
        </g>
      </svg>
    ),
    witch: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="62" r="32" fill="#1a0a2a"/>
        <ellipse cx="80" cy="60" rx="22" ry="24" fill="#c8a0c0"/>
        <polygon points="80,16 96,40 64,40" fill="#2a0a3a"/>
        <rect x="64" y="38" width="32" height="8" rx="2" fill="#1a0828"/>
        <path d="M64 40 Q80 36 96 40" stroke="#3a1048" strokeWidth="1.5" fill="none"/>
        <ellipse cx="70" cy="60" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="60" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="60" rx="4" ry="4" fill="#2a0a3a"/>
        <ellipse cx="90" cy="60" rx="4" ry="4" fill="#2a0a3a"/>
        <ellipse cx="71" cy="59" rx="1.5" ry="1.5" fill="#cc88ff" opacity="0.9"/>
        <ellipse cx="91" cy="59" rx="1.5" ry="1.5" fill="#cc88ff" opacity="0.9"/>
        <path d="M68 54 Q70 51 74 55" fill="none" stroke="#2a0a3a" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M75 70 Q80 75 85 70" fill="none" stroke="#a060a0" strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="64" cy="68" rx="5" ry="3" fill="#d090c0" opacity="0.5"/>
        <ellipse cx="96" cy="68" rx="5" ry="3" fill="#d090c0" opacity="0.5"/>
        <rect x="58" y="90" width="44" height="42" rx="10" fill="#2a0a3a"/>
        <rect x="64" y="98" width="32" height="8" fill="#1a0828"/>
        <rect x="66" y="108" width="12" height="20" rx="5" fill="#1a0828"/>
        <rect x="82" y="108" width="12" height="20" rx="5" fill="#1a0828"/>
        <rect x="46" y="96" width="13" height="30" rx="5" fill="#2a0a3a"/>
        <rect x="101" y="96" width="13" height="30" rx="5" fill="#2a0a3a"/>
        <circle cx="48" cy="124" r="6" fill="#c8a0c0"/>
        <circle cx="112" cy="124" r="6" fill="#c8a0c0"/>
        <g transform="translate(106,88)">
          <ellipse cx="0" cy="0" rx="7" ry="10" fill="#1a3a1a" stroke="#2a5a2a" strokeWidth="1"/>
          <ellipse cx="0" cy="-2" rx="4" ry="6" fill="#00aa44" opacity="0.6"/>
          <circle cx="0" cy="-4" r="2" fill="#88ffaa" opacity="0.8"/>
        </g>
      </svg>
    ),
    minion: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#1a0a1a"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#c8b0a0"/>
        <path d="M58 50 Q62 30 80 28 Q98 30 102 50 Q94 36 80 34 Q66 36 58 50Z" fill="#2a0a1a"/>
        <ellipse cx="70" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="58" rx="4" ry="4" fill="#2a0a1a"/>
        <ellipse cx="90" cy="58" rx="4" ry="4" fill="#2a0a1a"/>
        <ellipse cx="71" cy="57" rx="1.5" ry="1.5" fill="#ff4444" opacity="0.7"/>
        <ellipse cx="91" cy="57" rx="1.5" ry="1.5" fill="#ff4444" opacity="0.7"/>
        <path d="M68 54 Q70 50 74 54" fill="none" stroke="#2a0a1a" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M83 67 Q80 72 77 67" fill="none" stroke="#a07060" strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="64" cy="66" rx="5" ry="3" fill="#c8906a" opacity="0.4"/>
        <ellipse cx="96" cy="66" rx="5" ry="3" fill="#c8906a" opacity="0.4"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill="#2a0a1a"/>
        <rect x="64" y="96" width="32" height="8" fill="#1a0515"/>
        <rect x="66" y="106" width="12" height="20" rx="5" fill="#1a0515"/>
        <rect x="82" y="106" width="12" height="20" rx="5" fill="#1a0515"/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill="#2a0a1a"/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill="#2a0a1a"/>
        <circle cx="48" cy="122" r="6" fill="#c8b0a0"/>
        <circle cx="112" cy="122" r="6" fill="#c8b0a0"/>
        <ellipse cx="80" cy="35" rx="8" ry="4" fill="#8B0000" opacity="0.3"/>
        <path d="M76 35 Q80 30 84 35" fill="none" stroke="#8B0000" strokeWidth="1" opacity="0.5"/>
      </svg>
    ),
    bodyguard: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#0a1020"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#d4b896"/>
        <path d="M58 50 Q62 28 80 26 Q98 28 102 50" fill="#1a2840"/>
        <rect x="62" y="28" width="36" height="18" rx="4" fill="#1e3a5a"/>
        <path d="M62 28 Q80 22 98 28" stroke="#2e5a8a" strokeWidth="2" fill="none"/>
        <ellipse cx="70" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="6" ry="5" fill="#fff"/>
        <ellipse cx="70" cy="58" rx="4" ry="4" fill="#1a2840"/>
        <ellipse cx="90" cy="58" rx="4" ry="4" fill="#1a2840"/>
        <ellipse cx="71" cy="57" rx="1.5" ry="1.5" fill="#aaccff" opacity="0.9"/>
        <ellipse cx="91" cy="57" rx="1.5" ry="1.5" fill="#aaccff" opacity="0.9"/>
        <path d="M68 54 Q70 51 74 54" fill="none" stroke="#1a2840" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M75 68 Q80 73 85 68" fill="none" stroke="#c8906a" strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="56" y="88" width="48" height="44" rx="10" fill="#1e3a5a"/>
        <path d="M80,94 L62,100 L62,112 Q62,124 80,130 Q98,124 98,112 L98,100 Z" fill="#2e5a8a" stroke="#4a7aaa" strokeWidth="1"/>
        <path d="M80,98 L66,103 L66,112 Q66,122 80,127 Q94,122 94,112 L94,103 Z" fill="#1e3a5a"/>
        <path d="M73,108 L78,113 L88,103" fill="none" stroke="#aaccff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="44" y="94" width="14" height="32" rx="6" fill="#1e3a5a"/>
        <rect x="102" y="94" width="14" height="32" rx="6" fill="#1e3a5a"/>
        <circle cx="46" cy="124" r="7" fill="#d4b896"/>
        <circle cx="114" cy="124" r="7" fill="#d4b896"/>
      </svg>
    ),
    alpha: () => (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="65" r="35" fill="#1a0505"/>
        <ellipse cx="80" cy="62" rx="28" ry="30" fill="#5a2a1a"/>
        <path d="M52 50 Q56 22 80 20 Q104 22 108 50 Q98 30 80 26 Q62 30 52 50Z" fill="#2a0505"/>
        <polygon points="60,38 52,16 68,32" fill="#2a0505"/>
        <polygon points="100,38 108,16 92,32" fill="#2a0505"/>
        <polygon points="60,38 52,16 68,32" fill="#6a1a0a" opacity="0.8"/>
        <polygon points="100,38 108,16 92,32" fill="#6a1a0a" opacity="0.8"/>
        <path d="M60,30 L56,20 L62,18 M100,30 L104,20 L98,18" stroke="#8B0000" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <ellipse cx="68" cy="60" rx="8" ry="7" fill="#111"/>
        <ellipse cx="92" cy="60" rx="8" ry="7" fill="#111"/>
        <ellipse cx="68" cy="60" rx="6" ry="5" fill="#8B0000"/>
        <ellipse cx="92" cy="60" rx="6" ry="5" fill="#8B0000"/>
        <ellipse cx="69" cy="58" rx="2" ry="2" fill="#ff6666" opacity="0.9"/>
        <ellipse cx="93" cy="58" rx="2" ry="2" fill="#ff6666" opacity="0.9"/>
        <path d="M66 74 Q72 69 80 74 Q88 69 94 74" fill="none" stroke="#2a0505" strokeWidth="2" strokeLinecap="round"/>
        <path d="M71 78 Q76 86 80 78" fill="none" stroke="#3a0808" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M62,76 L58,84 M98,76 L102,84" stroke="#2a0505" strokeWidth="2.5" strokeLinecap="round"/>
        <rect x="54" y="92" width="52" height="48" rx="12" fill="#2a0505"/>
        <rect x="62" y="102" width="15" height="34" rx="7" fill="#1a0303"/>
        <rect x="83" y="102" width="15" height="34" rx="7" fill="#1a0303"/>
        <rect x="40" y="98" width="16" height="36" rx="7" fill="#2a0505"/>
        <rect x="104" y="98" width="16" height="36" rx="7" fill="#2a0505"/>
        <circle cx="42" cy="132" r="8" fill="#5a2a1a"/>
        <circle cx="118" cy="132" r="8" fill="#5a2a1a"/>
        <path d="M42 126 L36 118 L42 120 L46 112 M118 126 L112 118 L118 120 L122 112" fill="none" stroke="#8B0000" strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="80" cy="52" rx="12" ry="4" fill="#8B0000" opacity="0.2"/>
      </svg>
    ),
  };

  const artFn = wwArt[role?.id];
  if (artFn) return artFn();
  return wwArt.villager();
}

// ─── ROLE REVEAL (KILLER) ─────────────────────────────────────────
function RoleRevealScreen({ role, room, username, cardFlipped, setCardFlipped, onAccuse, onBack }) {
  const [showAccuse, setShowAccuse] = useState(false);
  const isPolice = role?.id === "police";
  const players = room?.players || [];
  const others = players.filter(p => p.username !== username && !p.eliminated);
  return (
    <div className="screen role-screen">
      <div className="role-screen-bg" style={{"--accent": role?.color||"#e63946"}} />
      <div className="role-screen-content">
        <div className="role-label">Your role — keep this secret!</div>
        <div className={`role-card ${cardFlipped?"flipped":""}`} onClick={() => !cardFlipped && setCardFlipped(true)}
          style={{"--accent":role?.color||"#e63946","--accent2":role?.accent||"#e63946"}}>
          <div className="role-card-front"><div className="card-front-inner"><div className="card-mystery-icon">?</div><p className="card-tap-hint">Tap to reveal</p></div></div>
          <div className="role-card-back">
            <div className="card-back-inner">
              <div className="card-corner card-corner-tl">{role?.letter||role?.name?.[0]}</div>
              <div className="card-corner card-corner-tr">{role?.suit||"♠"}</div>
              <div className="card-corner card-corner-br">{role?.letter||role?.name?.[0]}</div>
              <div className="card-corner card-corner-bl">{role?.suit||"♠"}</div>
              <div className="card-art-placeholder"><RoleArt role={role} /></div>
              <div className="card-divider" />
              <div className="card-role-name">{role?.name?.toUpperCase()}</div>
              <div className="card-role-desc">{role?.description}</div>
            </div>
          </div>
        </div>
        {cardFlipped && (
          <div className="role-actions">
            {isPolice && <button className="btn-accent" style={{"--accent":role?.color}} onClick={() => setShowAccuse(!showAccuse)}>{showAccuse?"Cancel":"Accuse a player"}</button>}
            {showAccuse && <div className="accuse-list"><p className="accuse-label">Who is the killer?</p>{others.map(p => <button key={p.id} className="btn-accuse" onClick={() => onAccuse(p.id)}>Accuse {p.username}</button>)}</div>}
            <button className="btn-ghost" onClick={onBack}>Back to lobby</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WW ROLE REVEAL ───────────────────────────────────────────────
function WwRoleRevealScreen({ role, wolfTeam, cardFlipped, setCardFlipped, isHost, onBeginNight }) {
  return (
    <div className="screen role-screen ww-theme">
      <div className="role-screen-bg" style={{"--accent": role?.color||"#8B0000"}} />
      <div className="role-screen-content">
        <div className="role-label">Your role — tell no one</div>
        <div className={`role-card ${cardFlipped?"flipped":""}`} onClick={() => !cardFlipped && setCardFlipped(true)}
          style={{"--accent":role?.color||"#8B0000","--accent2":role?.accent||"#c8a97e"}}>
          <div className="role-card-front"><div className="card-front-inner"><div className="card-mystery-icon">?</div><p className="card-tap-hint">Tap to reveal</p></div></div>
          <div className="role-card-back">
            <div className="card-back-inner">
              <div className="card-corner card-corner-tl">{role?.letter}</div>
              <div className="card-corner card-corner-tr">{role?.suit}</div>
              <div className="card-corner card-corner-br">{role?.letter}</div>
              <div className="card-corner card-corner-bl">{role?.suit}</div>
              <div className="card-art-placeholder"><RoleArt role={role} /></div>
              <div className="card-divider" />
              <div className="card-role-name">{role?.name?.toUpperCase()}</div>
              <div className="card-role-desc">{role?.description}</div>
            </div>
          </div>
        </div>
        {cardFlipped && wolfTeam && (
          <div className="ww-wolf-team-box">
            <p className="ww-wolf-team-label">🐺 Your pack</p>
            <p className="ww-wolf-team-names">{wolfTeam.join(', ')}</p>
          </div>
        )}
        {cardFlipped && isHost && (
          <button className="btn-ww-primary" onClick={onBeginNight}>Begin Night 1</button>
        )}
        {cardFlipped && !isHost && (
          <p className="ww-waiting-text">Waiting for host to begin the game...</p>
        )}
      </div>
    </div>
  );
}

// ─── WW NIGHT ─────────────────────────────────────────────────────
function WwNightScreen({ role, narration, currentNightRole, isMyTurn, targets, onAction, seerResult, witchInfo, witchAction, setWitchAction, isHost, onSkip }) {
  const roleNames = { werewolf:'Werewolves', alpha:'Alpha Wolf', seer:'The Seer', doctor:'The Doctor', witch:'The Witch', bodyguard:'The Bodyguard' };
  return (
    <div className="screen ww-night-screen">
      <div className="ww-night-overlay" />
      <div className="ww-night-content">
        <div className="ww-moon">☽</div>
        <h2 className="ww-narration">{narration}</h2>
        <div className="ww-night-phase-label">{currentNightRole ? `${roleNames[currentNightRole]||currentNightRole} — take your action` : 'All actions complete...'}</div>

        {isMyTurn && role?.id !== 'witch' && (
          <div className="ww-action-panel">
            <p className="ww-action-prompt">
              {role?.id === 'werewolf' || role?.id === 'alpha' ? 'Choose your victim:' :
               role?.id === 'seer'      ? 'Investigate a player:' :
               role?.id === 'doctor'    ? 'Choose who to save:' :
               role?.id === 'bodyguard' ? 'Choose who to guard:' : 'Choose:'}
            </p>
            {targets.map(t => (
              <button key={t.id} className="ww-target-btn" onClick={() => onAction(role?.id, t.id)}>{t.username}</button>
            ))}
          </div>
        )}

        {isMyTurn && role?.id === 'witch' && (
          <div className="ww-action-panel">
            {witchInfo?.victim && <p className="ww-action-prompt">Tonight's victim: <strong>{witchInfo.victim}</strong></p>}
            <div className="ww-witch-btns">
              {witchInfo?.potions?.save && <button className="ww-target-btn" onClick={() => onAction('save', witchInfo?.victimId)}>Use Save Potion</button>}
              {witchInfo?.potions?.poison && <button className={`ww-target-btn ${witchAction==='poison'?'active':''}`} onClick={() => setWitchAction('poison')}>Use Poison Potion</button>}
              <button className="ww-target-btn skip" onClick={() => onAction('skip', null)}>Skip</button>
            </div>
            {witchAction === 'poison' && targets.map(t => (
              <button key={t.id} className="ww-target-btn danger" onClick={() => onAction('poison', t.id)}>Poison {t.username}</button>
            ))}
          </div>
        )}

        {seerResult && (
          <div className="ww-seer-result">
            <p>🔮 {seerResult.targetName} is <strong>{seerResult.reveal}</strong></p>
          </div>
        )}

        {!isMyTurn && (
          <div className="ww-sleeping"><p>😴 Eyes closed. Wait for your turn...</p></div>
        )}

        {isHost && (
          <button className="btn-ghost ww-skip-btn" onClick={onSkip}>Skip current role →</button>
        )}
      </div>
    </div>
  );
}

// ─── WW DAY ───────────────────────────────────────────────────────
function WwDayScreen({ role, narration, dayNumber, results, alivePlayers, votes, voteCount, myVote, onVote, isHost, onBeginNight, onForceVote, hunterActive, onHunterRevenge, room, username }) {
  const [phase, setPhase] = useState('results');
  const myId = room?.players?.find(p => p.username === username)?.id;
  const amAlive = alivePlayers?.some(p => p.id === myId);

  return (
    <div className="screen ww-day-screen">
      <div className="ww-day-overlay" />
      <div className="ww-day-content">
        <div className="ww-day-sun">☀</div>
        <div className="ww-day-number">Day {dayNumber}</div>
        <p className="ww-narration ww-day-narration">{narration}</p>

        {results && (
          <div className="ww-results-box">
            {results.killed   && <div className="ww-result-death">💀 {results.killed.username} was killed{results.killed.role ? ` (${results.killed.role.name})` : ''}</div>}
            {results.poisoned && <div className="ww-result-death">☠️ {results.poisoned.username} was poisoned{results.poisoned.role ? ` (${results.poisoned.role.name})` : ''}</div>}
            {!results.killed && !results.poisoned && <div className="ww-result-safe">✨ Nobody died tonight!</div>}
          </div>
        )}

        {hunterActive && amAlive && (
          <div className="ww-hunter-panel">
            <p className="ww-action-prompt">🏹 You are the Hunter! Choose your final target:</p>
            {alivePlayers?.filter(p => p.id !== myId).map(t => (
              <button key={t.id} className="ww-target-btn danger" onClick={() => onHunterRevenge(t.id)}>{t.username}</button>
            ))}
          </div>
        )}

        <div className="ww-day-tabs">
          <button className={`ww-tab ${phase==='results'?'active':''}`} onClick={() => setPhase('results')}>Results</button>
          <button className={`ww-tab ${phase==='vote'?'active':''}`} onClick={() => setPhase('vote')}>Vote</button>
        </div>

        {phase === 'results' && (
          <div className="ww-alive-list">
            <p className="ww-alive-label">Alive players ({alivePlayers?.length})</p>
            {alivePlayers?.map(p => (
              <div key={p.id} className={`ww-player-row ${p.id===myId?'me':''}`}>
                <div className="player-avatar">{p.username[0]}</div>
                <span>{p.username}{p.id===myId?' (you)':''}</span>
              </div>
            ))}
          </div>
        )}

        {phase === 'vote' && amAlive && (
          <div className="ww-vote-panel">
            <p className="ww-action-prompt">Who do you suspect is a werewolf?</p>
            <p className="ww-vote-count">{voteCount} / {alivePlayers?.length} voted</p>
            {alivePlayers?.filter(p => p.id !== myId).map(p => (
              <button key={p.id} className={`ww-target-btn ${myVote===p.id?'voted':''}`} onClick={() => !myVote && onVote(p.id)} disabled={!!myVote}>
                {p.username}{myVote===p.id?' ✓':''}
              </button>
            ))}
            {isHost && <button className="btn-ghost" style={{marginTop:'12px'}} onClick={onForceVote}>Force resolve votes</button>}
          </div>
        )}

        {phase === 'vote' && !amAlive && <p className="ww-dead-notice">You are dead. You may observe but cannot vote.</p>}

        {isHost && (
          <button className="btn-ww-primary" style={{marginTop:'16px'}} onClick={onBeginNight}>Begin Next Night →</button>
        )}
      </div>
    </div>
  );
}

// ─── KILLER GAME OVER ─────────────────────────────────────────────
function GameOverScreen({ result, myRole, isHost, onRestart, onHome }) {
  const policeWon = result?.correct;
  return (
    <div className="screen game-over-screen">
      <div className={`game-over-banner ${policeWon?"police-win":"killer-win"}`}>
        <div className="game-over-icon">{policeWon?"🕵️":"🔪"}</div>
        <h2>{policeWon?"Police wins!":"Killer wins!"}</h2>
        <p>{policeWon ? `${result.accuserName} caught ${result.targetName} — the killer!` : `${result.accuserName} accused ${result.targetName}, but they were innocent!`}</p>
      </div>
      <div className="game-over-role">
        <p className="game-over-role-label">Your role was</p>
        <div className="game-over-role-name" style={{color:myRole?.color}}>{myRole?.name}</div>
      </div>
      <div className="game-over-actions">
        {isHost && <button className="btn-primary" onClick={onRestart}>Play again</button>}
        <button className="btn-secondary" onClick={onHome}>Back to home</button>
      </div>
    </div>
  );
}

// ─── WW END ───────────────────────────────────────────────────────
function WwEndScreen({ data, myRole, isHost, onRestart, onHome }) {
  if (!data) return null;
  const villageWon = data.winner === 'village';
  return (
    <div className="screen ww-end-screen">
      <div className={`ww-end-banner ${villageWon?"village-win":"wolf-win"}`}>
        <div className="game-over-icon">{villageWon?"🌅":"🐺"}</div>
        <h2>{villageWon?"Village wins!":"Wolves win!"}</h2>
        <p>{data.narration}</p>
      </div>
      <div className="ww-roles-reveal">
        <p className="ww-roles-reveal-label">Full role reveal</p>
        {data.rolesReveal?.map(p => (
          <div key={p.id} className={`ww-role-reveal-row ${!p.alive?'dead':''}`}>
            <span className="ww-role-reveal-name">{p.username}</span>
            <span className="ww-role-reveal-role" style={{color:p.role?.color}}>{p.role?.name}</span>
            {!p.alive && <span className="ww-role-reveal-dead">☠</span>}
          </div>
        ))}
      </div>
      <div className="game-over-actions">
        {isHost && <button className="btn-ww-primary" onClick={onRestart}>Play again</button>}
        <button className="btn-secondary" onClick={onHome}>Back to home</button>
      </div>
    </div>
  );
}
