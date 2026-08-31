import { describe, expect, it } from "vitest";
import {
  buildChatTimeline,
  mergeChatMessages,
  normalizeChatBody,
  plyLabel,
  type GameChatMessage,
} from "./messages";

function msg(id: string, ply: number, at: string, body = "hi"): GameChatMessage {
  return {
    id,
    game_id: "g",
    user_id: "u",
    author_name: "A",
    author_role: "player",
    ply,
    body,
    created_at: at,
  };
}

describe("mergeChatMessages", () => {
  it("dedupes realtime and polled copies of the same row", () => {
    const a = msg("1", 0, "2026-01-01T00:00:00Z");
    const merged = mergeChatMessages([a], [a, msg("2", 1, "2026-01-01T00:00:01Z")]);
    expect(merged.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("sorts by creation time", () => {
    const merged = mergeChatMessages(
      [msg("late", 2, "2026-01-01T00:00:05Z")],
      [msg("early", 0, "2026-01-01T00:00:00Z")],
    );
    expect(merged.map((m) => m.id)).toEqual(["early", "late"]);
  });
});

describe("buildChatTimeline", () => {
  it("inserts one move marker per ply group", () => {
    const items = buildChatTimeline(
      [
        msg("a", 0, "2026-01-01T00:00:00Z"),
        msg("b", 2, "2026-01-01T00:00:01Z"),
        msg("c", 2, "2026-01-01T00:00:02Z"),
      ],
      ["e4", "e5"],
    );
    expect(items.map((i) => i.kind)).toEqual([
      "move",
      "message",
      "move",
      "message",
      "message",
    ]);
  });
});

describe("plyLabel", () => {
  it("labels white and black plies", () => {
    expect(plyLabel(1, ["e4", "e5"])).toBe("1. e4");
    expect(plyLabel(2, ["e4", "e5"])).toBe("1… e5");
    expect(plyLabel(0, ["e4"])).toBe("Trước nước đi đầu tiên");
  });
});

describe("normalizeChatBody", () => {
  it("rejects blank input and trims/truncates", () => {
    expect(normalizeChatBody("   ")).toBeNull();
    expect(normalizeChatBody("  gg  ")).toBe("gg");
    expect(normalizeChatBody("x".repeat(600))?.length).toBe(400);
  });
});
