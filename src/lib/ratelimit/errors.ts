/**
 * Client-safe helpers for the canonical RATE_LIMITED error contract.
 *
 * Server functions cross the RPC boundary as plain `Error`s, so the machine
 * readable part travels in the message using a stable prefix:
 *   `RATE_LIMITED:{"retryAfterSeconds":30,"scope":"user","action":"coach.burst"}`
 */

export const RATE_LIMITED_PREFIX = "RATE_LIMITED:";

export interface RateLimitedInfo {
  code: "RATE_LIMITED";
  action: string;
  scope: string;
  retryAfterSeconds: number;
  limit?: number;
  /** True when the limiter itself failed and the endpoint failed closed. */
  unavailable?: boolean;
}

export function encodeRateLimited(info: Omit<RateLimitedInfo, "code">): string {
  return `${RATE_LIMITED_PREFIX}${JSON.stringify(info)}`;
}

/** Returns the structured info when `error` is a rate-limit rejection. */
export function parseRateLimited(error: unknown): RateLimitedInfo | null {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message.startsWith(RATE_LIMITED_PREFIX)) return null;
  try {
    const parsed = JSON.parse(message.slice(RATE_LIMITED_PREFIX.length)) as
      | Partial<RateLimitedInfo>
      | null;
    return {
      code: "RATE_LIMITED",
      action: String(parsed?.action ?? "unknown"),
      scope: String(parsed?.scope ?? "unknown"),
      retryAfterSeconds: Number.isFinite(Number(parsed?.retryAfterSeconds))
        ? Math.max(1, Math.round(Number(parsed?.retryAfterSeconds)))
        : 60,
      ...(parsed?.limit !== undefined ? { limit: Number(parsed.limit) } : {}),
      ...(parsed?.unavailable ? { unavailable: true } : {}),
    };
  } catch {
    return { code: "RATE_LIMITED", action: "unknown", scope: "unknown", retryAfterSeconds: 60 };
  }
}

/** "2 phút 5 giây" style countdown text for inline UI messages. */
export function formatRetryAfter(seconds: number, locale: "vi" | "en" = "vi"): string {
  const total = Math.max(1, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(locale === "en" ? `${h}h` : `${h} giờ`);
  if (m) parts.push(locale === "en" ? `${m}m` : `${m} phút`);
  if (s && !h) parts.push(locale === "en" ? `${s}s` : `${s} giây`);
  return parts.join(" ");
}

/** Ready-to-render inline message for a rate-limit rejection. */
export function rateLimitMessage(info: RateLimitedInfo, locale: "vi" | "en" = "vi"): string {
  const wait = formatRetryAfter(info.retryAfterSeconds, locale);
  if (info.unavailable) {
    return locale === "en"
      ? `Protection service is unavailable, so this action is paused. Try again in ${wait}.`
      : `Dịch vụ bảo vệ đang gián đoạn nên thao tác tạm dừng. Vui lòng thử lại sau ${wait}.`;
  }
  return locale === "en"
    ? `Too many requests. Please try again in ${wait}.`
    : `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${wait}.`;
}

export const TURNSTILE_FAILED_CODE = "CAPTCHA_FAILED";

export function isCaptchaFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(TURNSTILE_FAILED_CODE);
}

export function captchaMessage(locale: "vi" | "en" = "vi"): string {
  return locale === "en"
    ? "Human verification failed or expired. Please complete the check again."
    : "Xác minh không thành công hoặc đã hết hạn. Vui lòng xác minh lại.";
}
