import { describe, expect, it, vi } from "vitest";
import {
  createTitanSessionController,
  endSessionPatch,
  startWithRollback,
} from "@/lib/engine/sessionLifecycle";

/** Minimal in-memory stand-in for the bot_sessions table. */
function fakeServer(opts: { openingFails?: boolean; openingThrows?: boolean } = {}) {
  let seq = 0;
  const rows = new Map<string, { status: string; result: string | null; endReason: string | null; version: number }>();
  const create = vi.fn(async () => {
    const id = `s-${++seq}`;
    rows.set(id, { status: "active", result: null, endReason: null, version: 0 });
    return { ok: true as const, snapshot: { sessionId: id, version: 0 } };
  });
  const opening = vi.fn(async (snapshot: { sessionId: string; version: number }) => {
    if (opts.openingThrows) throw new Error("engine boom");
    if (opts.openingFails) return { ok: false as const, code: "ENGINE_UNAVAILABLE" };
    const row = rows.get(snapshot.sessionId)!;
    row.version = 1;
    return { ok: true as const, snapshot: { sessionId: snapshot.sessionId, version: 1 } };
  });
  const abort = vi.fn(async (id: string) => {
    const row = rows.get(id);
    if (row && row.status === "active") Object.assign(row, endSessionPatch("startup_failed", "b"));
  });
  const activeCount = () => [...rows.values()].filter((r) => r.status === "active").length;
  return { rows, create, opening, abort, activeCount };
}

describe("endSessionPatch", () => {
  it("keeps resign canonical per player colour", () => {
    expect(endSessionPatch("resign", "w")).toEqual({ status: "finished", result: "0-1", endReason: "resign" });
    expect(endSessionPatch("resign", "b")).toEqual({ status: "finished", result: "1-0", endReason: "resign" });
  });

  it("supports draw by agreement", () => {
    expect(endSessionPatch("draw", "w")).toEqual({
      status: "finished",
      result: "1/2-1/2",
      endReason: "agreement",
    });
  });

  it("marks failed startups as aborted", () => {
    expect(endSessionPatch("startup_failed", "b")).toEqual({
      status: "aborted",
      result: null,
      endReason: "startup_failed",
    });
    expect(endSessionPatch("abort", "w").status).toBe("aborted");
  });
});

describe("startWithRollback", () => {
  it("returns the opened snapshot on success", async () => {
    const srv = fakeServer();
    const res = await startWithRollback({ create: srv.create, opening: srv.opening, abort: srv.abort });
    expect(res).toEqual({ ok: true, snapshot: { sessionId: "s-1", version: 1 } });
    expect(srv.abort).not.toHaveBeenCalled();
    expect(srv.activeCount()).toBe(1);
  });

  it("leaves zero active sessions when the engine opening fails", async () => {
    const srv = fakeServer({ openingFails: true });
    const res = await startWithRollback({ create: srv.create, opening: srv.opening, abort: srv.abort });
    expect(res).toEqual({ ok: false, code: "ENGINE_UNAVAILABLE" });
    expect(srv.activeCount()).toBe(0);
    expect([...srv.rows.values()][0]).toMatchObject({ status: "aborted", endReason: "startup_failed" });
  });

  it("rolls back when the engine throws", async () => {
    const srv = fakeServer({ openingThrows: true });
    const res = await startWithRollback({ create: srv.create, opening: srv.opening, abort: srv.abort });
    expect(res.ok).toBe(false);
    expect(srv.activeCount()).toBe(0);
  });

  it("does not leak sessions across 5 consecutive failed starts", async () => {
    const srv = fakeServer({ openingFails: true });
    for (let i = 0; i < 5; i++) {
      await startWithRollback({ create: srv.create, opening: srv.opening, abort: srv.abort });
    }
    expect(srv.rows.size).toBe(5);
    expect(srv.activeCount()).toBe(0);
  });

  it("skips the opening step when the player is White", async () => {
    const srv = fakeServer();
    const res = await startWithRollback({ create: srv.create, opening: null, abort: srv.abort });
    expect(res).toEqual({ ok: true, snapshot: { sessionId: "s-1", version: 0 } });
    expect(srv.opening).not.toHaveBeenCalled();
  });
});

describe("titan session controller", () => {
  function ctl() {
    const calls: { id: string; reason: string }[] = [];
    const controller = createTitanSessionController({
      end: async (id, reason) => {
        calls.push({ id, reason });
      },
    });
    return { controller, calls };
  }

  it("closes the server session on resign and clears the handle", async () => {
    const { controller, calls } = ctl();
    controller.set({ id: "s-1", version: 3 });
    expect(await controller.closeAndClear("resign")).toBe(true);
    expect(calls).toEqual([{ id: "s-1", reason: "resign" }]);
    expect(controller.get()).toBeNull();
  });

  it("closes the server session on draw", async () => {
    const { controller, calls } = ctl();
    controller.set({ id: "s-2", version: 8 });
    await controller.closeAndClear("draw");
    expect(calls).toEqual([{ id: "s-2", reason: "draw" }]);
  });

  it("aborts the old session when going back to setup", async () => {
    const { controller, calls } = ctl();
    controller.set({ id: "s-3", version: 2 });
    await controller.closeAndClear("abort");
    expect(calls).toEqual([{ id: "s-3", reason: "abort" }]);
    expect(controller.get()).toBeNull();
  });

  it("never closes twice after a terminal server state", async () => {
    const { controller, calls } = ctl();
    controller.set({ id: "s-4", version: 12 });
    controller.clear(); // checkmate already committed server-side
    expect(await controller.closeAndClear("resign")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("rematch aborts the old session and adopts a new id with reset version", async () => {
    const srv = fakeServer();
    const { controller, calls } = ctl();
    const first = await startWithRollback({ create: srv.create, opening: null, abort: srv.abort });
    expect(first.ok).toBe(true);
    if (first.ok) controller.set({ id: first.snapshot.sessionId, version: 9 });

    // Rematch: close previous, then start fresh.
    await controller.closeAndClear("abort");
    const second = await startWithRollback({ create: srv.create, opening: null, abort: srv.abort });
    expect(second.ok).toBe(true);
    if (second.ok) controller.set({ id: second.snapshot.sessionId, version: second.snapshot.version });

    expect(calls).toEqual([{ id: "s-1", reason: "abort" }]);
    expect(controller.get()).toEqual({ id: "s-2", version: 0 });
  });

  it("is a no-op for browser bots that never own a session", async () => {
    const { controller, calls } = ctl();
    expect(controller.get()).toBeNull();
    expect(await controller.closeAndClear("abort")).toBe(false);
    expect(calls).toEqual([]);
  });
});
