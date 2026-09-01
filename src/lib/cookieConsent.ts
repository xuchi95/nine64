export type CookieConsent = "accepted" | "rejected";

/** Nhóm cookie tuỳ chọn (nhóm bắt buộc luôn bật, không cần lưu). */
export type OptionalCookieCategory = "preferences" | "analytics";

export type CookieConsentPreferences = {
  /** Luôn true — cookie kỹ thuật bắt buộc. */
  necessary: true;
  /** Ghi nhớ ngôn ngữ, theme bàn cờ, cài đặt giao diện. */
  preferences: boolean;
  /** Thống kê ẩn danh để cải thiện sản phẩm. */
  analytics: boolean;
};

export const OPTIONAL_COOKIE_CATEGORIES: OptionalCookieCategory[] = ["preferences", "analytics"];

export const COOKIE_CONSENT_KEY = "nine64.cookie-consent";
export const COOKIE_PREFS_KEY = "nine64.cookie-consent.categories";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 ngày

export const DEFAULT_COOKIE_PREFERENCES: CookieConsentPreferences = {
  necessary: true,
  preferences: true,
  analytics: false,
};

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

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
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

function parsePreferences(raw: string | null): CookieConsentPreferences | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CookieConsentPreferences>;
    return {
      necessary: true,
      preferences: parsed.preferences === true,
      analytics: parsed.analytics === true,
    };
  } catch {
    return null;
  }
}

/** Đọc chi tiết từng nhóm cookie; null nếu người dùng chưa lựa chọn. */
export function getCookiePreferences(): CookieConsentPreferences | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(COOKIE_PREFS_KEY);
  } catch {
    /* storage bị chặn */
  }
  const parsed = parsePreferences(raw) ?? parsePreferences(readCookie(COOKIE_PREFS_KEY));
  if (parsed) return parsed;

  // Tương thích ngược với lựa chọn cũ chỉ có accepted/rejected.
  const legacy = getCookieConsent();
  if (legacy === "accepted") return { necessary: true, preferences: true, analytics: true };
  if (legacy === "rejected") return { necessary: true, preferences: false, analytics: false };
  return null;
}

/** Nhóm cookie này có được phép dùng hay không. */
export function isCategoryAllowed(category: OptionalCookieCategory | "necessary"): boolean {
  if (category === "necessary") return true;
  const prefs = getCookiePreferences();
  return prefs ? prefs[category] : false;
}

/** Lưu lựa chọn theo từng nhóm vào localStorage và cookie. */
export function setCookiePreferences(input: Partial<Omit<CookieConsentPreferences, "necessary">>) {
  if (typeof window === "undefined") return;
  const prefs: CookieConsentPreferences = {
    necessary: true,
    preferences: input.preferences === true,
    analytics: input.analytics === true,
  };
  const serialized = JSON.stringify(prefs);
  const consent: CookieConsent = prefs.preferences || prefs.analytics ? "accepted" : "rejected";
  try {
    window.localStorage.setItem(COOKIE_PREFS_KEY, serialized);
    window.localStorage.setItem(COOKIE_CONSENT_KEY, consent);
  } catch {
    /* storage bị chặn */
  }
  writeCookie(COOKIE_PREFS_KEY, serialized);
  writeCookie(COOKIE_CONSENT_KEY, consent);
  window.dispatchEvent(new CustomEvent<CookieConsent>("nine64:cookie-consent", { detail: consent }));
  window.dispatchEvent(
    new CustomEvent<CookieConsentPreferences>("nine64:cookie-preferences", { detail: prefs }),
  );
}

/** Lưu lựa chọn tổng (giữ cho tương thích ngược). */
export function setCookieConsent(value: CookieConsent) {
  setCookiePreferences(
    value === "accepted" ? { preferences: true, analytics: true } : { preferences: false, analytics: false },
  );
}

/** Xoá lựa chọn (dùng cho nút "Thay đổi lựa chọn cookie"). */
export function resetCookieConsent() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(COOKIE_CONSENT_KEY);
    window.localStorage.removeItem(COOKIE_PREFS_KEY);
  } catch {
    /* storage bị chặn */
  }
  deleteCookie(COOKIE_CONSENT_KEY);
  deleteCookie(COOKIE_PREFS_KEY);
  window.dispatchEvent(new CustomEvent("nine64:cookie-consent-reset"));
}
