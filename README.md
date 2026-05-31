# ALT F4 Games

Party games that end friendships. A real-time multiplayer party game app built with React + Node.js + Socket.io.

## Games
- **Killer** ✅ (live)
- Werewolf (coming soon)
- Spyfall (coming soon)
- The Resistance (coming soon)
- Coup (coming soon)

---

## Project Structure

```
altf4games/
├── client/         ← React frontend (what players see)
│   ├── public/
│   └── src/
│       ├── App.js
│       └── App.css
└── server/         ← Node.js + Socket.io backend
    ├── server.js
    └── package.json
```

---

## Running Locally (for testing)

### Step 1 — Install Node.js
Download from https://nodejs.org (choose LTS version)

### Step 2 — Start the backend server
```bash
cd altf4games/server
npm install
npm start
```
Server runs on http://localhost:3001

### Step 3 — Start the frontend
Open a new terminal:
```bash
cd altf4games/client
npm install
npm start
```
App opens at http://localhost:3000

### Step 4 — Test with friends on same WiFi
Find your local IP address:
- Mac/Linux: run `ifconfig` in terminal, look for inet address
- Windows: run `ipconfig`, look for IPv4 address

Tell your friends to open: `http://YOUR_IP:3000`

---

## Deploying Online (FREE — for playing anywhere)

### Backend → Deploy to Render (free)
1. Create account at https://render.com
2. Click "New Web Service"
3. Connect your GitHub repo
4. Set root directory to `server`
5. Build command: `npm install`
6. Start command: `npm start`
7. Copy your Render URL (e.g. https://altf4games.onrender.com)

### Frontend → Deploy to Vercel (free)
1. Create account at https://vercel.com
2. Click "New Project"
3. Connect your GitHub repo
4. Set root directory to `client`
5. Add environment variable:
   - Name: `REACT_APP_SERVER_URL`
   - Value: your Render backend URL
6. Deploy!
7. Share your Vercel URL with friends

### Making it a PWA (installable on phones)
Once deployed on Vercel, players can:
- Open the site in Chrome on Android → tap "Add to Home Screen"
- Open in Safari on iPhone → tap Share → "Add to Home Screen"
It will look and feel like a real app!

---

## Adding Card Images Later
When you have your card illustrations ready, add them to:
`client/src/assets/cards/`

Then in App.js, update the `RoleRevealScreen` component:
Replace the `card-art-placeholder` div with:
```jsx
<img src={require(`../assets/cards/${role.id}.png`)} alt={role.name} />
```

---

## Tech Stack
- **Frontend**: React 18, CSS animations, Google Fonts
- **Backend**: Node.js, Express, Socket.io
- **Real-time**: WebSockets via Socket.io
- **Hosting**: Vercel (frontend) + Render (backend) — both free
- **PWA**: Installable on any phone via browser
