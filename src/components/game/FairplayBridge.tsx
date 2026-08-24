import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { reviewGame } from "@/lib/engine/review";
import { toObservations } from "@/lib/fairplay/engineProfile";
import { reportFairplayGame } from "@/lib/fairplay.functions";
import type { GameMove } from "@/lib/database.types";

interface Props {
  gameId: string;
  initialFen: string;
  moves: GameMove[];
  whiteId: string;
  blackId: string;
  /** Only one side runs the analysis to avoid duplicate work: white by default. */
  runAnalysis: boolean;
}

/**
 * Layer 2 of the fair play engine: after an online game ends, one client runs a
 * quick engine review and reports observations for BOTH players. Because either
 * side can submit and the server keeps the strongest verdict, a cheater cannot
 * bury their own report with a flattering analysis.
 */
export function FairplayBridge({ gameId, initialFen, moves, whiteId, blackId, runAnalysis }: Props) {
  const report = useServerFn(reportFairplayGame);
  const doneRef = useRef(false);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (!runAnalysis || doneRef.current || moves.length < 12) return;
    doneRef.current = true;
    const signal = { cancelled: false };

    void (async () => {
      setState("running");
      try {
        const review = await reviewGame({
          startFen: initialFen,
          moves: moves.map((m) => ({
            san: m.san,
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            color: m.move_number % 2 === 1 ? ("w" as const) : ("b" as const),
            fen: m.fen,
          })),
          moveTimeMs: 200,
          performance: "balanced",
          multiPv: 3,
          signal,
        });
        const plies = review.plies ?? [];
        if (plies.length === 0 || signal.cancelled) return;

        for (const [color, subjectId] of [
          ["w", whiteId],
          ["b", blackId],
        ] as const) {
          const observations = toObservations(plies, color).map((o, i) => ({
            ...o,
            spentMs: o.spentMs ?? spentFor(moves, color, i),
          }));
          if (observations.length === 0) continue;
          try {
            await report({ data: { gameId, subjectId, observations } });
          } catch {
            // a failed report must never break the game screen
          }
        }
      } catch {
        // engine unavailable — telemetry alone still reaches the server
      } finally {
        setState("done");
      }
    })();

    return () => {
      signal.cancelled = true;
    };
  }, [blackId, gameId, initialFen, moves, report, runAnalysis, whiteId]);

  if (state !== "running") return null;
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5" />
      Đang kiểm tra fair play cho ván này…
    </p>
  );
}

/** Derive the time spent on a move from the clock deltas stored per move. */
function spentFor(moves: GameMove[], color: "w" | "b", index: number): number | null {
  const own = moves.filter((m) => (m.move_number % 2 === 1 ? "w" : "b") === color);
  const current = own[index];
  const previous = own[index - 1];
  if (!current) return null;
  const key = color === "w" ? "white_time_ms" : "black_time_ms";
  if (!previous) return null;
  const delta = previous[key] - current[key];
  return delta > 0 ? delta : null;
}
