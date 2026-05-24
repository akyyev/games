const http = require("http");
const { WebSocketServer } = require("ws");
const rules = require("../shared/rules.js");

const PORT = process.env.PORT || 10000;
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 60 * 60 * 1000);
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 5 * 60 * 1000);
const rooms = new Map();

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  do {
    id = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(id));
  return id;
}

function coord({ row, col }) {
  return `${String.fromCharCode(97 + col)}${rules.SIZE - row}`;
}

function logMove(color, wasKing, move, continues) {
  return {
    color,
    wasKing,
    from: coord(move.from),
    to: coord(move.to),
    mark: move.captures.length ? "x" : "-",
    continues,
  };
}

function createRoom() {
  const room = {
    id: createRoomId(),
    board: rules.createInitialBoard(),
    turn: rules.WHITE,
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
  room.positionHistory = [positionKey(room.board, room.turn, room.chainFrom)];
  rooms.set(room.id, room);
  return room;
}

function serializeRoom(room) {
  const players = [...room.players.values()];
  return {
    id: room.id,
    board: room.board,
    turn: room.turn,
    chainFrom: room.chainFrom,
    lastMove: room.lastMove,
    log: room.log,
    winner: room.draw ? null : rules.getWinner(room.board, room.turn, room.chainFrom),
    draw: room.draw,
    twoKingsVsOneHalfMoves: room.twoKingsVsOneHalfMoves,
    rematchVotes: Object.fromEntries(room.rematchVotes),
    players,
  };
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
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

function joinRoom(ws, room, preferredColor = null) {
  const isAlreadyInRoom = room.players.has(ws);
  const players = [...room.players.entries()];
  const taken = new Set(players.map(([, color]) => color));
  const requestedColor = normalizeColor(preferredColor);
  if (preferredColor && !requestedColor) {
    send(ws, { type: "error", message: "Invalid color." });
    return;
  }

  if (players.length >= 2 && !isAlreadyInRoom) {
    send(ws, { type: "error", message: "Room is full." });
    return;
  }

  let color = requestedColor || null;
  let colorToReassign = null;
  if (requestedColor && taken.has(requestedColor) && players.length === 1 && !isAlreadyInRoom) {
    colorToReassign = rules.opponent(requestedColor);
  } else if (!color) {
    color = !taken.has(rules.WHITE) ? rules.WHITE : rules.BLACK;
  } else if (taken.has(color) && !isAlreadyInRoom) {
    send(ws, { type: "error", message: "Color is already taken." });
    return;
  }

  if (!isAlreadyInRoom) leaveCurrentRoom(ws);
  if (colorToReassign) room.players.set(players[0][0], colorToReassign);
  ws.roomId = room.id;
  room.players.set(ws, color);
  syncRoom(room);
}

function normalizeColor(color) {
  return color === rules.WHITE || color === rules.BLACK ? color : null;
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
    broadcast(room, { type: "notice", message: "Opponent disconnected." });
  }
}

function handleMove(ws, payload) {
  const room = rooms.get(ws.roomId);
  if (!room) return send(ws, { type: "error", message: "Room not found." });
  if (room.draw || rules.getWinner(room.board, room.turn, room.chainFrom)) {
    return send(ws, { type: "error", message: "Game is over." });
  }

  const color = room.players.get(ws);
  if (!color || color !== room.turn) return send(ws, { type: "error", message: "Not your turn." });

  const legalMove = rules
    .getAllMoves(room.board, room.turn, room.chainFrom)
    .find((move) => rules.sameMove(move, payload.move));

  if (!legalMove) return send(ws, { type: "error", message: "Illegal move." });

  const piece = room.board[legalMove.from.row][legalMove.from.col];
  room.rematchVotes.clear();
  room.board = rules.applyMove(room.board, legalMove);
  room.lastMove = [legalMove.from, legalMove.to];
  const continuedCaptures = legalMove.captures.length
    ? rules.getCaptureMovesForPiece(room.board, legalMove.to.row, legalMove.to.col)
    : [];
  room.log.unshift(logMove(piece.color, piece.king, legalMove, continuedCaptures.length > 0));

  if (continuedCaptures.length) {
    room.chainFrom = { ...legalMove.to };
  } else {
    room.chainFrom = null;
    room.turn = rules.opponent(room.turn);
    recordCurrentPosition(room);
  }

  syncRoom(room);
}

function isGameOver(room) {
  return room.draw || rules.getWinner(room.board, room.turn, room.chainFrom);
}

function resetRoomForRematch(room) {
  room.board = rules.createInitialBoard();
  room.turn = rules.WHITE;
  room.chainFrom = null;
  room.lastMove = [];
  room.log = [];
  room.draw = false;
  room.twoKingsVsOneHalfMoves = 0;
  room.positionHistory = [positionKey(room.board, room.turn, room.chainFrom)];
  room.rematchVotes.clear();
}

function positionKey(board = rules.createInitialBoard(), turn = rules.WHITE, chainFrom = null) {
  const pieces = [];
  for (let row = 0; row < rules.SIZE; row += 1) {
    for (let col = 0; col < rules.SIZE; col += 1) {
      const piece = board[row][col];
      if (piece) pieces.push(`${row}${col}${piece.color[0]}${piece.king ? "K" : "M"}`);
    }
  }
  const chain = chainFrom ? `${chainFrom.row}${chainFrom.col}` : "-";
  return `${turn}|${chain}|${pieces.join(",")}`;
}

function countPositionOccurrences(room, key) {
  return room.positionHistory.filter((position) => position === key).length;
}

function recordCurrentPosition(room) {
  const key = positionKey(room.board, room.turn, room.chainFrom);
  room.positionHistory.push(key);
  updateTwoKingsVsOneCounter(room);
  if (
    countPositionOccurrences(room, key) >= 3 ||
    hasInsufficientWinningMaterial(room.board, room.turn, room.chainFrom) ||
    room.twoKingsVsOneHalfMoves >= 20
  ) {
    room.draw = true;
  }
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
  if (!room) return send(ws, { type: "error", message: "Room not found." });
  if (!isGameOver(room)) return send(ws, { type: "error", message: "Game is not over." });

  const color = room.players.get(ws);
  if (!color) return send(ws, { type: "error", message: "Player not found." });
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

function getPieceCounts(board) {
  const counts = { [rules.WHITE]: 0, [rules.BLACK]: 0 };
  for (const row of board) {
    for (const piece of row) {
      if (piece) counts[piece.color] += 1;
    }
  }
  return counts;
}

function getKingCounts(board) {
  const counts = { [rules.WHITE]: 0, [rules.BLACK]: 0 };
  for (const row of board) {
    for (const piece of row) {
      if (piece?.king) counts[piece.color] += 1;
    }
  }
  return counts;
}

function isTwoKingsVsOneKingEndgame(board) {
  const pieceCounts = getPieceCounts(board);
  if (pieceCounts[rules.WHITE] + pieceCounts[rules.BLACK] !== 3) return false;
  const kingCounts = getKingCounts(board);
  return (
    pieceCounts[rules.WHITE] === kingCounts[rules.WHITE] &&
    pieceCounts[rules.BLACK] === kingCounts[rules.BLACK] &&
    ((kingCounts[rules.WHITE] === 2 && kingCounts[rules.BLACK] === 1) ||
      (kingCounts[rules.WHITE] === 1 && kingCounts[rules.BLACK] === 2))
  );
}

function hasInsufficientWinningMaterial(board, turn, chainFrom) {
  const pieces = board.flat().filter(Boolean);
  if (pieces.length !== 2 || pieces.some((piece) => !piece.king)) return false;
  const colors = new Set(pieces.map((piece) => piece.color));
  return colors.size === 2 && !rules.getAllMoves(board, turn, chainFrom).some((move) => move.captures.length);
}

function updateTwoKingsVsOneCounter(room) {
  if (isTwoKingsVsOneKingEndgame(room.board)) {
    room.twoKingsVsOneHalfMoves += 1;
  } else {
    room.twoKingsVsOneHalfMoves = 0;
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Russian Checkers online server is running.\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Invalid message." });
    }

    if (message.type === "create") {
      const room = createRoom();
      joinRoom(ws, room, message.preferredColor);
      return;
    }

    if (message.type === "join") {
      const room = rooms.get(String(message.roomId || "").trim().toUpperCase());
      if (!room) return send(ws, { type: "error", message: "Room not found." });
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
    broadcast(room, { type: "notice", message: "Room expired.", closeReason: true });
    for (const ws of room.players.keys()) {
      ws.roomId = null;
      ws.close();
    }
    rooms.delete(roomId);
  }
}

setInterval(cleanupIdleRooms, ROOM_CLEANUP_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`Russian Checkers online server listening on ${PORT}`);
});
