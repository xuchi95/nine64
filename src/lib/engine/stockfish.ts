import type { BotLevel, BotPersonality } from "@/config/bots";

export interface EngineCapability {
  cores: number;
  threads: number;
  hashMb: number;
  threaded: boolean;
  wasm: boolean;
}

export interface EngineLine {
  move: string;
  /** centipawns from the moving side's perspective */
  cp: number | null;
  mateIn: number | null;
  depth: number;
  pv: string[];
}

export type EngineVariant = "standard" | "chess960";

export interface SearchRequest {
  fen: string;
  /**
   * Rule set for the search. `chess960` toggles `UCI_Chess960`, which changes
   * BOTH castling legality and the castling move encoding (king takes rook).
   * Callers must convert bestmove/PV through `chess960MoveCodec`.
   */
  variant?: EngineVariant;
  /** search movetime in ms (used when depth is null) */
  moveTimeMs?: number;
  depth?: number | null;
  multiPv?: number;
  skill?: number | null;
  uciElo?: number | null;
}


export type PerformanceMode = "performance" | "balanced" | "maximum";

const SINGLE = "/engine/stockfish-18-lite-single.js";
const THREADED = "/engine/stockfish-18-lite.js";

export function detectCapability(mode: PerformanceMode): EngineCapability {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2;
  const threaded =
    typeof window !== "undefined" &&
    typeof SharedArrayBuffer !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).crossOriginIsolated === true &&
    cores > 2;

  const budget: Record<PerformanceMode, { threadRatio: number; hash: number }> = {
    performance: { threadRatio: 0.25, hash: 16 },
    balanced: { threadRatio: 0.5, hash: 64 },
    maximum: { threadRatio: 0.85, hash: 256 },
  };
  const b = budget[mode];
  const deviceMemory =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof navigator !== "undefined" ? ((navigator as any).deviceMemory as number | undefined) : undefined;
  const memoryCap = deviceMemory && deviceMemory <= 4 ? 32 : b.hash;

  return {
    cores,
    threads: threaded ? Math.max(1, Math.min(8, Math.floor(cores * b.threadRatio))) : 1,
    hashMb: memoryCap,
    threaded,
    wasm: typeof WebAssembly !== "undefined",
  };
}

/** Parses `option name X type spin ...` handshake lines into option names. */
export function parseUciOptionName(line: string): string | null {
  const m = /^option name (.+?) type /.exec(line.trim());
  return m ? m[1]!.trim() : null;
}

/**
 * Thin UCI adapter over the Stockfish WASM worker. All search work happens off
 * the UI thread; this class only marshals UCI text.
 */
export class StockfishEngine {
  private worker: Worker | null = null;
  private ready = false;
  private queue: ((line: string) => void)[] = [];
  private lineHandlers = new Set<(line: string) => void>();
  /** Options the engine advertised during the `uci` handshake. We never send
   * anything outside this set — Stockfish 18 Lite dropped `Contempt`, and
   * unknown options just spam the log. */
  private options = new Set<string>();
  /** Serialises searches: UCI is a single-position protocol, so overlapping
   * `go` commands would mix candidate lines from two different positions. */
  private chain: Promise<unknown> = Promise.resolve();
  readonly capability: EngineCapability;

  constructor(private mode: PerformanceMode = "balanced") {
    this.capability = detectCapability(mode);
  }

  supportsOption(name: string): boolean {
    return this.options.has(name);
  }

  get advertisedOptions(): string[] {
    return [...this.options];
  }

  private setOption(name: string, value: string | number | boolean) {
    if (!this.options.has(name)) return false;
    this.send(`setoption name ${name} value ${value}`);
    return true;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    const url = this.capability.threaded ? THREADED : SINGLE;
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      const data = typeof e.data === "string" ? e.data : String(e.data?.data ?? "");
      if (!data) return;
      this.lineHandlers.forEach((h) => h(data));
      this.queue.forEach((h) => h(data));
    };
    const optionCollector = (line: string) => {
      const name = parseUciOptionName(line);
      if (name) this.options.add(name);
    };
    this.lineHandlers.add(optionCollector);
    this.send("uci");
    try {
      await this.waitFor((l) => l.startsWith("uciok"), 20000);
    } finally {
      this.lineHandlers.delete(optionCollector);
    }
    this.setOption("Threads", this.capability.threads);
    this.setOption("Hash", this.capability.hashMb);
    this.setOption("Ponder", false);
    await this.isReady();
    this.ready = true;
  }


  get performanceMode() {
    return this.mode;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean, timeout = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Engine timed out"));
      }, timeout);
      const handler = (line: string) => {
        if (pred(line)) {
          cleanup();
          resolve(line);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.queue = this.queue.filter((h) => h !== handler);
      };
      this.queue.push(handler);
    });
  }

  private async isReady() {
    this.send("isready");
    await this.waitFor((l) => l.startsWith("readyok"), 20000);
  }

  /** Public entry point — queued so callers never interleave two searches. */
  search(req: SearchRequest): Promise<EngineLine[]> {
    const run = this.chain.then(
      () => this.runSearch(req),
      () => this.runSearch(req),
    );
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async runSearch(req: SearchRequest): Promise<EngineLine[]> {
    await this.init();
    const multiPv = Math.max(1, req.multiPv ?? 1);

    // Set explicitly on EVERY search: a shared engine instance keeps UCI
    // options, so a previous Chess960 search must never leak into a standard
    // one (and vice versa).
    this.setOption("UCI_Chess960", req.variant === "chess960" ? "true" : "false");

    if (req.skill === null || req.skill === undefined) {
      this.setOption("UCI_LimitStrength", "false");
      this.setOption("Skill Level", 20);
    } else {
      this.setOption("Skill Level", req.skill);
      if (req.uciElo) {
        this.setOption("UCI_LimitStrength", "true");
        this.setOption("UCI_Elo", req.uciElo);
      } else {
        this.setOption("UCI_LimitStrength", "false");
      }
    }
    this.setOption("MultiPV", multiPv);

    await this.isReady();

    const lines = new Map<number, EngineLine>();
    const collector = (line: string) => {
      if (!line.startsWith("info ")) return;
      const depth = Number(/ depth (\d+)/.exec(line)?.[1] ?? 0);
      const pvIndex = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
      const pvMatch = / pv (.+)$/.exec(line);
      if (!pvMatch) return;
      const pv = (pvMatch[1] ?? "").trim().split(/\s+/).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
      if (pv.length === 0) return;
      const cpMatch = / score cp (-?\d+)/.exec(line);
      const mateMatch = / score mate (-?\d+)/.exec(line);
      lines.set(pvIndex, {
        move: pv[0]!,
        cp: cpMatch ? Number(cpMatch[1]) : null,
        mateIn: mateMatch ? Number(mateMatch[1]) : null,
        depth,
        pv,
      });
    };
    this.lineHandlers.add(collector);

    this.send(`position fen ${req.fen}`);
    const go =
      req.depth && req.depth > 0
        ? `go depth ${req.depth}`
        : `go movetime ${Math.max(20, Math.round(req.moveTimeMs ?? 1000))}`;
    this.send(go);

    let best = "";
    try {
      const line = await this.waitFor((l) => l.startsWith("bestmove"), 180000);
      best = line.split(/\s+/)[1] ?? "";
    } finally {
      this.lineHandlers.delete(collector);
    }

    // Terminal position: Stockfish answers `bestmove (none)` with no usable pv.
    const legalBest = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best) ? best : "";
    const result = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    if (result.length === 0 && !legalBest) return [];
    if (result.length === 0 && legalBest) {
      return [{ move: legalBest, cp: null, mateIn: null, depth: 0, pv: [legalBest] }];
    }
    if (legalBest && result[0] && result[0].move !== legalBest) {
      const idx = result.findIndex((r) => r.move === legalBest);
      if (idx > 0) {
        const hit = result.splice(idx, 1)[0]!;
        result.unshift(hit);
      }
    }
    return result;
  }

  stop() {
    this.send("stop");
  }

  destroy() {
    this.send("quit");
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}

/**
 * Presentation-layer "human" delay. Never reduces engine strength — the engine
 * has already produced its move; we just hold it for a believable duration.
 */
export function humanThinkTime(opts: {
  level: BotLevel;
  legalMoves: number;
  moveNumber: number;
  evalSwingCp: number;
  remainingMs: number;
  baseTimeSec: number;
  isCritical: boolean;
}): number {
  const { level, legalMoves, moveNumber, evalSwingCp, remainingMs, baseTimeSec, isCritical } = opts;

  const paceFactor = baseTimeSec <= 120 ? 0.22 : baseTimeSec <= 300 ? 0.5 : baseTimeSec <= 900 ? 1 : 1.5;
  const strengthFactor = 0.55 + level.level / 18;

  let ms = 550 + legalMoves * 55;
  if (moveNumber <= 8) ms *= 0.45;
  else if (moveNumber <= 16) ms *= 0.9;
  ms += Math.min(6000, Math.abs(evalSwingCp) * 12);
  if (isCritical) ms *= 1.7;
  ms *= paceFactor * strengthFactor;
  ms *= 0.75 + Math.random() * 0.5;

  const clockCap = Math.max(150, remainingMs * 0.08);
  return Math.round(Math.min(Math.max(ms, 180), Math.min(18000, clockCap)));
}

export function pickMoveWithPersonality(
  lines: EngineLine[],
  personality: BotPersonality,
  level: BotLevel,
): string {
  if (lines.length === 0) return "";
  if (level.level >= 13 || personality.evalTolerance === 0) return lines[0]!.move;

  const best = lines[0]!;
  const bestScore = scoreOf(best);
  const acceptable = lines.filter((l) => {
    if (l.mateIn !== null && l.mateIn > 0) return true;
    return bestScore - scoreOf(l) <= personality.evalTolerance;
  });
  if (best.mateIn !== null) return best.move;
  const pool = acceptable.length > 0 ? acceptable : [best];
  return pool[Math.floor(Math.random() * pool.length)]!.move;
}

function scoreOf(line: EngineLine): number {
  if (line.mateIn !== null) return line.mateIn > 0 ? 100000 - line.mateIn : -100000 - line.mateIn;
  return line.cp ?? 0;
}
