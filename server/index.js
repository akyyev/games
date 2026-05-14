const http = require("http");
const { WebSocketServer } = require("ws");
const rules = require("../shared/rules.js");

const PORT = process.env.PORT || 10000;
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
    rematchVotes: new Map(),
    players: new Map(),
    createdAt: Date.now(),
  };
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

function syncRoom(room) {
  for (const [ws, color] of room.players.entries()) {
    send(ws, {
      type: "state",
      room: serializeRoom(room),
      color,
    });
  }
}

function joinRoom(ws, room, preferredColor = null) {
  const taken = new Set(room.players.values());
  let color = preferredColor && !taken.has(preferredColor) ? preferredColor : null;
  if (!color) color = !taken.has(rules.WHITE) ? rules.WHITE : rules.BLACK;
  if (taken.has(color)) {
    send(ws, { type: "error", message: "Room is full." });
    return;
  }
  ws.roomId = room.id;
  room.players.set(ws, color);
  syncRoom(room);
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
    updateTwoKingsVsOneCounter(room);
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
  room.rematchVotes.clear();
}

function sendRematchStatus(room, voterColor, accepted) {
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

function updateTwoKingsVsOneCounter(room) {
  if (isTwoKingsVsOneKingEndgame(room.board)) {
    room.twoKingsVsOneHalfMoves += 1;
  } else {
    room.twoKingsVsOneHalfMoves = 0;
  }

  if (!rules.getWinner(room.board, room.turn, room.chainFrom) && room.twoKingsVsOneHalfMoves >= 20) {
    room.draw = true;
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
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.players.delete(ws);
    if (!room.players.size) {
      rooms.delete(room.id);
    } else {
      syncRoom(room);
      broadcast(room, { type: "notice", message: "Opponent disconnected." });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Russian Checkers online server listening on ${PORT}`);
});
