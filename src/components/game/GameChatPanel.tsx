import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { GamePanel } from "@/components/game/GamePanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listGameChat, sendGameChat } from "@/lib/chat.functions";
import {
  buildChatTimeline,
  mergeChatMessages,
  normalizeChatBody,
  CHAT_MAX_LENGTH,
  type GameChatMessage,
} from "@/lib/chat/messages";
import { cn } from "@/lib/utils";
import { uniqueTopic } from "@/lib/realtime";

const POLL_MS = 5000;

export interface GameChatPanelProps {
  gameId: string;
  /** SAN list of the moves played so far — used for the move markers. */
  moveSans: string[];
  /** Current ply; new messages are anchored to it. */
  ply: number;
  /** Signed-in user id, or null when the viewer cannot post. */
  userId: string | null;
  /** `true` for a spectator surface (read-only styling hints). */
  readOnlyReason?: string | null;
  className?: string;
}

/**
 * Move-synced chat room shared by both players and spectators.
 *
 * Messages carry the ply they were written at, so the transcript stays aligned
 * with the game instead of being a detached log. Realtime inserts arrive over
 * the Supabase channel; a slow poll fills any gap when the socket drops.
 */
export function GameChatPanel({
  gameId,
  moveSans,
  ply,
  userId,
  readOnlyReason = null,
  className,
}: GameChatPanelProps) {
  const listFn = useServerFn(listGameChat);
  const sendFn = useServerFn(sendGameChat);
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestRef = useRef<string | null>(null);

  const ingest = useCallback((incoming: GameChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const merged = mergeChatMessages(prev, incoming);
      latestRef.current = merged[merged.length - 1]?.created_at ?? latestRef.current;
      return merged;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const rows = (await listFn({
        data: { gameId, since: latestRef.current },
      })) as GameChatMessage[];
      ingest(rows);
    } catch {
      /* transient: realtime or the next poll recovers */
    }
  }, [gameId, ingest, listFn]);

  useEffect(() => {
    setMessages([]);
    latestRef.current = null;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const channel = supabase
      .channel(uniqueTopic(`game-chat:${gameId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_chat_messages",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => ingest([payload.new as GameChatMessage]),
      )
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [gameId, ingest, refresh]);

  const timeline = useMemo(() => buildChatTimeline(messages, moveSans), [messages, moveSans]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = normalizeChatBody(draft);
    if (!body || !userId || sending) return;
    setSending(true);
    setError(null);
    try {
      const row = (await sendFn({ data: { gameId, body, ply } })) as GameChatMessage;
      ingest([row]);
      setDraft("");
    } catch {
      setError("Không gửi được tin nhắn. Thử lại nhé.");
    } finally {
      setSending(false);
    }
  };

  return (
    <GamePanel
      title="Trò chuyện"
      meta={<span>{messages.length}</span>}
      className={className ?? ""}
      bodyClassName="flex flex-col"
    >
      <div ref={scrollRef} className="max-h-72 min-h-32 flex-1 space-y-2 overflow-y-auto p-3">
        {timeline.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Chưa có tin nhắn nào. Hãy chào đối thủ và khán giả.
          </p>
        )}
        {timeline.map((item) =>
          item.kind === "move" ? (
            <div
              key={`ply-${item.ply}`}
              className="flex items-center gap-2 pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
            >
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono normal-case tracking-normal">{item.label}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : (
            <div key={item.message.id} className="text-sm">
              <span
                className={cn(
                  "mr-1.5 font-semibold",
                  item.message.author_role === "player" ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.message.author_name}
                {item.message.author_role === "spectator" && (
                  <span className="ml-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                    khán giả
                  </span>
                )}
                :
              </span>
              <span className="break-words">{item.message.body}</span>
            </div>
          ),
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          disabled={!userId || Boolean(readOnlyReason) || sending}
          placeholder={
            readOnlyReason ?? (userId ? "Nhắn cho đối thủ và khán giả…" : "Đăng nhập để trò chuyện")
          }
          aria-label="Nội dung tin nhắn"
          className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-60"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!userId || Boolean(readOnlyReason) || sending || !normalizeChatBody(draft)}
          aria-label="Gửi tin nhắn"
        >
          <Send className="size-4" />
        </Button>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-destructive">{error}</p>}
    </GamePanel>
  );
}
