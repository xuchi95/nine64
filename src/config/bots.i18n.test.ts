import { describe, expect, it } from "vitest";
import { BOT_LEVELS, BOT_PERSONALITIES, botLevelTitle } from "@/config/bots";
import { translate } from "@/lib/i18n";

const LOCALES = ["vi", "en"] as const;

describe("bot levels i18n coverage", () => {
  it("every BOT_LEVELS entry has a title in both locales", () => {
    for (const locale of LOCALES) {
      for (const bot of BOT_LEVELS) {
        const key = `play.bots.level.${bot.level}.title`;
        const value = translate(key, undefined, locale);
        expect(value, `${locale} missing ${key}`).not.toBe(key);
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("botLevelTitle never returns a raw i18n key", () => {
    for (const bot of BOT_LEVELS) {
      const title = botLevelTitle(bot.level);
      expect(title.startsWith("play.bots.")).toBe(false);
    }
    // Unknown level must also fall back to config title, not a raw key.
    expect(botLevelTitle(999).startsWith("play.bots.")).toBe(false);
  });

  it("level 16 resolves to Nine64 Titan in both locales", () => {
    for (const locale of LOCALES) {
      expect(translate("play.bots.level.16.title", undefined, locale)).toBe("Nine64 Titan");
    }
    expect(botLevelTitle(16)).toBe("Nine64 Titan");
  });

  it("levels 1-15 keep their existing titles", () => {
    expect(translate("play.bots.level.1.title", undefined, "vi")).toBeTruthy();
    expect(translate("play.bots.level.15.title", undefined, "en")).toBe("Engine Max");
  });
});

describe("bot personalities i18n coverage", () => {
  it("every personality has name and blurb in both locales", () => {
    for (const locale of LOCALES) {
      for (const p of BOT_PERSONALITIES) {
        const nameKey = `play.bots.personality.${p.id}.name`;
        const blurbKey = `play.bots.personality.${p.id}.blurb`;
        expect(translate(nameKey, undefined, locale), `${locale} missing ${nameKey}`).not.toBe(nameKey);
        expect(translate(blurbKey, undefined, locale), `${locale} missing ${blurbKey}`).not.toBe(blurbKey);
      }
    }
  });

  it("has a dynamic cloud subtitle for Titan in both locales", () => {
    expect(translate("play.ai.subtitleCloud", undefined, "vi")).toContain("Nine64 Titan");
    expect(translate("play.ai.subtitleCloud", undefined, "en")).toContain("Nine64 Titan");
  });
});
