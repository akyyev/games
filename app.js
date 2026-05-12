const SIZE = 8;
const WHITE = "white";
const BLACK = "black";
const directions = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const translations = window.I18N || {};

const state = {
  board: [],
  turn: WHITE,
  mode: "computer",
  level: "medium",
  playerColor: WHITE,
  language: "en",
  selected: null,
  legalMoves: [],
  chainFrom: null,
  lastMove: [],
  flipped: false,
  boardStyle: "classic",
  soundEnabled: true,
  busy: false,
  history: [],
  animation: null,
  log: [],
};

let audioContext = null;
let computerTimer = null;
let animationTimer = null;

const boardEl = document.querySelector("#board");
const statusText = document.querySelector("#statusText");
const hintText = document.querySelector("#hintText");
const turnPill = document.querySelector("#turnPill");
const whiteCount = document.querySelector("#whiteCount");
const blackCount = document.querySelector("#blackCount");
const moveLog = document.querySelector("#moveLog");
const languageSelect = document.querySelector("#languageSelect");
const modeSelect = document.querySelector("#modeSelect");
const sideControl = document.querySelector("#sideControl");
const sideSelect = document.querySelector("#sideSelect");
const levelSelect = document.querySelector("#levelSelect");
const styleSelect = document.querySelector("#styleSelect");
const soundToggle = document.querySelector("#soundToggle");
const undoBtn = document.querySelector("#undoBtn");
const resultOverlay = document.querySelector("#resultOverlay");
const resultTitle = document.querySelector("#resultTitle");
const resultScore = document.querySelector("#resultScore");
const playAgainBtn = document.querySelector("#playAgainBtn");

function t(key, params = {}) {
  const dictionary = translations[state.language] || translations.en;
  const template = dictionary[key] || translations.en[key] || key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    template,
  );
}

function colorName(color) {
  return t(color);
}

function applyTranslations() {
  const dictionary = translations[state.language] || translations.en;
  document.documentElement.lang = state.language;
  document.title = dictionary.pageTitle;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function createInitialBoard() {
  const board = emptyBoard();
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (isDark(row, col)) board[row][col] = { color: BLACK, king: false };
    }
  }
  for (let row = 5; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (isDark(row, col)) board[row][col] = { color: WHITE, king: false };
    }
  }
  return board;
}

function resetGame() {
  if (computerTimer) window.clearTimeout(computerTimer);
  computerTimer = null;
  if (animationTimer) window.clearTimeout(animationTimer);
  animationTimer = null;
  state.board = createInitialBoard();
  state.turn = WHITE;
  state.selected = null;
  state.legalMoves = [];
  state.chainFrom = null;
  state.lastMove = [];
  state.busy = false;
  state.history = [];
  state.animation = null;
  state.log = [];
  render();
  if (isComputerTurn()) scheduleComputerMove();
}

function isDark(row, col) {
  return (row + col) % 2 === 1;
}

function inside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function opponent(color) {
  return color === WHITE ? BLACK : WHITE;
}

function computerColor() {
  return opponent(state.playerColor);
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function clonePoint(point) {
  return point ? { ...point } : null;
}

function cloneLog(log) {
  return log.map((entry) => ({ ...entry }));
}

function createSnapshot(source = "player") {
  return {
    source,
    board: cloneBoard(state.board),
    turn: state.turn,
    selected: clonePoint(state.selected),
    legalMoves: state.legalMoves.map(cloneMove),
    chainFrom: clonePoint(state.chainFrom),
    lastMove: state.lastMove.map(clonePoint),
    log: cloneLog(state.log),
  };
}

function restoreSnapshot(snapshot) {
  state.board = cloneBoard(snapshot.board);
  state.turn = snapshot.turn;
  state.selected = clonePoint(snapshot.selected);
  state.legalMoves = snapshot.legalMoves.map(cloneMove);
  state.chainFrom = clonePoint(snapshot.chainFrom);
  state.lastMove = snapshot.lastMove.map(clonePoint);
  state.log = cloneLog(snapshot.log);
  state.animation = null;
}

function cloneMove(move) {
  return {
    from: { ...move.from },
    to: { ...move.to },
    captures: move.captures.map((capture) => ({ ...capture })),
  };
}

function coord({ row, col }) {
  return `${String.fromCharCode(97 + col)}${SIZE - row}`;
}

function sameSquare(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}

function getSimpleMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const moves = [];

  if (piece.king) {
    for (const [dr, dc] of directions) {
      let r = row + dr;
      let c = col + dc;
      while (inside(r, c) && !board[r][c]) {
        moves.push({ from: { row, col }, to: { row: r, col: c }, captures: [] });
        r += dr;
        c += dc;
      }
    }
    return moves;
  }

  const forward = piece.color === WHITE ? -1 : 1;
  for (const dc of [-1, 1]) {
    const r = row + forward;
    const c = col + dc;
    if (inside(r, c) && !board[r][c]) {
      moves.push({ from: { row, col }, to: { row: r, col: c }, captures: [] });
    }
  }
  return moves;
}

function getCaptureMovesForPiece(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  return piece.king
    ? getKingCaptures(board, row, col, piece.color)
    : getManCaptures(board, row, col, piece.color);
}

function getManCaptures(board, row, col, color) {
  const moves = [];
  for (const [dr, dc] of directions) {
    const midRow = row + dr;
    const midCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;
    if (!inside(landRow, landCol) || !inside(midRow, midCol)) continue;
    const target = board[midRow][midCol];
    if (target?.color === opponent(color) && !board[landRow][landCol]) {
      moves.push({
        from: { row, col },
        to: { row: landRow, col: landCol },
        captures: [{ row: midRow, col: midCol }],
      });
    }
  }
  return moves;
}

function getKingCaptures(board, row, col, color) {
  const moves = [];
  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;
    let target = null;
    while (inside(r, c)) {
      const piece = board[r][c];
      if (piece) {
        if (piece.color === color || target) break;
        target = { row: r, col: c };
      } else if (target) {
        moves.push({
          from: { row, col },
          to: { row: r, col: c },
          captures: [target],
        });
      }
      r += dr;
      c += dc;
    }
  }
  return moves;
}

function getAllMoves(board, color, chainFrom = null) {
  if (chainFrom) return getCaptureMovesForPiece(board, chainFrom.row, chainFrom.col);

  const captures = [];
  const quiet = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col]?.color !== color) continue;
      captures.push(...getCaptureMovesForPiece(board, row, col));
      quiet.push(...getSimpleMoves(board, row, col));
    }
  }
  return captures.length ? captures : quiet;
}

function applyMove(board, move) {
  const next = cloneBoard(board);
  const piece = next[move.from.row][move.from.col];
  next[move.from.row][move.from.col] = null;
  for (const captured of move.captures) {
    next[captured.row][captured.col] = null;
  }
  const crownRow = piece.color === WHITE ? 0 : SIZE - 1;
  next[move.to.row][move.to.col] = {
    ...piece,
    king: piece.king || move.to.row === crownRow,
  };
  return next;
}

function canPromote(piece, move) {
  const crownRow = piece.color === WHITE ? 0 : SIZE - 1;
  return !piece.king && move.to.row === crownRow;
}

function getCapturedPieces(move) {
  return move.captures.map((capture) => ({
    ...capture,
    piece: { ...state.board[capture.row][capture.col] },
  }));
}

function makeMove(move, source = "player") {
  state.history.push(createSnapshot(source));
  const piece = state.board[move.from.row][move.from.col];
  const promotes = canPromote(piece, move);
  const capturedPieces = getCapturedPieces(move);
  state.animation = {
    from: { ...move.from },
    to: { ...move.to },
    captures: capturedPieces,
    promote: promotes,
  };
  state.board = applyMove(state.board, move);
  state.lastMove = [move.from, move.to];
  state.selected = null;
  state.legalMoves = [];

  const continuedCaptures = move.captures.length
    ? getCaptureMovesForPiece(state.board, move.to.row, move.to.col)
    : [];

  logMove(piece.color, piece.king, move, continuedCaptures.length > 0);
  playMoveSound({
    capture: move.captures.length > 0,
    promote: promotes,
    win: Boolean(getWinner()),
  });

  if (continuedCaptures.length) {
    state.chainFrom = { ...move.to };
    state.selected = { ...move.to };
    state.legalMoves = continuedCaptures;
    render("mustContinue", { color: colorName(piece.color) });
    if (isComputerTurn()) scheduleComputerMove();
    return;
  }

  state.chainFrom = null;
  state.turn = opponent(state.turn);
  render();
  if (source !== "computer" && isComputerTurn()) scheduleComputerMove();
}

function logMove(color, wasKing, move, continues) {
  state.log.unshift({
    color,
    wasKing,
    from: coord(move.from),
    to: coord(move.to),
    mark: move.captures.length ? "x" : "-",
    continues,
  });
}

function getAudioContext() {
  if (!state.soundEnabled) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(ctx, start, frequency, duration, type = "sine", volume = 0.08) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playNoiseClick(ctx, start, duration = 0.045, volume = 0.04) {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(850, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(start);
}

function playMoveSound({ capture, promote, win }) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (win) {
    playTone(ctx, now, 440, 0.12, "triangle", 0.07);
    playTone(ctx, now + 0.08, 554, 0.13, "triangle", 0.065);
    playTone(ctx, now + 0.17, 659, 0.18, "triangle", 0.06);
    return;
  }

  if (promote) {
    playTone(ctx, now, 392, 0.1, "triangle", 0.065);
    playTone(ctx, now + 0.08, 659, 0.16, "triangle", 0.06);
    return;
  }

  if (capture) {
    playTone(ctx, now, 260, 0.055, "triangle", 0.055);
    playNoiseClick(ctx, now + 0.018, 0.042, 0.035);
    playTone(ctx, now + 0.055, 390, 0.07, "sine", 0.035);
    return;
  }

  playTone(ctx, now, 240, 0.055, "triangle", 0.055);
  playTone(ctx, now + 0.035, 330, 0.06, "sine", 0.035);
}

function handleSquareClick(row, col) {
  if (state.busy || isComputerTurn()) return;
  const piece = state.board[row][col];
  const landingMove = state.legalMoves.find((move) => move.to.row === row && move.to.col === col);
  if (landingMove) {
    makeMove(landingMove);
    return;
  }

  if (!piece || piece.color !== state.turn) return;
  if (state.chainFrom && !sameSquare(state.chainFrom, { row, col })) return;

  const allMoves = getAllMoves(state.board, state.turn, state.chainFrom);
  const pieceMoves = allMoves.filter((move) => move.from.row === row && move.from.col === col);
  if (!pieceMoves.length) return;

  state.selected = { row, col };
  state.legalMoves = pieceMoves;
  render(pieceMoves[0].captures.length ? "captureRequired" : "chooseLanding");
}

function isComputerTurn() {
  return state.mode === "computer" && state.turn === computerColor();
}

function scheduleComputerMove() {
  state.busy = true;
  render("thinking");
  computerTimer = window.setTimeout(() => {
    computerTimer = null;
    const move = chooseComputerMove();
    state.busy = false;
    if (move) makeMove(move, "computer");
    else render();
  }, 420);
}

function undoMove() {
  if (computerTimer) {
    window.clearTimeout(computerTimer);
    computerTimer = null;
  }

  if (!state.history.length) {
    state.busy = false;
    render("nothingToUndo");
    return;
  }

  let snapshot = null;
  if (state.mode === "computer" && state.turn === state.playerColor && !state.chainFrom) {
    do {
      snapshot = state.history.pop();
    } while (state.history.length && snapshot.source !== "player");
  } else {
    snapshot = state.history.pop();
  }

  state.busy = false;
  if (snapshot) restoreSnapshot(snapshot);
  render("undone");
}

function chooseComputerMove() {
  const color = computerColor();
  const moves = getAllMoves(state.board, color, state.chainFrom);
  if (!moves.length) return null;
  if (state.level === "easy") return randomMove(moves);
  if (state.level === "medium") return chooseByHeuristic(state.board, moves, color);
  if (state.level === "hard") return chooseSearchMove(moves, 4, color);
  return chooseSearchMove(moves, 6, color);
}

function randomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function chooseByHeuristic(board, moves, color) {
  let bestScore = -Infinity;
  let best = [];
  for (const move of moves) {
    const next = applyMove(board, move);
    const score = evaluateMove(board, next, move, color);
    if (score > bestScore) {
      bestScore = score;
      best = [move];
    } else if (score === bestScore) {
      best.push(move);
    }
  }
  return randomMove(best);
}

function chooseSearchMove(moves, depth, color) {
  let bestScore = -Infinity;
  let best = [];
  for (const move of orderMoves(state.board, moves, color)) {
    const next = applyMove(state.board, move);
    const chain = move.captures.length ? getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
    const nextTurn = chain.length ? color : opponent(color);
    const score = minimax(next, nextTurn, depth - 1, -Infinity, Infinity, chain.length ? move.to : null, color);
    if (score > bestScore) {
      bestScore = score;
      best = [move];
    } else if (score === bestScore) {
      best.push(move);
    }
  }
  return randomMove(best);
}

function orderMoves(board, moves, color) {
  return [...moves].sort((a, b) => {
    const nextA = applyMove(board, a);
    const nextB = applyMove(board, b);
    return evaluateMove(board, nextB, b, color) - evaluateMove(board, nextA, a, color);
  });
}

function minimax(board, color, depth, alpha, beta, chainFrom, perspective = BLACK) {
  const moves = getAllMoves(board, color, chainFrom);
  if (depth === 0 || !moves.length) return evaluateBoard(board, perspective);
  const orderedMoves = orderMoves(board, moves, perspective);

  if (color === perspective) {
    let value = -Infinity;
    for (const move of orderedMoves) {
      const next = applyMove(board, move);
      const chain = move.captures.length ? getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
      value = Math.max(
        value,
        minimax(next, chain.length ? color : opponent(color), depth - 1, alpha, beta, chain.length ? move.to : null, perspective),
      );
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of orderedMoves) {
    const next = applyMove(board, move);
    const chain = move.captures.length ? getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
    value = Math.min(
      value,
      minimax(next, chain.length ? color : opponent(color), depth - 1, alpha, beta, chain.length ? move.to : null, perspective),
    );
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluateMove(previous, next, move, color) {
  const piece = previous[move.from.row][move.from.col];
  const promotion = !piece.king && (move.to.row === 0 || move.to.row === SIZE - 1) ? 3 : 0;
  const center = 3.5 - (Math.abs(move.to.row - 3.5) + Math.abs(move.to.col - 3.5)) / 2;
  return evaluateBoard(next, color) + move.captures.length * 7 + promotion + center;
}

function evaluateBoard(board, perspective = BLACK) {
  let score = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const value = piece.king ? 7 : 3 + (piece.color === BLACK ? row : SIZE - 1 - row) * 0.12;
      const center = 0.08 * (3.5 - (Math.abs(row - 3.5) + Math.abs(col - 3.5)) / 2);
      score += (piece.color === perspective ? 1 : -1) * (value + center);
    }
  }
  return score;
}

function getWinner() {
  const whitePieces = countPieces(WHITE);
  const blackPieces = countPieces(BLACK);
  if (!whitePieces) return BLACK;
  if (!blackPieces) return WHITE;
  if (!getAllMoves(state.board, state.turn, state.chainFrom).length) return opponent(state.turn);
  return null;
}

function countPieces(color) {
  return state.board.flat().filter((piece) => piece?.color === color).length;
}

function renderResultOverlay(winner) {
  if (!winner) {
    resultOverlay.hidden = true;
    return;
  }

  resultTitle.textContent = t("resultTitle", { color: colorName(winner) });
  resultScore.textContent = t("finalScore", {
    white: countPieces(WHITE),
    black: countPieces(BLACK),
  });
  resultOverlay.hidden = false;
}

function getMoveAnimationStyle(from, to) {
  const direction = state.flipped ? -1 : 1;
  const dx = (from.col - to.col) * direction * 1.3889;
  const dy = (from.row - to.row) * direction * 1.3889;
  return `--move-x: ${dx * 100}%; --move-y: ${dy * 100}%;`;
}

function render(messageKey = "", messageParams = {}) {
  applyTranslations();
  document.body.dataset.boardStyle = state.boardStyle;
  sideControl.hidden = state.mode !== "computer";
  const winner = getWinner();
  const moves = winner ? [] : getAllMoves(state.board, state.turn, state.chainFrom);
  const forcedCapture = moves.some((move) => move.captures.length);
  const selectedMoves = state.selected
    ? moves.filter((move) => sameSquare(move.from, state.selected))
    : state.legalMoves;

  boardEl.innerHTML = "";
  const rows = [...Array(SIZE).keys()];
  const cols = [...Array(SIZE).keys()];
  if (state.flipped) {
    rows.reverse();
    cols.reverse();
  }

  for (const row of rows) {
    for (const col of cols) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${isDark(row, col) ? "dark" : "light"}`;
      square.tabIndex = -1;
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", `${coord({ row, col })}`);
      square.dataset.row = row;
      square.dataset.col = col;

      if (state.lastMove.some((point) => sameSquare(point, { row, col }))) square.classList.add("last");
      if (sameSquare(state.selected, { row, col })) square.classList.add("selected");
      if (selectedMoves.some((move) => sameSquare(move.to, { row, col }))) square.classList.add("legal");

      const piece = state.board[row][col];
      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = `piece ${piece.color}${piece.king ? " king" : ""}`;
        if (sameSquare(state.animation?.to, { row, col })) {
          pieceEl.classList.add("move-animate");
          pieceEl.setAttribute("style", getMoveAnimationStyle(state.animation.from, state.animation.to));
          if (state.animation.promote) pieceEl.classList.add("crown-animate");
        }
        square.append(pieceEl);
        if (piece.color === state.turn && moves.some((move) => sameSquare(move.from, { row, col }))) {
          square.classList.add("selectable");
        }
      }

      const captured = state.animation?.captures.find((capture) => sameSquare(capture, { row, col }));
      if (captured?.piece) {
        const capturedEl = document.createElement("span");
        capturedEl.className = `piece ${captured.piece.color}${captured.piece.king ? " king" : ""} capture-animate`;
        square.append(capturedEl);
      }

      square.addEventListener("mousedown", (event) => event.preventDefault());
      square.addEventListener("click", () => handleSquareClick(row, col));
      boardEl.append(square);
    }
  }

  whiteCount.textContent = countPieces(WHITE);
  blackCount.textContent = countPieces(BLACK);
  undoBtn.disabled = !state.history.length;
  turnPill.className = `turn-pill ${state.turn}`;
  turnPill.textContent = t("turn", { color: colorName(state.turn) });

  if (winner) {
    statusText.textContent = t("winner", { color: colorName(winner) });
    hintText.textContent = t("winnerHint");
  } else {
    statusText.textContent =
      (messageKey ? t(messageKey, messageParams) : "") ||
      (isComputerTurn()
        ? t("computerReady")
        : state.chainFrom
          ? t("continueCapture")
          : t("chooseMove", { color: colorName(state.turn) }));
    hintText.textContent = forcedCapture
      ? t("forcedHint")
      : t("normalHint");
  }

  moveLog.innerHTML = "";
  for (const entry of state.log) {
    const item = document.createElement("li");
    item.textContent = t("moveLogEntry", {
      color: colorName(entry.color),
      king: entry.wasKing ? t("kingMark") : "",
      from: entry.from,
      mark: entry.mark,
      to: entry.to,
      continues: entry.continues ? " +" : "",
    });
    moveLog.append(item);
  }

  renderResultOverlay(winner);

  if (state.animation) {
    if (animationTimer) window.clearTimeout(animationTimer);
    animationTimer = window.setTimeout(() => {
      state.animation = null;
      animationTimer = null;
      render();
    }, 320);
  }
}

languageSelect.addEventListener("change", () => {
  state.language = languageSelect.value;
  render();
});

modeSelect.addEventListener("change", () => {
  state.mode = modeSelect.value;
  resetGame();
});

sideSelect.addEventListener("change", () => {
  state.playerColor = sideSelect.value;
  state.flipped = state.playerColor === BLACK;
  resetGame();
});

levelSelect.addEventListener("change", () => {
  state.level = levelSelect.value;
  render("levelChanged");
});

styleSelect.addEventListener("change", () => {
  state.boardStyle = styleSelect.value;
  render("styleChanged");
});

soundToggle.addEventListener("change", () => {
  state.soundEnabled = soundToggle.checked;
  render(state.soundEnabled ? "soundOn" : "soundOff");
});

document.querySelector("#newGameBtn").addEventListener("click", resetGame);
undoBtn.addEventListener("click", undoMove);
playAgainBtn.addEventListener("click", resetGame);
document.querySelector("#flipBtn").addEventListener("click", () => {
  state.flipped = !state.flipped;
  render("boardFlipped");
});

resetGame();
