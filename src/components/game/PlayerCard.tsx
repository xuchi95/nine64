import { Bot, User } from "lucide-react";
import { Piece, type PieceType } from "@/components/chess/Piece";
import { Clock } from "./Clock";
import { getPieceSet } from "@/lib/chess/themes";
import { useSettings } from "@/lib/settings";
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
  const set = getPieceSet(settings.pieceSet);
  const opponentColor = player.color === "w" ? "b" : "w";

  return (
    <div
      className={cn(
        "panel flex items-center gap-3 p-3 transition-colors",
        active && "border-primary/50",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
        {player.isBot ? <Bot className="size-4" /> : <User className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{player.name}</span>
          {player.isBot && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-accent">
              BOT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{thinking ? "Thinking…" : player.subtitle}</span>
        </div>
        {captured.length > 0 && (
          <div className="mt-1 flex items-center gap-0.5">
            {captured.map((c) =>
              Array.from({ length: c.count }).map((_, i) => (
                <Piece
                  key={`${c.type}-${i}`}
                  type={c.type as PieceType}
                  color={opponentColor}
                  set={set}
                  size={16}
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
