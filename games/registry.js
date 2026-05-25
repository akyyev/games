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
      forcedCapture: true,
      previewPieces: [
        { row: 0, col: 1, piece: { color: "black" } },
        { row: 1, col: 0, piece: { color: "black" } },
        { row: 2, col: 3, piece: { color: "white", king: true } },
        { row: 3, col: 2, piece: { color: "white" } },
      ],
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
    engine: window.createStockfishAdapter
      ? window.createStockfishAdapter(window.ChessRules, window.ChessEngine)
      : window.ChessEngine,
    ui: {
      boardSize: 8,
      previewPieces: [
        { row: 0, col: 0, piece: { color: "black", type: "r" } },
        { row: 0, col: 2, piece: { color: "black", type: "k" } },
        { row: 2, col: 1, piece: { color: "white", type: "n" } },
        { row: 3, col: 3, piece: { color: "white", type: "q" } },
      ],
      modeSupport: {
        human: true,
        computer: true,
        online: true,
      },
      isDarkSquare(row, col) {
        return window.ChessRules.isDark(row, col);
      },
      getPieceClasses(piece) {
        return ["chess-piece", piece.color, `piece-${piece.type}`];
      },
      getPieceMarkup(piece) {
        return window.ChessPieceSvgs?.[piece.color]?.[piece.type] || "";
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
