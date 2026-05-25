(function initStockfishAdapter(global) {
  const ENGINE_PATH = "./vendor/stockfish/stockfish.js";
  const LEVELS = {
    easy: { skill: 0, elo: 1320, movetime: 80 },
    medium: { skill: 4, elo: 1550, movetime: 140 },
    hard: { skill: 9, elo: 1850, movetime: 260 },
    "extra-hard": { skill: 15, elo: 2200, movetime: 650 },
  };

  function createStockfishAdapter(rules, fallbackEngine) {
    let worker = null;
    let readyPromise = null;
    let pending = null;

    function createWorker() {
      if (worker) return worker;
      if (!global.Worker) throw new Error("Web Workers are not available.");
      worker = new Worker(ENGINE_PATH);
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", () => {
        rejectPending(new Error("Stockfish failed to load."));
        stopWorker();
      });
      return worker;
    }

    function handleMessage(event) {
      const line = String(event.data || "");
      if (pending?.type === "ready" && line === "readyok") {
        const resolve = pending.resolve;
        pending = null;
        resolve();
        return;
      }
      if (pending?.type === "bestmove" && line.startsWith("bestmove ")) {
        const resolve = pending.resolve;
        pending = null;
        resolve(line.split(/\s+/)[1] || "");
      }
    }

    function rejectPending(error) {
      if (!pending) return;
      const reject = pending.reject;
      pending = null;
      reject(error);
    }

    function stopWorker() {
      if (!worker) return;
      worker.terminate();
      worker = null;
      readyPromise = null;
    }

    function send(command) {
      createWorker().postMessage(command);
    }

    function waitForReady() {
      if (readyPromise) return readyPromise;
      readyPromise = new Promise((resolve, reject) => {
        pending = { type: "ready", resolve, reject };
        send("uci");
        send("isready");
      });
      return readyPromise;
    }

    function uciToMove(board, uci) {
      if (!uci || uci === "(none)") return null;
      const from = rules.squareToPoint(uci.slice(0, 2));
      const to = rules.squareToPoint(uci.slice(2, 4));
      const promotion = uci[4] || null;
      return rules
        .getAllMoves(board, board._fen?.split(" ")[1] === "b" ? rules.BLACK : rules.WHITE)
        .find((move) =>
          rules.sameSquare(move.from, from) &&
          rules.sameSquare(move.to, to) &&
          (move.promotion || null) === promotion,
        ) || null;
    }

    async function chooseStockfishMove(state) {
      await waitForReady();
      const level = LEVELS[state.level] || LEVELS.medium;
      const bestmove = await new Promise((resolve, reject) => {
        pending = { type: "bestmove", resolve, reject };
        send("ucinewgame");
        send("setoption name Skill Level value " + level.skill);
        send("setoption name UCI_LimitStrength value true");
        send("setoption name UCI_Elo value " + level.elo);
        send("position fen " + state.board._fen);
        send("go movetime " + level.movetime);
      });
      return uciToMove(state.board, bestmove);
    }

    async function chooseComputerMove(state) {
      if (!state.board?._fen) return fallbackEngine.chooseComputerMove(state);
      try {
        return (await chooseStockfishMove(state)) || fallbackEngine.chooseComputerMove(state);
      } catch {
        stopWorker();
        return fallbackEngine.chooseComputerMove(state);
      }
    }

    return {
      ...fallbackEngine,
      chooseComputerMove,
    };
  }

  global.createStockfishAdapter = createStockfishAdapter;
})(typeof window !== "undefined" ? window : globalThis);
