import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GameResult } from "@/hooks/useChessGame";

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
  if (!result) return null;
  const outcome =
    result.winner === "draw"
      ? "Draw"
      : playerColor === null
        ? `${result.winner === "w" ? "White" : "Black"} wins`
        : result.winner === playerColor
          ? "Victory"
          : "Defeat";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-2xl">{outcome}</DialogTitle>
        </DialogHeader>
        <p className="text-center text-sm text-muted-foreground">{result.reason}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onRematch}>Rematch</Button>
          <Button variant="secondary" onClick={onNewGame}>
            New game
          </Button>
          <Button variant="outline" className="col-span-2" onClick={onAnalyse}>
            Analyse this game
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
