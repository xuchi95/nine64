import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isCaptchaFailure } from "@/lib/ratelimit/errors";

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://nine64.com/contact"),
  setResponseHeader: () => undefined,
  setResponseStatus: () => undefined,
}));

import { verifyTurnstile, TURNSTILE_TEST_SECRET_PASS, TURNSTILE_TEST_SITE_KEY } from "./turnstile.server";

const originalFetch = globalThis.fetch;

function mockSiteverify(payload: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(payload))) as unknown as typeof fetch;
}

describe("turnstile verification", () => {
  beforeEach(() => {
    // Official Cloudflare test keys only — never a production secret.
    process.env["TURNSTILE_SECRET_KEY"] = TURNSTILE_TEST_SECRET_PASS;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env["TURNSTILE_SECRET_KEY"];
  });

  it("uses the official test site key placeholder", () => {
    expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
  });

  it("accepts a valid token for the right action and hostname", async () => {
    mockSiteverify({ success: true, action: "contact", hostname: "nine64.com" });
    await expect(verifyTurnstile("tok", { action: "contact" })).resolves.toBeUndefined();
  });

  it("rejects a forged / failed token", async () => {
    mockSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
    const err = await verifyTurnstile("bad", { action: "contact" }).catch((e) => e);
    expect(isCaptchaFailure(err)).toBe(true);
  });

  it("rejects a replayed (already-used) token", async () => {
    mockSiteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    const err = await verifyTurnstile("used", { action: "contact" }).catch((e) => e);
    expect(isCaptchaFailure(err)).toBe(true);
  });

  it("rejects a token minted for another widget action", async () => {
    mockSiteverify({ success: true, action: "signup", hostname: "nine64.com" });
    const err = await verifyTurnstile("tok", { action: "contact" }).catch((e) => e);
    expect(isCaptchaFailure(err)).toBe(true);
  });

  it("rejects a token solved on a foreign hostname", async () => {
    mockSiteverify({ success: true, action: "contact", hostname: "evil.example" });
    const err = await verifyTurnstile("tok", { action: "contact" }).catch((e) => e);
    expect(isCaptchaFailure(err)).toBe(true);
  });

  it("rejects an empty token without calling the verifier", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const err = await verifyTurnstile("", { action: "contact" }).catch((e) => e);
    expect(isCaptchaFailure(err)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed when siteverify is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const err = await verifyTurnstile("tok", { action: "contact" }).catch((e) => e);
    expect(isCaptchaFailure(err)).toBe(true);
  });

  it("passes the idempotency key on retry", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ success: true, action: "contact", hostname: "nine64.com" })));
    globalThis.fetch = spy as unknown as typeof fetch;
    await verifyTurnstile("tok", { action: "contact", idempotencyKey: "abc" });
    const call = spy.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(call[1].body);
    expect(body).toContain("idempotency_key=abc");
  });
});
