/**
 * Client-side orchestration helpers for starting a Nine64 Titan (level 16) game.
 *
 * Pure + dependency-injected so the start flow can be tested without React.
 * Nothing here trusts the client: the server re-checks every condition.
 */

export type TitanState = "loading" | "ready" | "not_configured" | "disabled" | "unavailable";

export interface TitanStatusPayload {
  state: TitanState;
  name: string;
  stockfishVersion: string | null;
}

/** Never leak raw exceptions/URLs; unknown shapes degrade to "unavailable". */
export function titanStateOf(payload: unknown): TitanState {
  const state = (payload as { state?: unknown } | null)?.state;
  return state === "ready" || state === "not_configured" || state === "disabled"
    ? state
    : "unavailable";
}

/** Maps a server error code to a user-facing message; never downgrades Titan. */
export function titanMessage(code: string | null | undefined, t: (key: string) => string): string {
  switch (code) {
    case "ENGINE_NOT_CONFIGURED":
      return t("play.ai.titanNotConfigured");
    case "PROFILE_DISABLED":
    case "PROFILE_MISSING":
      return t("play.ai.titanProfileDisabled");
    case "INVALID_ENGINE_CREDENTIALS":
      return t("play.ai.titanNotConfigured");
    case "ENGINE_AUTH_FAILED":
      return t("play.ai.titanAuthFailed");
    case "ENGINE_UNHEALTHY":
    case "ENGINE_UNAVAILABLE":
      return t("play.ai.titanUnavailable");
    case "QUOTA_EXCEEDED":
      return t("play.ai.titanQuota");
    case "TOO_MANY_SESSIONS":
      return t("play.ai.titanTooMany");
    case "VERSION_CONFLICT":
    case "SESSION_CLOSED":
      return t("play.ai.titanConflict");
    case "WRITE_FAILED":
      return t("play.ai.titanWriteFailed");
    case "UNAUTHORIZED":
      return t("play.ai.titanAuthRequired");
    default:
      return t("play.ai.titanUnavailable");
  }
}

/** Message for a preflight status; `null` when there is nothing to warn about. */
export function titanStateMessage(
  state: TitanState,
  t: (key: string) => string,
  code?: string | null,
): string | null {
  if (state === "ready" || state === "loading") return null;
  if (code === "ENGINE_AUTH_FAILED" || code === "INVALID_ENGINE_CREDENTIALS") {
    return t(code === "ENGINE_AUTH_FAILED" ? "play.ai.titanAuthFailed" : "play.ai.titanNotConfigured");
  }
  switch (state) {
    case "not_configured":
      return t("play.ai.titanNotConfigured");
    case "disabled":
      return t("play.ai.titanProfileDisabled");
    default:
      return t("play.ai.titanUnavailable");
  }
}


export interface TitanStartResult {
  ok: boolean;
  code?: string | undefined;
  snapshot?: unknown;
}

export interface TitanStartDeps<S> {
  /** Calls the authenticated server function. */
  request: () => Promise<{ ok: boolean; code?: string; snapshot?: S }>;
  onStarted: (snapshot: S) => void;
  onError: (code: string | null) => void;
  onPending: (pending: boolean) => void;
}

/**
 * Classifies a thrown value from the Titan RPC. A 401 (no/expired session)
 * maps to UNAUTHORIZED; everything else stays generic. Never leaks the raw
 * message, URL or body.
 */
export function titanThrownCode(err: unknown): string | null {
  const status =
    typeof Response !== "undefined" && err instanceof Response
      ? err.status
      : (err as { status?: unknown } | null)?.status;
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /unauthorized|401/i.test(message) ? "UNAUTHORIZED" : null;
}


/**
 * Single-flight Titan session starter. Concurrent calls (double click) resolve
 * to the same in-flight promise, so exactly one session is ever created.
 * Session creation is deliberately never auto-retried.
 */
export function createTitanStarter<S>(deps: TitanStartDeps<S>): () => Promise<boolean> {
  let inFlight: Promise<boolean> | null = null;

  return () => {
    if (inFlight) return inFlight;
    deps.onPending(true);
    inFlight = (async () => {
      try {
        const res = await deps.request();
        if (!res.ok || !res.snapshot) {
          deps.onError(res.code ?? null);
          return false;
        }
        deps.onStarted(res.snapshot);
        return true;
      } catch (err) {
        // Raw exceptions never reach the UI, but an auth failure must not be
        // mislabelled as an engine outage.
        deps.onError(titanThrownCode(err));
        return false;

      } finally {
        deps.onPending(false);
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
