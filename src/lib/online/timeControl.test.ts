import { describe, expect, it } from "vitest";
import { parseTimeControl, ratingPoolFor, timeControlBaseMs } from "./timeControl";

describe("time control parsing", () => {
  it("keeps the legacy ids working", () => {
    expect(parseTimeControl("blitz3m")).toMatchObject({ baseMs: 180_000, incMs: 2000, pool: "blitz" });
    expect(parseTimeControl("rapid15m")).toMatchObject({ baseMs: 900_000, incMs: 10_000, pool: "rapid" });
  });

  it("parses the generic base+increment form", () => {
    expect(parseTimeControl("180+2")).toMatchObject({ pace: "realtime", baseMs: 180_000, incMs: 2000 });
    expect(parseTimeControl("1800+20").pool).toBe("classical");
    expect(parseTimeControl("60+0").pool).toBe("bullet");
  });

  it("classifies pools from the estimated game length", () => {
    expect(parseTimeControl("120+1").pool).toBe("blitz");
    expect(parseTimeControl("600+5").pool).toBe("rapid");
  });

  it("understands correspondence controls", () => {
    expect(parseTimeControl("daily3")).toMatchObject({
      pace: "daily",
      pool: "daily",
      dailyMoveMs: 3 * 86_400_000,
    });
    expect(parseTimeControl("daily5").valid).toBe(false);
  });

  it("rejects out-of-range and malformed controls", () => {
    expect(parseTimeControl("10+0").valid).toBe(false);
    expect(parseTimeControl("99999+0").valid).toBe(false);
    expect(parseTimeControl("300+900").valid).toBe(false);
    expect(parseTimeControl("bogus").valid).toBe(false);
    expect(parseTimeControl("").valid).toBe(false);
  });

  it("keeps chess960 in its own pool and daily games clockless", () => {
    expect(ratingPoolFor("chess960", "180+2")).toBe("chess960");
    expect(ratingPoolFor("standard", "daily1")).toBe("daily");
    expect(timeControlBaseMs("daily1")).toBe(0);
    expect(timeControlBaseMs("300+0")).toBe(300_000);
  });
});
