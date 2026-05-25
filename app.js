const games = window.GAMES || {};
let activeGame = null;
let rules = null;
let engine = null;
let gameUi = null;
let gameSides = [];
let gameScoreKeys = {};
let SIZE;
let WHITE;
let BLACK;
let createInitialBoard;
let isDark;
let opponent;
let cloneBoard;
let cloneMove;
let getCaptureMovesForPiece;
let getAllMoves;
let applyMove;
let sameSquare;

function bindActiveGame(gameId = window.DEFAULT_GAME_ID) {
  const nextGame = games[gameId] || games[window.DEFAULT_GAME_ID] || games.checkers;
  if (!nextGame?.rules) throw new Error("Game rules failed to load.");
  if (!nextGame?.engine) throw new Error("Game engine failed to load.");

  activeGame = nextGame;
  rules = activeGame.rules;
  engine = activeGame.engine;
  gameUi = activeGame.ui || {};
  gameSides = activeGame.sides || [];
  gameScoreKeys = activeGame.scoreKeys || {};
  ({
    SIZE,
    WHITE,
    BLACK,
    createInitialBoard,
    isDark,
    opponent,
    cloneBoard,
    cloneMove,
    getCaptureMovesForPiece,
    getAllMoves,
    applyMove,
    sameSquare,
  } = rules);
}

bindActiveGame();

const PREFERENCES_KEY = "russian-checkers-preferences";

const translations = window.I18N || {};

const state = {
  board: [],
  gameId: activeGame.id,
  turn: WHITE,
  mode: "computer",
  level: "medium",
  playerColor: WHITE,
  language: "en",
  selected: null,
  legalMoves: [],
  captureHint: false,
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
  pendingPromotionMoves: null,
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
const gameSelectOverlay = document.querySelector("#gameSelectOverlay");
const gameSelectBtn = document.querySelector("#gameSelectBtn");
const closeGameSelectBtn = document.querySelector("#closeGameSelectBtn");
const gameChoiceList = document.querySelector("#gameChoiceList");
const instructionsOverlay = document.querySelector("#instructionsOverlay");
const instructionsBtn = document.querySelector("#instructionsBtn");
const closeInstructionsBtn = document.querySelector("#closeInstructionsBtn");
const colorChoiceOverlay = document.querySelector("#colorChoiceOverlay");
const closeColorChoiceBtn = document.querySelector("#closeColorChoiceBtn");
const chooseWhiteBtn = document.querySelector("#chooseWhiteBtn");
const chooseBlackBtn = document.querySelector("#chooseBlackBtn");
const promotionOverlay = document.querySelector("#promotionOverlay");
const promotionChoices = document.querySelector("#promotionChoices");
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
    gameId: state.gameId,
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

function clearRoomFromUrl() {
  const url = new URL(window.location.href || String(window.location));
  if (!url.searchParams.has("room")) return;
  url.searchParams.delete("room");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", nextUrl || url.pathname);
}

function getGameSideIds() {
  const sideIds = gameSides.map((side) => side.id);
  return sideIds.length ? sideIds : [WHITE, BLACK];
}

function getSupportedModes() {
  const support = gameUi.modeSupport || {};
  return ["human", "computer", "online"].filter((mode) => support[mode] !== false);
}

function normalizeModeForGame(mode) {
  const supportedModes = getSupportedModes();
  if (supportedModes.includes(mode)) return mode;
  return supportedModes.includes("computer") ? "computer" : supportedModes[0] || "human";
}

function syncModeOptions() {
  const supportedModes = getSupportedModes();
  [...modeSelect.options].forEach((option) => {
    option.disabled = !supportedModes.includes(option.value);
  });
  if (!supportedModes.includes(state.mode)) {
    state.mode = normalizeModeForGame(state.mode);
    modeSelect.value = state.mode;
  }
}

function applyPreferences() {
  const preferences = loadPreferences();
  const validModes = getSupportedModes();
  const validLevels = ["easy", "medium", "hard", "extra-hard"];
  const validColors = getGameSideIds();
  const validLanguages = Object.keys(translations);
  const validStyles = ["classic", "tournament", "midnight", "porcelain"];
  const preferredGameId = games[preferences.gameId]?.id ? preferences.gameId : window.DEFAULT_GAME_ID;

  if (preferredGameId !== state.gameId) setActiveGame(preferredGameId, { reset: false, persist: false });
  state.language = validLanguages.includes(preferences.language)
    ? preferences.language
    : getBrowserLanguage(validLanguages);
  if (validModes.includes(preferences.mode)) state.mode = preferences.mode;
  state.mode = normalizeModeForGame(state.mode);
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
  syncModeOptions();
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
  return t(gameSides.find((side) => side.id === color)?.labelKey || color);
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

function syncGameMetadata() {
  for (const side of gameSides) {
    document.querySelectorAll(`[data-game-side="${side.id}"]`).forEach((element) => {
      element.dataset.i18n = side.labelKey;
    });
    document.querySelectorAll(`[data-game-side-option="${side.id}"]`).forEach((element) => {
      element.dataset.i18n = side.sideLabelKey || side.labelKey;
    });
  }
  document.querySelectorAll("[data-game-rule-index]").forEach((element) => {
    const key = activeGame.rulesKeys?.[Number(element.dataset.gameRuleIndex)];
    element.hidden = !key;
    if (key) element.dataset.i18n = key;
  });
  document.querySelectorAll("[data-game-title]").forEach((element) => {
    element.dataset.i18n = activeGame.headingKey || activeGame.titleKey || "title";
  });
  document.querySelectorAll("[data-game-eyebrow]").forEach((element) => {
    element.dataset.i18n = activeGame.eyebrowKey || "eyebrow";
  });
}

function getBoardSize() {
  return gameUi.boardSize || SIZE;
}

function isDarkSquare(row, col) {
  return gameUi.isDarkSquare ? gameUi.isDarkSquare(row, col) : isDark(row, col);
}

function getPieceClasses(piece, extraClasses = []) {
  const baseClasses = gameUi.getPieceClasses
    ? gameUi.getPieceClasses(piece)
    : ["piece", piece.color, piece.king ? "king" : ""].filter(Boolean);
  return [...baseClasses, ...extraClasses].filter(Boolean).join(" ");
}

function getTurnClass(color) {
  return gameUi.getTurnClass ? gameUi.getTurnClass(color) : color;
}

function createPieceElement(piece, extraClasses = []) {
  const pieceEl = document.createElement("span");
  pieceEl.className = getPieceClasses(piece, extraClasses);
  if (gameUi.getPieceMarkup) {
    pieceEl.innerHTML = gameUi.getPieceMarkup(piece);
    return pieceEl;
  }
  if (gameUi.getPieceText) pieceEl.textContent = gameUi.getPieceText(piece);
  return pieceEl;
}

function getCheckedKingSquare() {
  return gameUi.getCheckedKingSquare ? gameUi.getCheckedKingSquare(state.board, state.turn) : null;
}

function createPreviewPieceElement(game, piece) {
  const ui = game.ui || {};
  const pieceEl = document.createElement("span");
  const classes = ui.getPieceClasses
    ? ui.getPieceClasses(piece)
    : ["piece", piece.color, piece.king ? "king" : ""].filter(Boolean);
  pieceEl.className = classes.filter(Boolean).join(" ");
  if (ui.getPieceMarkup) {
    pieceEl.innerHTML = ui.getPieceMarkup(piece);
  } else if (ui.getPieceText) {
    pieceEl.textContent = ui.getPieceText(piece);
  }
  return pieceEl;
}

function createGamePreview(game) {
  const preview = document.createElement("span");
  preview.className = `game-choice-preview ${game.id ? `is-${game.id}` : ""}`;
  preview.setAttribute("aria-hidden", "true");
  const previewPieces = new Map((game.ui?.previewPieces || []).map((item) => [`${item.row},${item.col}`, item.piece]));
  for (let index = 0; index < 16; index += 1) {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const square = document.createElement("span");
    square.className = (row + col) % 2 === 0 ? "light" : "dark";
    const piece = previewPieces.get(`${row},${col}`);
    if (piece) square.append(createPreviewPieceElement(game, piece));
    preview.append(square);
  }
  return preview;
}

function createGameChoice({ id, titleKey, unavailable = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `game-choice${id === state.gameId ? " is-active" : ""}`;
  button.dataset.gameId = id;
  button.disabled = unavailable;

  const text = document.createElement("span");
  const title = document.createElement("span");
  title.className = "game-choice-title";
  title.textContent = titleKey ? t(titleKey) : id;
  const meta = document.createElement("span");
  meta.className = "game-choice-meta";
  meta.textContent = unavailable ? t("gameComingSoon") : t(id === state.gameId ? "gameSelected" : "gameAvailable");
  text.append(title, meta);

  const action = document.createElement("span");
  action.className = "game-choice-action";
  action.textContent = unavailable ? t("gameComingSoon") : t(id === state.gameId ? "gameCurrent" : "gamePlay");

  button.append(createGamePreview(games[id] || { id }), text, action);
  return button;
}

function renderGameChoices() {
  const fragment = document.createDocumentFragment();
  Object.values(games).forEach((game) => {
    fragment.append(createGameChoice(game));
  });
  gameChoiceList.replaceChildren(fragment);
}

function openGameSelection() {
  renderGameChoices();
  gameSelectOverlay.hidden = false;
}

function closeGameSelection() {
  gameSelectOverlay.hidden = true;
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
  syncGameMetadata();
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

function resetGame() {
  if (state.mode !== "online") clearRoomFromUrl();
  if (state.mode === "online") closeOnlineSocket();
  if (computerTimer) window.clearTimeout(computerTimer);
  computerTimer = null;
  if (animationTimer) window.clearTimeout(animationTimer);
  animationTimer = null;
  state.board = createInitialBoard();
  state.turn = WHITE;
  state.selected = null;
  state.legalMoves = [];
  state.captureHint = false;
  state.chainFrom = null;
  state.lastMove = [];
  state.busy = false;
  state.history = [];
  state.animation = null;
  state.positionHistory = [positionKey()];
  state.draw = false;
  state.twoKingsVsOneHalfMoves = 0;
  state.pendingPromotionMoves = null;
  state.log = [];
  promotionOverlay.hidden = true;
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
  openGameSelection();
}

function resetOnlineLocalState() {
  state.board = createInitialBoard();
  state.turn = WHITE;
  state.selected = null;
  state.legalMoves = [];
  state.captureHint = false;
  state.chainFrom = null;
  state.lastMove = [];
  state.busy = false;
  state.history = [];
  state.animation = null;
  state.positionHistory = [positionKey()];
  state.draw = false;
  state.twoKingsVsOneHalfMoves = 0;
  state.pendingPromotionMoves = null;
  state.log = [];
  promotionOverlay.hidden = true;
}

function setActiveGame(gameId, { reset = true, persist = true, closeOnline = true } = {}) {
  const nextGame = games[gameId] || games[window.DEFAULT_GAME_ID] || games.checkers;
  if (!nextGame?.id) return false;
  if (nextGame.id === state.gameId) return true;

  if (closeOnline && state.mode === "online") closeOnlineSocket();
  bindActiveGame(nextGame.id);
  state.gameId = activeGame.id;
  state.mode = normalizeModeForGame(state.mode);
  state.turn = WHITE;
  state.playerColor = WHITE;
  state.flipped = false;
  sideSelect.value = state.playerColor;
  syncGameMetadata();
  syncModeOptions();
  if (persist) savePreferences();
  if (reset) resetGame();
  renderGameChoices();
  return true;
}

window.setActiveGame = setActiveGame;

function computerColor() {
  return opponent(state.playerColor);
}

function isOnlineTurn() {
  return state.mode === "online" && state.online.connected && state.online.ready && state.turn === state.playerColor;
}

function getOnlineStatusType(statusKey) {
  if (statusKey === "onlineConnecting") return "connecting";
  if (
    statusKey === "onlineError" ||
    statusKey === "onlineServerMissing" ||
    statusKey === "onlineServerUnavailable" ||
    statusKey === "onlineDisconnected" ||
    statusKey === "onlineRoomExpired" ||
    statusKey === "onlineRoomFull" ||
    statusKey === "onlineRoomNotFound" ||
    statusKey === "onlineNotConnected" ||
    statusKey === "onlineInvalidColor" ||
    statusKey === "onlineColorTaken" ||
    statusKey === "roomCodeRequired"
  ) {
    return "error";
  }
  if (
    statusKey === "copiedRoomCode" ||
    statusKey === "copiedRoomLink" ||
    statusKey === "rematchStarted" ||
    statusKey === "onlineOpponentDisconnected"
  ) {
    return "notice";
  }
  return "idle";
}

function setOnlineStatus(statusKey, statusParams = {}) {
  state.online.statusKey = statusKey;
  state.online.statusParams = statusParams;
  render();
}

function getOnlineStatusFromMessage(message = {}) {
  const codeMap = {
    missing_ws_url: "onlineServerMissing",
    server_unavailable: "onlineServerUnavailable",
    not_connected: "onlineNotConnected",
    room_not_found: "onlineRoomNotFound",
    room_full: "onlineRoomFull",
    room_expired: "onlineRoomExpired",
    opponent_disconnected: "onlineOpponentDisconnected",
    invalid_color: "onlineInvalidColor",
    color_taken: "onlineColorTaken",
  };
  if (message.code && codeMap[message.code]) return { key: codeMap[message.code], params: {} };

  const text = String(message.message || "");
  if (text === "Room expired.") return { key: "onlineRoomExpired", params: {} };
  if (text === "Opponent disconnected.") return { key: "onlineOpponentDisconnected", params: {} };
  if (text === "Room not found.") return { key: "onlineRoomNotFound", params: {} };
  if (text === "Room is full.") return { key: "onlineRoomFull", params: {} };
  if (text === "Invalid color.") return { key: "onlineInvalidColor", params: {} };
  if (text === "Color is already taken.") return { key: "onlineColorTaken", params: {} };
  if (text === "Could not connect.") return { key: "onlineServerUnavailable", params: {} };
  if (text === "Not connected.") return { key: "onlineNotConnected", params: {} };
  return { key: "onlineError", params: { message: text || t("unknownOnlineError") } };
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

function clonePoint(point) {
  return point ? { ...point } : null;
}

function cloneLog(log) {
  return log.map((entry) => ({ ...entry }));
}

function attachBoardFen(board, fen) {
  if (!fen) return board;
  Object.defineProperty(board, "_fen", {
    value: fen,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return board;
}

function cloneOnlineBoard(room) {
  return attachBoardFen(cloneBoard(room.board), room.fen);
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
  state.captureHint = false;
  state.chainFrom = clonePoint(snapshot.chainFrom);
  state.lastMove = snapshot.lastMove.map(clonePoint);
  state.positionHistory = [...(snapshot.positionHistory || [positionKey()])];
  state.draw = Boolean(snapshot.draw);
  state.twoKingsVsOneHalfMoves = snapshot.twoKingsVsOneHalfMoves || 0;
  state.pendingPromotionMoves = null;
  state.log = cloneLog(snapshot.log);
  state.animation = null;
  promotionOverlay.hidden = true;
}

function coord({ row, col }) {
  return `${String.fromCharCode(97 + col)}${SIZE - row}`;
}

function squareKey({ row, col }) {
  return `${row},${col}`;
}

function positionKey(board = state.board, turn = state.turn, chainFrom = state.chainFrom) {
  return engine.positionKey(board, turn, chainFrom);
}

function recordCurrentPosition() {
  engine.recordCurrentPosition(state);
}

function canPromote(piece, move) {
  if (gameUi.canPromote) return gameUi.canPromote(piece, move);
  const crownRow = piece.color === WHITE ? 0 : SIZE - 1;
  return !piece.king && move.to.row === crownRow;
}

function getCapturedPieces(move) {
  return move.captures.map((capture) => ({
    ...capture,
    piece: state.board[capture.row][capture.col] ? { ...state.board[capture.row][capture.col] } : null,
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
  state.captureHint = false;

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
    notation: move.san,
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
  if (state.pendingPromotionMoves) return;
  if (state.busy || isComputerTurn()) return;
  if (state.mode === "online" && !isOnlineTurn()) return;
  const piece = state.board[row][col];
  const landingMoves = state.legalMoves.filter((move) => move.to.row === row && move.to.col === col);
  if (landingMoves.length) {
    state.captureHint = false;
    if (landingMoves.length > 1 && landingMoves.every((move) => move.promotion)) {
      openPromotionOverlay(landingMoves);
      return;
    }
    makeMove(landingMoves[0]);
    return;
  }

  const allMoves = getAllMoves(state.board, state.turn, state.chainFrom);
  const forcedCapture = hasForcedCaptureRule() && allMoves.some((move) => move.captures.length);
  if (!piece || piece.color !== state.turn) return;
  if (state.chainFrom && !sameSquare(state.chainFrom, { row, col })) {
    state.captureHint = true;
    render("mustContinue", { color: colorName(state.turn) });
    return;
  }

  const pieceMoves = allMoves.filter((move) => move.from.row === row && move.from.col === col);
  if (!pieceMoves.length) {
    if (forcedCapture) {
      state.captureHint = true;
      render("captureRequired");
    }
    return;
  }

  state.captureHint = false;
  state.selected = { row, col };
  state.legalMoves = pieceMoves;
  render(hasForcedCaptureRule() && pieceMoves[0].captures.length ? "captureRequired" : "chooseLanding");
}

function isComputerTurn() {
  return state.mode === "computer" && state.turn === computerColor();
}

function hasForcedCaptureRule() {
  return Boolean(gameUi.forcedCapture);
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
    setOnlineStatus("onlineServerMissing");
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
    socket.send(JSON.stringify({ type: action, roomId: normalizedRoomId, preferredColor: sideSelect.value, gameId: state.gameId }));
  });

  socket.addEventListener("message", (event) => {
    if (state.online.socket !== socket) return;
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      applyOnlineState(message.room, message.color);
    } else if (message.type === "error") {
      const status = getOnlineStatusFromMessage(message);
      setOnlineStatus(status.key, status.params);
    } else if (message.type === "notice") {
      const status = getOnlineStatusFromMessage(message);
      if (message.closeReason) state.online.closeReason = status;
      setOnlineStatus(status.key, status.params);
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
        setOnlineStatus(state.online.closeReason.key, state.online.closeReason.params);
        state.online.closeReason = null;
      } else if (state.online.statusKey === "onlineServerUnavailable") {
        setOnlineStatus("onlineServerUnavailable");
      } else {
        setOnlineStatus("onlineDisconnected");
      }
    }
  });

  socket.addEventListener("error", () => {
    if (state.online.socket !== socket) return;
    setOnlineStatus("onlineServerUnavailable");
  });
}

function applyOnlineState(room, color) {
  let switchedGame = false;
  if (!room.gameId && state.gameId !== window.DEFAULT_GAME_ID) {
    setOnlineStatus("onlineServerUnavailable");
    closeOnlineSocket();
    return;
  }
  if (room.gameId && room.gameId !== state.gameId) {
    setActiveGame(room.gameId, { reset: false, persist: true, closeOnline: false });
    state.mode = "online";
    modeSelect.value = "online";
    switchedGame = true;
  }
  const previousBoard = switchedGame ? cloneOnlineBoard(room) : cloneBoard(state.board);
  const hadMove = room.lastMove?.length;
  const previousLastMove = state.lastMove.map(clonePoint);
  state.online.connected = true;
  state.online.ready = room.players.length > 1;
  state.online.roomId = room.id;
  state.playerColor = color;
  sideSelect.value = color;
  state.flipped = color === BLACK;
  state.board = cloneOnlineBoard(room);
  state.turn = room.turn;
  state.chainFrom = clonePoint(room.chainFrom);
  state.lastMove = (room.lastMove || []).map(clonePoint);
  state.log = cloneLog(room.log || []);
  state.draw = Boolean(room.draw);
  state.twoKingsVsOneHalfMoves = room.twoKingsVsOneHalfMoves || 0;
  state.selected = null;
  state.legalMoves = [];
  state.captureHint = false;
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
    setOnlineStatus("onlineNotConnected");
    return;
  }
  socket.send(JSON.stringify({ type: "move", move }));
}

function sendRematchVote(accept) {
  const socket = state.online.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setOnlineStatus("onlineNotConnected");
    return;
  }
  state.online.rematchChoice = accept ? "yes" : "no";
  setOnlineStatus(accept ? "rematchWaiting" : "rematchDeclinedByYou");
  socket.send(JSON.stringify({ type: "rematch", accept }));
  render();
}

function chooseComputerMove() {
  return engine.chooseComputerMove(state);
}

function getWinner(pieceCounts = getPieceCounts()) {
  return engine.getWinner(state.board, state.turn, state.chainFrom, state.draw, pieceCounts);
}

function getPieceCounts(board = state.board) {
  return engine.getPieceCounts(board);
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
  resultScore.textContent = t("finalScore", Object.fromEntries(
    Object.entries(gameScoreKeys).map(([param, side]) => [param, pieceCounts[side] || 0]),
  ));
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
    setOnlineStatus("roomCodeRequired");
    return;
  }
  state.online.pendingJoinRoomId = normalizedRoomId;
  roomCodeInput.value = normalizedRoomId;
  colorChoiceOverlay.hidden = false;
}

function closeColorChoiceOverlay() {
  colorChoiceOverlay.hidden = true;
}

function getPromotionLabel(move) {
  return {
    q: "promotionQueen",
    r: "promotionRook",
    b: "promotionBishop",
    n: "promotionKnight",
  }[move.promotion] || "promotionQueen";
}

function getPromotionMarkup(move) {
  const color = state.board[move.from.row]?.[move.from.col]?.color || state.turn;
  return gameUi.getPieceMarkup ? gameUi.getPieceMarkup({ color, type: move.promotion }) : "";
}

function openPromotionOverlay(moves) {
  const promotionOrder = ["q", "r", "b", "n"];
  state.pendingPromotionMoves = moves
    .map(cloneMove)
    .sort((a, b) => promotionOrder.indexOf(a.promotion) - promotionOrder.indexOf(b.promotion));
  const fragment = document.createDocumentFragment();
  for (const move of state.pendingPromotionMoves) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "promotion-choice";
    button.dataset.promotion = move.promotion;
    button.setAttribute("aria-label", t(getPromotionLabel(move)));
    button.innerHTML = `<span class="promotion-piece" aria-hidden="true">${getPromotionMarkup(move)}</span><small>${t(getPromotionLabel(move))}</small>`;
    fragment.append(button);
  }
  promotionChoices.replaceChildren(fragment);
  promotionOverlay.hidden = false;
}

function closePromotionOverlay() {
  state.pendingPromotionMoves = null;
  promotionOverlay.hidden = true;
  promotionChoices.replaceChildren();
}

function chooseOnlineColor(color) {
  const roomId = state.online.pendingJoinRoomId;
  if (!roomId) {
    closeColorChoiceOverlay();
    setOnlineStatus("roomCodeRequired");
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
  syncModeOptions();
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
  const forcedCapture = hasForcedCaptureRule() && moves.some((move) => move.captures.length);
  const checkedKingSquare = winner || draw ? null : getCheckedKingSquare();
  const selectedMoves = state.selected
    ? moves.filter((move) => sameSquare(move.from, state.selected))
    : state.legalMoves;
  const lastMoveSquares = new Set(state.lastMove.map(squareKey));
  const legalLandingSquares = new Set(selectedMoves.map((move) => squareKey(move.to)));
  const movableSquares = new Set(moves.map((move) => squareKey(move.from)));
  const capturedBySquare = new Map((state.animation?.captures || []).map((capture) => [squareKey(capture), capture]));

  const rows = [...Array(getBoardSize()).keys()];
  const cols = [...Array(getBoardSize()).keys()];
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
      square.className = `square ${isDarkSquare(row, col) ? "dark" : "light"}`;
      square.tabIndex = -1;
      square.setAttribute("role", "gridcell");
      square.setAttribute("aria-label", `${coord({ row, col })}`);
      square.dataset.row = row;
      square.dataset.col = col;

      if (lastMoveSquares.has(key)) square.classList.add("last");
      if (sameSquare(checkedKingSquare, { row, col })) square.classList.add("in-check");
      if (sameSquare(state.selected, { row, col })) square.classList.add("selected");
      if (legalLandingSquares.has(key)) square.classList.add("legal");
      if (state.captureHint && forcedCapture && movableSquares.has(key)) square.classList.add("capture-source");

      const piece = state.board[row][col];
      if (piece) {
        const pieceEl = createPieceElement(piece);
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
        const capturedEl = createPieceElement(captured.piece, ["capture-animate"]);
        square.append(capturedEl);
      }

      square.addEventListener("mousedown", (event) => event.preventDefault());
      square.addEventListener("click", () => handleSquareClick(row, col));
      boardFragment.append(square);
    }
  }
  boardEl.append(boardFragment);

  whiteCount.textContent = pieceCounts[gameScoreKeys.white || WHITE] || 0;
  blackCount.textContent = pieceCounts[gameScoreKeys.black || BLACK] || 0;
  undoBtn.disabled = state.mode === "online" || !state.history.length;
  copyRoomBtn.disabled = !state.online.roomId;
  shareRoomBtn.disabled = !state.online.roomId;
  turnPill.className = `turn-pill ${getTurnClass(state.turn)}`;
  turnPill.textContent = t("turn", { color: colorName(state.turn) });

  if (draw) {
    statusText.textContent = t("draw");
    hintText.textContent = t("drawHint");
  } else if (winner) {
    statusText.textContent = t("winner", { color: colorName(winner) });
    hintText.textContent = t("winnerHint");
  } else {
    const checkedKingPiece = checkedKingSquare ? state.board[checkedKingSquare.row]?.[checkedKingSquare.col] : null;
    statusText.textContent =
      (messageKey ? t(messageKey, messageParams) : "") ||
      (checkedKingPiece ? t("checkWarning", { color: colorName(checkedKingPiece.color) }) : "") ||
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
    item.textContent = entry.notation
      ? `${colorName(entry.color)} ${entry.notation}${entry.continues ? " +" : ""}`
      : t("moveLogEntry", {
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
  onlineStatus.className = `online-status ${getOnlineStatusType(state.online.statusKey)}`;

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
  const nextMode = normalizeModeForGame(modeSelect.value);
  modeSelect.value = nextMode;
  if (nextMode !== "online") clearRoomFromUrl();
  if (state.mode === "online" && nextMode !== "online") closeOnlineSocket();
  state.mode = nextMode;
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
gameSelectBtn.addEventListener("click", () => {
  unlockAudio();
  openGameSelection();
});
closeGameSelectBtn.addEventListener("click", () => {
  unlockAudio();
  closeGameSelection();
});
gameChoiceList.addEventListener("click", (event) => {
  const choice = event.target.closest(".game-choice");
  if (!choice || choice.disabled) return;
  unlockAudio();
  setActiveGame(choice.dataset.gameId);
  closeGameSelection();
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
promotionChoices.addEventListener("click", (event) => {
  const choice = event.target.closest(".promotion-choice");
  if (!choice || !state.pendingPromotionMoves) return;
  unlockAudio();
  const move = state.pendingPromotionMoves.find((candidate) => candidate.promotion === choice.dataset.promotion);
  if (!move) return;
  closePromotionOverlay();
  makeMove(move);
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
    setOnlineStatus("roomCodeRequired");
    return;
  }
  roomCodeInput.value = roomId;
  setOnlineStatus("onlineChooseSide");
  openColorChoiceOverlay(roomId);
});
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = normalizeRoomId(roomCodeInput.value);
});

applyPreferences();
initializeGame();
