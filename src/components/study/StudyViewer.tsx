import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Code2,
  FlipHorizontal,
  Rewind,
  Zap,
} from "lucide-react";
import { ChessBoard, type BoardPiece } from "@/components/chess/ChessBoard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { rulesFor } from "@/lib/chess/rules";
import { StockfishEngine, type EngineLine } from "@/lib/engine/stockfish";
import { studyToPgn } from "@/lib/study/pgn";
import { STANDARD_FEN, type StudyChapter, type StudyNode, type StudyView } from "@/lib/study/types";
import { cn } from "@/lib/utils";
import type { PieceColor } from "@/components/chess/Piece";

function piecesFor(fen: string): BoardPiece[] {
  const rules = rulesFor("standard");
  try {
    return rules.createPosition(fen).boardPieces();
  } catch {
    return rules.createPosition().boardPieces();
  }
}

/** Square -> board percentage centre, respecting the current orientation. */
function centreOf(square: string, orientation: PieceColor): { x: number; y: number } | null {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  let file = square.charCodeAt(0) - 97;
  let rank = 8 - Number(square[1]);
  if (orientation === "b") {
    file = 7 - file;
    rank = 7 - rank;
  }
  return { x: (file + 0.5) * 12.5, y: (rank + 0.5) * 12.5 };
}

const ARROW_COLORS: Record<string, string> = {
  brass: "var(--color-primary, #c8a24a)",
  green: "#4ade80",
  red: "#f87171",
  blue: "#60a5fa",
};

/** Arrows + square highlights drawn over the board, read-only. */
function AnnotationLayer({
  node,
  chapter,
  orientation,
}: {
  node: StudyNode | null;
  chapter: StudyChapter;
  orientation: PieceColor;
}) {
  const arrows = node?.arrows ?? (node ? [] : (chapter.arrows ?? []));
  const highlights = node?.highlights ?? (node ? [] : (chapter.highlights ?? []));
  if (arrows.length === 0 && highlights.length === 0) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <marker id="study-arrow-head" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" fill="currentColor" />
        </marker>
      </defs>
      {highlights.map((h) => {
        const c = centreOf(h.square, orientation);
        if (!c) return null;
        return (
          <rect
            key={`h-${h.square}`}
            x={c.x - 6.25}
            y={c.y - 6.25}
            width={12.5}
            height={12.5}
            fill={ARROW_COLORS[h.color ?? "brass"]}
            opacity={0.32}
          />
        );
      })}
      {arrows.map((a, index) => {
        const from = centreOf(a.from, orientation);
        const to = centreOf(a.to, orientation);
        if (!from || !to) return null;
        return (
          <line
            key={`a-${index}-${a.from}${a.to}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={ARROW_COLORS[a.color ?? "brass"]}
            color={ARROW_COLORS[a.color ?? "brass"]}
            strokeWidth={1.6}
            opacity={0.85}
            markerEnd="url(#study-arrow-head)"
          />
        );
      })}
    </svg>
  );
}

/** Flatten a tree into rendered rows: main line inline, variations indented. */
interface TreeRow {
  node: StudyNode;
  ply: number;
  depth: number;
}

function flatten(nodes: StudyNode[], ply: number, depth: number, out: TreeRow[]): void {
  const [main, ...variations] = nodes;
  if (!main) return;
  out.push({ node: main, ply, depth });
  for (const variation of variations) {
    flatten([variation], ply, depth + 1, out);
  }
  flatten(main.children, ply + 1, depth, out);
}

function moveLabel(row: TreeRow, startWhite: boolean, startNumber: number): string {
  const whiteToMove = startWhite ? row.ply % 2 === 0 : row.ply % 2 === 1;
  const number = startNumber + Math.floor((row.ply + (startWhite ? 0 : 1)) / 2);
  return whiteToMove ? `${number}.` : `${number}...`;
}

export interface StudyViewerProps {
  study: StudyView;
  /** Absolute URL used by the embed snippet; omitted hides the snippet. */
  shareUrl?: string;
  embedUrl?: string;
  compact?: boolean;
}

export function StudyViewer({ study, shareUrl, embedUrl, compact = false }: StudyViewerProps) {
  const chapters = study.content.chapters;
  const [chapterIndex, setChapterIndex] = useState(0);
  const chapter = chapters[Math.min(chapterIndex, chapters.length - 1)];
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<PieceColor>("w");
  const [engineOn, setEngineOn] = useState(false);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [copied, setCopied] = useState<"pgn" | "link" | "embed" | null>(null);
  const engineRef = useRef<StockfishEngine | null>(null);

  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    if (chapter) flatten(chapter.children, 0, 0, out);
    return out;
  }, [chapter]);

  useEffect(() => setNodeId(null), [chapterIndex]);

  const current = useMemo(
    () => (nodeId ? (rows.find((r) => r.node.id === nodeId)?.node ?? null) : null),
    [nodeId, rows],
  );
  const viewFen = current?.fen ?? chapter?.startFen ?? STANDARD_FEN;
  const pieces = useMemo(() => piecesFor(viewFen), [viewFen]);
  const turn: PieceColor = (viewFen.split(" ")[1] === "b" ? "b" : "w") as PieceColor;

  const mainRows = useMemo(() => rows.filter((r) => r.depth === 0), [rows]);
  const currentMainIndex = mainRows.findIndex((r) => r.node.id === nodeId);

  const step = useCallback(
    (delta: number) => {
      const next = currentMainIndex + delta;
      if (next < 0) setNodeId(null);
      else if (next < mainRows.length) setNodeId(mainRows[next]?.node.id ?? null);
    },
    [currentMainIndex, mainRows],
  );

  useEffect(() => {
    if (!engineOn || !study.engineAllowed) {
      engineRef.current?.destroy();
      engineRef.current = null;
      setLines([]);
      return;
    }
    let cancelled = false;
    const engine = engineRef.current ?? new StockfishEngine();
    engineRef.current = engine;
    void engine
      .search({ fen: viewFen, depth: 16, multiPv: 2 })
      .then((result) => {
        if (!cancelled) setLines(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [engineOn, study.engineAllowed, viewFen]);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [],
  );

  const copy = useCallback(async (value: string, kind: "pgn" | "link" | "embed") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1_800);
    } catch {
      /* clipboard blocked — the textarea below still allows manual copy */
    }
  }, []);

  if (!chapter) {
    return <p className="text-sm text-muted-foreground">Study này chưa có chương nào.</p>;
  }

  const startWhite = (chapter.startFen ?? STANDARD_FEN).split(" ")[1] !== "b";
  const startNumber = Number((chapter.startFen ?? STANDARD_FEN).split(" ")[5] ?? 1) || 1;
  const embedSnippet = embedUrl
    ? `<iframe src="${embedUrl}" width="420" height="500" frameborder="0" title="${study.title}" loading="lazy"></iframe>`
    : "";

  return (
    <div className={cn("grid gap-6", compact ? "" : "lg:grid-cols-[minmax(0,1fr)_360px]")}>
      <div className="space-y-3">
        <div className="relative">
          <ChessBoard
            pieces={pieces}
            orientation={orientation}
            turn={turn}
            interactive={false}
            legalTargets={() => []}
            canMoveFrom={() => false}
            onMove={() => false}
            needsPromotion={() => false}
          />
          <AnnotationLayer node={current} chapter={chapter} orientation={orientation} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setNodeId(null)} aria-label="Về đầu ván">
            <Rewind className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => step(-1)} aria-label="Nước trước">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => step(1)} aria-label="Nước sau">
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
          >
            <FlipHorizontal className="mr-1 size-4" /> Xoay bàn
          </Button>
          {study.engineAllowed ? (
            <Button
              variant={engineOn ? "default" : "outline"}
              size="sm"
              onClick={() => setEngineOn((v) => !v)}
            >
              <Zap className="mr-1 size-4" /> Engine
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copy(studyToPgn(chapters), "pgn")}
          >
            {copied === "pgn" ? <Check className="mr-1 size-4" /> : <Copy className="mr-1 size-4" />} PGN
          </Button>
          {shareUrl ? (
            <Button variant="outline" size="sm" onClick={() => void copy(shareUrl, "link")}>
              {copied === "link" ? <Check className="mr-1 size-4" /> : <Copy className="mr-1 size-4" />} Link
            </Button>
          ) : null}
          {embedSnippet ? (
            <Button variant="outline" size="sm" onClick={() => void copy(embedSnippet, "embed")}>
              {copied === "embed" ? <Check className="mr-1 size-4" /> : <Code2 className="mr-1 size-4" />} Nhúng
            </Button>
          ) : null}
        </div>

        {engineOn && lines.length > 0 ? (
          <div className="rounded-lg border border-border/60 bg-card/60 p-3 font-mono text-xs">
            {lines.map((line, index) => (
              <div key={index} className="truncate">
                {line.mateIn !== null
                  ? `M${Math.abs(line.mateIn)}`
                  : `${((line.cp ?? 0) / 100).toFixed(2)}`}{" "}
                — {line.pv?.slice(0, 8).join(" ")}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {chapters.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {chapters.map((c, index) => (
              <Button
                key={c.id}
                size="sm"
                variant={index === chapterIndex ? "default" : "outline"}
                onClick={() => setChapterIndex(index)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nước đi</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-1 overflow-y-auto text-sm">
            {chapter.comment ? (
              <p className="mb-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {chapter.comment}
              </p>
            ) : null}
            {rows.length === 0 ? (
              <p className="text-muted-foreground">Thế cờ tĩnh — không có nước đi.</p>
            ) : null}
            {rows.map((row) => (
              <div
                key={row.node.id}
                style={{ paddingLeft: `${row.depth * 12}px` }}
                className={row.depth > 0 ? "text-xs text-muted-foreground" : ""}
              >
                <button
                  type="button"
                  onClick={() => setNodeId(row.node.id)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono hover:bg-muted",
                    row.node.id === nodeId && "bg-primary/20 text-primary",
                  )}
                >
                  {moveLabel(row, startWhite, startNumber)} {row.node.san}
                </button>
                {row.node.comment ? (
                  <span className="ml-1 italic text-muted-foreground">{row.node.comment}</span>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        {embedSnippet ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Mã nhúng</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea readOnly value={embedSnippet} rows={3} className="font-mono text-xs" />
              <p className="mt-2 text-xs text-muted-foreground">
                Bàn cờ nhúng chỉ đọc, chạy độc lập và không truy cập phiên đăng nhập Nine64.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{study.mode}</Badge>
          <Badge variant="outline">{study.visibility}</Badge>
          {study.result ? <Badge variant="outline">{study.result}</Badge> : null}
        </div>
      </div>
    </div>
  );
}
