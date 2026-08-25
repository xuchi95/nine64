import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GameResult } from "@/hooks/useChessGame";
import { useT } from "@/lib/i18n";

export function ResultModal({
  result,
  playerColor,
  open,
  onOpenChange,
  onRematch,
  onAnalyse,
  onNewGame,
}: {
  result: GameResult | null;
  playerColor: "w" | "b" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRematch: () => void;
  onAnalyse: () => void;
  onNewGame: () => void;
}) {
  const { t } = useT();
  if (!result) return null;
  const outcome =
    result.winner === "draw"
      ? t("game.resultModal.draw")
      : playerColor === null
        ? t("game.resultModal.winnerWins", {
            winner: result.winner === "w" ? t("game.board.white") : t("game.board.black"),
          })
        : result.winner === playerColor
          ? t("game.resultModal.victory")
          : t("game.resultModal.defeat");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-2xl">{outcome}</DialogTitle>
        </DialogHeader>
        <p className="text-center text-sm text-muted-foreground">{result.reason}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onRematch}>{t("game.resultModal.rematch")}</Button>
          <Button variant="secondary" onClick={onNewGame}>
            {t("game.resultModal.newGame")}
          </Button>
          <Button variant="outline" className="col-span-2" onClick={onAnalyse}>
            {t("game.resultModal.analyse")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
