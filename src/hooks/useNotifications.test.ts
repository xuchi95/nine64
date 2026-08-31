import { describe, expect, it } from "vitest";
import { dedupeNotifications } from "./useNotifications";
import type { Notification } from "@/lib/database.types";

function n(id: string, eventKey: string | null, read = false): Notification {
  return {
    id,
    user_id: "u1",
    type: "opponent_move",
    title: "t",
    body: "b",
    data: { event_type: "opponent_move", game_id: "g1", actor_id: "u2", url: "/game/g1" },
    event_key: eventKey,
    read,
    created_at: new Date().toISOString(),
  };
}

describe("notification dedupe", () => {
  it("keeps a single entry when realtime and refetch deliver the same event", () => {
    const list = dedupeNotifications([n("a", "opponent_move:g1:5"), n("b", "opponent_move:g1:5")]);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("a");
  });

  it("keeps distinct events", () => {
    const list = dedupeNotifications([n("a", "opponent_move:g1:5"), n("b", "opponent_move:g1:6")]);
    expect(list).toHaveLength(2);
  });

  it("falls back to row id when event_key is missing", () => {
    const list = dedupeNotifications([n("a", null), n("a", null), n("c", null)]);
    expect(list.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("carries the canonical deep-link payload", () => {
    expect(n("a", "k").data?.url).toBe("/game/g1");
    expect(n("a", "k").data?.game_id).toBe("g1");
  });
});
