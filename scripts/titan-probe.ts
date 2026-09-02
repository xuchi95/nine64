import { requestBestMove } from "@/lib/engine/cloudEngine.server";
import { getEngineProfile } from "@/lib/engine/profiles.server";
const probes = [
  ["r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",["f3f7"]],
  ["2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1",["c1c8"]],
  ["3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",["d1d8"]],
  ["6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",["a1a8"]],
  ["7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1",["f1f8"]],
  ["k7/7R/1K6/8/8/8/8/8 w - - 0 1",["h7h8"]],
  ["6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",["h6f7"]],
  ["6k1/4Pppp/8/8/8/8/5PPP/6K1 w - - 0 1",["e7e8q","e7e8r"]],
  ["8/8/8/8/8/2k5/1q6/K7 b - - 0 1",["c3c2","c3b3"]],
] as const;
const p = await getEngineProfile("titan");
const cfg = { ...(p!.draftConfig ?? p!.config), timePolicy: "movetime", moveTimeMs: 1500, maxMoveTimeMs: 1500, maxRetries: 0, ponder: false } as never;
for (const [fen, exp] of probes) {
  const r = await requestBestMove({ fen, variant: "standard", config: cfg, clock: null, sessionId: crypto.randomUUID(), requestId: crypto.randomUUID(), newGame: true });
  console.log(r.status, r.bestmove, "expected", exp.join("|"), (exp as readonly string[]).includes(r.bestmove ?? "") ? "OK" : "MISS", fen);
}
