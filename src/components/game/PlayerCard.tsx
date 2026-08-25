import { Bot, User } from "lucide-react";
import { Piece, type PieceType } from "@/components/chess/Piece";
import { Clock } from "./Clock";
import { useSettings } from "@/lib/settings";
import { useBoardStyle } from "@/components/chess/useBoardStyle";
import { cn } from "@/lib/utils";

export interface PlayerInfo {
  name: string;
  subtitle?: string;
  isBot?: boolean;
  color: "w" | "b";
}

export function PlayerCard({
  player,
  seconds,
  active,
  clockEnabled,
  captured,
  thinking,
}: {
  player: PlayerInfo;
  seconds: number;
  active: boolean;
  clockEnabled: boolean;
  captured: { type: string; count: number }[];
  thinking?: boolean;
}) {
  const settings = useSettings();
  const set = useBoardStyle().pieceSet;
  const opponentColor = player.color === "w" ? "b" : "w";

  return (
    <div
      className={cn(
        "panel group/player relative flex items-center gap-3 overflow-hidden p-3.5 pl-4 transition-[border-color,background-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none",
        active && "border-primary/70 bg-primary/[0.04]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] origin-top scale-y-100 transition-[background-color,transform] duration-300",
          active ? "bg-primary" : "bg-transparent group-hover/player:bg-primary/30",
        )}
      />
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md border transition-[background-color,border-color,color,transform] duration-300 group-hover/player:scale-[1.04] motion-reduce:transform-none",
          active
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border bg-surface-2 text-muted-foreground",
        )}
      >
        {player.isBot ? <Bot className="size-5" /> : <User className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold leading-tight">{player.name}</span>
          {player.isBot && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-primary">
              Bot
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[0.72rem] font-medium text-muted-foreground">
          {thinking ? (
            <span className="text-primary">Thinking…</span>
          ) : active ? (
            <span className="text-primary">To move</span>
          ) : (
            player.subtitle
          )}
        </div>
        {captured.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-px opacity-80">
            {captured.map((c) =>
              Array.from({ length: c.count }).map((_, i) => (
                <Piece
                  key={`${c.type}-${i}`}
                  type={c.type as PieceType}
                  color={opponentColor}
                  set={set}
                  size={15}
                />
              )),
            )}
          </div>
        )}
      </div>
      <Clock seconds={seconds} active={active} enabled={clockEnabled} />
    </div>
  );
}
