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

function RoleRevealScreen({ role, game, room, username, cardFlipped, setCardFlipped, onAccuse, onBack }) {
  const [showAccuse, setShowAccuse] = useState(false);
  const isPolice = role?.id === "police";
  const players = room?.players || [];
  const others = players.filter(p => p.username !== username && !p.eliminated);

  return (
    <div className="screen role-screen">
      <div className="role-screen-bg" style={{ "--accent": role?.color || "#e63946" }} />

      <div className="role-screen-content">
        <div className="role-label">Your role</div>

        <div
          className={`role-card ${cardFlipped ? "flipped" : ""}`}
          onClick={() => !cardFlipped && setCardFlipped(true)}
          style={{ "--accent": role?.color || "#e63946" }}
        >
          <div className="role-card-front">
            <div className="card-front-inner">
              <div className="card-mystery-icon">?</div>
              <p className="card-tap-hint">Tap to reveal your role</p>
            </div>
          </div>
          <div className="role-card-back">
            <div className="card-back-inner">
              <div className="card-corner card-corner-tl">{role?.name?.[0]}</div>
              <div className="card-corner card-corner-br">{role?.name?.[0]}</div>
              <div className="card-art-placeholder">
                <div className="card-art-icon">
                  {role?.id === "killer" ? "🔪" : role?.id === "police" ? "🕵️" : "👤"}
                </div>
                <p className="card-art-hint">Art coming soon</p>
              </div>
              <div className="card-divider" />
              <div className="card-role-name">{role?.name}</div>
              <div className="card-role-desc">{role?.description}</div>
            </div>
          </div>
        </div>

        {cardFlipped && (
          <div className="role-actions">
            {isPolice && (
              <button className="btn-accent" onClick={() => setShowAccuse(!showAccuse)}>
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
