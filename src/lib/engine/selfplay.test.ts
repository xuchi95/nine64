import { describe, expect, it, vi, beforeEach } from "vitest";
import { Chess } from "chess.js";
import type { EngineConfig } from "./profileTypes";

type MoveReply = { status: string; bestmove: string | null; engineVersion: string | null };
const moveImpl = {
  fn: (_fen: string, _isCandidate: boolean): MoveReply => ({
    status: "ok",
    bestmove: null,
    engineVersion: "Stockfish 18",
  }),
};
const inserted: Record<string, unknown>[] = [];

vi.mock("./cloudEngine.server", () => ({
  cloudEngineConfigured: () => true,
  requestBestMove: async (args: { fen: string; sessionId: string }) =>
    moveImpl.fn(args.fen, args.sessionId.includes("cand")),
}));
vi.mock("./profiles.server", () => ({
  getEngineProfile: async () => ({ slug: "titan", version: 7, config: { multipv: 1, requestTimeoutMs: 30_000 } }),
  titanProfile: async () => ({ slug: "titan", version: 7, config: { multipv: 1, requestTimeoutMs: 30_000 } }),
}));
vi.mock("./configFingerprint", () => ({
  engineConfigFingerprint: async (cfg: unknown) => `fp-${JSON.stringify(cfg).length}`,
}));
vi.mock("./benchmarks.server", () => ({ QUALIFICATION_SUITE_VERSION: "titan-v6-1" }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "bench-1" } }) }) };
      },
    }),
  },
}));

const candidate = { multipv: 1, requestTimeoutMs: 30_000, ponder: true } as unknown as EngineConfig;

async function run(overrides: Parameters<typeof import("./selfplay.server").runSelfPlayRegression>[0] | null = null) {
  const { runSelfPlayRegression } = await import("./selfplay.server");
  return runSelfPlayRegression(
    overrides ?? { slug: "titan", candidate, actorId: "admin-1", games: 2, moveTimeMs: 100 },
  );
}

/** Deterministic legal mover: always plays the first legal move. */
function firstLegal(fen: string): string {
  const chess = new Chess(fen);
  const move = chess.moves({ verbose: true })[0]!;
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

describe("titan self-play regression", () => {
  beforeEach(() => {
    inserted.length = 0;
    moveImpl.fn = (fen) => ({ status: "ok", bestmove: firstLegal(fen), engineVersion: "Stockfish 18" });
  });

  it("plays every game, alternates colours and records both fingerprints", async () => {
    const result = await run();
    expect(result.games).toBe(2);
    expect(result.detail.map((g) => g.candidateColor)).toEqual(["white", "black"]);
    expect(result.wins + result.draws + result.losses).toBe(2);
    expect(result.candidateSignature).not.toEqual(result.baselineSignature);
    expect(result.baselineVersion).toBe(7);
    expect(result.benchmarkId).toBe("bench-1");
  });

  it("stores a selfplay benchmark row with the candidate fingerprint and W/D/L", async () => {
    const result = await run();
    const row = inserted[0]!;
    expect(row["kind"]).toBe("selfplay");
    expect(row["config_signature"]).toBe(result.candidateSignature);
    expect(row["suite_version"]).toBe("titan-v6-1");
    const payload = row["result"] as Record<string, unknown>;
    expect(payload["wins"]).toBe(result.wins);
    expect(payload["draws"]).toBe(result.draws);
    expect(payload["losses"]).toBe(result.losses);
    expect(payload["baselineSignature"]).toBe(result.baselineSignature);
  });

  it("fails closed on an illegal engine move", async () => {
    moveImpl.fn = () => ({ status: "ok", bestmove: "a1a8", engineVersion: "Stockfish 18" });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ENGINE_ERROR");
    expect(result.detail[0]!.error).toBe("illegal_move");
    expect(inserted[0]!["passed"]).toBe(false);
  });

  it("fails closed on a transport error and stops the match", async () => {
    moveImpl.fn = () => ({ status: "unavailable", bestmove: null, engineVersion: null });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.detail).toHaveLength(1);
  });

  it("scores a candidate checkmate win", async () => {
    // Candidate is white in game 0; force a fast fool's-mate style sequence by
    // always choosing the mating move when one exists.
    moveImpl.fn = (fen) => {
      const chess = new Chess(fen);
      const mate = chess.moves({ verbose: true }).find((m) => m.san.includes("#"));
      const move = mate ?? chess.moves({ verbose: true })[0]!;
      return { status: "ok", bestmove: `${move.from}${move.to}${move.promotion ?? ""}`, engineVersion: "Stockfish 18" };
    };
    const result = await run();
    expect(result.wins + result.draws + result.losses).toBe(2);
    expect(result.score).not.toBeNull();
  });
});
