import { useMemo, useState } from "react";
import { Eye, EyeOff, Flag } from "lucide-react";
import type { SavedGame } from "@/lib/history";
import { useT } from "@/lib/i18n";
import {
  MAX_TECH_PLIES,
  MAX_TECH_VARIATIONS,
  evalWord,
  fallbackExplanation,
  focusFromPly,
  phaseLabel,
  pickTurningPoints,
  rawScoreText,
  severityLabel,
  type AnalysisFocus,
  type TurningPoint,
  type TurningSeverity,
} from "@/lib/analysis/presentation";
import type { CoachMistake } from "@/lib/coach/types";

const SEVERITY_RING: Record<TurningSeverity, string> = {
  slight: "border-border bg-surface-2",
  lostEdge: "border-warning/40 bg-warning/10",
  bigMistake: "border-destructive/40 bg-destructive/10",
  missedWin: "border-destructive/50 bg-destructive/15",
};

const SEVERITY_TONE: Record<TurningSeverity, string> = {
  slight: "text-muted-foreground",
  lostEdge: "text-warning",
  bigMistake: "text-destructive",
  missedWin: "text-destructive",
};

interface Props {
  game: SavedGame;
  onSelectMove: (index: number) => void;
  focus: AnalysisFocus | null;
  onFocus: (focus: AnalysisFocus | null) => void;
}

/** Finds the AI coach note that belongs to a turning point, if any. */
function coachNoteFor(game: SavedGame, plyIndex: number): CoachMistake | null {
  const mistakes = game.coach?.mistakes ?? [];
  const byPly = mistakes.find((m) => m.plyIndex === plyIndex);
  if (byPly) return byPly;
  // Legacy reports carry only a move number — match it loosely.
  const moveNumber = Math.floor(plyIndex / 2) + 1;
  return mistakes.find((m) => m.plyIndex === undefined && m.moveNumber === moveNumber) ?? null;
}

/** Default layer: at most three turning points, explained in plain language. */
export function VariationPanel({ game, onSelectMove, focus, onFocus }: Props) {
  const { t, locale } = useT();
  const side = game.playerColor ?? "w";
  const points = useMemo(
    () => pickTurningPoints(game.review?.plies, side),
    [game.review, side],
  );

  if (!game.review?.plies?.length) return null;

  return (
    <section className="panel p-4">
      <div className="flex items-center gap-2">
        <Flag className="size-4 text-accent" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("game.turning.title")}
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("game.turning.subtitle")}</p>

      {points.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("game.turning.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {points.map((point, i) => (
            <TurningCard
              key={point.index}
              point={point}
              ordinal={i + 1}
              game={game}
              locale={locale}
              t={t}
              focused={focus?.plyIndex === point.index}
              onSelectMove={onSelectMove}
              onFocus={onFocus}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function TurningCard({
  point,
  ordinal,
  game,
  locale,
  t,
  focused,
  onSelectMove,
  onFocus,
}: {
  point: TurningPoint;
  ordinal: number;
  game: SavedGame;
  locale: "vi" | "en";
  t: (key: string, vars?: Record<string, string | number>) => string;
  focused: boolean;
  onSelectMove: (index: number) => void;
  onFocus: (focus: AnalysisFocus | null) => void;
}) {
  const [showTech, setShowTech] = useState(false);
  const { ply, severity, moveNumber } = point;
  const coachNote = coachNoteFor(game, ply.index);
  const fallback = fallbackExplanation(point, locale);
  const whatHappened = coachNote?.whatHappened?.trim() || fallback.whatHappened;
  const betterPlan = coachNote?.betterPlan?.trim() || fallback.betterPlan;
  const arrow = focusFromPly(ply);
  const techId = `turning-tech-${ply.index}`;
  const variations = (ply.variations ?? []).slice(0, MAX_TECH_VARIATIONS);

  return (
    <li className={`rounded-lg border p-3 ${SEVERITY_RING[severity]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider">
          {t("game.turning.item", { n: ordinal })}
        </span>
        <span className="rounded bg-background/60 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {phaseLabel(ply.phase, locale)}
        </span>
        <span className={`text-xs font-semibold ${SEVERITY_TONE[severity]}`}>
          {severityLabel(severity, locale)}
        </span>
        <button
          type="button"
          onClick={() => {
            onFocus(null);
            onSelectMove(ply.index);
          }}
          className="tabular ml-auto rounded bg-background/60 px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground hover:text-primary"
        >
          {t("game.turning.moveChip", { n: moveNumber })}
        </button>
      </div>

      <p className="mt-2 text-sm">
        <span className="font-semibold">{t("game.turning.whatHappened")}: </span>
        {whatHappened}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{t("game.turning.nextTime")}: </span>
        {betterPlan}
      </p>
      {coachNote?.title ? (
        <p className="mt-1 text-2xs uppercase tracking-wider text-muted-foreground">
          {t("game.turning.fromCoach")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {arrow ? (
          focused ? (
            <button
              type="button"
              onClick={() => onFocus(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-xs font-semibold hover:border-primary/50"
            >
              <EyeOff className="size-3.5" aria-hidden /> {t("game.turning.hideHint")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onFocus(arrow)}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Eye className="size-3.5" aria-hidden /> {t("game.turning.showOnBoard")}
            </button>
          )
        ) : null}

        {variations.length > 0 ? (
          <button
            type="button"
            aria-expanded={showTech}
            aria-controls={techId}
            onClick={() => setShowTech((v) => !v)}
            className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {showTech ? t("game.turning.hideTech") : t("game.turning.showTech")}
          </button>
        ) : (
          <span className="text-2xs text-muted-foreground">{t("game.turning.needDeep")}</span>
        )}
      </div>

      {showTech && variations.length > 0 ? (
        <div id={techId} className="mt-3 space-y-2 rounded-md bg-background/50 p-3">
          <p className="tabular text-xs">
            <span className="font-semibold">{t("game.turning.youPlayed")}: </span>
            {ply.san}
          </p>
          {variations[0]?.san ? (
            <p className="tabular text-xs">
              <span className="font-semibold">{t("game.turning.enginePrefers")}: </span>
              {variations[0].san}
            </p>
          ) : null}
          <ol className="space-y-2">
            {variations.map((v, idx) => (
              <li key={v.uci} className="rounded bg-surface-2 p-2">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("game.turning.line", { n: idx + 1 })} ·{" "}
                  {evalWord(v.cp, v.mateIn, ply.color, locale)}
                </p>
                <p className="tabular mt-1 break-words text-xs leading-relaxed">
                  {v.pvSan.slice(0, MAX_TECH_PLIES).join(" ")}
                </p>
                <p className="tabular mt-1 text-2xs text-muted-foreground">
                  {t("game.turning.engineData", {
                    score: rawScoreText(v.cp, v.mateIn),
                    depth: v.depth,
                  })}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  );
}
