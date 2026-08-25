import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Piece, type PieceColor, type PieceType } from "./Piece";
import { getBoardTheme, getPieceSet } from "@/lib/chess/themes";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sound";

export interface BoardPiece {
  square: string;
  type: PieceType;
  color: PieceColor;
}

export interface ChessBoardProps {
  pieces: BoardPiece[];
  orientation: PieceColor;
  /** squares the side to move may move to from a given square */
  legalTargets: (square: string) => string[];
  /** true when the given square holds a piece the user may move now */
  canMoveFrom: (square: string) => boolean;
  onMove: (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => boolean;
  needsPromotion: (from: string, to: string) => boolean;
  lastMove?: { from: string; to: string } | null;
  checkSquare?: string | null;
  /** explicit mate flag from the rules engine; falls back to a board-side check */
  checkmate?: boolean;
  interactive?: boolean;
  /** premove currently armed (rendered as a ghost highlight) */
  premove?: { from: string; to: string } | null;
  onPremove?: (from: string, to: string) => void;
  turn: PieceColor;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

interface TrackedPiece extends BoardPiece {
  id: number;
}

interface Ghost extends BoardPiece {
  id: number;
  key: number;
}

let idCounter = 0;
let ghostCounter = 0;

interface TrackResult {
  result: TrackedPiece[];
  /** ids of pieces that changed square in this update (animate the travel) */
  movedIds: number[];
  /** pieces that left the board (animate the capture) */
  removed: TrackedPiece[];
}

function trackPieces(prev: TrackedPiece[], next: BoardPiece[]): TrackResult {
  const remaining = [...prev];
  const result: TrackedPiece[] = [];
  const movedIds: number[] = [];
  const prevSquares = new Map(prev.map((p) => [p.id, p.square]));
  const takeExact = (p: BoardPiece): TrackedPiece | null => {
    const i = remaining.findIndex(
      (r) => r.square === p.square && r.type === p.type && r.color === p.color,
    );
    if (i === -1) return null;
    return remaining.splice(i, 1)[0] ?? null;
  };
  const takeSimilar = (p: BoardPiece): TrackedPiece | null => {
    const i = remaining.findIndex((r) => r.type === p.type && r.color === p.color);
    if (i === -1) return null;
    return remaining.splice(i, 1)[0] ?? null;
  };

  const pending: BoardPiece[] = [];
  for (const p of next) {
    const exact = takeExact(p);
    if (exact) result.push({ ...p, id: exact.id });
    else pending.push(p);
  }
  for (const p of pending) {
    const similar = takeSimilar(p);
    const id = similar ? similar.id : ++idCounter;
    if (similar && prevSquares.get(id) !== p.square) movedIds.push(id);
    result.push({ ...p, id });
  }
  return { result, movedIds, removed: remaining };
}


export function ChessBoard(props: ChessBoardProps) {
  const {
    pieces,
    orientation,
    legalTargets,
    canMoveFrom,
    onMove,
    needsPromotion,
    lastMove,
    checkSquare,
    checkmate,
    interactive = true,
    premove,
    onPremove,
  } = props;

  const settings = useSettings();
  const theme = getBoardTheme(settings.boardTheme);
  const pieceSet = getPieceSet(settings.pieceSet);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(480);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null);
  const [focusedSquare, setFocusedSquare] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: number; from: string; x: number; y: number } | null>(
    null,
  );
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [tracked, setTracked] = useState<TrackedPiece[]>([]);
  const trackedRef = useRef<TrackedPiece[]>([]);
  /** ids currently travelling — get a lift + elevated stacking while in flight */
  const [travelling, setTravelling] = useState<Set<number>>(() => new Set());
  /** captured pieces kept on screen for a short fade-out */
  const [ghosts, setGhosts] = useState<Ghost[]>([]);

  const transitionMs = settings.animations ? settings.animationMs : 0;

  /** Check alert: a banner + board frame flash each time a new check appears. */
  const [checkAlert, setCheckAlert] = useState(0);
  const prevCheckRef = useRef<string | null>(null);
  useEffect(() => {
    if (checkSquare && checkSquare !== prevCheckRef.current) {
      setCheckAlert((n) => n + 1);
    }
    prevCheckRef.current = checkSquare ?? null;
  }, [checkSquare]);

  /** Who is giving check, and along which squares — used to explain the check. */
  const checkAttacks = useMemo(
    () => findCheckAttacks(pieces, checkSquare),
    [pieces, checkSquare],
  );
  const attackerSquares = useMemo(
    () => new Set(checkAttacks.map((a) => a.from)),
    [checkAttacks],
  );
  const raySquares = useMemo(
    () => new Set(checkAttacks.flatMap((a) => a.ray)),
    [checkAttacks],
  );


  /**
   * Checkmate = the side to move is in check and has no legal target anywhere.
   * Only trusted on interactive boards, where `legalTargets` is a real query.
   */
  const isCheckmate =
    checkmate ??
    (interactive &&
      !!checkSquare &&
      !pieces.some((p) => p.color === props.turn && legalTargets(p.square).length > 0));

  const [mateDismissed, setMateDismissed] = useState(false);
  const matePlayedRef = useRef(false);
  useEffect(() => {
    if (!isCheckmate) {
      matePlayedRef.current = false;
      setMateDismissed(false);
      return;
    }
    if (!matePlayedRef.current) {
      matePlayedRef.current = true;
      playSound("checkmate");
    }
  }, [isCheckmate]);

  const winnerLabel = props.turn === "w" ? "Black" : "White";





  useEffect(() => {
    const { result, movedIds, removed } = trackPieces(trackedRef.current, pieces);
    trackedRef.current = result;
    setTracked(result);
    if (!transitionMs) return;

    let clearTravel: number | undefined;
    let clearGhost: number | undefined;
    if (movedIds.length) {
      setTravelling(new Set(movedIds));
      clearTravel = window.setTimeout(() => setTravelling(new Set()), transitionMs + 60);
    }

    if (removed.length) {
      const batch = removed.map((p) => ({ ...p, key: ++ghostCounter }));
      setGhosts((g) => [...g, ...batch]);
      const keys = new Set(batch.map((b) => b.key));
      clearGhost = window.setTimeout(
        () => setGhosts((g) => g.filter((x) => !keys.has(x.key))),
        transitionMs + 120,
      );
    }
    return () => {
      if (clearTravel) window.clearTimeout(clearTravel);
      if (clearGhost) window.clearTimeout(clearGhost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, transitionMs]);


  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSize(w);
    });
    observer.observe(el);
    setSize(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const squareSize = size / 8;

  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();

  const squareToXY = useCallback(
    (square: string) => {
      const f = files.indexOf(square[0]!);
      const r = ranks.indexOf(square[1]!);
      return { x: f * squareSize, y: r * squareSize };
    },
    [files, ranks, squareSize],
  );

  const xyToSquare = useCallback(
    (x: number, y: number) => {
      const f = Math.floor(x / squareSize);
      const r = Math.floor(y / squareSize);
      if (f < 0 || f > 7 || r < 0 || r > 7) return null;
      return `${files[f]!}${ranks[r]!}`;
    },
    [files, ranks, squareSize],
  );

  const targets = useMemo(
    () => (selected ? legalTargets(selected) : []),
    [selected, legalTargets],
  );

  const occupied = useMemo(() => new Set(tracked.map((p) => p.square)), [tracked]);

  const attemptMove = useCallback(
    (from: string, to: string) => {
      if (from === to) return false;
      if (!canMoveFrom(from)) {
        if (props.premove !== undefined && settings.premove && onPremove) {
          onPremove(from, to);
          return true;
        }
        return false;
      }
      if (!legalTargets(from).includes(to)) return false;
      if (needsPromotion(from, to) && !settings.autoQueen) {
        setPromotion({ from, to });
        return true;
      }
      return onMove(from, to, needsPromotion(from, to) ? "q" : undefined);
    },
    [canMoveFrom, legalTargets, needsPromotion, onMove, onPremove, props.premove, settings.autoQueen, settings.premove],
  );

  const handlePointerDown = (e: React.PointerEvent, square: string) => {
    if (!interactive) return;
    const piece = tracked.find((p) => p.square === square);
    const selectable = piece && (canMoveFrom(square) || (settings.premove && onPremove));

    if (selected && selected !== square) {
      const moved = attemptMove(selected, square);
      if (moved) {
        setSelected(null);
        return;
      }
    }

    if (!selectable) {
      if (selected) {
        setSelected(null);
        playSound("deselect");
      }
      return;
    }

    if (selected === square) {
      setSelected(null);
      playSound("deselect");
      return;
    }

    setSelected(square);
    playSound("select");
    const rect = containerRef.current!.getBoundingClientRect();
    setDragging({
      id: piece!.id,
      from: square,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const rect = containerRef.current!.getBoundingClientRect();
    setDragging({ ...dragging, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const target = xyToSquare(e.clientX - rect.left, e.clientY - rect.top);
    const from = dragging.from;
    setDragging(null);
    if (target && target !== from) {
      const moved = attemptMove(from, target);
      if (moved) setSelected(null);
    } else if (target === from) {
      // Thả lại đúng ô cũ — chỉ một tap rất nhẹ, quân vẫn đang được chọn.
      playSound("deselect");
    }
  };

  const finishPromotion = (piece: "q" | "r" | "b" | "n") => {
    if (!promotion) return;
    onMove(promotion.from, promotion.to, piece);
    setPromotion(null);
    setSelected(null);
  };

  // Spring-like travel curve: quick launch, tiny settle at the target square.
  const travelEase = "cubic-bezier(0.22, 1.16, 0.32, 1)";


  return (
    <div className="w-full">
      <div
        ref={containerRef}
        role="grid"
        aria-label="Chess board"
        className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-md ring-1 ring-black/40"
        style={{ backgroundColor: theme.frame }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragging(null)}
      >
        {ranks.map((rank, r) =>
          files.map((file, f) => {
            const square = `${file}${rank}`;
            const isDark = (FILES.indexOf(file) + Number(rank)) % 2 === 0;
            const isTarget = targets.includes(square);
            const isCapture = isTarget && occupied.has(square);
            const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
            const isPremove = premove && (premove.from === square || premove.to === square);
            const isCheck = checkSquare === square;
            return (
              <button
                key={square}
                type="button"
                role="gridcell"
                tabIndex={-1}
                aria-label={square}
                className="absolute block cursor-pointer p-0"
                style={{
                  left: f * squareSize,
                  top: r * squareSize,
                  width: squareSize,
                  height: squareSize,
                  backgroundColor: isDark ? theme.dark : theme.light,
                  backgroundImage: isDark
                    ? "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(0,0,0,0.14) 55%, rgba(0,0,0,0.22))"
                    : "linear-gradient(135deg, rgba(255,255,255,0.30), rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.10))",
                  boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)",
                }}

                onPointerDown={(e) => handlePointerDown(e, square)}
                onMouseEnter={() => setHoveredSquare(square)}
                onMouseLeave={() => setHoveredSquare(null)}
                onFocus={() => setFocusedSquare(square)}
                onBlur={() => setFocusedSquare(null)}
              >
                {isLast && (
                  <span
                    className="absolute inset-0"
                    style={{ backgroundColor: theme.lastMove }}
                  />
                )}
                {isPremove && (
                  <span className="absolute inset-0" style={{ backgroundColor: "rgba(90,160,255,0.35)" }} />
                )}
                {selected === square && (
                  <span className="absolute inset-0" style={{ backgroundColor: theme.selected }} />
                )}
                {isCheck && (
                  <span
                    className="animate-nexus-check-pulse absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(220,60,50,0.85) 8%, rgba(220,60,50,0.25) 55%, transparent 72%)",
                      boxShadow: "inset 0 0 0 2px rgba(255,90,80,0.9)",
                    }}
                  />
                )}
                {settings.showLegalMoves && isTarget && !isCapture && (
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: squareSize * 0.28,
                      height: squareSize * 0.28,
                      left: squareSize * 0.36,
                      top: squareSize * 0.36,
                      backgroundColor: theme.hint,
                    }}
                  />
                )}
                {settings.showLegalMoves && isCapture && (
                  <span
                    className="absolute rounded-full"
                    style={{
                      inset: squareSize * 0.04,
                      border: `${Math.max(3, squareSize * 0.075)}px solid ${theme.hint}`,
                    }}
                  />
                )}
                {settings.showCoordinates && f === 0 && (
                  <span
                    className="absolute left-[3px] top-[2px] text-[10px] font-semibold leading-none"
                    style={{ color: isDark ? theme.light : theme.coord }}
                  >
                    {rank}
                  </span>
                )}
                {settings.showCoordinates && r === 7 && (
                  <span
                    className="absolute bottom-[2px] right-[3px] text-[10px] font-semibold leading-none"
                    style={{ color: isDark ? theme.light : theme.coord }}
                  >
                    {file}
                  </span>
                )}
              </button>
            );
          }),
        )}

        {/* captured pieces fade out in place instead of vanishing on the frame */}
        {ghosts.map((g) => {
          const pos = squareToXY(g.square);
          return (
            <div
              key={`ghost-${g.key}`}
              className="pointer-events-none absolute z-10"
              style={{
                width: squareSize,
                height: squareSize,
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
              }}
            >
              <div
                className="animate-nexus-capture"
                style={{ animationDuration: `${Math.max(140, transitionMs)}ms` }}
              >
                <Piece type={g.type} color={g.color} set={pieceSet} size={squareSize} />
              </div>
            </div>

          );
        })}

        {tracked.map((piece) => {
          const isDragged = dragging?.id === piece.id;
          const isTravelling = !isDragged && travelling.has(piece.id);
          const isGlowing =
            isDragged ||
            selected === piece.square ||
            hoveredSquare === piece.square ||
            focusedSquare === piece.square;
          const pos = squareToXY(piece.square);
          const x = isDragged ? dragging!.x - squareSize / 2 : pos.x;
          const y = isDragged ? dragging!.y - squareSize / 2 : pos.y;
          return (
            <div
              key={piece.id}
              className={cn(
                "pointer-events-none absolute",
                isDragged ? "z-30" : isTravelling ? "z-20" : undefined,
              )}
              style={{
                width: squareSize,
                height: squareSize,
                // Only transform/opacity animate here, so the whole move stays
                // on the compositor and holds a full frame budget (>60FPS).
                transform: `translate3d(${x}px, ${y}px, 0)`,
                transition: isDragged ? "none" : `transform ${transitionMs}ms ${travelEase}`,
                willChange: isDragged || isTravelling ? "transform" : "auto",
                backfaceVisibility: "hidden",
              }}
            >
              <div
                style={{
                  transform: isDragged
                    ? "scale(1.1) translateZ(0)"
                    : isTravelling
                      ? "scale(1.06) translateZ(0)"
                      : "scale(1) translateZ(0)",
                  transition: `transform ${Math.max(90, Math.round(transitionMs * 0.6))}ms ease-out`,
                }}
              >
                <Piece
                  type={piece.type}
                  color={piece.color}
                  set={pieceSet}
                  size={squareSize}
                  glow={isGlowing}
                />
              </div>
            </div>
          );
        })}

        {checkSquare && (
          <>
            <span
              key={`frame-${checkAlert}`}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-30 rounded-md",
                isCheckmate ? "animate-nexus-mate-frame" : "animate-nexus-check-frame",
              )}
            />
            <div
              key={`banner-${checkAlert}-${isCheckmate ? "mate" : "check"}`}
              role="status"
              aria-live="assertive"
              className={cn(
                "animate-nexus-check-banner pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-white shadow-lg",
                isCheckmate
                  ? "border-amber-300/70 bg-red-700/95"
                  : "border-red-400/60 bg-red-600/90",
              )}
            >
              {isCheckmate ? "Checkmate!" : "Check!"}
            </div>
          </>
        )}

        {isCheckmate && !mateDismissed && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
            <div
              role="alertdialog"
              aria-label="Game over"
              className="panel animate-nexus-pop max-w-[85%] px-6 py-5 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                Checkmate
              </p>
              <p className="mt-2 text-xl font-bold">{winnerLabel} wins</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The king is in check with no legal moves left.
              </p>
              <button
                type="button"
                onClick={() => setMateDismissed(true)}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                View board
              </button>
            </div>
          </div>
        )}



        {promotion && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-[2px]">
            <div className="panel animate-nexus-pop flex gap-1 p-2">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => finishPromotion(p)}
                  className="rounded-md bg-surface-2 p-1 transition-colors hover:bg-primary/20"
                  aria-label={`Promote to ${p}`}
                >
                  <Piece
                    type={p}
                    color={promotion.from[1] === "7" ? "w" : "b"}
                    set={pieceSet}
                    size={Math.min(64, squareSize)}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
