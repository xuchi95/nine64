/**
 * Pure helpers for in-game chat.
 *
 * The chat is *move-synced*: every message stores the ply (number of moves
 * played) at the moment it was sent, so the transcript can be interleaved with
 * move markers instead of being a flat, context-free log.
 */

export interface GameChatMessage {
  id: string;
  game_id: string;
  user_id: string;
  author_name: string;
  author_role: "player" | "spectator";
  ply: number;
  body: string;
  created_at: string;
}

export const CHAT_MAX_LENGTH = 400;

/** Merge incoming rows (realtime or poll) into the local list: dedupe + sort. */
export function mergeChatMessages(
  existing: GameChatMessage[],
  incoming: GameChatMessage[],
): GameChatMessage[] {
  const byId = new Map<string, GameChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    const t = Date.parse(a.created_at) - Date.parse(b.created_at);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
}

export type ChatTimelineItem =
  | { kind: "move"; ply: number; label: string }
  | { kind: "message"; message: GameChatMessage };

/**
 * Interleave messages with a marker for each ply that has chat attached, so a
 * reader sees "after 12. Nf3" above the messages sent at that point.
 */
export function buildChatTimeline(
  messages: GameChatMessage[],
  moveSans: string[],
): ChatTimelineItem[] {
  const out: ChatTimelineItem[] = [];
  let lastPly: number | null = null;
  for (const message of messages) {
    const ply = Math.max(0, Math.min(message.ply, moveSans.length));
    if (ply !== lastPly) {
      out.push({ kind: "move", ply, label: plyLabel(ply, moveSans) });
      lastPly = ply;
    }
    out.push({ kind: "message", message });
  }
  return out;
}

/** "Trước nước 1" / "12. Nf3" / "12… Nf6" style marker for a ply. */
export function plyLabel(ply: number, moveSans: string[]): string {
  if (ply <= 0) return "Trước nước đi đầu tiên";
  const san = moveSans[ply - 1];
  const moveNumber = Math.ceil(ply / 2);
  const isWhite = ply % 2 === 1;
  if (!san) return `Sau nước ${moveNumber}`;
  return isWhite ? `${moveNumber}. ${san}` : `${moveNumber}… ${san}`;
}

/** Client-side guard mirroring the database CHECK constraint. */
export function normalizeChatBody(input: string): string | null {
  const body = input.trim();
  if (!body) return null;
  return body.slice(0, CHAT_MAX_LENGTH);
}
