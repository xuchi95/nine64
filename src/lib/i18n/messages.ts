import type { Locale } from "./index";

export type Dictionary = Record<string, string>;
export interface DictModule {
  default: Partial<Record<Locale, Dictionary>>;
}

/**
 * Every file in `dict/` contributes namespaced keys for both locales, so new
 * screens can add strings without touching a central registry.
 */
const modules = import.meta.glob<DictModule>("./dict/*.ts", { eager: true });

function collect(locale: Locale): Dictionary {
  const out: Dictionary = {};
  for (const mod of Object.values(modules)) {
    Object.assign(out, mod.default[locale] ?? {});
  }
  return out;
}

export const messages: Record<Locale, Dictionary> = {
  vi: collect("vi"),
  en: collect("en"),
};
