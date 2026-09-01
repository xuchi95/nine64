import { describe, expect, it, vi } from "vitest";
import {
  createTitanStarter,
  titanMessage,
  titanStateMessage,
  titanStateOf,
} from "@/lib/engine/titanStart";
import { dict } from "@/lib/i18n/dict/play";

const t = (key: string) => {
  const vi = (dict as unknown as { vi: Record<string, string> }).vi;
  return vi[key] ?? key;
};

function harness(res: unknown, opts: { throws?: boolean } = {}) {
  const errors: (string | null)[] = [];
  const started: unknown[] = [];
  const pending: boolean[] = [];
  const request = vi.fn(async () => {
    await Promise.resolve();
    if (opts.throws) throw new Error("boom: https://secret.internal");
    return res as { ok: boolean; code?: string; snapshot?: { sessionId: string } };
  });
  const start = createTitanStarter<{ sessionId: string }>({
    request,
    onStarted: (s) => started.push(s),
    onError: (c) => errors.push(c),
    onPending: (p) => pending.push(p),
  });
  return { start, request, errors, started, pending };
}

describe("titan status mapping", () => {
  it("maps known states and degrades unknown payloads", () => {
    expect(titanStateOf({ state: "ready" })).toBe("ready");
    expect(titanStateOf({ state: "disabled" })).toBe("disabled");
    expect(titanStateOf({ state: "not_configured" })).toBe("not_configured");
    expect(titanStateOf(null)).toBe("unavailable");
    expect(titanStateOf({ state: "weird" })).toBe("unavailable");
  });

  it("has a human message for every non-ready state", () => {
    expect(titanStateMessage("ready", t)).toBeNull();
    expect(titanStateMessage("loading", t)).toBeNull();
    for (const s of ["not_configured", "disabled", "unavailable"] as const) {
      const msg = titanStateMessage(s, t)!;
      expect(msg).toBeTruthy();
      expect(msg).not.toMatch(/^play\./);
    }
  });

  it("maps every structured error code to a translated message", () => {
    for (const code of [
      "PROFILE_DISABLED",
      "ENGINE_NOT_CONFIGURED",
      "ENGINE_UNAVAILABLE",
      "QUOTA_EXCEEDED",
      "TOO_MANY_SESSIONS",
      "VERSION_CONFLICT",
      "WRITE_FAILED",
      "UNAUTHORIZED",
      null,
    ]) {
      const msg = titanMessage(code, t);
      expect(msg).toBeTruthy();
      expect(msg).not.toMatch(/^play\./);
    }
  });
});

describe("titan session starter", () => {
  it("reports disabled without starting the game", async () => {
    const h = harness({ ok: false, code: "PROFILE_DISABLED" });
    expect(await h.start()).toBe(false);
    expect(h.started).toHaveLength(0);
    expect(h.errors).toEqual(["PROFILE_DISABLED"]);
    expect(h.pending).toEqual([true, false]);
  });

  it("reports a missing configuration", async () => {
    const h = harness({ ok: false, code: "ENGINE_NOT_CONFIGURED" });
    expect(await h.start()).toBe(false);
    expect(h.errors).toEqual(["ENGINE_NOT_CONFIGURED"]);
  });

  it("starts the game when Titan is healthy", async () => {
    const h = harness({ ok: true, snapshot: { sessionId: "s1" } });
    expect(await h.start()).toBe(true);
    expect(h.started).toEqual([{ sessionId: "s1" }]);
    expect(h.errors).toHaveLength(0);
  });

  it("creates exactly one session on a double click", async () => {
    const h = harness({ ok: true, snapshot: { sessionId: "s1" } });
    const [a, b] = await Promise.all([h.start(), h.start()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.started).toHaveLength(1);
  });

  it("swallows raw exceptions and never rejects", async () => {
    const h = harness(null, { throws: true });
    await expect(h.start()).resolves.toBe(false);
    expect(h.errors).toEqual([null]);
    expect(titanMessage(null, t)).not.toMatch(/secret/);
  });

  it("allows a manual retry after a failure", async () => {
    const h = harness({ ok: false, code: "ENGINE_UNAVAILABLE" });
    await h.start();
    await h.start();
    expect(h.request).toHaveBeenCalledTimes(2);
  });
});
