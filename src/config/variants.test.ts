import { describe, expect, it } from "vitest";
import {
  VARIANTS,
  botVariants,
  isOnlinePlayable,
  localVariants,
  onlineVariants,
} from "./variants";
import { rulesFor } from "@/lib/chess/rules";
import { QUEUE_SCHEMA, startingFenForVariant } from "@/lib/online.helpers";

describe("variant capability registry", () => {
  it("never advertises a surface without a working rules engine", () => {
    for (const v of VARIANTS) {
      const engine = rulesFor(v.id);
      if (!engine.supported) {
        expect(v.localPlayable).toBe(false);
        expect(v.botPlayable).toBe(false);
        expect(v.onlinePlayable).toBe(false);
        expect(v.rated).toBe(false);
      }
    }
  });

  it("keeps Chess960 and Random Army disabled until 960 castling is implemented", () => {
    for (const id of ["chess960", "random-army"] as const) {
      expect(isOnlinePlayable(id)).toBe(false);
      expect(localVariants().some((v) => v.id === id)).toBe(false);
      expect(botVariants().some((v) => v.id === id)).toBe(false);
      expect(onlineVariants().some((v) => v.id === id)).toBe(false);
    }
  });

  it("rejects non-online variants at the queue boundary and in the FEN factory", () => {
    expect(QUEUE_SCHEMA.safeParse({ variant: "chess960", timeControl: "blitz5m" }).success).toBe(
      false,
    );
    expect(QUEUE_SCHEMA.safeParse({ variant: "standard", timeControl: "blitz5m" }).success).toBe(
      true,
    );
    expect(() => startingFenForVariant("chess960")).toThrowError(/VARIANT_NOT_ONLINE_PLAYABLE/);
    expect(startingFenForVariant("standard")).toContain("rnbqkbnr");
  });
});
