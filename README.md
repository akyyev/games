# Russian Checkers

A modern browser-based Russian checkers game with local two-player mode, computer play, difficulty levels, board themes, sounds, undo, animations, language support, and a game result overlay.

## Features

- Russian draughts rules
- 2-player local mode
- 1 vs computer mode
- Online room mode with a WebSocket server
- Player side selection
- Difficulty levels: Beginner, Club Player, Master, Grandmaster
- English, Russian, and Turkish language support
- Board style selector
- Move sounds with toggle
- Undo support
- Move, capture, and crowning animations
- Win overlay with final score

## Run Locally

This is a static app. You can run it with any local static server:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/
```

## Deploy To GitHub Pages

1. Push this project to a GitHub repository.
2. Open the repository settings.
3. Go to `Pages`.
4. Choose `Deploy from a branch`.
5. Select the `main` branch and `/root` folder.
6. Save.

GitHub Pages will publish the app at a URL like:

```text
https://your-username.github.io/your-repo-name/
```

## Online Play Server

The online mode uses a small WebSocket server in `server/`. Deploy the frontend to GitHub Pages and deploy `server/` to Render as a Web Service.

For local server testing:

```bash
cd server
npm install
npm start
```

The local WebSocket URL is already set in [config.js](./config.js):

```js
WS_URL: "ws://localhost:10000"
```

After deploying to Render, update `config.js` to your Render WebSocket URL:

```js
WS_URL: "wss://your-checkers-server.onrender.com"
```

On Render, use:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
```

## Project Structure

```text
.
├── app.js
├── index.html
├── styles.css
├── i18n/
│   ├── en.js
│   ├── ru.js
│   └── tr.js
├── shared/
│   └── rules.js
├── server/
│   ├── index.js
│   └── package.json
└── README.md
```
