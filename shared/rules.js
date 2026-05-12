(function initRules(global) {
  const SIZE = 8;
  const WHITE = "white";
  const BLACK = "black";
  const directions = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
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

  function cloneBoard(board) {
    return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
  }

  function cloneMove(move) {
    return {
      from: { ...move.from },
      to: { ...move.to },
      captures: move.captures.map((capture) => ({ ...capture })),
    };
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

  function getCaptureMovesForPiece(board, row, col) {
    const piece = board[row][col];
    if (!piece) return [];
    return piece.king
      ? getKingCaptures(board, row, col, piece.color)
      : getManCaptures(board, row, col, piece.color);
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

  function sameSquare(a, b) {
    return a && b && a.row === b.row && a.col === b.col;
  }

  function sameMove(a, b) {
    return sameSquare(a.from, b.from) && sameSquare(a.to, b.to);
  }

  function getWinner(board, turn, chainFrom = null) {
    const pieces = board.flat();
    if (!pieces.some((piece) => piece?.color === WHITE)) return BLACK;
    if (!pieces.some((piece) => piece?.color === BLACK)) return WHITE;
    if (!getAllMoves(board, turn, chainFrom).length) return opponent(turn);
    return null;
  }

  const api = {
    SIZE,
    WHITE,
    BLACK,
    emptyBoard,
    createInitialBoard,
    isDark,
    inside,
    opponent,
    cloneBoard,
    cloneMove,
    getSimpleMoves,
    getCaptureMovesForPiece,
    getAllMoves,
    applyMove,
    sameSquare,
    sameMove,
    getWinner,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.CheckersRules = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
