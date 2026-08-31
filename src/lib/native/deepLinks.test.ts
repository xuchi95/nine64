import { describe, expect, it } from "vitest";
import { buildDeepLink, resolveDeepLink } from "./deepLinks";

describe("resolveDeepLink", () => {
  it("maps custom-scheme study links", () => {
    expect(resolveDeepLink("nine64://study/aB3xY")).toEqual({
      target: { kind: "study", slug: "aB3xY" },
      path: "/s/aB3xY",
    });
  });

  it("maps universal links for games, puzzles and lessons", () => {
    expect(resolveDeepLink("https://nine64.com/games/42")?.path).toBe("/games/42");
    expect(resolveDeepLink("nine64://puzzle/p-9")?.path).toBe("/puzzles?id=p-9");
    expect(resolveDeepLink("https://www.nine64.com/learn/lesson/pin-basics")?.path).toBe(
      "/learn/lesson/pin-basics",
    );
  });

  it("rejects foreign origins and junk", () => {
    expect(resolveDeepLink("https://evil.example.com/s/abc")).toBeNull();
    expect(resolveDeepLink("not a url")).toBeNull();
  });

  it("round-trips through buildDeepLink", () => {
    const link = buildDeepLink({ kind: "study", slug: "abc" });
    expect(resolveDeepLink(link)?.target).toEqual({ kind: "study", slug: "abc" });
  });
});
