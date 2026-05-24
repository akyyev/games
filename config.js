window.CHECKERS_CONFIG = {
  // Online mode needs a running WebSocket server.
  // Local testing: start `node server/index.js`, then use "ws://localhost:10000".
  // Production: deploy `server/` to a WebSocket-capable host and use its wss:// URL.
  // Free hosts can sleep; use an always-on plan if rooms should be available immediately.
  // WS_URL: "wss://checkers-app-hdoh.onrender.com",
  // WS_URL: "ws://localhost:10000",
  WS_URL: "ws://localhost:10003",
};
