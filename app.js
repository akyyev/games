const SIZE = 8;
const WHITE = "white";
const BLACK = "black";
const PREFERENCES_KEY = "russian-checkers-preferences";
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
  positionHistory: [],
  draw: false,
  twoKingsVsOneHalfMoves: 0,
  online: {
    socket: null,
    roomId: "",
    connected: false,
    ready: false,
    statusKey: "onlineIdle",
    statusParams: {},
    closeReason: null,
    rematchChoice: null,
    pendingJoinRoomId: "",
  },
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
const levelControl = document.querySelector("#levelControl");
const levelSelect = document.querySelector("#levelSelect");
const levelCycleBtn = document.querySelector("#levelCycleBtn");
const levelCycleLabel = document.querySelector("#levelCycleLabel");
const styleSelect = document.querySelector("#styleSelect");
const soundToggle = document.querySelector("#soundToggle");
const undoBtn = document.querySelector("#undoBtn");
const onlinePanel = document.querySelector("#onlinePanel");
const createRoomBtn = document.querySelector("#createRoomBtn");
const copyRoomBtn = document.querySelector("#copyRoomBtn");
const shareRoomBtn = document.querySelector("#shareRoomBtn");
const joinRoomBtn = document.querySelector("#joinRoomBtn");
const roomCodeInput = document.querySelector("#roomCodeInput");
const onlineStatus = document.querySelector("#onlineStatus");
const resultOverlay = document.querySelector("#resultOverlay");
const resultTitle = document.querySelector("#resultTitle");
const resultScore = document.querySelector("#resultScore");
const instructionsOverlay = document.querySelector("#instructionsOverlay");
const instructionsBtn = document.querySelector("#instructionsBtn");
const closeInstructionsBtn = document.querySelector("#closeInstructionsBtn");
const colorChoiceOverlay = document.querySelector("#colorChoiceOverlay");
const closeColorChoiceBtn = document.querySelector("#closeColorChoiceBtn");
const chooseWhiteBtn = document.querySelector("#chooseWhiteBtn");
const chooseBlackBtn = document.querySelector("#chooseBlackBtn");
const closeResultBtn = document.querySelector("#closeResultBtn");
const playAgainBtn = document.querySelector("#playAgainBtn");
const declineRematchBtn = document.querySelector("#declineRematchBtn");
const copyrightYear = document.querySelector("#copyrightYear");
const levelOrder = ["easy", "medium", "hard", "extra-hard"];

copyrightYear.textContent = new Date().getFullYear();

function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFERENCES_KEY)) || {};
  } catch {
    return {};
  }
}

function getBrowserLanguage(validLanguages) {
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of browserLanguages) {
    const baseLanguage = String(language || "").toLowerCase().split("-")[0];
    if (validLanguages.includes(baseLanguage)) return baseLanguage;
  }
  return "en";
}

function savePreferences() {
  const preferences = {
    language: state.language,
    mode: state.mode,
    level: state.level,
    playerColor: state.playerColor,
    flipped: state.flipped,
    boardStyle: state.boardStyle,
    soundEnabled: state.soundEnabled,
  };
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

function applyPreferences() {
  const preferences = loadPreferences();
  const validModes = ["human", "computer", "online"];
  const validLevels = ["easy", "medium", "hard", "extra-hard"];
  const validColors = [WHITE, BLACK];
  const validLanguages = Object.keys(translations);
  const validStyles = ["classic", "tournament", "midnight", "porcelain"];

  state.language = validLanguages.includes(preferences.language)
    ? preferences.language
    : getBrowserLanguage(validLanguages);
  if (validModes.includes(preferences.mode)) state.mode = preferences.mode;
  if (validLevels.includes(preferences.level)) state.level = preferences.level;
  if (validColors.includes(preferences.playerColor)) state.playerColor = preferences.playerColor;
  if (validStyles.includes(preferences.boardStyle)) state.boardStyle = preferences.boardStyle;
  if (typeof preferences.soundEnabled === "boolean") state.soundEnabled = preferences.soundEnabled;
  if (typeof preferences.flipped === "boolean") {
    state.flipped = preferences.flipped;
  } else if (state.mode === "computer") {
    state.flipped = state.playerColor === BLACK;
  }

  languageSelect.value = state.language;
  modeSelect.value = state.mode;
  sideSelect.value = state.playerColor;
  levelSelect.value = state.level;
  styleSelect.value = state.boardStyle;
  soundToggle.checked = state.soundEnabled;
  syncLevelControl();
}

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

function getLevelLabelKey(level = state.level) {
  return {
    easy: "levelEasy",
    medium: "levelMedium",
    hard: "levelHard",
    "extra-hard": "levelExtraHard",
  }[level] || "levelMedium";
}

function syncLevelControl() {
  const levelKey = getLevelLabelKey();
  const levelLabel = t(levelKey);
  const accessibleLabel = `${t("levelLabel")}: ${levelLabel}`;
  levelSelect.value = state.level;
  levelCycleLabel.textContent = levelLabel;
  levelCycleBtn.dataset.level = state.level;
  levelCycleBtn.setAttribute("aria-label", accessibleLabel);
  levelCycleBtn.setAttribute("title", accessibleLabel);
}

function changeLevel(level) {
  if (!levelOrder.includes(level)) return;
  state.level = level;
  syncLevelControl();
  savePreferences();
  render("levelChanged");
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

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
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
  if (state.mode === "online") closeOnlineSocket();
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
  state.positionHistory = [positionKey()];
  state.draw = false;
  state.twoKingsVsOneHalfMoves = 0;
  state.log = [];
  render();
  if (isComputerTurn()) scheduleComputerMove();
}

function initializeGame() {
  const roomFromUrl = normalizeRoomId(new URLSearchParams(window.location.search).get("room"));
  if (roomFromUrl) {
    state.mode = "online";
    modeSelect.value = "online";
    resetOnlineLocalState();
    roomCodeInput.value = roomFromUrl;
    setOnlineStatus("onlineChooseSide");
    openColorChoiceOverlay(roomFromUrl);
    return;
  }

  resetGame();
  if (state.mode === "online") {
    state.mode = "online";
    render();
  }
}

function resetOnlineLocalState() {
  state.board = createInitialBoard();
  state.turn = WHITE;
  state.selected = null;
  state.legalMoves = [];
  state.chainFrom = null;
  state.lastMove = [];
  state.busy = false;
  state.history = [];
  state.animation = null;
  state.positionHistory = [positionKey()];
  state.draw = false;
  state.twoKingsVsOneHalfMoves = 0;
  state.log = [];
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

function isOnlineTurn() {
  return state.mode === "online" && state.online.connected && state.online.ready && state.turn === state.playerColor;
}

function setOnlineStatus(statusKey, statusParams = {}) {
  state.online.statusKey = statusKey;
  state.online.statusParams = statusParams;
  render();
}

function normalizeRoomId(value = "") {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";

  try {
    const url = new URL(text, window.location.href);
    const room = url.searchParams.get("room");
    if (room) return normalizeRoomId(room);
  } catch {
    // Treat non-URL input as a plain room code.
  }

  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function getRoomLink() {
  if (!state.online.roomId) return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", state.online.roomId);
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function copyRoomCode() {
  if (!state.online.roomId) {
    setOnlineStatus("noRoomToShare");
    return;
  }
  await copyText(state.online.roomId);
  setOnlineStatus("copiedRoomCode");
}

async function shareRoomLink() {
  const roomLink = getRoomLink();
  if (!roomLink) {
    setOnlineStatus("noRoomToShare");
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: document.title,
        text: t("onlineWaiting", { room: state.online.roomId }),
        url: roomLink,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyText(roomLink);
  setOnlineStatus("copiedRoomLink");
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
    positionHistory: [...state.positionHistory],
    draw: state.draw,
    twoKingsVsOneHalfMoves: state.twoKingsVsOneHalfMoves,
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
  state.positionHistory = [...(snapshot.positionHistory || [positionKey()])];
  state.draw = Boolean(snapshot.draw);
  state.twoKingsVsOneHalfMoves = snapshot.twoKingsVsOneHalfMoves || 0;
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

function squareKey({ row, col }) {
  return `${row},${col}`;
}

function positionKey(board = state.board, turn = state.turn, chainFrom = state.chainFrom) {
  const pieces = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const piece = board[row][col];
      if (piece) pieces.push(`${row}${col}${piece.color[0]}${piece.king ? "K" : "M"}`);
    }
  }
  const chain = chainFrom ? `${chainFrom.row}${chainFrom.col}` : "-";
  return `${turn}|${chain}|${pieces.join(",")}`;
}

function countPositionOccurrences(key) {
  return state.positionHistory.filter((position) => position === key).length;
}

function recordCurrentPosition() {
  const key = positionKey();
  state.positionHistory.push(key);
  updateTwoKingsVsOneCounter();
  if (countPositionOccurrences(key) >= 3 || hasInsufficientWinningMaterial() || state.twoKingsVsOneHalfMoves >= 20) {
    state.draw = true;
  }
}

function getKingCounts(board = state.board) {
  const counts = { [WHITE]: 0, [BLACK]: 0 };
  for (const row of board) {
    for (const piece of row) {
      if (piece?.king) counts[piece.color] += 1;
    }
  }
  return counts;
}

function isTwoKingsVsOneKingEndgame() {
  const pieceCounts = getPieceCounts();
  if (pieceCounts[WHITE] + pieceCounts[BLACK] !== 3) return false;
  const kingCounts = getKingCounts();
  return (
    pieceCounts[WHITE] === kingCounts[WHITE] &&
    pieceCounts[BLACK] === kingCounts[BLACK] &&
    ((kingCounts[WHITE] === 2 && kingCounts[BLACK] === 1) ||
      (kingCounts[WHITE] === 1 && kingCounts[BLACK] === 2))
  );
}

function updateTwoKingsVsOneCounter() {
  if (isTwoKingsVsOneKingEndgame()) {
    state.twoKingsVsOneHalfMoves += 1;
  } else {
    state.twoKingsVsOneHalfMoves = 0;
  }
}

function hasInsufficientWinningMaterial() {
  const pieces = state.board.flat().filter(Boolean);
  if (pieces.length !== 2 || pieces.some((piece) => !piece.king)) return false;
  const colors = new Set(pieces.map((piece) => piece.color));
  return colors.size === 2 && !getAllMoves(state.board, state.turn, state.chainFrom).some((move) => move.captures.length);
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

function animateAcceptedMove(previousBoard, room) {
  const [from, to] = room.lastMove || [];
  if (!from || !to) return;
  const piece = previousBoard[from.row]?.[from.col];
  if (!piece) return;
  const captures = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const previousPiece = previousBoard[row][col];
      if (previousPiece && !room.board[row][col] && !(from.row === row && from.col === col)) {
        captures.push({ row, col, piece: { ...previousPiece } });
      }
    }
  }
  state.animation = {
    from: { ...from },
    to: { ...to },
    captures,
    promote: !piece.king && room.board[to.row]?.[to.col]?.king,
  };
}

function makeMove(move, source = "player") {
  if (state.mode === "online" && source === "player") {
    sendOnlineMove(move);
    return;
  }

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
  recordCurrentPosition();
  render();
  if (!state.draw && source !== "computer" && isComputerTurn()) scheduleComputerMove();
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

function unlockAudio() {
  getAudioContext();
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

function playNoiseClick(ctx, start, duration = 0.045, volume = 0.04, filterType = "highpass", frequency = 850) {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, start);
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
    playNoiseClick(ctx, now, 0.026, 0.032, "highpass", 1600);
    playTone(ctx, now + 0.012, 520, 0.045, "triangle", 0.035);
    playTone(ctx, now + 0.038, 150, 0.12, "sine", 0.072);
    playNoiseClick(ctx, now + 0.045, 0.075, 0.022, "lowpass", 620);
    return;
  }

  playTone(ctx, now, 240, 0.055, "triangle", 0.055);
  playTone(ctx, now + 0.035, 330, 0.06, "sine", 0.035);
}

function handleSquareClick(row, col) {
  unlockAudio();
  if (state.busy || isComputerTurn()) return;
  if (state.mode === "online" && !isOnlineTurn()) return;
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

function closeOnlineSocket() {
  if (state.online.socket) {
    const socket = state.online.socket;
    state.online.socket = null;
    state.online.socket.close();
  }
  state.online.connected = false;
  state.online.ready = false;
  state.online.roomId = "";
  state.online.statusKey = "onlineIdle";
  state.online.statusParams = {};
  state.online.closeReason = null;
  state.online.rematchChoice = null;
  state.online.pendingJoinRoomId = "";
}

function connectOnline(action, roomId = "") {
  const url = window.CHECKERS_CONFIG?.WS_URL;
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!url) {
    setOnlineStatus("onlineError", { message: "Missing WebSocket URL." });
    return;
  }

  closeOnlineSocket();
  resetOnlineLocalState();
  state.mode = "online";
  state.playerColor = WHITE;
  state.flipped = false;
  setOnlineStatus("onlineConnecting");

  const socket = new WebSocket(url);
  state.online.socket = socket;

  socket.addEventListener("open", () => {
    if (state.online.socket !== socket) return;
    socket.send(JSON.stringify({ type: action, roomId: normalizedRoomId, preferredColor: sideSelect.value }));
  });

  socket.addEventListener("message", (event) => {
    if (state.online.socket !== socket) return;
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      applyOnlineState(message.room, message.color);
    } else if (message.type === "error") {
      setOnlineStatus("onlineError", { message: message.message });
    } else if (message.type === "notice") {
      if (message.closeReason) state.online.closeReason = { message: message.message };
      setOnlineStatus("onlineError", { message: message.message });
    } else if (message.type === "rematch") {
      handleRematchStatus(message.status);
    }
  });

  socket.addEventListener("close", () => {
    if (state.online.socket !== socket) return;
    state.online.connected = false;
    state.online.ready = false;
    if (state.mode === "online") {
      if (state.online.closeReason) {
        setOnlineStatus("onlineError", state.online.closeReason);
        state.online.closeReason = null;
      } else {
        setOnlineStatus("onlineIdle");
      }
    }
  });

  socket.addEventListener("error", () => {
    if (state.online.socket !== socket) return;
    setOnlineStatus("onlineError", { message: "Could not connect." });
  });
}

function applyOnlineState(room, color) {
  const previousBoard = cloneBoard(state.board);
  const hadMove = room.lastMove?.length;
  const previousLastMove = state.lastMove.map(clonePoint);
  state.online.connected = true;
  state.online.ready = room.players.length > 1;
  state.online.roomId = room.id;
  state.playerColor = color;
  sideSelect.value = color;
  state.flipped = color === BLACK;
  state.board = cloneBoard(room.board);
  state.turn = room.turn;
  state.chainFrom = clonePoint(room.chainFrom);
  state.lastMove = (room.lastMove || []).map(clonePoint);
  state.log = cloneLog(room.log || []);
  state.draw = Boolean(room.draw);
  state.twoKingsVsOneHalfMoves = room.twoKingsVsOneHalfMoves || 0;
  state.selected = null;
  state.legalMoves = [];
  if (state.chainFrom && state.turn === color) {
    state.selected = clonePoint(state.chainFrom);
    state.legalMoves = getCaptureMovesForPiece(state.board, state.chainFrom.row, state.chainFrom.col);
  }
  state.busy = false;
  state.history = [];
  if (hadMove) animateAcceptedMove(previousBoard, room);
  const hasNewMove =
    hadMove &&
    (!previousLastMove.length ||
      !sameSquare(previousLastMove[0], room.lastMove[0]) ||
      !sameSquare(previousLastMove[1], room.lastMove[1]));
  if (hasNewMove) {
    const movedPiece = room.board[room.lastMove[1].row]?.[room.lastMove[1].col];
    playMoveSound({
      capture: previousBoard.flat().filter(Boolean).length > room.board.flat().filter(Boolean).length,
      promote: Boolean(movedPiece?.king && !previousBoard[room.lastMove[0].row]?.[room.lastMove[0].col]?.king),
      win: Boolean(room.winner),
    });
  }

  state.online.statusKey = state.online.ready ? "onlineReady" : "onlineWaiting";
  state.online.statusParams = { room: room.id, color: colorName(color) };
  state.online.rematchChoice = null;
  roomCodeInput.value = room.id;
  render();
}

function handleRematchStatus(status) {
  const statusKeys = {
    waiting: "rematchWaiting",
    opponentAccepted: "rematchOpponentAccepted",
    declinedByYou: "rematchDeclinedByYou",
    declinedByOpponent: "rematchDeclinedByOpponent",
    started: "rematchStarted",
  };
  if (status === "started") {
    state.online.rematchChoice = "starting";
    resultOverlay.hidden = true;
  } else if (status === "declinedByYou" || status === "declinedByOpponent") {
    state.online.rematchChoice = "closed";
  }
  setOnlineStatus(statusKeys[status] || "onlineIdle");
  render();
}

function sendOnlineMove(move) {
  const socket = state.online.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setOnlineStatus("onlineError", { message: "Not connected." });
    return;
  }
  socket.send(JSON.stringify({ type: "move", move }));
}

function sendRematchVote(accept) {
  const socket = state.online.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setOnlineStatus("onlineError", { message: "Not connected." });
    return;
  }
  state.online.rematchChoice = accept ? "yes" : "no";
  setOnlineStatus(accept ? "rematchWaiting" : "rematchDeclinedByYou");
  socket.send(JSON.stringify({ type: "rematch", accept }));
  render();
}

function chooseComputerMove() {
  const color = computerColor();
  const moves = getAllMoves(state.board, color, state.chainFrom);
  if (!moves.length) return null;
  const candidates = preferFreshPositions(moves, color);
  if (state.level === "easy") return randomMove(candidates);
  if (state.level === "medium") return chooseByHeuristic(state.board, candidates, color);
  if (state.level === "hard") return chooseSearchMove(candidates, 4, color);
  return chooseSearchMove(candidates, 6, color);
}

function randomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function preferFreshPositions(moves, color) {
  const fresh = moves.filter((move) => {
    const next = applyMove(state.board, move);
    const chain = move.captures.length ? getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
    const nextTurn = chain.length ? color : opponent(color);
    const nextChainFrom = chain.length ? move.to : null;
    return countPositionOccurrences(positionKey(next, nextTurn, nextChainFrom)) === 0;
  });
  return fresh.length ? fresh : moves;
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

function getWinner(pieceCounts = getPieceCounts()) {
  if (state.draw) return null;
  const whitePieces = pieceCounts[WHITE];
  const blackPieces = pieceCounts[BLACK];
  if (!whitePieces) return BLACK;
  if (!blackPieces) return WHITE;
  if (!getAllMoves(state.board, state.turn, state.chainFrom).length) return opponent(state.turn);
  return null;
}

function getPieceCounts(board = state.board) {
  const counts = { [WHITE]: 0, [BLACK]: 0 };
  for (const row of board) {
    for (const piece of row) {
      if (piece) counts[piece.color] += 1;
    }
  }
  return counts;
}

function renderResultOverlay(winner, draw, pieceCounts) {
  if (!winner && !draw) {
    resultOverlay.hidden = true;
    declineRematchBtn.hidden = true;
    playAgainBtn.disabled = false;
    return;
  }

  if (state.mode === "online" && state.online.rematchChoice) {
    resultOverlay.hidden = true;
    declineRematchBtn.hidden = true;
    playAgainBtn.disabled = false;
    return;
  }

  if (draw) {
    resultTitle.textContent = t("drawTitle");
  } else if (state.mode === "computer" || state.mode === "online") {
    resultTitle.textContent = t(winner === state.playerColor ? "youWonTitle" : "youLostTitle");
  } else {
    resultTitle.textContent = t("resultTitle", { color: colorName(winner) });
  }
  resultScore.textContent = t("finalScore", {
    white: pieceCounts[WHITE],
    black: pieceCounts[BLACK],
  });
  const canRematchOnline = state.mode === "online" && state.online.ready;
  const hasRematchChoice = Boolean(state.online.rematchChoice);
  declineRematchBtn.hidden = !canRematchOnline;
  playAgainBtn.disabled = hasRematchChoice;
  declineRematchBtn.disabled = hasRematchChoice;
  resultOverlay.hidden = false;
}

function closeResultOverlay() {
  resultOverlay.hidden = true;
}

function openInstructionsOverlay() {
  instructionsOverlay.hidden = false;
}

function closeInstructionsOverlay() {
  instructionsOverlay.hidden = true;
}

function openColorChoiceOverlay(roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) {
    setOnlineStatus("onlineError", { message: t("roomCodeRequired") });
    return;
  }
  state.online.pendingJoinRoomId = normalizedRoomId;
  roomCodeInput.value = normalizedRoomId;
  colorChoiceOverlay.hidden = false;
}

function closeColorChoiceOverlay() {
  colorChoiceOverlay.hidden = true;
}

function chooseOnlineColor(color) {
  const roomId = state.online.pendingJoinRoomId;
  if (!roomId) {
    closeColorChoiceOverlay();
    setOnlineStatus("onlineError", { message: t("roomCodeRequired") });
    return;
  }
  sideSelect.value = color;
  state.playerColor = color;
  state.flipped = color === BLACK;
  closeColorChoiceOverlay();
  connectOnline("join", roomId);
}

function getMoveAnimationStyle(from, to) {
  const direction = state.flipped ? -1 : 1;
  const dx = (from.col - to.col) * direction * 1.3889;
  const dy = (from.row - to.row) * direction * 1.3889;
  return `--move-x: ${dx * 100}%; --move-y: ${dy * 100}%;`;
}

function render(messageKey = "", messageParams = {}) {
  applyTranslations();
  syncLevelControl();
  document.body.dataset.boardStyle = state.boardStyle;
  document.body.dataset.flipped = state.flipped ? "true" : "false";
  sideControl.hidden = state.mode !== "computer";
  levelControl.hidden = state.mode !== "computer";
  onlinePanel.hidden = state.mode !== "online";
  const pieceCounts = getPieceCounts();
  const winner = getWinner(pieceCounts);
  const draw = state.draw;
  const turnOwner =
    winner || draw
      ? "neutral"
      : state.mode === "online"
        ? isOnlineTurn()
          ? "player"
          : "opponent"
        : state.mode === "computer"
          ? isComputerTurn()
            ? "opponent"
            : "player"
          : "local";
  document.body.dataset.turn = winner || draw ? "neutral" : state.turn;
  document.body.dataset.turnOwner = turnOwner;
  const moves = winner || draw ? [] : getAllMoves(state.board, state.turn, state.chainFrom);
  const forcedCapture = moves.some((move) => move.captures.length);
  const selectedMoves = state.selected
    ? moves.filter((move) => sameSquare(move.from, state.selected))
    : state.legalMoves;
  const lastMoveSquares = new Set(state.lastMove.map(squareKey));
  const legalLandingSquares = new Set(selectedMoves.map((move) => squareKey(move.to)));
  const movableSquares = new Set(moves.map((move) => squareKey(move.from)));
  const capturedBySquare = new Map((state.animation?.captures || []).map((capture) => [squareKey(capture), capture]));

  const rows = [...Array(SIZE).keys()];
  const cols = [...Array(SIZE).keys()];
  if (state.flipped) {
    rows.reverse();
    cols.reverse();
  }

  boardEl.innerHTML = "";
  const boardFragment = document.createDocumentFragment();
  for (const row of rows) {
    for (const col of cols) {
      const key = `${row},${col}`;
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${isDark(row, col) ? "dark" : "light"}`;
      square.tabIndex = -1;
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", `${coord({ row, col })}`);
      square.dataset.row = row;
      square.dataset.col = col;

      if (lastMoveSquares.has(key)) square.classList.add("last");
      if (sameSquare(state.selected, { row, col })) square.classList.add("selected");
      if (legalLandingSquares.has(key)) square.classList.add("legal");

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
        if (piece.color === state.turn && movableSquares.has(key)) {
          square.classList.add("selectable");
        }
      }

      const captured = capturedBySquare.get(key);
      if (captured?.piece) {
        const capturedEl = document.createElement("span");
        capturedEl.className = `piece ${captured.piece.color}${captured.piece.king ? " king" : ""} capture-animate`;
        square.append(capturedEl);
      }

      square.addEventListener("mousedown", (event) => event.preventDefault());
      square.addEventListener("click", () => handleSquareClick(row, col));
      boardFragment.append(square);
    }
  }
  boardEl.append(boardFragment);

  whiteCount.textContent = pieceCounts[WHITE];
  blackCount.textContent = pieceCounts[BLACK];
  undoBtn.disabled = state.mode === "online" || !state.history.length;
  copyRoomBtn.disabled = !state.online.roomId;
  shareRoomBtn.disabled = !state.online.roomId;
  turnPill.className = `turn-pill ${state.turn}`;
  turnPill.textContent = t("turn", { color: colorName(state.turn) });

  if (draw) {
    statusText.textContent = t("draw");
    hintText.textContent = t("drawHint");
  } else if (winner) {
    statusText.textContent = t("winner", { color: colorName(winner) });
    hintText.textContent = t("winnerHint");
  } else {
    statusText.textContent =
      (messageKey ? t(messageKey, messageParams) : "") ||
      (state.mode === "online"
        ? t(isOnlineTurn() ? "onlineYourTurn" : "onlineOpponentTurn")
        : isComputerTurn()
        ? t("computerReady")
        : state.chainFrom
          ? t("continueCapture")
          : t("chooseMove", { color: colorName(state.turn) }));
    hintText.textContent = forcedCapture
      ? t("forcedHint")
      : t("normalHint");
  }

  moveLog.innerHTML = "";
  const logFragment = document.createDocumentFragment();
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
    logFragment.append(item);
  }
  moveLog.append(logFragment);

  renderResultOverlay(winner, draw, pieceCounts);
  onlineStatus.textContent = t(state.online.statusKey, state.online.statusParams);

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
  unlockAudio();
  state.language = languageSelect.value;
  savePreferences();
  render();
});

modeSelect.addEventListener("change", () => {
  unlockAudio();
  if (state.mode === "online" && modeSelect.value !== "online") closeOnlineSocket();
  state.mode = modeSelect.value;
  savePreferences();
  resetGame();
});

sideSelect.addEventListener("change", () => {
  unlockAudio();
  if (state.mode === "online" && state.online.connected) {
    sideSelect.value = state.playerColor;
    render();
    return;
  }
  state.playerColor = sideSelect.value;
  state.flipped = state.playerColor === BLACK;
  savePreferences();
  if (state.mode === "online") {
    render();
    return;
  }
  resetGame();
});

levelSelect.addEventListener("change", () => {
  unlockAudio();
  changeLevel(levelSelect.value);
});

levelCycleBtn.addEventListener("click", () => {
  unlockAudio();
  const currentIndex = levelOrder.indexOf(state.level);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % levelOrder.length;
  changeLevel(levelOrder[nextIndex]);
});

styleSelect.addEventListener("change", () => {
  unlockAudio();
  state.boardStyle = styleSelect.value;
  savePreferences();
  render("styleChanged");
});

soundToggle.addEventListener("change", () => {
  state.soundEnabled = soundToggle.checked;
  unlockAudio();
  savePreferences();
  render(state.soundEnabled ? "soundOn" : "soundOff");
});

document.querySelector("#newGameBtn").addEventListener("click", () => {
  unlockAudio();
  resetGame();
});
undoBtn.addEventListener("click", () => {
  unlockAudio();
  undoMove();
});
playAgainBtn.addEventListener("click", () => {
  unlockAudio();
  if (state.mode === "online") {
    sendRematchVote(true);
    return;
  }
  resetGame();
});
declineRematchBtn.addEventListener("click", () => {
  unlockAudio();
  sendRematchVote(false);
});
closeResultBtn.addEventListener("click", () => {
  unlockAudio();
  closeResultOverlay();
});
instructionsBtn.addEventListener("click", () => {
  unlockAudio();
  openInstructionsOverlay();
});
closeInstructionsBtn.addEventListener("click", () => {
  unlockAudio();
  closeInstructionsOverlay();
});
closeColorChoiceBtn.addEventListener("click", () => {
  unlockAudio();
  closeColorChoiceOverlay();
});
chooseWhiteBtn.addEventListener("click", () => {
  unlockAudio();
  chooseOnlineColor(WHITE);
});
chooseBlackBtn.addEventListener("click", () => {
  unlockAudio();
  chooseOnlineColor(BLACK);
});
createRoomBtn.addEventListener("click", () => {
  unlockAudio();
  connectOnline("create");
});
copyRoomBtn.addEventListener("click", () => {
  unlockAudio();
  copyRoomCode().catch(() => setOnlineStatus("onlineError", { message: t("copyFailed") }));
});
shareRoomBtn.addEventListener("click", () => {
  unlockAudio();
  shareRoomLink().catch(() => setOnlineStatus("onlineError", { message: t("shareFailed") }));
});
joinRoomBtn.addEventListener("click", () => {
  unlockAudio();
  const roomId = normalizeRoomId(roomCodeInput.value);
  if (!roomId) {
    setOnlineStatus("onlineError", { message: t("roomCodeRequired") });
    return;
  }
  roomCodeInput.value = roomId;
  setOnlineStatus("onlineChooseSide");
  openColorChoiceOverlay(roomId);
});
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = normalizeRoomId(roomCodeInput.value);
});
document.querySelector("#flipBtn").addEventListener("click", () => {
  unlockAudio();
  state.flipped = !state.flipped;
  savePreferences();
  render("boardFlipped");
});

applyPreferences();
initializeGame();
