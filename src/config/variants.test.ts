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

  it("offers Chess960 on every surface now that 960 castling is implemented", () => {
    expect(isOnlinePlayable("chess960")).toBe(true);
    expect(localVariants().some((v) => v.id === "chess960")).toBe(true);
    expect(botVariants().some((v) => v.id === "chess960")).toBe(true);
    expect(onlineVariants().some((v) => v.id === "chess960")).toBe(true);
  });

  it("keeps Random Army disabled until its generator is finished", () => {
    expect(isOnlinePlayable("random-army")).toBe(false);
    expect(localVariants().some((v) => v.id === "random-army")).toBe(false);
    expect(botVariants().some((v) => v.id === "random-army")).toBe(false);
    expect(onlineVariants().some((v) => v.id === "random-army")).toBe(false);
  });

  it("gates the queue boundary and FEN factory on online playability", () => {
    expect(QUEUE_SCHEMA.safeParse({ variant: "chess960", timeControl: "blitz5m" }).success).toBe(
      true,
    );
    expect(QUEUE_SCHEMA.safeParse({ variant: "random-army", timeControl: "blitz5m" }).success).toBe(
      false,
    );
    expect(QUEUE_SCHEMA.safeParse({ variant: "standard", timeControl: "blitz5m" }).success).toBe(
      true,
    );
    expect(() => startingFenForVariant("random-army")).toThrowError(/VARIANT_NOT_ONLINE_PLAYABLE/);
    // Chess960 hands back a shuffled, canonical start position.
    const fen960 = startingFenForVariant("chess960");
    expect(fen960.split(" ")[0]?.split("/")[0]).toMatch(/^[a-z]{8}$/);
    expect(startingFenForVariant("standard")).toContain("rnbqkbnr");
  });
});
