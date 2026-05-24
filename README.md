# Russian Checkers

A browser-based Russian checkers game with local play, computer play, and online rooms.

## Features

- Russian draughts rules with forced captures, capture chains, flying kings, and crowning
- Game modes: Local two-player, Play vs computer, Online match
- Computer levels: Beginner, Club Player, Master, Grandmaster
- Online rooms with room codes, copy code, and shareable links
- Clear online states for unavailable server, expired rooms, full rooms, missing rooms, and disconnected opponents
- English, Russian, and Turkish translations
- Board themes: Classic wood, Tournament green, Midnight glass, Porcelain blue
- Turn indicator rail that follows the board theme and board orientation
- Move sounds, undo, board flip, move log, and animations
- Win and draw overlays with final score
- Draw handling for repeated positions, 1 king vs 1 king, and 2 kings vs 1 king after 10 full moves
- Saved local preferences for mode, side, level, language, style, board flip, and sounds
- Shared move rules between local play and the online server

## Run Locally

The frontend is static. Serve the project root so `shared/rules.js` loads correctly:

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/
```

## Online Server

Online mode uses the WebSocket server in `server/`.

```bash
cd server
npm install
npm start
```

For local online testing, set `config.js` to:

```js
WS_URL: "ws://localhost:10000"
```

For production, deploy `server/` to a WebSocket-capable host and set `config.js` to that URL, for example:

```js
WS_URL: "wss://your-checkers-server.onrender.com"
```

If the WebSocket server is down or sleeping, the game still works in local and computer modes. Online mode will show a server-unavailable message instead of silently failing.

The server also exposes `/health` for host health checks or uptime monitors:

```text
https://your-checkers-server.onrender.com/health
```

## Deploy

The frontend can be hosted on GitHub Pages.

On Render, the server settings are:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
```

Note: free hosting services may sleep when inactive. Use an always-on plan if online play needs to be available immediately. An uptime monitor can call `/health`, but check your hosting provider's rules before using one.

## Project Structure

```text
.
├── app.js
├── index.html
├── styles.css
├── config.js
├── i18n/
├── shared/
├── server/
└── README.md
```
