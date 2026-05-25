(function initCheckersEngine(global) {
  const WIN_SCORE = 10000;
  const SEARCH_DEPTHS = {
    hard: 4,
    "extra-hard": 7,
  };

  function createCheckersEngine(rules) {
    const { SIZE, WHITE, BLACK } = rules;

    function positionKey(board, turn, chainFrom = null) {
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

    function countPositionOccurrences(positionHistory, key) {
      return positionHistory.filter((position) => position === key).length;
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

    function getKingCounts(board) {
      const counts = { [WHITE]: 0, [BLACK]: 0 };
      for (const row of board) {
        for (const piece of row) {
          if (piece?.king) counts[piece.color] += 1;
        }
      }
      return counts;
    }

    function isTwoKingsVsOneKingEndgame(board) {
      const pieceCounts = getPieceCounts(board);
      if (pieceCounts[WHITE] + pieceCounts[BLACK] !== 3) return false;
      const kingCounts = getKingCounts(board);
      return (
        pieceCounts[WHITE] === kingCounts[WHITE] &&
        pieceCounts[BLACK] === kingCounts[BLACK] &&
        ((kingCounts[WHITE] === 2 && kingCounts[BLACK] === 1) ||
          (kingCounts[WHITE] === 1 && kingCounts[BLACK] === 2))
      );
    }

    function hasInsufficientWinningMaterial(board, turn, chainFrom) {
      const pieces = board.flat().filter(Boolean);
      if (pieces.length !== 2 || pieces.some((piece) => !piece.king)) return false;
      const colors = new Set(pieces.map((piece) => piece.color));
      return colors.size === 2 && !rules.getAllMoves(board, turn, chainFrom).some((move) => move.captures.length);
    }

    function updateTwoKingsVsOneCounter(state) {
      if (isTwoKingsVsOneKingEndgame(state.board)) {
        state.twoKingsVsOneHalfMoves += 1;
      } else {
        state.twoKingsVsOneHalfMoves = 0;
      }
    }

    function recordCurrentPosition(state) {
      const key = positionKey(state.board, state.turn, state.chainFrom);
      state.positionHistory.push(key);
      updateTwoKingsVsOneCounter(state);
      if (
        countPositionOccurrences(state.positionHistory, key) >= 3 ||
        hasInsufficientWinningMaterial(state.board, state.turn, state.chainFrom) ||
        state.twoKingsVsOneHalfMoves >= 20
      ) {
        state.draw = true;
      }
    }

    function randomMove(moves) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    function preferFreshPositions(state, moves, color) {
      const fresh = moves.filter((move) => {
        const next = rules.applyMove(state.board, move);
        const chain = move.captures.length ? rules.getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
        const nextTurn = chain.length ? color : rules.opponent(color);
        const nextChainFrom = chain.length ? move.to : null;
        return countPositionOccurrences(state.positionHistory, positionKey(next, nextTurn, nextChainFrom)) === 0;
      });
      return fresh.length ? fresh : moves;
    }

    function evaluateBoard(board, perspective = BLACK) {
      let score = 0;
      let ownKings = 0;
      let opponentKings = 0;
      let ownBackRank = 0;
      let opponentBackRank = 0;
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          const piece = board[row][col];
          if (!piece) continue;
          const isOwnPiece = piece.color === perspective;
          const value = piece.king ? 7.4 : 3 + (piece.color === BLACK ? row : SIZE - 1 - row) * 0.14;
          const center = 0.08 * (3.5 - (Math.abs(row - 3.5) + Math.abs(col - 3.5)) / 2);
          const backRank = piece.color === WHITE ? SIZE - 1 : 0;
          if (piece.king) {
            if (isOwnPiece) ownKings += 1;
            else opponentKings += 1;
          }
          if (!piece.king && row === backRank) {
            if (isOwnPiece) ownBackRank += 1;
            else opponentBackRank += 1;
          }
          score += (isOwnPiece ? 1 : -1) * (value + center);
        }
      }
      const kingPressure = ownKings - opponentKings;
      const backRankGuard = ownBackRank - opponentBackRank;
      return score + kingPressure * 0.25 + backRankGuard * 0.08;
    }

    function evaluateMove(previous, next, move, color) {
      const piece = previous[move.from.row][move.from.col];
      const promotion = !piece.king && (move.to.row === 0 || move.to.row === SIZE - 1) ? 3 : 0;
      const center = 3.5 - (Math.abs(move.to.row - 3.5) + Math.abs(move.to.col - 3.5)) / 2;
      return evaluateBoard(next, color) + move.captures.length * 7 + promotion + center;
    }

    function chooseByHeuristic(board, moves, color) {
      let bestScore = -Infinity;
      let best = [];
      for (const move of moves) {
        const next = rules.applyMove(board, move);
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

    function searchCacheKey(board, color, depth, chainFrom, perspective) {
      return `${depth}|${perspective}|${positionKey(board, color, chainFrom)}`;
    }

    function orderMoves(board, moves, color) {
      return [...moves].sort((a, b) => {
        const nextA = rules.applyMove(board, a);
        const nextB = rules.applyMove(board, b);
        return evaluateMove(board, nextB, b, color) - evaluateMove(board, nextA, a, color);
      });
    }

    function getMaterialWinner(board) {
      const pieces = board.flat();
      if (!pieces.some((piece) => piece?.color === WHITE)) return BLACK;
      if (!pieces.some((piece) => piece?.color === BLACK)) return WHITE;
      return null;
    }

    function minimax(board, color, depth, alpha, beta, chainFrom, perspective = BLACK, cache = new Map()) {
      const cacheKey = searchCacheKey(board, color, depth, chainFrom, perspective);
      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;

      const winner = getMaterialWinner(board);
      if (winner) {
        const score = winner === perspective ? WIN_SCORE + depth : -WIN_SCORE - depth;
        cache.set(cacheKey, score);
        return score;
      }

      const moves = rules.getAllMoves(board, color, chainFrom);
      if (!moves.length) {
        const score = rules.opponent(color) === perspective ? WIN_SCORE + depth : -WIN_SCORE - depth;
        cache.set(cacheKey, score);
        return score;
      }
      if (depth === 0) {
        const score = evaluateBoard(board, perspective);
        cache.set(cacheKey, score);
        return score;
      }
      const orderedMoves = orderMoves(board, moves, perspective);

      if (color === perspective) {
        let value = -Infinity;
        let searchedEveryMove = true;
        for (const move of orderedMoves) {
          const next = rules.applyMove(board, move);
          const chain = move.captures.length ? rules.getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
          value = Math.max(
            value,
            minimax(next, chain.length ? color : rules.opponent(color), depth - 1, alpha, beta, chain.length ? move.to : null, perspective, cache),
          );
          alpha = Math.max(alpha, value);
          if (alpha >= beta) {
            searchedEveryMove = false;
            break;
          }
        }
        if (searchedEveryMove) cache.set(cacheKey, value);
        return value;
      }

      let value = Infinity;
      let searchedEveryMove = true;
      for (const move of orderedMoves) {
        const next = rules.applyMove(board, move);
        const chain = move.captures.length ? rules.getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
        value = Math.min(
          value,
          minimax(next, chain.length ? color : rules.opponent(color), depth - 1, alpha, beta, chain.length ? move.to : null, perspective, cache),
        );
        beta = Math.min(beta, value);
        if (alpha >= beta) {
          searchedEveryMove = false;
          break;
        }
      }
      if (searchedEveryMove) cache.set(cacheKey, value);
      return value;
    }

    function chooseSearchMove(board, moves, depth, color) {
      let bestScore = -Infinity;
      let best = [];
      const cache = new Map();
      for (const move of orderMoves(board, moves, color)) {
        const next = rules.applyMove(board, move);
        const chain = move.captures.length ? rules.getCaptureMovesForPiece(next, move.to.row, move.to.col) : [];
        const nextTurn = chain.length ? color : rules.opponent(color);
        const score = minimax(next, nextTurn, depth - 1, -Infinity, Infinity, chain.length ? move.to : null, color, cache);
        if (score > bestScore) {
          bestScore = score;
          best = [move];
        } else if (score === bestScore) {
          best.push(move);
        }
      }
      return randomMove(best);
    }

    function chooseComputerMove(state) {
      const color = rules.opponent(state.playerColor);
      const moves = rules.getAllMoves(state.board, color, state.chainFrom);
      if (!moves.length) return null;
      const candidates = preferFreshPositions(state, moves, color);
      if (state.level === "easy") return randomMove(candidates);
      if (state.level === "medium") return chooseByHeuristic(state.board, candidates, color);
      return chooseSearchMove(state.board, candidates, SEARCH_DEPTHS[state.level] || SEARCH_DEPTHS.hard, color);
    }

    function getWinner(board, turn, chainFrom, draw = false, pieceCounts = getPieceCounts(board)) {
      if (draw) return null;
      if (!pieceCounts[WHITE]) return BLACK;
      if (!pieceCounts[BLACK]) return WHITE;
      if (!rules.getAllMoves(board, turn, chainFrom).length) return rules.opponent(turn);
      return null;
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
    module.exports = { createCheckersEngine };
  } else {
    global.CheckersEngine = createCheckersEngine(global.CheckersRules);
  }
})(typeof window !== "undefined" ? window : globalThis);
