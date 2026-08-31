import { useSyncExternalStore } from "react";
import { messages } from "./messages";

export type Locale = "vi" | "en";

export const LOCALES: { id: Locale; label: string; short: string }[] = [
  { id: "vi", label: "Tiếng Việt", short: "VI" },
  { id: "en", label: "English", short: "EN" },
];

const KEY = "nine64.locale.v1";
const DEFAULT_LOCALE: Locale = "vi";

let locale: Locale = DEFAULT_LOCALE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocale(): Locale {
  return locale;
}

export function hydrateLocale() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    // `?lang=` wins over storage so hreflang alternates resolve to real pages.
    const param = new URLSearchParams(window.location.search).get("lang");
    if (param === "vi" || param === "en") {
      locale = param;
      window.localStorage.setItem(KEY, param);
    } else {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "vi" || raw === "en") locale = raw;
    }
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = locale;
  emit();
}

export function setLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = next;
  }
  emit();
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

/**
 * Translates a dictionary key for the active locale. Falls back to English and
 * finally to the key itself so a missing string never blanks the UI.
 */
export function translate(
  key: string,
  vars?: Record<string, string | number>,
  forLocale: Locale = locale,
): string {
  const value = messages[forLocale][key] ?? messages.en[key] ?? messages.vi[key] ?? key;
  return interpolate(value, vars);
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** React hook: re-renders the component whenever the locale changes. */
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}

export function useT(): { t: TFunction; locale: Locale; setLocale: (l: Locale) => void } {
  const active = useLocale();
  return {
    t: (key, vars) => translate(key, vars, active),
    locale: active,
    setLocale,
  };
}
