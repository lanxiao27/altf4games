import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

const SCREENS = {
  HOME: "home",
  USERNAME: "username",
  GAME_SELECT: "game_select",
  LOBBY: "lobby",
  ROLE_REVEAL: "role_reveal",
  GAME_OVER: "game_over",
};

const GAMES = [
  {
    id: "killer",
    name: "Killer",
    tagline: "Blink. Eliminate. Survive.",
    description: "The killer winks to eliminate players. The police must catch them before everyone is dead.",
    minPlayers: 3,
    maxPlayers: 15,
    theme: "noir",
    accent: "#e63946",
    available: true,
  },
  {
    id: "werewolf",
    name: "Werewolf",
    tagline: "Trust no one. The night hunts.",
    description: "Villagers must find and eliminate the werewolves before they're outnumbered.",
    minPlayers: 5,
    maxPlayers: 15,
    theme: "forest",
    accent: "#2d6a4f",
    available: false,
  },
  {
    id: "spyfall",
    name: "Spyfall",
    tagline: "One spy. One location. Find them.",
    description: "Everyone knows the location except the spy. Ask questions. Find the impostor.",
    minPlayers: 4,
    maxPlayers: 12,
    theme: "spy",
    accent: "#7c4dff",
    available: false,
  },
  {
    id: "resistance",
    name: "The Resistance",
    tagline: "Missions will be sabotaged.",
    description: "Resistance fighters must complete missions while spies work to destroy them from within.",
    minPlayers: 5,
    maxPlayers: 10,
    theme: "resistance",
    accent: "#e9a000",
    available: false,
  },
  {
    id: "coup",
    name: "Coup",
    tagline: "Bluff. Betray. Rule.",
    description: "Claim any role. Bluff your way to power. Last one standing wins.",
    minPlayers: 3,
    maxPlayers: 10,
    theme: "coup",
    accent: "#c77dff",
    available: false,
  },
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

  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  }, []);

  useEffect(() => {
    socket = io(SERVER_URL, { transports: ["websocket"] });

    socket.on("room_created", ({ code, room }) => {
      setRoomCode(code);
      setRoom(room);
      setIsHost(true);
      setScreen(SCREENS.LOBBY);
    });

    socket.on("room_joined", ({ code, room }) => {
      setRoomCode(code);
      setRoom(room);
      setIsHost(false);
      setScreen(SCREENS.LOBBY);
    });

    socket.on("room_updated", (room) => setRoom({ ...room }));

    socket.on("you_are_host", () => {
      setIsHost(true);
      showNotification("You are now the host!");
    });

    socket.on("player_left", ({ username }) => {
      showNotification(`${username} left the game`);
    });

    socket.on("game_started", () => {
      setCardFlipped(false);
    });

    socket.on("role_assigned", ({ role }) => {
      setMyRole(role);
      setTimeout(() => setScreen(SCREENS.ROLE_REVEAL), 300);
    });

    socket.on("player_eliminated", ({ username }) => {
      showNotification(`${username} has been eliminated!`);
    });

    socket.on("you_were_eliminated", () => {
      showNotification("You have been eliminated! Keep your role secret.");
    });

    socket.on("accusation_result", ({ accuserName, targetName, correct }) => {
      setGameResult({ accuserName, targetName, correct });
      setScreen(SCREENS.GAME_OVER);
    });

    socket.on("game_restarted", ({ room }) => {
      setRoom({ ...room });
      setMyRole(null);
      setGameResult(null);
      setCardFlipped(false);
      setScreen(SCREENS.LOBBY);
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setTimeout(() => setError(""), 4000);
    });

    return () => socket.disconnect();
  }, [showNotification]);

  const handleSetUsername = () => {
    const name = usernameInput.trim();
    if (!name || name.length < 2) return setError("Name must be at least 2 characters");
    if (name.length > 16) return setError("Name must be under 16 characters");
    setUsername(name);
    setError("");
    setScreen(SCREENS.GAME_SELECT);
  };

  const handleCreateRoom = () => {
    socket.emit("create_room", { username, game: selectedGame.id });
  };

  const handleJoinRoom = () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 4) return setError("Enter a valid 4-letter code");
    setError("");
    socket.emit("join_room", { username, code });
  };

  const handleStartGame = () => {
    if (room?.players?.length < 3) return setError("Need at least 3 players to start");
    socket.emit("start_game");
  };

  const handleAccuse = (targetId) => {
    socket.emit("accuse_player", { targetId });
  };

  const handleRestart = () => {
    socket.emit("restart_game");
  };

  const handleBackToLobby = () => {
    setMyRole(null);
    setScreen(SCREENS.LOBBY);
  };

  const currentTheme = selectedGame?.theme || "default";

  return (
    <div className={`app theme-${currentTheme}`}>
      {notification && <div className="notification">{notification}</div>}
      {error && <div className="error-toast">{error}</div>}

      {screen === SCREENS.HOME && <HomeScreen onNext={() => setScreen(SCREENS.USERNAME)} />}

      {screen === SCREENS.USERNAME && (
        <UsernameScreen
          value={usernameInput}
          onChange={setUsernameInput}
          onSubmit={handleSetUsername}
          error={error}
        />
      )}

      {screen === SCREENS.GAME_SELECT && (
        <GameSelectScreen
          games={GAMES}
          selectedGame={selectedGame}
          onSelect={setSelectedGame}
          isJoining={isJoining}
          setIsJoining={setIsJoining}
          joinCode={joinCodeInput}
          setJoinCode={setJoinCodeInput}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          error={error}
          username={username}
        />
      )}

      {screen === SCREENS.LOBBY && (
        <LobbyScreen
          room={room}
          roomCode={roomCode}
          isHost={isHost}
          username={username}
          game={selectedGame || GAMES.find(g => g.id === room?.game)}
          onStart={handleStartGame}
          error={error}
        />
      )}

      {screen === SCREENS.ROLE_REVEAL && (
        <RoleRevealScreen
          role={myRole}
          game={selectedGame || GAMES.find(g => g.id === room?.game)}
          room={room}
          username={username}
          cardFlipped={cardFlipped}
          setCardFlipped={setCardFlipped}
          onAccuse={handleAccuse}
          onBack={handleBackToLobby}
        />
      )}

      {screen === SCREENS.GAME_OVER && (
        <GameOverScreen
          result={gameResult}
          myRole={myRole}
          isHost={isHost}
          onRestart={handleRestart}
          onHome={() => {
            setScreen(SCREENS.HOME);
            setSelectedGame(null);
            setMyRole(null);
            setRoom(null);
            setRoomCode("");
          }}
        />
      )}
    </div>
  );
}

function HomeScreen({ onNext }) {
  return (
    <div className="screen home-screen">
      <div className="home-bg">
        <div className="home-grid" />
      </div>
      <div className="home-content">
        <div className="home-logo">
          <div className="logo-key">
            <span>Alt</span>
            <span>F4</span>
          </div>
          <div className="logo-text">
            <h1>ALT F4</h1>
            <p>GAMES</p>
          </div>
        </div>
        <div className="home-tagline">
          <p>Party games that end friendships.</p>
          <p className="home-sub">5 to 15 players · Any device · Free</p>
        </div>
        <button className="btn-primary" onClick={onNext}>
          <span>Play now</span>
          <i className="icon-arrow" />
        </button>
        <div className="home-games-list">
          {["Killer", "Werewolf", "Spyfall", "Resistance", "Coup"].map((g, i) => (
            <span key={g} className={`home-game-pill ${i > 0 ? "locked" : ""}`}>{g}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsernameScreen({ value, onChange, onSubmit, error }) {
  return (
    <div className="screen center-screen">
      <div className="screen-card">
        <div className="screen-icon">👤</div>
        <h2>What's your name?</h2>
        <p className="screen-sub">This is how other players will see you</p>
        <input
          className="text-input"
          placeholder="Enter your name..."
          value={value}
          maxLength={16}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSubmit()}
          autoFocus
        />
        {error && <p className="inline-error">{error}</p>}
        <button className="btn-primary" onClick={onSubmit}>Continue</button>
      </div>
    </div>
  );
}

function GameSelectScreen({ games, selectedGame, onSelect, isJoining, setIsJoining, joinCode, setJoinCode, onCreateRoom, onJoinRoom, error, username }) {
  return (
    <div className="screen game-select-screen">
      <div className="screen-header">
        <h2>Hey {username}!</h2>
        <p>Choose a game to play</p>
      </div>

      <div className="games-list">
        {games.map(game => (
          <div
            key={game.id}
            className={`game-row ${selectedGame?.id === game.id ? "selected" : ""} ${!game.available ? "locked" : ""}`}
            onClick={() => game.available && onSelect(game)}
            style={{ "--accent": game.accent }}
          >
            <div className="game-row-info">
              <div className="game-row-name">{game.name}</div>
              <div className="game-row-tagline">{game.tagline}</div>
            </div>
            <div className="game-row-right">
              {game.available ? (
                <div className={`game-row-check ${selectedGame?.id === game.id ? "checked" : ""}`} />
              ) : (
                <span className="soon-badge">Soon</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedGame && (
        <div className="game-actions">
          <div className="game-desc-box" style={{ "--accent": selectedGame.accent }}>
            <p>{selectedGame.description}</p>
            <span>{selectedGame.minPlayers}–{selectedGame.maxPlayers} players</span>
          </div>

          {!isJoining ? (
            <>
              <button className="btn-primary" onClick={onCreateRoom}>
                Create room
              </button>
              <button className="btn-secondary" onClick={() => setIsJoining(true)}>
                Join a room
              </button>
            </>
          ) : (
            <>
              <input
                className="text-input code-input"
                placeholder="Enter room code..."
                value={joinCode}
                maxLength={4}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && onJoinRoom()}
                autoFocus
              />
              {error && <p className="inline-error">{error}</p>}
              <button className="btn-primary" onClick={onJoinRoom}>Join room</button>
              <button className="btn-ghost" onClick={() => setIsJoining(false)}>Back</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LobbyScreen({ room, roomCode, isHost, username, game, onStart, error }) {
  const players = room?.players || [];

  return (
    <div className="screen lobby-screen">
      <div className="lobby-header" style={{ "--accent": game?.accent || "#e63946" }}>
        <div className="lobby-game-name">{game?.name || "Game"}</div>
        <div className="lobby-code-wrap">
          <span className="lobby-code-label">Room code</span>
          <span className="lobby-code">{roomCode}</span>
        </div>
      </div>

      <div className="lobby-body">
        <div className="lobby-status">
          {isHost ? "Waiting for players to join..." : "Waiting for host to start..."}
        </div>

        <div className="player-list">
          {players.map((p, i) => (
            <div key={p.id} className={`player-row ${p.username === username ? "me" : ""}`}>
              <div className="player-avatar" style={{ "--accent": game?.accent || "#e63946" }}>
                {p.username[0].toUpperCase()}
              </div>
              <span className="player-name">{p.username}{p.username === username ? " (you)" : ""}</span>
              {p.id === room?.host && <span className="host-badge">host</span>}
            </div>
          ))}
        </div>

        <div className="player-count">
          {players.length} / {game?.maxPlayers || 15} players
          {players.length < 3 && <span className="count-warn"> · need {3 - players.length} more</span>}
        </div>

        {error && <p className="inline-error">{error}</p>}

        {isHost && (
          <button
            className="btn-primary"
            onClick={onStart}
            disabled={players.length < 3}
          >
            Start game ({players.length} players)
          </button>
        )}
      </div>
    </div>
  );
}

function RoleArt({ role }) {
  if (role?.id === "killer") {
    return (
      <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="60" r="32" fill="#2a1a1a"/>
        <ellipse cx="80" cy="58" rx="22" ry="24" fill="#f5c5a3"/>
        <path d="M58 50 Q60 34 80 32 Q100 34 102 50 Q98 40 88 37 Q80 35 72 37 Q62 40 58 50Z" fill="#1a1a1a"/>
        <path d="M56 50 Q54 42 60 36 Q68 29 80 28 Q92 29 100 36 Q106 42 104 50" fill="none" stroke="#111" stroke-width="2"/>
        <ellipse cx="70" cy="58" rx="5" ry="4" fill="#fff"/>
        <ellipse cx="90" cy="58" rx="5" ry="4" fill="#fff"/>
        <ellipse cx="71" cy="59" rx="3" ry="3" fill="#1a1a1a"/>
        <ellipse cx="91" cy="59" rx="3" ry="3" fill="#1a1a1a"/>
        <ellipse cx="72" cy="58" rx="1" ry="1" fill="#fff"/>
        <ellipse cx="92" cy="58" rx="1" ry="1" fill="#fff"/>
        <path d="M66 54 Q70 51 74 54" fill="none" stroke="#1a1a1a" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M83 67 Q80 72 77 67" fill="none" stroke="#c8906a" stroke-width="1.5" stroke-linecap="round"/>
        <ellipse cx="65" cy="65" rx="4" ry="2.5" fill="#f0a88a" opacity="0.5"/>
        <ellipse cx="95" cy="65" rx="4" ry="2.5" fill="#f0a88a" opacity="0.5"/>
        <rect x="58" y="88" width="44" height="42" rx="10" fill="#1a0a0a"/>
        <rect x="66" y="98" width="12" height="28" rx="5" fill="#110808"/>
        <rect x="82" y="98" width="12" height="28" rx="5" fill="#110808"/>
        <rect x="66" y="120" width="9" height="10" rx="3" fill="#0a0505"/>
        <rect x="85" y="120" width="9" height="10" rx="3" fill="#0a0505"/>
        <rect x="46" y="94" width="13" height="30" rx="5" fill="#1a0a0a"/>
        <rect x="101" y="94" width="13" height="30" rx="5" fill="#1a0a0a"/>
        <circle cx="48" cy="122" r="6" fill="#f5c5a3"/>
        <circle cx="112" cy="122" r="6" fill="#f5c5a3"/>
        <rect x="104" y="76" width="4" height="20" rx="2" fill="#c0c0c0"/>
        <rect x="101" y="74" width="10" height="4" rx="2" fill="#a0a0a0"/>
        <polygon points="106,96 103,106 109,106" fill="#d0d0d0"/>
      </svg>
    );
  }

  if (role?.id === "police") {
    return (
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
        <path d="M66 55 Q70 52 74 55" fill="none" stroke="#0d2b40" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M76 68 Q80 73 84 68" fill="none" stroke="#c8906a" stroke-width="1.5" stroke-linecap="round"/>
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
  }

  const variantColors = {
    cheerful: { skin: "#fad7a0", body: "#27ae60", dark: "#1e8449", hair: "#c0392b", cheek: "#f4a77e" },
    mystic:   { skin: "#f5cba7", body: "#8e44ad", dark: "#6c3483", hair: "#4a235a", cheek: "#f0a88a" },
    noble:    { skin: "#fae5d3", body: "#b7950b", dark: "#9a7d0a", hair: "#1a1a1a", cheek: "#f0a88a" },
    rebel:    { skin: "#fad7a0", body: "#e67e22", dark: "#ca6f1e", hair: "#1a1a1a", cheek: "#f4a77e" },
    scholar:  { skin: "#faebd7", body: "#2471a3", dark: "#1a5276", hair: "#5d4037", cheek: "#f0a88a" },
  };
  const c = variantColors[role?.variant] || variantColors.cheerful;

  return (
    <svg viewBox="0 0 160 160" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="60" r="32" fill="#111"/>
      <ellipse cx="80" cy="58" rx="22" ry="24" fill={c.skin}/>
      <path d="M58 50 Q60 34 80 32 Q100 34 102 50 Q96 38 80 36 Q64 38 58 50Z" fill={c.hair}/>
      <ellipse cx="70" cy="58" rx="5" ry="4" fill="#fff"/>
      <ellipse cx="90" cy="58" rx="5" ry="4" fill="#fff"/>
      <ellipse cx="71" cy="59" rx="3" ry="3" fill="#2c3e50"/>
      <ellipse cx="91" cy="59" rx="3" ry="3" fill="#2c3e50"/>
      <ellipse cx="72" cy="58" rx="1" ry="1" fill="#fff"/>
      <ellipse cx="92" cy="58" rx="1" ry="1" fill="#fff"/>
      <path d="M75 68 Q80 74 85 68" fill="none" stroke="#c8906a" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="65" cy="66" rx="5" ry="3" fill={c.cheek} opacity="0.6"/>
      <ellipse cx="95" cy="66" rx="5" ry="3" fill={c.cheek} opacity="0.6"/>
      <rect x="58" y="88" width="44" height="42" rx="10" fill={c.body}/>
      <rect x="64" y="96" width="32" height="10" rx="0" fill={c.dark}/>
      <path d="M67 96 Q80 103 93 96" fill="#f0c040" opacity="0.6"/>
      <rect x="66" y="108" width="12" height="18" rx="5" fill={c.dark}/>
      <rect x="82" y="108" width="12" height="18" rx="5" fill={c.dark}/>
      <rect x="66" y="120" width="9" height="10" rx="3" fill={c.dark}/>
      <rect x="85" y="120" width="9" height="10" rx="3" fill={c.dark}/>
      <rect x="46" y="94" width="13" height="30" rx="5" fill={c.body}/>
      <rect x="101" y="94" width="13" height="30" rx="5" fill={c.body}/>
      <circle cx="48" cy="122" r="6" fill={c.skin}/>
      <circle cx="112" cy="122" r="6" fill={c.skin}/>
    </svg>
  );
}

function RoleRevealScreen({ role, game, room, username, cardFlipped, setCardFlipped, onAccuse, onBack }) {
  const [showAccuse, setShowAccuse] = useState(false);
  const isPolice = role?.id === "police";
  const players = room?.players || [];
  const others = players.filter(p => p.username !== username && !p.eliminated);

  return (
    <div className="screen role-screen">
      <div className="role-screen-bg" style={{ "--accent": role?.color || "#e63946" }} />
      <div className="role-screen-content">
        <div className="role-label">Your role — keep this secret!</div>

        <div
          className={`role-card ${cardFlipped ? "flipped" : ""}`}
          onClick={() => !cardFlipped && setCardFlipped(true)}
          style={{ "--accent": role?.color || "#e63946", "--accent2": role?.accent || "#e63946" }}
        >
          <div className="role-card-front">
            <div className="card-front-inner">
              <div className="card-mystery-icon">?</div>
              <p className="card-tap-hint">Tap to reveal your role</p>
            </div>
          </div>
          <div className="role-card-back">
            <div className="card-back-inner">
              <div className="card-corner card-corner-tl">{role?.letter || role?.name?.[0]}</div>
              <div className="card-corner card-corner-tr">{role?.suit || "♠"}</div>
              <div className="card-corner card-corner-br">{role?.letter || role?.name?.[0]}</div>
              <div className="card-corner card-corner-bl">{role?.suit || "♠"}</div>
              <div className="card-art-placeholder">
                <RoleArt role={role} />
              </div>
              <div className="card-divider" />
              <div className="card-role-name">{role?.name?.toUpperCase()}</div>
              <div className="card-role-desc">{role?.description}</div>
            </div>
          </div>
        </div>

        {cardFlipped && (
          <div className="role-actions">
            {isPolice && (
              <button className="btn-accent" style={{"--accent": role?.color}} onClick={() => setShowAccuse(!showAccuse)}>
                {showAccuse ? "Cancel accusation" : "Accuse a player"}
              </button>
            )}
            {showAccuse && (
              <div className="accuse-list">
                <p className="accuse-label">Who is the killer?</p>
                {others.map(p => (
                  <button key={p.id} className="btn-accuse" onClick={() => onAccuse(p.id)}>
                    Accuse {p.username}
                  </button>
                ))}
              </div>
            )}
            <button className="btn-ghost" onClick={onBack}>Back to lobby</button>
          </div>
        )}
      </div>
    </div>
  );
}

function GameOverScreen({ result, myRole, isHost, onRestart, onHome }) {
  const policeWon = result?.correct;

  return (
    <div className="screen game-over-screen">
      <div className={`game-over-banner ${policeWon ? "police-win" : "killer-win"}`}>
        <div className="game-over-icon">{policeWon ? "🕵️" : "🔪"}</div>
        <h2>{policeWon ? "Police wins!" : "Killer wins!"}</h2>
        <p>
          {policeWon
            ? `${result.accuserName} caught ${result.targetName} — the killer!`
            : `${result.accuserName} accused ${result.targetName}, but they were innocent!`}
        </p>
      </div>

      <div className="game-over-role">
        <p className="game-over-role-label">Your role was</p>
        <div className="game-over-role-name" style={{ color: myRole?.color }}>{myRole?.name}</div>
      </div>

      <div className="game-over-actions">
        {isHost && (
          <button className="btn-primary" onClick={onRestart}>Play again</button>
        )}
        <button className="btn-secondary" onClick={onHome}>Back to home</button>
      </div>
    </div>
  );
}
