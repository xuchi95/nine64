import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Lightbulb, RotateCcw, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import type { Color } from "@/hooks/useChessGame";
import { useGameHistory } from "@/lib/history";
import { MOTIF_LABEL } from "@/lib/analysis/motifs";
import { formatRating, isProvisional } from "@/lib/rating/glicko2";
import { addPuzzles, gradePuzzle, hydrateLearn, useLearnState } from "@/lib/learn/store";
import { generateFromLibrary } from "@/lib/learn/puzzleGen";
import { isDue, retrievability, sortByUrgency } from "@/lib/learn/fsrs";
import type { Puzzle } from "@/lib/learn/puzzleGen";
import { playSound } from "@/lib/sound";

export const Route = createFileRoute("/puzzles/")({
  head: () => ({
    meta: [
      { title: `Puzzles from your games — ${APP.name}` },
      {
        name: "description",
        content:
          "Spaced-repetition tactics trainer built from the exact positions you misplayed, rated with Glicko-2.",
      },
      { property: "og:title", content: `Puzzles from your games — ${APP.name}` },
      {
        property: "og:description",
        content: "Train the tactics you actually missed, scheduled by an FSRS-style algorithm.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PuzzlesPage;
});

function PuzzlesPage() {
  return null;
}
