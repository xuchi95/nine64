import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, ShieldAlert, Scale, HelpCircle } from "lucide-react";
import { probeEndgame } from "@/lib/learn/tablebase.functions";
import { verdictOf } from "@/lib/learn/tablebaseVerdict";
import type { TablebaseResult } from "@/lib/learn/tablebase.server";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  fen: string;
  /** Engine fallback line shown when the tablebase has nothing to say. */
  engineFallback?: string | null;
}

/**
 * Tablebase verdict in human language first, technical DTZ/DTM second.
 * When the service is unavailable we say so and lean on the engine — we never
 * invent a result.
 */
export function TablebasePanel({ fen, engineFallback = null }: Props) {
  const { t } = useT();
  const probe = useServerFn(probeEndgame);
  const [state, setState] = useState<{ loading: boolean; result: TablebaseResult | null }>({
    loading: true,
    result: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, result: null });
    void probe({ data: { fen } })
      .then((result) => {
        if (!cancelled) setState({ loading: false, result });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [fen, probe]);

  const verdict = verdictOf(state.result);
  const Icon =
    verdict.tone === "win"
      ? ShieldCheck
      : verdict.tone === "loss"
        ? ShieldAlert
        : verdict.tone === "draw"
          ? Scale
          : HelpCircle;

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {state.loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
        {t("academy.tb.title")}
      </h3>
      {state.loading ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("academy.loading")}</p>
      ) : (
        <>
          <p
            className={cn(
              "mt-2 text-sm font-medium",
              verdict.tone === "win" && "text-emerald-400",
              verdict.tone === "loss" && "text-destructive",
              verdict.tone === "draw" && "text-amber-300",
              verdict.tone === "unknown" && "text-muted-foreground",
            )}
          >
            {t(verdict.headlineKey)}
          </p>
          {verdict.detailKey ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {t(verdict.detailKey, verdict.detailParams)}
            </p>
          ) : null}
          {state.result?.available && state.result.moves.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("academy.tb.bestMoves")}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {state.result.moves.slice(0, 5).map((move) => (
                  <li
                    key={move.uci}
                    className="rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-xs"
                  >
                    {move.san || move.uci}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!state.result?.available && engineFallback ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("academy.tb.engineFallback")}: <span className="font-mono">{engineFallback}</span>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
