import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Lightbulb, RotateCcw, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { StockfishEngine } from "@/lib/engine/stockfish";
import { compareWhatIf, judgeRetry, retryHints, type RetryResult } from "@/lib/analysis/whatif";
import { cpToWinPercent, MATE_CP } from "@/lib/analysis/winrate";
import { MOTIF_LABEL } from "@/lib/analysis/motifs";
import { retrySkillEvent } from "@/lib/skills/detect";
import { skillsForPly } from "@/lib/skills/detect";
import { recordSkillEvents } from "@/lib/skills.functions";
import { useSettings } from "@/lib/settings";
import type { SavedGame } from "@/lib/history";
import type { PlyAnalysis } from "@/lib/analysis/types";

/**
 * Layers 3 & 4 — "Try again" and the What-If lab.
 *
 * The player proposes a legal move; the local Stockfish worker scores it and
 * `judgeRetry` / `compareWhatIf` turn the two evaluations into a verdict.
 * A solved retry emits a positive skill event for the skill the mistake failed.
 */
export function TrainingLab({
  game,
  onSelectMove,
}: {
  game: SavedGame;
  onSelectMove: (ply: number) => void;
}) {
  const { t } = useT();
  const settings = useSettings();
  const color = game.playerColor ?? "w";
  const engineRef = useRef<StockfishEngine | null>(null);

  const mistakes = useMemo(
    () =>
      (game.review?.plies ?? [])
        .filter(
          (p) =>
            p.color === color &&
            (p.label === "blunder" || p.label === "mistake" || p.label === "miss"),
        )
        .sort((a, b) => b.loss - a.loss)
        .slice(0, 3),
    [game.review, color],
  );

  const [activePly, setActivePly] = useState<number | null>(null);
  const active = mistakes.find((m) => m.index === activePly) ?? null;

  if (mistakes.length === 0) return null;

  return (
    <section className="panel p-4" aria-labelledby="training-lab">
      <h2
        id="training-lab"
        className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {t("review.lab.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("review.lab.subtitle")}</p>

      <div className="mt-3 space-y-2">
        {mistakes.map((ply) => (
          <div key={ply.index} className="rounded-md bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                {t("review.lab.position", {
                  move: Math.floor(ply.index / 2) + 1,
                  san: ply.san,
                })}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onSelectMove(ply.index - 1)}>
                  {t("review.lab.showOnBoard")}
                </Button>
                <Button
                  variant={activePly === ply.index ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setActivePly(activePly === ply.index ? null : ply.index)}
                >
                  <RotateCcw className="size-4" /> {t("review.lab.tryAgain")}
                </Button>
              </div>
            </div>
            {active?.index === ply.index && (
              <LabWorkbench
                key={ply.index}
                gameId={game.id}
                ply={ply}
                performance={settings.enginePerformance}
                engineRef={engineRef}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function legalMoves(fen: string): { uci: string; san: string }[] {
  const chess = new Chess();
  try {
    chess.load(fen);
  } catch {
    return [];
  }
  return chess.moves({ verbose: true }).map((m) => ({
    uci: `${m.from}${m.to}${m.promotion ?? ""}`,
    san: m.san,
  }));
}

function LabWorkbench({
  gameId,
  ply,
  performance,
  engineRef,
}: {
  gameId: string;
  ply: PlyAnalysis;
  performance: "performance" | "balanced" | "maximum";
  engineRef: React.MutableRefObject<StockfishEngine | null>;
}) {
  const { t } = useT();
  const moves = useMemo(() => legalMoves(ply.fenBefore), [ply.fenBefore]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RetryResult | null>(null);
  const [whatIf, setWhatIf] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hints = retryHints(
    ply.bestUci,
    ply.motifs.map((m) => MOTIF_LABEL[m]),
  );

  /** Mover-POV centipawns after `uci`, from the local engine. */
  const evaluate = async (uci: string): Promise<number> => {
    if (!engineRef.current) {
      engineRef.current = new StockfishEngine(performance);
      await engineRef.current.init();
    }
    const chess = new Chess();
    chess.load(ply.fenBefore);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as string | undefined) ?? "q" });
    const lines = await engineRef.current.search({ fen: chess.fen(), moveTimeMs: 600, multiPv: 1 });
    const line = lines[0];
    if (!line) return 0;
    const cp = line.mateIn !== null ? (line.mateIn > 0 ? MATE_CP : -MATE_CP) : (line.cp ?? 0);
    // Score is from the side to move after our move — flip back to the mover.
    return -cp;
  };

  const run = async (mode: "retry" | "whatif") => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const tryCp = await evaluate(choice);
      const bestCp = ply.bestUci ? await evaluate(ply.bestUci) : tryCp;
      if (mode === "retry") {
        const verdict = judgeRetry({
          fen: ply.fenBefore,
          bestUci: ply.bestUci,
          tryUci: choice,
          bestWin: cpToWinPercent(bestCp),
          tryWin: cpToWinPercent(tryCp),
        });
        setResult(verdict);
        setWhatIf(null);
        if (verdict.verdict === "solved" || verdict.verdict === "alsoGood") {
          const skill = skillsForPly(ply).find((s) => s.outcome === "negative");
          if (skill) {
            void recordSkillEvents({
              data: { events: [retrySkillEvent(gameId, ply, skill.key)] },
            }).catch(() => undefined);
          }
        }
      } else {
        const playedCp = ply.cpAfter ?? 0;
        const comparison = compareWhatIf(
          ply.fenBefore,
          choice,
          tryCp,
          ply.color === "w" ? playedCp : -playedCp,
        );
        setResult(null);
        setWhatIf(
          comparison
            ? t(`review.lab.whatif.${comparison.verdict}`, {
                san: comparison.san,
                delta: Math.abs(comparison.delta),
              })
            : t("review.lab.illegal"),
        );
      }
    } catch {
      setError(t("review.lab.engineError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <label className="block text-xs uppercase tracking-wider text-muted-foreground" htmlFor={`lab-${ply.index}`}>
        {t("review.lab.chooseMove")}
      </label>
      <select
        id={`lab-${ply.index}`}
        className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">{t("review.lab.selectPlaceholder")}</option>
        {moves.map((m) => (
          <option key={m.uci} value={m.uci}>
            {m.san}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!choice || busy} onClick={() => run("retry")}>
          <RotateCcw className="size-4" /> {t("review.lab.check")}
        </Button>
        <Button size="sm" variant="outline" disabled={!choice || busy} onClick={() => run("whatif")}>
          <FlaskConical className="size-4" /> {t("review.lab.whatIf")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={hintLevel >= hints.length}
          onClick={() => setHintLevel((h) => h + 1)}
        >
          <Lightbulb className="size-4" /> {t("review.lab.hint")}
        </Button>
      </div>

      {hintLevel > 0 && hints.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("review.lab.hintText", { hint: hints.slice(0, hintLevel).join(" · ") })}
        </p>
      )}
      {busy && <p className="text-xs text-muted-foreground">{t("review.lab.thinking")}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <p className="text-sm font-medium">
          {result.verdict === "illegal"
            ? t("review.lab.illegal")
            : t(`review.lab.verdict.${result.verdict}`, {
                san: result.san ?? "",
                loss: result.loss,
              })}
        </p>
      )}
      {whatIf && <p className="text-sm font-medium">{whatIf}</p>}
    </div>
  );
}
