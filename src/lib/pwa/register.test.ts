import { describe, expect, it } from "vitest";
import { shouldSkipServiceWorker } from "./register";

describe("shouldSkipServiceWorker", () => {
  it("skips outside production builds", () => {
    // Vitest runs with PROD=false, so every context is skipped here.
    expect(shouldSkipServiceWorker({ hostname: "nine64.com", search: "" })).toBe(true);
  });

  it("honours the ?sw=off kill switch", () => {
    expect(shouldSkipServiceWorker({ hostname: "nine64.com", search: "?sw=off" })).toBe(true);
  });

  it("treats preview hosts as skip contexts", () => {
    for (const hostname of [
      "id-preview--abc.lovable.app",
      "preview--abc.lovable.app",
      "foo.lovableproject.com",
      "beta.lovable.dev",
    ]) {
      expect(shouldSkipServiceWorker({ hostname, search: "" })).toBe(true);
    }
  });
});
