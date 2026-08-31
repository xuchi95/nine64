/**
 * Server-side Stockfish driver. The engine runs inside this trusted service —
 * never in a player's browser — and only ever sees positions replayed from the
 * canonical move ledger.
 */
import { Chess } from "chess.js";

/** @returns {Promise<{ analyse: (fen: string) => Promise<{ lines: {move: string, cp: number}[] }>, version: string, quit: () => void }>} */
export async function createEngine({ depth = 16, moveTimeMs = 250, multiPv = 2 } = {}) {
  const mod = await import("stockfish");
  const factory = mod.default ?? mod;
  const engine = typeof factory === "function" ? await factory() : factory;

  let version = "stockfish-unknown";
  const pending = [];
  engine.addMessageListener?.((line) => {
    if (typeof line === "string" && line.startsWith("Stockfish ")) version = line.trim();
    for (const handler of pending) handler(line);
  });

  const send = (cmd) => engine.postMessage(cmd);

  function waitFor(predicate, collector) {
    return new Promise((resolve) => {
      const handler = (line) => {
        collector?.(line);
        if (predicate(line)) {
          pending.splice(pending.indexOf(handler), 1);
          resolve();
        }
      };
      pending.push(handler);
    });
  }

  send("uci");
  await waitFor((l) => typeof l === "string" && l.includes("uciok"));
  send(`setoption name MultiPV value ${multiPv}`);
  send("isready");
  await waitFor((l) => typeof l === "string" && l.includes("readyok"));

  async function analyse(fen) {
    /** @type {Map<number, {move: string, cp: number}>} */
    const byPv = new Map();
    send(`position fen ${fen}`);
    send(`go depth ${depth} movetime ${moveTimeMs}`);
    await waitFor(
      (l) => typeof l === "string" && l.startsWith("bestmove"),
      (line) => {
        if (typeof line !== "string" || !line.startsWith("info ") || !line.includes(" pv ")) return;
        const pv = Number(/multipv (\d+)/.exec(line)?.[1] ?? 1);
        const mate = /score mate (-?\d+)/.exec(line);
        const cpMatch = /score cp (-?\d+)/.exec(line);
        const cp = mate ? (Number(mate[1]) > 0 ? 10000 : -10000) : Number(cpMatch?.[1] ?? 0);
        const move = /\spv\s([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line)?.[1];
        if (move) byPv.set(pv, { move, cp });
      },
    );
    return { lines: [...byPv.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v) };
  }

  return { analyse, get version() { return version; }, quit: () => send("quit") };
}

/** Replay the canonical ledger and evaluate each position before the move. */
export async function evaluateGame(engine, { initialFen, moves }) {
  const chess = new Chess(initialFen);
  const plies = [];
  for (const move of moves) {
    const fenBefore = chess.fen();
    const color = chess.turn();
    const legalMoves = chess.moves().length;
    const { lines } = await engine.analyse(fenBefore);
    const best = lines[0];
    const second = lines[1];

    let applied = null;
    try {
      applied = chess.move({
        from: move.uci.slice(0, 2),
        to: move.uci.slice(2, 4),
        promotion: move.uci.length > 4 ? move.uci.slice(4, 5) : undefined,
      });
    } catch {
      applied = null;
    }
    // Ledger diverged from the replay: stop instead of inventing evidence.
    if (!applied) break;

    let playedCp = best?.cp ?? 0;
    if (best && best.move !== move.uci) {
      const { lines: after } = await engine.analyse(chess.fen());
      playedCp = after[0] ? -after[0].cp : playedCp;
    }

    plies.push({
      ply: move.ply,
      color,
      bestCp: best?.cp ?? 0,
      playedCp,
      isTop1: best?.move === move.uci,
      legalMoves,
      spread: best && second ? best.cp - second.cp : 0,
      spentMs: null,
    });
  }
  return plies;
}
