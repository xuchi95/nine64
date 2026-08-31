/**
 * P0.9 — Cloudflare Turnstile server verification.
 *
 * The widget only collects a token on the client; the decision is always made
 * here through Siteverify with success + hostname + action validation. Tokens
 * are single-use: a replayed or expired token fails and the UI must render a
 * fresh challenge.
 */
import { getRequest } from "@tanstack/react-start/server";
import { TURNSTILE_FAILED_CODE } from "@/lib/ratelimit/errors";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's official test keys — used only when no real secret is set. */
export const TURNSTILE_TEST_SECRET_PASS = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SECRET_FAIL = "2x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

export class CaptchaError extends Error {
  constructor(reason: string) {
    super(`${TURNSTILE_FAILED_CODE}:${reason}`);
    this.name = "CaptchaError";
  }
}

function secret(): string {
  const configured = process.env["TURNSTILE_SECRET_KEY"];
  if (configured) return configured;
  // Production must never silently accept the always-pass test key.
  if (process.env["NODE_ENV"] === "production") {
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not configured");
    throw new CaptchaError("not_configured");
  }
  return TURNSTILE_TEST_SECRET_PASS;
}

/** True when a production secret is configured (test keys => development). */
export function turnstileConfigured(): boolean {
  return Boolean(process.env["TURNSTILE_SECRET_KEY"]);
}

function requestHostname(): string | null {
  try {
    return new URL(getRequest().url).hostname;
  } catch {
    return null;
  }
}

export interface VerifyOptions {
  /** Widget action name; must match what the client rendered. */
  action: string;
  /** Retry-safe idempotency key so a re-sent verification is not double-spent. */
  idempotencyKey?: string;
  remoteIp?: string;
  /** Extra hostnames accepted besides the request hostname. */
  allowedHostnames?: string[];
}

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
}

/**
 * Verifies a Turnstile token. Throws `CaptchaError` on any failure so the
 * caller fails closed. Never returns provider internals to the client.
 */
export async function verifyTurnstile(token: string, options: VerifyOptions): Promise<void> {
  if (!token || typeof token !== "string" || token.length > 4096) {
    throw new CaptchaError("missing_token");
  }

  const body = new URLSearchParams();
  body.set("secret", secret());
  body.set("response", token);
  if (options.remoteIp) body.set("remoteip", options.remoteIp);
  if (options.idempotencyKey) body.set("idempotency_key", options.idempotencyKey);

  let payload: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    payload = (await res.json()) as SiteverifyResponse;
  } catch (err) {
    // Fail closed: a verification outage must not open the endpoint.
    console.error("[turnstile] siteverify unreachable", {
      action: options.action,
      error: err instanceof Error ? err.message : "unknown",
    });
    throw new CaptchaError("verifier_unavailable");
  }

  if (!payload.success) {
    console.warn("[turnstile] rejected", {
      action: options.action,
      codes: payload["error-codes"] ?? [],
    });
    throw new CaptchaError("rejected");
  }

  // Widget action binding: prevents replaying a token minted on another form.
  if (payload.action && options.action && payload.action !== options.action) {
    throw new CaptchaError("action_mismatch");
  }

  const host = requestHostname();
  const allowed = new Set(
    [host, "localhost", "127.0.0.1", ...(options.allowedHostnames ?? [])].filter(
      (h): h is string => Boolean(h),
    ),
  );
  if (payload.hostname && allowed.size > 0 && !allowed.has(payload.hostname)) {
    throw new CaptchaError("hostname_mismatch");
  }
}
