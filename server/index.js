const http = require("http");
const { WebSocketServer } = require("ws");

global.window = global;
require("../vendor/chess.js/chess.global.js");

const checkersRules = require("../games/checkers/rules.js");
const { createCheckersEngine } = require("../games/checkers/engine.js");
const chessRules = require("../games/chess/rules.js");
const createChessEngine = require("../games/chess/engine.js");

const games = {
  checkers: {
    id: "checkers",
    rules: checkersRules,
    engine: createCheckersEngine(checkersRules),
  },
  chess: {
    id: "chess",
    rules: chessRules,
    engine: createChessEngine(chessRules),
  },
};

const DEFAULT_GAME_ID = "checkers";
const PORT = process.env.PORT || 10000;
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 60 * 60 * 1000);
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 5 * 60 * 1000);
const rooms = new Map();

function getGame(gameId = DEFAULT_GAME_ID) {
  return games[gameId] || games[DEFAULT_GAME_ID];
}

function normalizeGameId(gameId) {
  return games[gameId]?.id || DEFAULT_GAME_ID;
}

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  do {
    id = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(id));
  return id;
}

function coord(rules, { row, col }) {
  return `${String.fromCharCode(97 + col)}${rules.SIZE - row}`;
}

function logMove(room, color, wasKing, move, continues) {
  return {
    color,
    wasKing,
    notation: move.san,
    from: coord(room.game.rules, move.from),
    to: coord(room.game.rules, move.to),
    mark: move.captures.length ? "x" : "-",
    continues,
  };
}

function createRoom(gameId = DEFAULT_GAME_ID) {
  const game = getGame(normalizeGameId(gameId));
  const room = {
    id: createRoomId(),
    gameId: game.id,
    game,
    board: game.rules.createInitialBoard(),
    turn: game.rules.WHITE,
    chainFrom: null,
    lastMove: [],
    log: [],
    draw: false,
    twoKingsVsOneHalfMoves: 0,
    positionHistory: [],
    rematchVotes: new Map(),
    players: new Map(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  room.positionHistory = [game.engine.positionKey(room.board, room.turn, room.chainFrom)];
  rooms.set(room.id, room);
  return room;
}

function serializeRoom(room) {
  const players = [...room.players.values()];
  return {
    id: room.id,
    gameId: room.gameId,
    board: room.board,
    fen: room.board._fen || null,
    turn: room.turn,
    chainFrom: room.chainFrom,
    lastMove: room.lastMove,
    log: room.log,
    winner: room.game.engine.getWinner(room.board, room.turn, room.chainFrom, room.draw),
    draw: room.draw,
    twoKingsVsOneHalfMoves: room.twoKingsVsOneHalfMoves,
    rematchVotes: Object.fromEntries(room.rematchVotes),
    players,
  };
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function sendError(ws, code, message) {
  send(ws, { type: "error", code, message });
}

function sendNotice(ws, code, message, extra = {}) {
  send(ws, { type: "notice", code, message, ...extra });
}

function broadcast(room, message) {
  for (const ws of room.players.keys()) {
    send(ws, message);
  }
}

function touchRoom(room) {
  room.updatedAt = Date.now();
}

function syncRoom(room) {
  touchRoom(room);
  for (const [ws, color] of room.players.entries()) {
    send(ws, {
      type: "state",
      room: serializeRoom(room),
      color,
    });
  }
}

function normalizeColor(room, color) {
  return color === room.game.rules.WHITE || color === room.game.rules.BLACK ? color : null;
}

function joinRoom(ws, room, preferredColor = null) {
  const rules = room.game.rules;
  const isAlreadyInRoom = room.players.has(ws);
  const players = [...room.players.entries()];
  const taken = new Set(players.map(([, color]) => color));
  const requestedColor = normalizeColor(room, preferredColor);
  if (preferredColor && !requestedColor) {
    sendError(ws, "invalid_color", "Invalid color.");
    return;
  }

  if (players.length >= 2 && !isAlreadyInRoom) {
    sendError(ws, "room_full", "Room is full.");
    return;
  }

  let color = requestedColor || null;
  let colorToReassign = null;
  if (requestedColor && taken.has(requestedColor) && players.length === 1 && !isAlreadyInRoom) {
    colorToReassign = rules.opponent(requestedColor);
  } else if (!color) {
    color = !taken.has(rules.WHITE) ? rules.WHITE : rules.BLACK;
  } else if (taken.has(color) && !isAlreadyInRoom) {
    sendError(ws, "color_taken", "Color is already taken.");
    return;
  }

  if (!isAlreadyInRoom) leaveCurrentRoom(ws);
  if (colorToReassign) room.players.set(players[0][0], colorToReassign);
  ws.roomId = room.id;
  room.players.set(ws, color);
  syncRoom(room);
}

function leaveCurrentRoom(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) return;
  room.players.delete(ws);
  ws.roomId = null;
  if (!room.players.size) {
    rooms.delete(room.id);
  } else {
    syncRoom(room);
    for (const playerWs of room.players.keys()) {
      sendNotice(playerWs, "opponent_disconnected", "Opponent disconnected.");
    }
  }
}

function handleMove(ws, payload) {
  const room = rooms.get(ws.roomId);
  if (!room) return sendError(ws, "room_not_found", "Room not found.");
  const { rules, engine } = room.game;
  if (room.draw || engine.getWinner(room.board, room.turn, room.chainFrom, room.draw)) {
    return sendError(ws, "game_over", "Game is over.");
  }

  const color = room.players.get(ws);
  if (!color || color !== room.turn) return sendError(ws, "not_your_turn", "Not your turn.");

  const legalMove = rules
    .getAllMoves(room.board, room.turn, room.chainFrom)
    .find((move) => rules.sameMove(move, payload.move));

  if (!legalMove) return sendError(ws, "illegal_move", "Illegal move.");

  const piece = room.board[legalMove.from.row][legalMove.from.col];
  room.rematchVotes.clear();
  room.board = rules.applyMove(room.board, legalMove);
  room.lastMove = [legalMove.from, legalMove.to];
  const continuedCaptures = legalMove.captures.length
    ? rules.getCaptureMovesForPiece(room.board, legalMove.to.row, legalMove.to.col)
    : [];
  room.log.unshift(logMove(room, piece.color, piece.king, legalMove, continuedCaptures.length > 0));

  if (continuedCaptures.length) {
    room.chainFrom = { ...legalMove.to };
  } else {
    room.chainFrom = null;
    room.turn = rules.opponent(room.turn);
    engine.recordCurrentPosition(room);
  }

  syncRoom(room);
}

function isGameOver(room) {
  return room.draw || room.game.engine.getWinner(room.board, room.turn, room.chainFrom, room.draw);
}

function resetRoomForRematch(room) {
  const { rules, engine } = room.game;
  room.board = rules.createInitialBoard();
  room.turn = rules.WHITE;
  room.chainFrom = null;
  room.lastMove = [];
  room.log = [];
  room.draw = false;
  room.twoKingsVsOneHalfMoves = 0;
  room.positionHistory = [engine.positionKey(room.board, room.turn, room.chainFrom)];
  room.rematchVotes.clear();
}

function sendRematchStatus(room, voterColor, accepted) {
  touchRoom(room);
  for (const [playerWs, playerColor] of room.players.entries()) {
    send(playerWs, {
      type: "rematch",
      status: accepted
        ? playerColor === voterColor
          ? "waiting"
          : "opponentAccepted"
        : playerColor === voterColor
          ? "declinedByYou"
          : "declinedByOpponent",
    });
  }
}

function handleRematch(ws, payload) {
  const room = rooms.get(ws.roomId);
  if (!room) return sendError(ws, "room_not_found", "Room not found.");
  if (!isGameOver(room)) return sendError(ws, "game_not_over", "Game is not over.");

  const color = room.players.get(ws);
  if (!color) return sendError(ws, "player_not_found", "Player not found.");
  if ([...room.rematchVotes.values()].includes("no")) {
    touchRoom(room);
    return send(ws, {
      type: "rematch",
      status: room.rematchVotes.get(color) === "no" ? "declinedByYou" : "declinedByOpponent",
    });
  }

  const accepted = payload.accept !== false;
  room.rematchVotes.set(color, accepted ? "yes" : "no");

  if (!accepted) {
    sendRematchStatus(room, color, accepted);
    return;
  }

  const colors = [...room.players.values()];
  const bothPlayersAccepted = colors.length === 2 && colors.every((playerColor) => room.rematchVotes.get(playerColor) === "yes");
  if (bothPlayersAccepted) {
    resetRoomForRematch(room);
    broadcast(room, { type: "rematch", status: "started" });
    syncRoom(room);
    return;
  }

  sendRematchStatus(room, color, accepted);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, games: Object.keys(games) }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Board games online server is running.\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return sendError(ws, "invalid_message", "Invalid message.");
    }

    if (message.type === "create") {
      const room = createRoom(message.gameId);
      joinRoom(ws, room, message.preferredColor);
      return;
    }

    if (message.type === "join") {
      const room = rooms.get(String(message.roomId || "").trim().toUpperCase());
      if (!room) return sendError(ws, "room_not_found", "Room not found.");
      joinRoom(ws, room, message.preferredColor);
      return;
    }

    if (message.type === "move") {
      handleMove(ws, message);
      return;
    }

    if (message.type === "rematch") {
      handleRematch(ws, message);
    }
  });

  ws.on("close", () => {
    leaveCurrentRoom(ws);
  });
});

function cleanupIdleRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.size > 0 && now - room.updatedAt < ROOM_TTL_MS) continue;
    for (const ws of room.players.keys()) {
      sendNotice(ws, "room_expired", "Room expired.", { closeReason: true });
    }
    for (const ws of room.players.keys()) {
      ws.roomId = null;
      ws.close();
    }
    rooms.delete(roomId);
  }
}

setInterval(cleanupIdleRooms, ROOM_CLEANUP_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`Board games online server listening on ${PORT}`);
});
