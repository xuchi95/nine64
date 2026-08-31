/**
 * Stockfish process pool.
 *
 * Each process handles exactly one search at a time; UCI output from two
 * sessions can therefore never be interleaved. A hung engine is killed and
 * replaced instead of blocking the pool forever.
 *
 * Copyright (C) 2026 Nine64. Licensed under GPL-3.0-or-later, matching the
 * Stockfish engine this service runs. See LICENSE and README for the
 * corresponding source and build instructions.
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

const STOCKFISH_BIN = process.env.STOCKFISH_PATH || "stockfish";

class Engine extends EventEmitter {
  constructor() {
    super();
    this.proc = spawn(STOCKFISH_BIN, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.busy = false;
    this.dead = false;
    this.version = null;
    this.appliedOptions = {};
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.#onData(chunk));
    this.proc.on("exit", () => {
      this.dead = true;
      this.emit("exit");
    });
    this.proc.on("error", () => {
      this.dead = true;
      this.emit("exit");
    });
  }

  #onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) this.emit("line", line);
    }
  }

  send(command) {
    if (this.dead) throw new Error("engine_dead");
    this.proc.stdin.write(`${command}\n`);
  }

  /** Waits for a line matching `predicate`, rejecting on timeout. */
  waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const onLine = (line) => {
        if (predicate(line)) {
          cleanup();
          resolve(line);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("timeout"));
      }, timeoutMs);
      const onExit = () => {
        cleanup();
        reject(new Error("engine_exit"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.off("line", onLine);
        this.off("exit", onExit);
      };
      this.on("line", onLine);
      this.once("exit", onExit);
    });
  }

  async handshake(timeoutMs = 10_000) {
    const versionPromise = new Promise((resolve) => {
      const onLine = (line) => {
        if (line.startsWith("Stockfish")) {
          this.version = line.split(" by ")[0].trim();
          this.off("line", onLine);
          resolve();
        }
      };
      this.on("line", onLine);
      setTimeout(resolve, timeoutMs);
    });
    this.send("uci");
    await this.waitFor((l) => l === "uciok", timeoutMs);
    await versionPromise;
    this.send("isready");
    await this.waitFor((l) => l === "readyok", timeoutMs);
  }

  kill() {
    this.dead = true;
    try {
      this.proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export class EnginePool {
  constructor(size = Number(process.env.ENGINE_POOL_SIZE || 1)) {
    this.size = Math.max(1, size);
    this.engines = [];
    this.waiters = [];
    this.stats = { searches: 0, timeouts: 0, restarts: 0, illegal: 0 };
  }

  async init() {
    for (let i = 0; i < this.size; i += 1) {
      const engine = new Engine();
      await engine.handshake();
      this.engines.push(engine);
    }
  }

  get engineVersion() {
    return this.engines.find((e) => e.version)?.version ?? null;
  }

  async #acquire(timeoutMs) {
    const free = this.engines.find((e) => !e.busy && !e.dead);
    if (free) {
      free.busy = true;
      return free;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== resolve);
        reject(new Error("pool_busy"));
      }, timeoutMs);
      this.waiters.push({
        resolve: (engine) => {
          clearTimeout(timer);
          resolve(engine);
        },
      });
    });
  }

  #release(engine) {
    engine.busy = false;
    const waiter = this.waiters.shift();
    if (waiter) {
      engine.busy = true;
      waiter.resolve(engine);
    }
  }

  async #replace(engine) {
    this.stats.restarts += 1;
    engine.kill();
    this.engines = this.engines.filter((e) => e !== engine);
    const fresh = new Engine();
    try {
      await fresh.handshake();
      this.engines.push(fresh);
      this.#release(fresh);
    } catch {
      fresh.kill();
    }
  }

  async applyOptions(engine, options) {
    for (const [name, value] of Object.entries(options)) {
      if (engine.appliedOptions[name] === value) continue;
      engine.send(`setoption name ${name} value ${value}`);
      engine.appliedOptions[name] = value;
    }
    engine.send("isready");
    await engine.waitFor((l) => l === "readyok", 10_000);
  }

  /**
   * Runs one search. `goArgs` is built by the caller (clock-based when the
   * caller supplies a clock, movetime otherwise).
   */
  async search({ fen, moves = [], options = {}, goArgs, timeoutMs = 30_000, newGame = false }) {
    const engine = await this.#acquire(Math.min(timeoutMs, 15_000));
    const info = { depth: null, nodes: null, nps: null, tbhits: null, timeMs: null };
    const started = Date.now();
    const onLine = (line) => {
      if (!line.startsWith("info ")) return;
      const depth = /\bdepth (\d+)/.exec(line);
      const nodes = /\bnodes (\d+)/.exec(line);
      const nps = /\bnps (\d+)/.exec(line);
      const tb = /\btbhits (\d+)/.exec(line);
      if (depth) info.depth = Number(depth[1]);
      if (nodes) info.nodes = Number(nodes[1]);
      if (nps) info.nps = Number(nps[1]);
      if (tb) info.tbhits = Number(tb[1]);
    };
    try {
      await this.applyOptions(engine, options);
      if (newGame) {
        engine.send("ucinewgame");
        engine.send("isready");
        await engine.waitFor((l) => l === "readyok", 10_000);
      }
      engine.on("line", onLine);
      const position = moves.length ? `position fen ${fen} moves ${moves.join(" ")}` : `position fen ${fen}`;
      engine.send(position);
      engine.send(`go ${goArgs}`);
      const line = await engine.waitFor((l) => l.startsWith("bestmove"), timeoutMs);
      const parts = line.split(/\s+/);
      info.timeMs = Date.now() - started;
      this.stats.searches += 1;
      return {
        bestmove: parts[1] && parts[1] !== "(none)" ? parts[1] : null,
        ponder: parts[3] ?? null,
        ...info,
        engineVersion: engine.version,
      };
    } catch (err) {
      if (err.message === "timeout" || err.message === "engine_exit") {
        this.stats.timeouts += err.message === "timeout" ? 1 : 0;
        await this.#replace(engine);
        throw new Error(err.message);
      }
      throw err;
    } finally {
      engine.off("line", onLine);
      if (!engine.dead) this.#release(engine);
    }
  }

  async bench(timeoutMs = 180_000) {
    const engine = await this.#acquire(15_000);
    let nodes = null;
    let nps = null;
    const onLine = (line) => {
      const n = /^Nodes searched\s*:\s*(\d+)/.exec(line);
      const s = /^Nodes\/second\s*:\s*(\d+)/.exec(line);
      if (n) nodes = Number(n[1]);
      if (s) nps = Number(s[1]);
    };
    try {
      engine.on("line", onLine);
      engine.send("bench");
      await engine.waitFor(() => nps !== null, timeoutMs);
      return { nodes, nps, engineVersion: engine.version };
    } finally {
      engine.off("line", onLine);
      if (!engine.dead) this.#release(engine);
    }
  }

  shutdown() {
    for (const engine of this.engines) engine.kill();
    this.engines = [];
  }
}
