/**
 * P0.9 — distributed rate limiter.
 *
 * Backed by an atomic Postgres counter (`consume_rate_limit`), never by a
 * per-instance in-memory map: every Cloudflare isolate shares the same buckets,
 * so restarting or moving instances cannot reset a limit and concurrent calls
 * cannot race past a quota.
 *
 * Subjects are hashed: for unauthenticated callers we store an HMAC of the IP
 * (keyed by RATE_LIMIT_SALT), never the raw address.
 */
import { createHmac } from "node:crypto";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import {
  RATE_LIMIT_POLICY,
  type RateLimitAction,
  type RateLimitRule,
} from "./policy";
import { encodeRateLimited } from "./errors";

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: string | null;
}

const DEV_SALT = "nine64-dev-rate-limit-salt";

function salt(): string {
  return process.env["RATE_LIMIT_SALT"] ?? DEV_SALT;
}

/** Stable, non-reversible subject id. Raw IPs are never persisted. */
export function hashSubject(raw: string): string {
  return createHmac("sha256", salt()).update(raw).digest("hex").slice(0, 32);
}

/** Best-effort client IP from the edge headers. */
export function requestIp(): string {
  try {
    const request = getRequest();
    const h = request.headers;
    const candidate =
      h.get("cf-connecting-ip") ??
      h.get("x-real-ip") ??
      (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
      "";
    return candidate || "unknown-ip";
  } catch {
    return "unknown-ip";
  }
}

export function ipSubject(): string {
  return `ip:${hashSubject(requestIp())}`;
}

export function emailSubject(email: string): string {
  return `em:${hashSubject(email.trim().toLowerCase())}`;
}

export function userSubject(userId: string): string {
  return `u:${userId}`;
}

function ruleFor(action: RateLimitAction): RateLimitRule {
  const base = RATE_LIMIT_POLICY[action];
  const envKey = action.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const limit = Number(process.env[`RL_${envKey}_LIMIT`]);
  const windowSeconds = Number(process.env[`RL_${envKey}_WINDOW`]);
  return {
    ...base,
    ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    ...(Number.isFinite(windowSeconds) && windowSeconds > 0 ? { windowSeconds } : {}),
  };
}

/** Thrown when a caller is over quota; carries the canonical 429 contract. */
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(action: RateLimitAction, scope: string, retryAfterSeconds: number, extra?: { limit?: number; unavailable?: boolean }) {
    super(
      encodeRateLimited({
        action,
        scope,
        retryAfterSeconds,
        ...(extra?.limit !== undefined ? { limit: extra.limit } : {}),
        ...(extra?.unavailable ? { unavailable: true } : {}),
      }),
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function markResponse(retryAfterSeconds: number): void {
  try {
    setResponseStatus(429);
    setResponseHeader("Retry-After", String(Math.max(1, Math.round(retryAfterSeconds))));
  } catch {
    /* outside a request scope (tests) — the encoded error still carries it */
  }
}

type ConsumeFn = (args: {
  key: string;
  windowSeconds: number;
  limit: number;
  cost: number;
}) => Promise<Record<string, unknown>>;

const defaultConsume: ConsumeFn = async ({ key, windowSeconds, limit, cost }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
    _key: key,
    _window_seconds: windowSeconds,
    _limit: limit,
    _cost: cost,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
};

let consume: ConsumeFn = defaultConsume;

/** Test seam only: swaps the atomic counter backend. */
export function __setRateLimitBackend(fn: ConsumeFn | null): void {
  consume = fn ?? defaultConsume;
}

/** Raw check: returns the decision instead of throwing. */
export async function checkRateLimit(
  action: RateLimitAction,
  subject: string,
  options: { cost?: number } = {},
): Promise<RateDecision & { unavailable?: boolean }> {
  const rule = ruleFor(action);
  const key = `${action}|${subject}`;
  try {
    const payload = await consume({
      key,
      windowSeconds: rule.windowSeconds,
      limit: rule.limit,
      cost: options.cost ?? 1,
    });
    return {
      allowed: Boolean(payload["allowed"]),
      limit: Number(payload["limit"] ?? rule.limit),
      remaining: Number(payload["remaining"] ?? 0),
      retryAfterSeconds: Number(payload["retry_after_seconds"] ?? rule.windowSeconds),
      resetAt: (payload["reset_at"] as string | undefined) ?? null,
    };
  } catch (err) {
    // Structured log only — no payload, no secrets.
    console.error("[ratelimit] backend unavailable", {
      action,
      scope: rule.scope,
      failClosed: rule.failClosed,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      allowed: !rule.failClosed,
      limit: rule.limit,
      remaining: 0,
      retryAfterSeconds: 30,
      resetAt: null,
      unavailable: true,
    };
  }
}

/**
 * Consumes one unit of quota, throwing `RateLimitError` (HTTP 429 +
 * Retry-After) when the caller is over the limit. Costly actions fail closed
 * when the limiter itself is unreachable.
 */
export async function enforceRateLimit(
  action: RateLimitAction,
  subject: string,
  options: { cost?: number } = {},
): Promise<RateDecision> {
  const rule = ruleFor(action);
  const decision = await checkRateLimit(action, subject, options);
  if (!decision.allowed) {
    markResponse(decision.retryAfterSeconds);
    console.warn("[ratelimit] blocked", {
      action,
      scope: rule.scope,
      retryAfterSeconds: decision.retryAfterSeconds,
      unavailable: Boolean(decision.unavailable),
    });
    throw new RateLimitError(action, rule.scope, decision.retryAfterSeconds, {
      limit: decision.limit,
      ...(decision.unavailable ? { unavailable: true } : {}),
    });
  }
  return decision;
}

/** Enforces several buckets; the first breach wins. */
export async function enforceAll(
  entries: { action: RateLimitAction; subject: string; cost?: number }[],
): Promise<void> {
  for (const entry of entries) {
    await enforceRateLimit(entry.action, entry.subject, entry.cost ? { cost: entry.cost } : {});
  }
}
