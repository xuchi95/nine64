import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_BENCHMARK_SUITE_VERSION,
  EXPECTED_ENGINE_SERVICE_VERSION,
} from "./engineContractTypes";

describe("play-engine repository version contract", () => {
  it("keeps backend expectations synchronized with the canonical service source", () => {
    const source = readFileSync("services/play-engine/src/version.js", "utf8");
    expect(source).toContain(`BENCHMARK_SUITE_VERSION = "${EXPECTED_BENCHMARK_SUITE_VERSION}"`);
    expect(source).toContain(`SERVICE_VERSION = "${EXPECTED_ENGINE_SERVICE_VERSION}"`);
  });
});