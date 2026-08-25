import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Piece, type PieceColor, type PieceType } from "./Piece";
import { useBoardStyle } from "./useBoardStyle";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { playSound, playShatter } from "@/lib/sound";
import { findCheckAttacks, squaresBetween } from "@/lib/chess/checkGeometry";
import { useT } from "@/lib/i18n";


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

import {
  FILES,
  PIECE_SCALE,
  RANKS,
  isDarkSquare,
  pieceBoxStyle,
  squareSurface,
} from "./boardSurface";

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

/** Chebyshev distance between two algebraic squares. */
function squareDistance(a: string, b: string): number {
  const fa = a.charCodeAt(0);
  const ra = a.charCodeAt(1);
  const fb = b.charCodeAt(0);
  const rb = b.charCodeAt(1);
  return Math.max(Math.abs(fa - fb), Math.abs(ra - rb));
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
  // Pick the closest same-type piece so a pawn appearing on d6 is matched with
  // the pawn that was on e5 (en passant) rather than an unrelated pawn.
  const takeSimilar = (p: BoardPiece): TrackedPiece | null => {
    let best = -1;
    let bestDist = Infinity;
    remaining.forEach((r, i) => {
      if (r.type !== p.type || r.color !== p.color) return;
      const d = squareDistance(r.square, p.square);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best === -1) return null;
    return remaining.splice(best, 1)[0] ?? null;
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
  const { theme, pieceSet } = useBoardStyle();
  const { t } = useT();

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
  /** promotion-by-capture flourish: shards gather into the new piece */
  const [promoBurst, setPromoBurst] = useState<{
    key: number;
    square: string;
    color: "w" | "b";
    type: string;
  } | null>(null);



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
   * Defenders: pieces of the side to move that can legally capture a checking
   * piece, plus the path they would travel. Only meaningful on interactive
   * boards where `legalTargets` is a real rules query.
   */
  const defences = useMemo(() => {
    if (!interactive || !checkSquare || checkAttacks.length === 0) return [];
    const out: { from: string; to: string; path: string[] }[] = [];
    for (const attack of checkAttacks) {
      for (const p of pieces) {
        if (p.color !== props.turn) continue;
        if (p.square === attack.from) continue;
        if (!legalTargets(p.square).includes(attack.from)) continue;
        out.push({
          from: p.square,
          to: attack.from,
          path: squaresBetween(p.square, attack.from),
        });
      }
    }
    return out;
  }, [interactive, checkSquare, checkAttacks, pieces, props.turn, legalTargets]);

  const defenderSquares = useMemo(() => new Set(defences.map((d) => d.from)), [defences]);
  const defencePathSquares = useMemo(
    () => new Set(defences.flatMap((d) => d.path)),
    [defences],
  );

  /** Squares the checked king may legally step to in order to escape. */
  const kingSquare = useMemo(() => {
    if (!checkSquare) return null;
    const king = pieces.find((p) => p.square === checkSquare && p.type === "k");
    return king ? king.square : checkSquare;
  }, [pieces, checkSquare]);

  const escapeSquares = useMemo(() => {
    if (!interactive || !checkSquare || !kingSquare) return new Set<string>();
    const kingPiece = pieces.find((p) => p.square === kingSquare);
    if (!kingPiece || kingPiece.color !== props.turn) return new Set<string>();
    return new Set(legalTargets(kingSquare));
  }, [interactive, checkSquare, kingSquare, pieces, props.turn, legalTargets]);

  /** Colour-blind mode: every status also carries a shape/pattern/glyph cue. */
  const cb = settings.colorBlindMode;
  const stripes = (color: string, angle: number) =>
    `repeating-linear-gradient(${angle}deg, ${color} 0px, ${color} 3px, transparent 3px, transparent 8px)`;



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

  const winnerLabel = props.turn === "w" ? t("game.board.black") : t("game.board.white");





  useEffect(() => {
    const prevIds = new Set(trackedRef.current.map((p) => p.id));
    const { result, movedIds, removed } = trackPieces(trackedRef.current, pieces);
    trackedRef.current = result;
    setTracked(result);
    if (!transitionMs) return;

    let clearTravel: number | undefined;
    let clearGhost: number | undefined;
    let clearPromo: number | undefined;
    if (movedIds.length) {
      setTravelling(new Set(movedIds));
      clearTravel = window.setTimeout(() => setTravelling(new Set()), transitionMs + 60);
    }

    // The side that just moved is the opposite of the side to move now. A
    // removed piece of that colour is a promoted pawn (it morphs into the new
    // piece), never a capture — only enemy pieces shatter. En passant works
    // naturally here: the captured pawn keeps its own square (d5), so the
    // shards burst there instead of on the arrival square (d6).
    const mover = props.turn === "w" ? "b" : "w";
    const captured = removed.filter((p) => p.color !== mover);
    const promotedPawn = removed.find((p) => p.color === mover && p.type === "p");
    // The freshly created piece that replaced the pawn on the last rank.
    const promotedPiece = promotedPawn
      ? result.find(
          (p) =>
            !prevIds.has(p.id) &&
            p.color === mover &&
            p.type !== "p" &&
            p.square[1] === (mover === "w" ? "8" : "1"),
        )
      : undefined;

    // A legal move can only ever remove one enemy piece; anything larger is a
    // position reset (new game, jumping through history) and must not shatter.
    if (captured.length === 1) {
      const batch = captured.map((p) => ({ ...p, key: ++ghostCounter }));
      setGhosts((g) => [...g, ...batch]);
      const keys = new Set(batch.map((b) => b.key));
      // Fires on the same frame the shatter animation starts, so audio and
      // visuals land together.
      if (settings.shatterSound) playShatter(!!promotedPiece);
      clearGhost = window.setTimeout(
        () => setGhosts((g) => g.filter((x) => !keys.has(x.key))),
        Math.max(transitionMs + 120, 500),
      );

    }

    // Capture *and* promotion: the shards of the captured piece are pulled
    // back in and reforged into the new piece rising on the last rank.
    if (promotedPiece) {
      const key = ++ghostCounter;
      setPromoBurst({
        key,
        square: promotedPiece.square,
        color: promotedPiece.color,
        type: promotedPiece.type,
      });
      clearPromo = window.setTimeout(
        () => setPromoBurst((p) => (p && p.key === key ? null : p)),
        700,
      );
    }
    return () => {
      if (clearTravel) window.clearTimeout(clearTravel);
      if (clearGhost) window.clearTimeout(clearGhost);
      if (clearPromo) window.clearTimeout(clearPromo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, transitionMs]);



  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    let last = 0;
    // Khoá kích thước trong lúc xoay màn hình: iOS/Android bắn ra vài giá trị
    // trung gian (chiều cũ, chiều mới, có/không thanh URL) khiến bàn cờ nhảy.
    let rotating = false;
    let settleTimer = 0;
    let stableTimer = 0;
    let stableWidth = -1;

    /** Snap to a whole pixel so the 8x8 grid never lands on sub-pixel seams. */
    const apply = (raw: number) => {
      if (!raw) return;
      // Bàn cờ không bao giờ được rộng hơn màn hình: nếu một panel nào đó
      // làm trang tràn ngang, w-full sẽ đo ra giá trị lớn hơn viewport và
      // webview mobile sẽ thu/phóng lại trang (hiệu ứng "nhảy" khi đi cờ).
      const viewport =
        typeof window === "undefined"
          ? raw
          : Math.min(
              window.visualViewport?.width ?? window.innerWidth,
              document.documentElement.clientWidth || window.innerWidth,
            );
      const next = Math.round(Math.min(raw, viewport || raw));
      // Ignore sub-pixel churn (scrollbar/zoom/theme repaint) that would
      // otherwise re-render the whole board and look like a layout jump.
      if (Math.abs(next - last) < 1) return;
      last = next;
      setSize(next);
    };


    const measure = () => {
      raf = 0;
      const node = containerRef.current;
      if (node) apply(node.getBoundingClientRect().width);
    };

    const schedule = () => {
      // Never resize mid theme cross-fade: geometry is frozen there.
      if (document.documentElement.classList.contains("theme-anim")) return;
      // Đang xoay màn hình -> giữ nguyên kích thước cũ, chỉ đo lại 1 lần
      // duy nhất sau khi viewport đã đứng yên.
      if (rotating) return;
      if (raf) return;
      raf = window.requestAnimationFrame(measure);
    };

    /** Đợi bề rộng viewport đứng yên (2 lần đo giống nhau) rồi mới đo lại. */
    const settle = () => {
      const width = Math.round(
        window.visualViewport?.width ?? window.innerWidth,
      );
      if (width === stableWidth) {
        rotating = false;
        stableWidth = -1;
        if (raf) window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(measure);
        return;
      }
      stableWidth = width;
      stableTimer = window.setTimeout(settle, 120);
    };

    const beginRotation = () => {
      rotating = true;
      stableWidth = -1;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      window.clearTimeout(stableTimer);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 120);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", beginRotation);
    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(orientation: portrait)")
        : null;
    mql?.addEventListener?.("change", beginRotation);
    window.screen?.orientation?.addEventListener?.("change", beginRotation);
    apply(el.getBoundingClientRect().width);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", beginRotation);
      mql?.removeEventListener?.("change", beginRotation);
      window.screen?.orientation?.removeEventListener?.("change", beginRotation);
      window.clearTimeout(settleTimer);
      window.clearTimeout(stableTimer);
      if (raf) window.cancelAnimationFrame(raf);
    };
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
    <div className="w-full max-w-full overflow-hidden">
      <div
        ref={containerRef}
        data-board-root=""

        role="grid"
        aria-label={t("game.board.aria")}
        className="relative aspect-square w-full max-w-full touch-none select-none overflow-hidden rounded-md ring-1 ring-black/40"

        style={{ backgroundColor: theme.frame }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragging(null)}
      >
        {ranks.map((rank, r) =>
          files.map((file, f) => {
            const square = `${file}${rank}`;
            const isDark = isDarkSquare(file, rank);
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
                  ...squareSurface(theme, isDark),
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
                {attackerSquares.has(square) && (
                  <span
                    className="animate-nexus-check-pulse absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(255,176,60,0.55) 20%, rgba(255,150,40,0.18) 62%, transparent 78%)",
                      boxShadow: cb
                        ? "inset 0 0 0 3px rgba(255,190,80,1)"
                        : "inset 0 0 0 2px rgba(255,190,80,0.95)",
                    }}
                  />
                )}
                {raySquares.has(square) && (
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      backgroundColor: "rgba(255,140,70,0.16)",
                      backgroundImage: cb ? stripes("rgba(255,150,60,0.55)", 45) : undefined,
                    }}
                  />
                )}
                {defencePathSquares.has(square) && (
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      backgroundColor: cb ? "rgba(70,170,255,0.16)" : "rgba(80,220,140,0.14)",
                      backgroundImage: cb ? stripes("rgba(70,170,255,0.55)", -45) : undefined,
                    }}
                  />
                )}
                {defenderSquares.has(square) && (
                  <span
                    aria-hidden
                    className="animate-nexus-check-pulse absolute inset-0"
                    style={{
                      background: cb
                        ? "radial-gradient(circle, rgba(70,170,255,0.42) 22%, rgba(70,170,255,0.14) 62%, transparent 78%)"
                        : "radial-gradient(circle, rgba(70,220,140,0.42) 22%, rgba(70,220,140,0.14) 62%, transparent 78%)",
                      boxShadow: cb
                        ? "inset 0 0 0 3px rgba(120,190,255,1)"
                        : "inset 0 0 0 2px rgba(110,240,170,0.9)",
                    }}
                  />
                )}
                {escapeSquares.has(square) && !isCheck && (
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(120,235,255,0.34) 24%, rgba(120,235,255,0.12) 62%, transparent 80%)",
                      boxShadow: "inset 0 0 0 2px rgba(150,240,255,0.9)",
                      backgroundImage: cb
                        ? stripes("rgba(150,240,255,0.5)", 90)
                        : undefined,
                    }}
                  />
                )}
                {isCheck && (
                  <span
                    className="animate-nexus-check-pulse absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(220,60,50,0.85) 8%, rgba(220,60,50,0.25) 55%, transparent 72%)",
                      boxShadow: cb
                        ? "inset 0 0 0 3px rgba(255,90,80,1)"
                        : "inset 0 0 0 2px rgba(255,90,80,0.9)",
                    }}
                  />
                )}
                {cb &&
                  (() => {
                    const glyph = isCheck
                      ? "!"
                      : attackerSquares.has(square)
                        ? "\u2715"
                        : defenderSquares.has(square)
                          ? "\u2714"
                          : escapeSquares.has(square)
                            ? "\u2192"
                            : null;
                    if (!glyph) return null;
                    return (
                      <span
                        aria-hidden
                        className="absolute right-[2px] top-[2px] flex items-center justify-center rounded-full bg-black/75 font-bold leading-none text-white"
                        style={{
                          width: Math.max(14, squareSize * 0.3),
                          height: Math.max(14, squareSize * 0.3),
                          fontSize: Math.max(9, squareSize * 0.18),
                        }}
                      >
                        {glyph}
                      </span>
                    );
                  })()}


                {settings.showLegalMoves && isTarget && !isCapture && (
                  <span
                    className={cn("absolute", cb ? "rotate-45" : "rounded-full")}
                    style={{
                      width: squareSize * 0.28,
                      height: squareSize * 0.28,
                      left: squareSize * 0.36,
                      top: squareSize * 0.36,
                      backgroundColor: theme.hint,
                    }}
                  />
                )}
                {cb && settings.showLegalMoves && isCapture && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-black leading-none text-white"
                    style={{
                      fontSize: Math.max(12, squareSize * 0.34),
                      textShadow: "0 0 4px rgba(0,0,0,0.9)",
                    }}
                  >
                    {"\u2715"}
                  </span>
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
                    className="absolute left-[3px] top-[2px] text-2xs font-semibold leading-none"
                    style={{ color: isDark ? theme.light : theme.coord }}
                  >
                    {rank}
                  </span>
                )}
                {settings.showCoordinates && r === 7 && (
                  <span
                    className="absolute bottom-[2px] right-[3px] text-2xs font-semibold leading-none"
                    style={{ color: isDark ? theme.light : theme.coord }}
                  >
                    {file}
                  </span>
                )}
              </button>
            );
          }),
        )}

        {/* attack lines: from every checking piece to the king */}
        {checkAttacks.length > 0 && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20"
            width={squareSize * 8}
            height={squareSize * 8}
          >
            <defs>
              <marker
                id="nexus-check-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,120,60,0.9)" />
              </marker>
              <marker
                id="nexus-defend-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={cb ? "rgba(90,180,255,0.98)" : "rgba(90,230,150,0.95)"} />
              </marker>
            </defs>
            {defences.map((d) => {
              const from = squareToXY(d.from);
              const to = squareToXY(d.to);
              const half = squareSize / 2;
              return (
                <line
                  key={`def-${d.from}-${d.to}`}
                  x1={from.x + half}
                  y1={from.y + half}
                  x2={to.x + half}
                  y2={to.y + half}
                  stroke={cb ? "rgba(90,180,255,0.9)" : "rgba(90,230,150,0.8)"}
                  strokeWidth={Math.max(2, squareSize * 0.045)}
                  strokeLinecap="round"
                  strokeDasharray={cb ? `${squareSize * 0.05} ${squareSize * 0.12}` : `${squareSize * 0.14} ${squareSize * 0.1}`}
                  markerEnd="url(#nexus-defend-arrow)"
                />
              );
            })}
            {checkAttacks.map((a) => {
              const from = squareToXY(a.from);
              const to = squareToXY(a.to);
              const half = squareSize / 2;
              return (
                <line
                  key={`atk-${a.from}-${a.to}`}
                  x1={from.x + half}
                  y1={from.y + half}
                  x2={to.x + half}
                  y2={to.y + half}
                  stroke="rgba(255,120,60,0.85)"
                  strokeWidth={Math.max(2, squareSize * 0.05)}
                  strokeLinecap="round"
                  strokeDasharray={`${squareSize * 0.18} ${squareSize * 0.12}`}
                  markerEnd="url(#nexus-check-arrow)"
                />
              );
            })}
          </svg>
        )}


        {/* Capture: "Nexus Shatter" — impact flash, shockwave ring, flying shards. */}
        {ghosts.map((g) => {
          const pos = squareToXY(g.square);
          const accent = g.color === "w" ? "rgba(255,224,168," : "rgba(126,196,255,";
          const shardCount = 10;
          return (
            <div
              key={`ghost-${g.key}`}
              className="pointer-events-none absolute z-20"
              style={{
                width: squareSize,
                height: squareSize,
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
              }}
            >
              <span
                aria-hidden
                className="animate-nexus-impact absolute inset-0 rounded-sm"
                style={{
                  background: `radial-gradient(circle, ${accent}0.85) 0%, ${accent}0.25) 45%, transparent 72%)`,
                }}
              />
              <span
                aria-hidden
                className="animate-nexus-shockwave absolute rounded-full"
                style={{
                  inset: squareSize * 0.08,
                  border: `${Math.max(2, squareSize * 0.05)}px solid ${accent}0.9)`,
                  boxShadow: `0 0 ${squareSize * 0.22}px ${accent}0.55)`,
                }}
              />
              {Array.from({ length: shardCount }).map((_, i) => {
                const angle = (i / shardCount) * Math.PI * 2 + (g.key % 7) * 0.21;
                const dist = squareSize * (0.44 + ((i * 37) % 11) / 40);
                const w = Math.max(2, squareSize * (i % 3 === 0 ? 0.11 : 0.07));
                const h = Math.max(2, squareSize * (i % 2 === 0 ? 0.05 : 0.08));
                return (
                  <span
                    key={i}
                    aria-hidden
                    className="animate-nexus-shard absolute"
                    style={
                      {
                        left: squareSize / 2 - w / 2,
                        top: squareSize / 2 - h / 2,
                        width: w,
                        height: h,
                        background: `linear-gradient(90deg, ${accent}0.95), ${accent}0.35))`,
                        clipPath: "polygon(0 40%, 60% 0, 100% 55%, 45% 100%)",
                        animationDelay: `${(i % 4) * 18}ms`,
                        "--sx": `${Math.cos(angle) * dist}px`,
                        "--sy": `${Math.sin(angle) * dist}px`,
                        "--sr": `${(i % 2 === 0 ? 1 : -1) * (140 + i * 22)}deg`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
              <div
                className="animate-nexus-capture"
                style={{ animationDuration: `${Math.max(300, transitionMs)}ms` }}
              >
                <Piece type={g.type} color={g.color} set={pieceSet} size={squareSize} />
              </div>
            </div>
          );
        })}

        {/* Capture + promotion: shards gather, a beam lifts and the new piece
            is reforged on the last rank. */}
        {promoBurst && (() => {
          const pos = squareToXY(promoBurst.square);
          const accent = promoBurst.color === "w" ? "rgba(255,224,168," : "rgba(126,196,255,";
          return (
            <div
              key={`promo-${promoBurst.key}`}
              className="pointer-events-none absolute z-30"
              style={{
                width: squareSize,
                height: squareSize,
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
              }}
            >
              <span
                aria-hidden
                className="animate-nexus-promote-beam absolute"
                style={{
                  left: squareSize * 0.3,
                  top: -squareSize * 0.45,
                  width: squareSize * 0.4,
                  height: squareSize * 1.45,
                  background: `linear-gradient(to top, ${accent}0.75) 0%, ${accent}0.28) 45%, transparent 100%)`,
                  filter: "blur(2px)",
                }}
              />
              <span
                aria-hidden
                className="animate-nexus-promote-ring absolute rounded-full"
                style={{
                  inset: squareSize * 0.05,
                  border: `${Math.max(2, squareSize * 0.045)}px solid ${accent}0.95)`,
                  boxShadow: `0 0 ${squareSize * 0.3}px ${accent}0.6)`,
                }}
              />
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i / 12) * Math.PI * 2 + (promoBurst.key % 5) * 0.3;
                const dist = squareSize * (0.6 + ((i * 29) % 9) / 26);
                const w = Math.max(2, squareSize * (i % 3 === 0 ? 0.1 : 0.065));
                const h = Math.max(2, squareSize * (i % 2 === 0 ? 0.05 : 0.075));
                return (
                  <span
                    key={i}
                    aria-hidden
                    className="animate-nexus-promote-gather absolute"
                    style={
                      {
                        left: squareSize / 2 - w / 2,
                        top: squareSize / 2 - h / 2,
                        width: w,
                        height: h,
                        background: `linear-gradient(90deg, ${accent}0.95), ${accent}0.3))`,
                        clipPath: "polygon(0 40%, 60% 0, 100% 55%, 45% 100%)",
                        animationDelay: `${(i % 4) * 24}ms`,
                        "--gx": `${Math.cos(angle) * dist}px`,
                        "--gy": `${Math.sin(angle) * dist}px`,
                        "--gr": `${(i % 2 === 0 ? 1 : -1) * (120 + i * 18)}deg`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
              <div className="animate-nexus-promote-rise">
                <Piece
                  type={promoBurst.type as BoardPiece["type"]}
                  color={promoBurst.color}
                  set={pieceSet}
                  size={squareSize}
                />
              </div>
            </div>
          );
        })()}




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
              data-square={piece.square}
              className={cn(
                "pointer-events-none absolute",
                isDragged ? "z-30" : isTravelling ? "z-20" : undefined,
              )}
              style={{
                // Shared placement helper — identical maths on every board.
                ...pieceBoxStyle(`${x}px`, `${y}px`, `${squareSize}px`),
                // Only transform/opacity animate here, so the whole move stays
                // on the compositor and holds a full frame budget (>60FPS).
                transition: isDragged ? "none" : `transform ${transitionMs}ms ${travelEase}`,
                willChange: isDragged || isTravelling ? "transform" : "auto",
              }}
            >
              <div
                style={{
                  transform:
                    PIECE_SCALE[isDragged ? "dragging" : isTravelling ? "travelling" : "idle"],
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
              {isCheckmate ? t("game.board.checkmate") : t("game.board.check")}
            </div>
          </>
        )}

        {isCheckmate && !mateDismissed && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
            <div
              role="alertdialog"
              aria-label={t("game.board.gameOver")}
              className="panel animate-nexus-pop max-w-[85%] px-6 py-5 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                {t("game.board.checkmateLabel")}
              </p>
              <p className="mt-2 text-xl font-bold">{t("game.board.winnerWins", { winner: winnerLabel })}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("game.board.mateDetail")}
              </p>
              <button
                type="button"
                onClick={() => setMateDismissed(true)}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("game.board.viewBoard")}
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
                  aria-label={t("game.board.promoteTo", { piece: p })}
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
