import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  FlipVertical2,
  Gauge,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { EvalGraph } from "@/components/game/EvalGraph";
import { MoveList } from "@/components/game/MoveList";
import { CoachPanel } from "@/components/game/CoachPanel";
import { VariationPanel } from "@/components/game/VariationPanel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { APP } from "@/config/app";
import type { Color } from "@/hooks/useChessGame";
import { attachReview, formatEval, outcomeLabel, toPgn, useSavedGame } from "@/lib/history";
import { reviewGame } from "@/lib/engine/review";
import { generatePuzzles } from "@/lib/learn/puzzleGen";
import { addPuzzles } from "@/lib/learn/store";
import { useSettings } from "@/lib/settings";
import { BoardSkeleton } from "@/components/layout/PageSkeleton";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/games/$gameId")({
  head: () => ({
    meta: [
      { title: `Chi tiết ván đấu — ${APP.name}` },
      {
        name: "description",
        content:
          "Xem lại từng nước của ván đấu đã lưu với biểu đồ đánh giá, độ chính xác của mỗi bên và xuất PGN.",
      },
      { property: "og:title", content: `Chi tiết ván đấu — ${APP.name}` },
      {
        property: "og:description",
        content: "Xem lại từng nước với đánh giá engine và độ chính xác.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: BoardSkeleton,
  component: GameDetail,
});

function GameDetail() {
  const { t } = useT();
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const game = useSavedGame(gameId);

  // -1 = starting position, otherwise index into moves.
  const [cursor, setCursor] = useState(-1);
  const [orientation, setOrientation] = useState<Color>("w");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [deep, setDeep] = useState(false);
  /** Single engine suggestion currently drawn on the board. */
  const [focus, setFocus] = useState<AnalysisFocus | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  /** Manual navigation always clears the suggestion arrow. */
  const goto = useCallback((next: number | ((c: number) => number)) => {
    setFocus(null);
    setCursor(next);
  }, []);

  /** Jump to the position right BEFORE the mistake and draw one arrow. */
  const showOnBoard = useCallback((next: AnalysisFocus | null) => {
    setFocus(next);
    if (next) setCursor(next.plyIndex - 1);
  }, []);

  useEffect(() => {
    if (game) setCursor(game.moves.length - 1);
    if (game?.playerColor) setOrientation(game.playerColor);
    setFocus(null);
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    const signal = cancelRef.current;
    return () => {
      signal.cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game) return;
      if (e.key === "ArrowLeft") setCursor((c) => Math.max(-1, c - 1));
      if (e.key === "ArrowRight") setCursor((c) => Math.min(game.moves.length - 1, c + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game?.id, game?.moves.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fen = useMemo(() => {
    if (!game) return null;
    if (cursor < 0) return game.startFen;
    return game.moves[Math.min(cursor, game.moves.length - 1)]?.fen ?? game.startFen;
  }, [game, cursor]);

  const position = useMemo(() => {
    if (!fen) return null;
    const chess = new Chess();
    try {
      chess.load(fen);
    } catch {
      return null;
    }
    const pieces = chess
      .board()
      .flat()
      .filter((sq): sq is NonNullable<typeof sq> => sq !== null)
      .map((sq) => ({ square: sq.square as string, type: sq.type, color: sq.color }));
    let checkSquare: string | null = null;
    if (chess.isCheck()) {
      for (const row of chess.board()) {
        for (const sq of row) {
          if (sq && sq.type === "k" && sq.color === chess.turn()) checkSquare = sq.square as string;
        }
      }
    }
    return { pieces, turn: chess.turn() as Color, checkSquare };
  }, [fen]);

  if (!game) {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">{t("play.detail.notFoundTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("play.detail.notFoundText")}
        </p>
        <Button asChild className="mt-4">
          <Link to="/games">{t("play.detail.backToGames")}</Link>
        </Button>
      </AppShell>
    );
  }

  const lastMove = cursor >= 0 ? game.moves[cursor] ?? null : null;
  const evalNow =
    game.review === undefined
      ? null
      : cursor < 0
        ? game.review.startEval
        : (game.review.evals[cursor] ?? null);

  const runReview = async () => {
    cancelRef.current = { cancelled: false };
    setProgress({ done: 0, total: game.moves.length + 1 });
    try {
      const review = await reviewGame({
        startFen: game.startFen,
        moves: game.moves,
        performance: settings.enginePerformance,
        deep,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: cancelRef.current,
      });
      attachReview(game.id, review);
      const created = addPuzzles(generatePuzzles({ ...game, review }));
      toast.success(t(deep ? "play.detail.deepReviewComplete" : "play.detail.reviewComplete"), {
        description:
          t("play.detail.reviewCompleteDesc", { w: review.accuracy.w, b: review.accuracy.b }) +
          (created > 0 ? ` · ${t("play.detail.puzzlesAdded", { n: created })}` : ""),
      });
    } catch (e) {
      toast.error(t("play.detail.reviewFailed"), { description: (e as Error).message });
    } finally {
      setProgress(null);
    }
  };

  return (
    <AppShell wide>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/games" })}>
          <ArrowLeft className="size-4" /> {t("play.detail.myGames")}
        </Button>
        <h1 className="font-display text-xl font-bold">
          {game.white.name} <span className="text-muted-foreground">{t("play.games.vsBadge")}</span> {game.black.name}
        </h1>
        <span className="rounded bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
          {outcomeLabel(game)} · {game.result.reason}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto w-full max-w-[720px]">
          {position && (
            <ChessBoard
              pieces={position.pieces}
              orientation={orientation}
              turn={position.turn}
              legalTargets={() => []}
              canMoveFrom={() => false}
              onMove={() => false}
              needsPromotion={() => false}
              interactive={false}
              lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
              checkSquare={position.checkSquare}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label={t("play.detail.firstMove")} onClick={() => setCursor(-1)}>
              <SkipBack className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("play.detail.prevMove")}
              onClick={() => setCursor((c) => Math.max(-1, c - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("play.detail.nextMove")}
              onClick={() => setCursor((c) => Math.min(game.moves.length - 1, c + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("play.detail.lastMove")}
              onClick={() => setCursor(game.moves.length - 1)}
            >
              <SkipForward className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
            >
              <FlipVertical2 className="size-4" /> {t("play.detail.flip")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate({ to: "/analysis", search: { fen: fen ?? game.finalFen } })}
            >
              {t("play.detail.openAnalysis")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(toPgn(game))
                  .then(() => toast.success(t("play.detail.pgnCopied")))
                  .catch(() => toast.error(t("play.detail.clipboardUnavailable")));
              }}
            >
              <Copy className="size-4" /> {t("play.detail.copyPgn")}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("play.detail.evaluation")}
              </h2>
              <span className="tabular text-sm font-semibold">{formatEval(evalNow)}</span>
            </div>
            {game.review ? (
              <>
                <EvalGraph
                  className="mt-3"
                  startEval={game.review.startEval}
                  evals={game.review.evals}
                  activeIndex={cursor}
                  onSelect={setCursor}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-surface-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("play.detail.whiteAccuracy")}
                    </p>
                    <p className="tabular font-display text-xl font-bold">
                      {game.review.accuracy.w}%
                    </p>
                  </div>
                  <div className="rounded-md bg-surface-2 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("play.detail.blackAccuracy")}
                    </p>
                    <p className="tabular font-display text-xl font-bold">
                      {game.review.accuracy.b}%
                    </p>
                  </div>
                </div>
            <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-surface-2 p-3">
              <div>
                <Label htmlFor="deep-review" className="text-sm font-semibold">
                  {t("play.detail.deepReview")}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("play.detail.deepReviewDesc")}
                </p>
              </div>
              <Switch
                id="deep-review"
                checked={deep}
                disabled={progress !== null}
                onCheckedChange={setDeep}
              />
            </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={progress !== null}
                  onClick={runReview}
                >
                  <Gauge className="size-4" /> {deep ? t("play.detail.runDeepReview") : t("play.detail.rerunReview")}
                </Button>
              </>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">
                  {t("play.detail.reviewIntro")}
                </p>
            <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-surface-2 p-3">
              <div>
                <Label htmlFor="deep-review" className="text-sm font-semibold">
                  {t("play.detail.deepReview")}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("play.detail.deepReviewDesc")}
                </p>
              </div>
              <Switch
                id="deep-review"
                checked={deep}
                disabled={progress !== null}
                onCheckedChange={setDeep}
              />
            </div>
                <Button className="mt-3 w-full" disabled={progress !== null} onClick={runReview}>
                  <Gauge className="size-4" />
                  {progress
                    ? t("play.detail.reviewing", { done: progress.done, total: progress.total })
                    : deep
                      ? t("play.detail.runDeepReview")
                      : t("play.detail.runReview")}
                </Button>
              </div>
            )}
            {progress && game.review && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {t("play.detail.reviewing", { done: progress.done, total: progress.total })}
              </p>
            )}
          </div>

          <VariationPanel game={game} onSelectMove={setCursor} />

          <CoachPanel game={game} onSelectMove={setCursor} />

          <div className="panel flex max-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("play.detail.moves")}
            </div>
            <MoveList moves={game.moves} activeIndex={cursor} onSelect={setCursor} />
          </div>

          <div className="panel space-y-2 p-4 text-sm">
            <Row label={t("play.detail.mode")} value={game.mode === "ai" ? t("play.detail.modeAi") : t("play.detail.modeLocal")} />
            <Row label={t("play.detail.variant")} value={game.variantName} />
            <Row label={t("play.detail.timeControl")} value={game.timeControl} />
            <Row label={t("play.detail.opening")} value={game.opening ?? "—"} />
            <Row label={t("play.detail.movesLabel")} value={String(game.moves.length)} />
            <Row label={t("play.detail.played")} value={new Date(game.playedAt).toLocaleString()} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
