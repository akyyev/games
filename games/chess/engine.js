(function initChessEngine(global) {
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

    function chooseComputerMove(state) {
      const moves = rules.getAllMoves(state.board, state.turn, state.chainFrom);
      if (!moves.length) return null;
      return moves[Math.floor(Math.random() * moves.length)];
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
