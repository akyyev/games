(function initChessRules(global) {
  const SIZE = 8;
  const WHITE = "white";
  const BLACK = "black";
  const FILES = "abcdefgh";
  const CHESS_WHITE = "w";
  const CHESS_BLACK = "b";

  function getChessCtor() {
    const Chess = global.ChessJs?.Chess;
    if (!Chess) throw new Error("chess.js failed to load.");
    return Chess;
  }

  function toChessColor(color) {
    return color === WHITE ? CHESS_WHITE : CHESS_BLACK;
  }

  function fromChessColor(color) {
    return color === CHESS_WHITE ? WHITE : BLACK;
  }

  function squareToPoint(square) {
    const col = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    return { row: SIZE - rank, col };
  }

  function pointToSquare({ row, col }) {
    return `${FILES[col]}${SIZE - row}`;
  }

  function attachFen(board, fen) {
    Object.defineProperty(board, "_fen", {
      value: fen,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    return board;
  }

  function boardFromFen(fen) {
    const Chess = getChessCtor();
    const chess = new Chess(fen);
    const board = chess.board().map((row) =>
      row.map((piece) => piece ? { color: fromChessColor(piece.color), type: piece.type } : null),
    );
    return attachFen(board, chess.fen());
  }

  function createInitialBoard() {
    const Chess = getChessCtor();
    return boardFromFen(new Chess().fen());
  }

  function isDark(row, col) {
    return (row + col) % 2 === 1;
  }

  function opponent(color) {
    return color === WHITE ? BLACK : WHITE;
  }

  function cloneBoard(board) {
    return attachFen(
      board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
      board._fen,
    );
  }

  function cloneMove(move) {
    return {
      ...move,
      from: { ...move.from },
      to: { ...move.to },
      captures: (move.captures || []).map((capture) => ({ ...capture })),
    };
  }

  function moveToAppMove(move) {
    const from = squareToPoint(move.from);
    const to = squareToPoint(move.to);
    const captures = [];
    if (move.captured) {
      captures.push(move.flags.includes("e") ? { row: from.row, col: to.col } : { ...to });
    }
    return {
      from,
      to,
      captures,
      san: move.san,
      lan: move.lan,
      before: move.before,
      after: move.after,
      promotion: move.promotion,
      pieceType: move.piece,
      capturedType: move.captured,
    };
  }

  function getChess(board) {
    const Chess = getChessCtor();
    return new Chess(board._fen);
  }

  function findKing(board, color) {
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const piece = board[row][col];
        if (piece?.type === "k" && piece.color === color) return { row, col };
      }
    }
    return null;
  }

  function isCheck(board) {
    return getChess(board).isCheck();
  }

  function getAllMoves(board, color) {
    const chess = getChess(board);
    if (chess.turn() !== toChessColor(color)) return [];
    return chess.moves({ verbose: true }).map(moveToAppMove);
  }

  function getCaptureMovesForPiece() {
    return [];
  }

  function applyMove(board, move) {
    if (move.after) return boardFromFen(move.after);
    const chess = getChess(board);
    chess.move({ from: pointToSquare(move.from), to: pointToSquare(move.to), promotion: move.promotion || "q" });
    return boardFromFen(chess.fen());
  }

  function sameSquare(a, b) {
    return a && b && a.row === b.row && a.col === b.col;
  }

  const api = {
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
    pointToSquare,
    squareToPoint,
    findKing,
    isCheck,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.ChessRules = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
