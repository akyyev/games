window.GAMES = {
  checkers: {
    id: "checkers",
    titleKey: "gameCheckersTitle",
    headingKey: "title",
    eyebrowKey: "eyebrow",
    sides: [
      { id: "white", labelKey: "white", sideLabelKey: "sideWhite", cssClass: "white" },
      { id: "black", labelKey: "black", sideLabelKey: "sideBlack", cssClass: "black" },
    ],
    scoreKeys: {
      white: "white",
      black: "black",
    },
    rulesKeys: ["ruleMenMove", "ruleMenCapture", "ruleChains", "ruleCrown", "ruleKings", "ruleDraws"],
    rules: window.CheckersRules,
    engine: window.CheckersEngine,
    ui: {
      boardSize: 8,
      modeSupport: {
        human: true,
        computer: true,
        online: true,
      },
      isDarkSquare(row, col) {
        return window.CheckersRules.isDark(row, col);
      },
      getPieceClasses(piece) {
        return ["piece", piece.color, piece.king ? "king" : ""].filter(Boolean);
      },
      getTurnClass(color) {
        return color;
      },
    },
  },
  chess: {
    id: "chess",
    titleKey: "chessTitle",
    headingKey: "chessTitle",
    eyebrowKey: "chessEyebrow",
    sides: [
      { id: "white", labelKey: "white", sideLabelKey: "sideWhite", cssClass: "white" },
      { id: "black", labelKey: "black", sideLabelKey: "sideBlack", cssClass: "black" },
    ],
    scoreKeys: {
      white: "white",
      black: "black",
    },
    rulesKeys: ["chessRuleMove", "chessRuleCheck", "chessRuleCastle", "chessRulePromotion", "chessRuleDraws"],
    rules: window.ChessRules,
    engine: window.ChessEngine,
    ui: {
      boardSize: 8,
      modeSupport: {
        human: true,
        computer: true,
        online: false,
      },
      isDarkSquare(row, col) {
        return window.ChessRules.isDark(row, col);
      },
      getPieceClasses(piece) {
        return ["chess-piece", piece.color, `piece-${piece.type}`];
      },
      getPieceText(piece) {
        const symbols = {
          white: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
          black: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
        };
        return symbols[piece.color]?.[piece.type] || "";
      },
      getTurnClass(color) {
        return color;
      },
      canPromote(piece, move) {
        return Boolean(move.promotion);
      },
      getCheckedKingSquare(board, turn) {
        return window.ChessRules.isCheck(board) ? window.ChessRules.findKing(board, turn) : null;
      },
    },
  },
};

window.DEFAULT_GAME_ID = "checkers";
