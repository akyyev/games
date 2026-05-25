(function initChessEngine(global) {
  const MATE_SCORE = 100000;
  const SEARCH_DEPTHS = {
    hard: 2,
    "extra-hard": 5,
  };
  const HARD_TIME_MS = 350;
  const EXTRA_HARD_TIME_MS = 900;
  const QUIESCENCE_DEPTH = 4;
  const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0,
  };
  const PIECE_TABLES = {
    p: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5, 5, 10, 25, 25, 10, 5, 5],
      [0, 0, 0, 20, 20, 0, 0, 0],
      [5, -5, -10, 0, 0, -10, -5, 5],
      [5, 10, 10, -20, -20, 10, 10, 5],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    n: [
      [-50, -40, -30, -30, -30, -30, -40, -50],
      [-40, -20, 0, 5, 5, 0, -20, -40],
      [-30, 5, 15, 20, 20, 15, 5, -30],
      [-30, 0, 20, 25, 25, 20, 0, -30],
      [-30, 5, 20, 25, 25, 20, 5, -30],
      [-30, 0, 15, 20, 20, 15, 0, -30],
      [-40, -20, 0, 0, 0, 0, -20, -40],
      [-50, -40, -30, -30, -30, -30, -40, -50],
    ],
    b: [
      [-20, -10, -10, -10, -10, -10, -10, -20],
      [-10, 5, 0, 0, 0, 0, 5, -10],
      [-10, 10, 10, 10, 10, 10, 10, -10],
      [-10, 0, 10, 15, 15, 10, 0, -10],
      [-10, 5, 5, 15, 15, 5, 5, -10],
      [-10, 0, 5, 10, 10, 5, 0, -10],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-20, -10, -10, -10, -10, -10, -10, -20],
    ],
    r: [
      [0, 0, 0, 5, 5, 0, 0, 0],
      [5, 10, 10, 10, 10, 10, 10, 5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [0, 0, 0, 5, 5, 0, 0, 0],
    ],
    q: [
      [-20, -10, -10, -5, -5, -10, -10, -20],
      [-10, 0, 5, 0, 0, 0, 0, -10],
      [-10, 5, 5, 5, 5, 5, 0, -10],
      [0, 0, 5, 5, 5, 5, 0, -5],
      [-5, 0, 5, 5, 5, 5, 0, -5],
      [-10, 0, 5, 5, 5, 5, 0, -10],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-20, -10, -10, -5, -5, -10, -10, -20],
    ],
    k: [
      [20, 30, 10, 0, 0, 10, 30, 20],
      [20, 20, 0, 0, 0, 0, 20, 20],
      [-10, -20, -20, -20, -20, -20, -20, -10],
      [-20, -30, -30, -40, -40, -30, -30, -20],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
    ],
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

    function now() {
      return global.performance?.now ? global.performance.now() : Date.now();
    }

    function isTimedOut(context) {
      if (!context?.deadline) return false;
      if (now() <= context.deadline) return false;
      context.timedOut = true;
      return true;
    }

    function pieceSquareValue(piece, row, col) {
      const table = PIECE_TABLES[piece.type];
      if (!table) return 0;
      const tableRow = piece.color === WHITE ? row : rules.SIZE - 1 - row;
      return table[tableRow][col] || 0;
    }

    function evaluateBoard(board, perspective) {
      let score = 0;
      for (let row = 0; row < rules.SIZE; row += 1) {
        for (let col = 0; col < rules.SIZE; col += 1) {
          const piece = board[row][col];
          if (!piece) continue;
          const value = PIECE_VALUES[piece.type] || 0;
          const placement = pieceSquareValue(piece, row, col);
          score += (piece.color === perspective ? 1 : -1) * (value + placement);
        }
      }
      return score;
    }

    function moveAttacksSquare(board, move, square) {
      return move.to.row === square.row && move.to.col === square.col;
    }

    function movedPieceHangingPenalty(board, move, color) {
      const movedPieceValue = PIECE_VALUES[move.promotion || move.pieceType] || 0;
      if (!movedPieceValue) return 0;

      const replies = rules.getAllMoves(board, rules.opponent(color));
      const canCaptureMovedPiece = replies.some((reply) => moveAttacksSquare(board, reply, move.to));
      return canCaptureMovedPiece ? movedPieceValue * 1.15 : 0;
    }

    function evaluateMove(board, move, color) {
      const next = rules.applyMove(board, move);
      const capture = move.capturedType ? (PIECE_VALUES[move.capturedType] || 0) * 1.4 : 0;
      const promotion = move.promotion ? PIECE_VALUES[move.promotion] || PIECE_VALUES.q : 0;
      const hangingPenalty = movedPieceHangingPenalty(next, move, color);
      return evaluateBoard(next, color) + capture + promotion - hangingPenalty;
    }

    function chooseByHeuristic(board, moves, color) {
      let bestScore = -Infinity;
      let best = [];
      for (const move of moves) {
        const score = evaluateMove(board, move, color);
        if (score > bestScore) {
          bestScore = score;
          best = [move];
        } else if (score === bestScore) {
          best.push(move);
        }
      }
      return randomMove(best);
    }

    function isDrawish(chess) {
      return (
        chess.isDraw() ||
        chess.isStalemate() ||
        chess.isThreefoldRepetition() ||
        chess.isInsufficientMaterial()
      );
    }

    function terminalScore(board, color, depth, perspective) {
      const chess = getChess(board);
      if (chess.isCheckmate()) {
        const winner = rules.opponent(color);
        return winner === perspective ? MATE_SCORE + depth : -MATE_SCORE - depth;
      }
      if (isDrawish(chess)) return 0;
      return null;
    }

    function searchCacheKey(board, color, depth, perspective) {
      return `${depth}|${perspective}|${color}|${board._fen}`;
    }

    function moveGivesCheck(board, move) {
      return getChess(rules.applyMove(board, move)).isCheck();
    }

    function moveOrderScore(board, move) {
      let score = 0;
      if (move.capturedType) {
        score += (PIECE_VALUES[move.capturedType] || 0) * 10 - (PIECE_VALUES[move.pieceType] || 0);
      }
      if (move.promotion) score += PIECE_VALUES[move.promotion] || PIECE_VALUES.q;
      const next = rules.applyMove(board, move);
      const chess = getChess(next);
      if (chess.isCheckmate()) score += MATE_SCORE;
      else if (chess.isCheck()) score += 75;
      return score;
    }

    function orderMoves(board, moves) {
      return moves
        .map((move) => ({ move, score: moveOrderScore(board, move) }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.move);
    }

    function getQuiescenceMoves(board, color) {
      const moves = rules.getAllMoves(board, color);
      if (getChess(board).isCheck()) return moves;
      return moves.filter((move) => move.capturedType || move.promotion || moveGivesCheck(board, move));
    }

    function quiescence(board, color, alpha, beta, perspective, cache, depth, context) {
      if (isTimedOut(context)) return evaluateBoard(board, perspective);

      const terminal = terminalScore(board, color, depth, perspective);
      if (terminal !== null) return terminal;

      const inCheck = getChess(board).isCheck();
      const standingPat = evaluateBoard(board, perspective);
      if (depth === 0 && !inCheck) return standingPat;
      if (depth === 0 && inCheck) return color === perspective ? -MATE_SCORE : MATE_SCORE;

      const quiescenceMoves = orderMoves(board, getQuiescenceMoves(board, color));
      if (inCheck && !quiescenceMoves.length) {
        return color === perspective ? -MATE_SCORE - depth : MATE_SCORE + depth;
      }

      if (color === perspective) {
        let value = inCheck ? -Infinity : standingPat;
        if (!inCheck) {
          if (value >= beta) return value;
          alpha = Math.max(alpha, value);
        }
        for (const move of quiescenceMoves) {
          value = Math.max(value, quiescence(rules.applyMove(board, move), rules.opponent(color), alpha, beta, perspective, cache, depth - 1, context));
          alpha = Math.max(alpha, value);
          if (alpha >= beta || context?.timedOut) break;
        }
        return value;
      }

      let value = inCheck ? Infinity : standingPat;
      if (!inCheck) {
        if (value <= alpha) return value;
        beta = Math.min(beta, value);
      }
      for (const move of quiescenceMoves) {
        value = Math.min(value, quiescence(rules.applyMove(board, move), rules.opponent(color), alpha, beta, perspective, cache, depth - 1, context));
        beta = Math.min(beta, value);
        if (alpha >= beta || context?.timedOut) break;
      }
      return value;
    }

    function minimax(board, color, depth, alpha, beta, perspective, cache, context = null) {
      if (isTimedOut(context)) return evaluateBoard(board, perspective);
      const cacheKey = searchCacheKey(board, color, depth, perspective);
      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;

      const terminal = terminalScore(board, color, depth, perspective);
      if (terminal !== null) {
        if (!context?.timedOut) cache.set(cacheKey, terminal);
        return terminal;
      }
      if (depth === 0) {
        return quiescence(board, color, alpha, beta, perspective, cache, QUIESCENCE_DEPTH, context);
      }

      const moves = rules.getAllMoves(board, color);
      if (!moves.length) return 0;
      const orderedMoves = orderMoves(board, moves);
      const nextColor = rules.opponent(color);

      if (color === perspective) {
        let value = -Infinity;
        let searchedEveryMove = true;
        for (const move of orderedMoves) {
          value = Math.max(value, minimax(rules.applyMove(board, move), nextColor, depth - 1, alpha, beta, perspective, cache, context));
          alpha = Math.max(alpha, value);
          if (alpha >= beta || context?.timedOut) {
            searchedEveryMove = false;
            break;
          }
        }
        if (searchedEveryMove && !context?.timedOut) cache.set(cacheKey, value);
        return value;
      }

      let value = Infinity;
      let searchedEveryMove = true;
      for (const move of orderedMoves) {
        value = Math.min(value, minimax(rules.applyMove(board, move), nextColor, depth - 1, alpha, beta, perspective, cache, context));
        beta = Math.min(beta, value);
        if (alpha >= beta || context?.timedOut) {
          searchedEveryMove = false;
          break;
        }
      }
      if (searchedEveryMove && !context?.timedOut) cache.set(cacheKey, value);
      return value;
    }

    function chooseSearchMove(board, moves, depth, color, context = null) {
      const cache = new Map();
      let bestScore = -Infinity;
      let best = [];
      for (const move of orderMoves(board, moves)) {
        const next = rules.applyMove(board, move);
        const score = minimax(next, rules.opponent(color), depth - 1, -Infinity, Infinity, color, cache, context);
        if (context?.timedOut) break;
        if (score > bestScore) {
          bestScore = score;
          best = [move];
        } else if (score === bestScore) {
          best.push(move);
        }
      }
      return { move: best.length ? randomMove(best) : null, score: bestScore, timedOut: Boolean(context?.timedOut) };
    }

    function chooseTimedSearchMove(board, moves, maxDepth, color, timeMs) {
      const immediateMates = moves.filter((move) => getChess(rules.applyMove(board, move)).isCheckmate());
      if (immediateMates.length) return randomMove(immediateMates);

      let bestMove = chooseByHeuristic(board, moves, color);
      const context = { deadline: now() + timeMs, timedOut: false };
      for (let depth = 1; depth <= maxDepth; depth += 1) {
        const result = chooseSearchMove(board, moves, depth, color, context);
        if (result.move && !result.timedOut) bestMove = result.move;
        if (result.score >= MATE_SCORE - maxDepth) return bestMove;
        if (context.timedOut) break;
      }
      return bestMove;
    }

    function chooseComputerMove(state) {
      const moves = rules.getAllMoves(state.board, state.turn, state.chainFrom);
      if (!moves.length) return null;
      if (state.level === "easy") return randomMove(moves);
      if (state.level === "medium") return chooseByHeuristic(state.board, moves, state.turn);
      if (state.level === "extra-hard") {
        return chooseTimedSearchMove(state.board, moves, SEARCH_DEPTHS["extra-hard"], state.turn, EXTRA_HARD_TIME_MS);
      }
      return chooseTimedSearchMove(state.board, moves, SEARCH_DEPTHS.hard, state.turn, HARD_TIME_MS);
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
