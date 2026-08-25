export type CookieConsent = "accepted" | "rejected";

export const COOKIE_CONSENT_KEY = "nine64.cookie-consent";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 ngày

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function isConsent(value: string | null): value is CookieConsent {
  return value === "accepted" || value === "rejected";
}

/** Đọc lựa chọn đã lưu (localStorage ưu tiên, fallback cookie). */
export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (isConsent(stored)) return stored;
  } catch {
    /* storage bị chặn */
  }
  const fromCookie = readCookie(COOKIE_CONSENT_KEY);
  return isConsent(fromCookie) ? fromCookie : null;
}

/** Lưu lựa chọn vào cả localStorage và cookie để áp dụng khi tải lại. */
export function setCookieConsent(value: CookieConsent) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* storage bị chặn */
  }
  writeCookie(COOKIE_CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent<CookieConsent>("nine64:cookie-consent", { detail: value }));
}

/** Xoá lựa chọn (dùng cho nút "Thay đổi lựa chọn cookie"). */
export function resetCookieConsent() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(COOKIE_CONSENT_KEY);
  } catch {
    /* storage bị chặn */
  }
  document.cookie = `${COOKIE_CONSENT_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("nine64:cookie-consent-reset"));
}
