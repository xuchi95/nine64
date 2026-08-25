/**
 * Client-side audit for denied data access.
 *
 * Any query the backend refuses (RLS violation, missing GRANT, denied RPC) is
 * reported to `public.security_events` through a security-definer function that
 * derives the caller identity server-side. A local burst detector raises an
 * extra `probe_suspected` event so admins can spot permission probing even when
 * each individual denial looks innocent.
 */
import { supabase } from "@/integrations/supabase/client";
import { translate } from "@/lib/i18n";

/** Postgres / PostgREST codes that mean "the backend refused this access". */
const DENIED_CODES = new Set([
  "42501", // insufficient_privilege (missing GRANT, RLS violation on write)
  "PGRST301", // JWT expired / not authorised
  "PGRST302", // anonymous access disabled
  "PGRST401",
  "PGRST403",
]);

const DENIED_PATTERNS = [
  /row-level security/i,
  /permission denied/i,
  /insufficient privilege/i,
  /not authenticated/i,
  /not a player in this game/i,
  /not your queue entry/i,
  /^forbidden$/i,
];

export interface DeniedAccess {
  code: string;
  message: string;
}

interface MaybePgError {
  code?: unknown;
  message?: unknown;
  error?: unknown;
  status?: unknown;
}

/** Returns denial details when the error looks like a refused access, else null. */
export function detectAccessDenied(error: unknown): DeniedAccess | null {
  if (!error) return null;
  const e = error as MaybePgError;
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const message =
    typeof e.message === "string" ? e.message : typeof error === "string" ? error : "";

  if (DENIED_CODES.has(code)) return { code, message };
  if (status === 401 || status === 403) return { code: String(status), message };
  if (message && DENIED_PATTERNS.some((re) => re.test(message))) {
    return { code: code || "denied", message };
  }
  return null;
}

// Burst detection + de-duplication, per browser session.
const WINDOW_MS = 5 * 60_000;
const BURST_THRESHOLD = 5;
const MAX_REPORTS_PER_SESSION = 60;

let recent: number[] = [];
let reported = 0;
let burstFlagged = false;
const seen = new Map<string, number>();

function shouldSend(signature: string): boolean {
  if (reported >= MAX_REPORTS_PER_SESSION) return false;
  const now = Date.now();
  const last = seen.get(signature) ?? 0;
  if (now - last < 15_000) return false; // same denial repeating: log once per 15s
  seen.set(signature, now);
  return true;
}

async function send(payload: {
  kind: string;
  resource?: string | null;
  operation?: string | null;
  errorCode?: string | null;
  message?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  reported += 1;
  try {
    await supabase.rpc("log_security_event", {
      _kind: payload.kind,
      _resource: payload.resource ?? "",
      _operation: payload.operation ?? "",
      _error_code: payload.errorCode ?? "",
      _message: payload.message ?? "",
      _path: typeof window === "undefined" ? "" : window.location.pathname,
      _user_agent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      _detail: (payload.detail ?? {}) as never,
    });
  } catch {
    // Never let auditing break the user flow.
  }
}

/**
 * Report a denied access. Safe to call with any error: non-denial errors are
 * ignored. Returns true when the error was a denial.
 */
export function reportAccessDenied(
  error: unknown,
  ctx: { resource?: string; operation?: string; detail?: Record<string, unknown> } = {},
): boolean {
  const denied = detectAccessDenied(error);
  if (!denied) return false;
  if (typeof window === "undefined") return true; // server side: DB logs it already

  const resource = ctx.resource ?? "unknown";
  const operation = ctx.operation ?? "unknown";
  const signature = `${resource}|${operation}|${denied.code}`;

  const now = Date.now();
  recent = recent.filter((t) => now - t < WINDOW_MS);
  recent.push(now);

  if (shouldSend(signature)) {
    void send({
      kind: "access_denied",
      resource,
      operation,
      errorCode: denied.code,
      message: denied.message,
      ...(ctx.detail ? { detail: ctx.detail } : {}),
    });
  }

  if (recent.length >= BURST_THRESHOLD && !burstFlagged) {
    burstFlagged = true;
    setTimeout(() => {
      burstFlagged = false;
    }, WINDOW_MS);
    void send({
      kind: "probe_suspected",
      resource,
      operation,
      errorCode: denied.code,
      message: translate("admin.rlsAudit.burstMessage", {
        count: recent.length,
        minutes: Math.round(WINDOW_MS / 60000),
      }),
      detail: { window_ms: WINDOW_MS, denials: recent.length },
    });
  }

  return true;
}

/**
 * Wrap a Supabase call so denials are audited automatically.
 *
 *   const { data, error } = await auditedQuery("games", "select", () =>
 *     supabase.from("games").select("*").eq("id", id));
 */
export async function auditedQuery<T extends { error: unknown }>(
  resource: string,
  operation: string,
  run: () => PromiseLike<T>,
): Promise<T> {
  const result = await run();
  if (result.error) reportAccessDenied(result.error, { resource, operation });
  return result;
}
