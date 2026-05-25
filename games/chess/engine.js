(function initChessEngine(global) {
  const PIECE_VALUES = {
    p: 1,
    n: 3,
    b: 3.2,
    r: 5,
    q: 9,
    k: 0,
  };

  function createChessEngine(rules) {
    const { WHITE, BLACK } = rules;

    function getChess(board) {
      return new global.ChessJs.Chess(board._fen);
    }

    function positionKey(board) {
      return board._fen;
    }

    function getPieceCounts(board) {
      const counts = { [WHITE]: 0, [BLACK]: 0 };
      for (const row of board) {
        for (const piece of row) {
          if (piece) counts[piece.color] += 1;
        }
      }
      return counts;
    }

    function recordCurrentPosition(state) {
      const chess = getChess(state.board);
      state.positionHistory.push(positionKey(state.board));
      state.draw = chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition();
    }

    function getWinner(board, turn, chainFrom, draw) {
      if (draw) return null;
      const chess = getChess(board);
      if (!chess.isCheckmate()) return null;
      return turn === WHITE ? BLACK : WHITE;
    }

    function randomMove(moves) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    function evaluateBoard(board, perspective) {
      let score = 0;
      for (let row = 0; row < rules.SIZE; row += 1) {
        for (let col = 0; col < rules.SIZE; col += 1) {
          const piece = board[row][col];
          if (!piece) continue;
          const value = PIECE_VALUES[piece.type] || 0;
          const center = 0.05 * (3.5 - (Math.abs(row - 3.5) + Math.abs(col - 3.5)) / 2);
          score += (piece.color === perspective ? 1 : -1) * (value + center);
        }
      }
      return score;
    }

    function evaluateMove(board, move, color) {
      const next = rules.applyMove(board, move);
      const capture = move.capturedType ? (PIECE_VALUES[move.capturedType] || 0) * 1.4 : 0;
      const promotion = move.promotion ? PIECE_VALUES[move.promotion] || 8 : 0;
      return evaluateBoard(next, color) + capture + promotion;
    }

    function chooseComputerMove(state) {
      const moves = rules.getAllMoves(state.board, state.turn, state.chainFrom);
      if (!moves.length) return null;
      if (state.level === "easy") return randomMove(moves);

      let bestScore = -Infinity;
      let best = [];
      for (const move of moves) {
        const score = evaluateMove(state.board, move, state.turn);
        if (score > bestScore) {
          bestScore = score;
          best = [move];
        } else if (score === bestScore) {
          best.push(move);
        }
      }
      return randomMove(best);
    }

    return {
      positionKey,
      recordCurrentPosition,
      chooseComputerMove,
      getPieceCounts,
      getWinner,
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = createChessEngine;
  } else {
    global.ChessEngine = createChessEngine(global.ChessRules);
  }
})(typeof window !== "undefined" ? window : globalThis);
