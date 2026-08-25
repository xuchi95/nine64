import { Chess } from "chess.js";

/**
 * Robust endgame recognition.
 *
 * Pure functions over a FEN: no engine, no network. The engine tells us *how good*
 * a position is; this module tells us *what kind of position it is* and what the
 * theoretical verdict/technique is when material alone decides the outcome.
 */

export type GamePhase = "opening" | "middlegame" | "endgame";

/** Theoretical verdict derived from material patterns (never from engine eval). */
export type EndgameVerdict =
  | "white-wins"
  | "black-wins"
  | "draw"
  | "white-better"
  | "black-better"
  | "unclear";

export interface EndgameInfo {
  phase: GamePhase;
  isEndgame: boolean;
  /** i18n key suffix, e.g. "kpk" -> study.endgame.class.kpk */
  classKey: string;
  /** Compact material signature, e.g. "KRP vs KR" */
  signature: string;
  verdict: EndgameVerdict;
  /** true when the verdict is book-certain (insufficient material, KQvK, ...) */
  theoretical: boolean;
  /** i18n key suffixes for technique hints, e.g. ["lucena", "shortSide"] */
  techniqueKeys: string[];
  /** total non-king material in centipawn-ish units, used for phase detection */
  materialValue: number;
}

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const ORDER = ["q", "r", "b", "n", "p"] as const;

interface Side {
  q: number;
  r: number;
  b: number;
  n: number;
  p: number;
  bishopSquares: string[];
  pawnFiles: number[];
  king: string;
  value: number;
}

function emptySide(): Side {
  return { q: 0, r: 0, b: 0, n: 0, p: 0, bishopSquares: [], pawnFiles: [], king: "", value: 0 };
}

function isLightSquare(square: string): boolean {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 1;
}

function sig(s: Side): string {
  let out = "K";
  for (const t of ORDER) out += t.toUpperCase().repeat(s[t]);
  return out;
}

/** Count of every non-king, non-pawn piece — cheap material key for lookups. */
function pieceKey(s: Side): string {
  return `q${s.q}r${s.r}b${s.b}n${s.n}p${s.p}`;
}

function readSides(chess: Chess): { w: Side; b: Side } {
  const w = emptySide();
  const b = emptySide();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const side = cell.color === "w" ? w : b;
      if (cell.type === "k") {
        side.king = cell.square;
        continue;
      }
      side[cell.type as "q" | "r" | "b" | "n" | "p"] += 1;
      side.value += VALUE[cell.type] ?? 0;
      if (cell.type === "b") side.bishopSquares.push(cell.square);
      if (cell.type === "p") side.pawnFiles.push(cell.square.charCodeAt(0) - 97);
    }
  }
  return { w, b };
}

function phaseOf(total: number, pieceCount: number): GamePhase {
  if (total <= 2000 || pieceCount <= 6) return "endgame";
  if (total <= 4600) return "middlegame";
  return "opening";
}

/** Distance in king moves. */
function kingDistance(a: string, b: string): number {
  if (!a || !b) return 8;
  return Math.max(
    Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
    Math.abs(Number(a[1]) - Number(b[1])),
  );
}

interface SideWithPawn extends Side {
  pawnSquare?: string | null;
}

/**
 * King-and-pawn versus king: Bähr-style shortcut.
 * Returns "win" when the stronger side wins with correct play in the common cases,
 * "draw" for the known dead draws, or null when it needs concrete calculation.
 */
function kpkVerdict(
  strong: SideWithPawn,
  weak: Side,
  strongIsWhite: boolean,
  strongToMove: boolean,
): "win" | "draw" | null {
  const pawn = strong.pawnFiles.length === 1 ? strong.pawnFiles[0]! : null;
  if (pawn === null) return null;
  const pawnSquare = strong.pawnSquare ?? null;
  if (!pawnSquare) return null;
  const pawnRank = Number(pawnSquare[1]);
  const promotionRank = strongIsWhite ? 8 : 1;
  const rookFile = pawn === 0 || pawn === 7;

  // Rook pawn: defending king reaching (or already holding) the corner draws.
  if (rookFile) {
    const cornerFile = pawn === 0 ? "a" : "h";
    const corner = `${cornerFile}${promotionRank}`;
    if (kingDistance(weak.king, corner) <= (strongToMove ? 2 : 3)) return "draw";
  }

  // Defender in front of the pawn with the stronger king far away: draw.
  const stepsToPromote = Math.abs(promotionRank - pawnRank);
  const defenderAhead =
    weak.king.charCodeAt(0) - 97 === pawn &&
    (strongIsWhite ? Number(weak.king[1]) > pawnRank : Number(weak.king[1]) < pawnRank);
  if (defenderAhead && stepsToPromote >= 2 && kingDistance(strong.king, pawnSquare) > 1) return "draw";

  // Stronger king in front of its pawn and closer to the promotion square than the
  // defender: standard key-square win.
  const promoSquare = `${String.fromCharCode(97 + pawn)}${promotionRank}`;
  const strongAhead = strongIsWhite
    ? Number(strong.king[1]) > pawnRank
    : Number(strong.king[1]) < pawnRank;
  if (
    !rookFile &&
    strongAhead &&
    kingDistance(strong.king, promoSquare) + (strongToMove ? 0 : 1) <
      kingDistance(weak.king, promoSquare)
  ) {
    return "win";
  }
  return null;
}


/** Recognise the position type, phase, and any book verdict. */
export function recognizeEndgame(fen: string): EndgameInfo | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const { w, b } = readSides(chess);
  // record single pawn squares for KPK handling
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell?.type === "p") {
        const side = (cell.color === "w" ? w : b) as SideWithPawn;
        side.pawnSquare = side.pawnSquare === undefined ? cell.square : side.pawnSquare;
      }
    }
  }

  const materialValue = w.value + b.value;
  const pieceCount = chess.board().flat().filter(Boolean).length;
  const phase = phaseOf(materialValue, pieceCount);
  const signature = `${sig(w)} vs ${sig(b)}`;

  const base: EndgameInfo = {
    phase,
    isEndgame: phase === "endgame",
    classKey: phase === "endgame" ? "generic" : phase === "middlegame" ? "middlegame" : "opening",
    signature,
    verdict: "unclear",
    theoretical: false,
    techniqueKeys: [],
    materialValue,
  };

  if (phase !== "endgame") return base;

  const wKey = pieceKey(w);
  const bKey = pieceKey(b);
  const bare = (k: string) => k === "q0r0b0n0p0";

  // ---- Dead draws by insufficient material ----
  if (bare(wKey) && bare(bKey)) {
    return { ...base, classKey: "kk", verdict: "draw", theoretical: true };
  }
  const minorOnly = (s: Side) => s.q === 0 && s.r === 0 && s.p === 0 && s.b + s.n === 1;
  if ((minorOnly(w) && bare(bKey)) || (minorOnly(b) && bare(wKey))) {
    const knight = w.n + b.n === 1;
    return {
      ...base,
      classKey: knight ? "kNk" : "kBk",
      verdict: "draw",
      theoretical: true,
      techniqueKeys: ["insufficient"],
    };
  }
  const twoKnights = (s: Side) => s.q === 0 && s.r === 0 && s.b === 0 && s.p === 0 && s.n === 2;
  if ((twoKnights(w) && bare(bKey)) || (twoKnights(b) && bare(wKey))) {
    return { ...base, classKey: "kNNk", verdict: "draw", theoretical: true, techniqueKeys: ["noForcedMate"] };
  }
  // Same-coloured bishops, nothing else: dead draw.
  if (
    w.q + w.r + w.n + w.p === 0 &&
    b.q + b.r + b.n + b.p === 0 &&
    w.b === 1 &&
    b.b === 1 &&
    isLightSquare(w.bishopSquares[0]!) === isLightSquare(b.bishopSquares[0]!)
  ) {
    return { ...base, classKey: "kBkB", verdict: "draw", theoretical: true, techniqueKeys: ["insufficient"] };
  }

  // ---- Forced wins against a bare king ----
  const winsBare = (s: Side) =>
    s.q > 0 || s.r > 0 || s.b >= 2 || (s.b >= 1 && s.n >= 1) || s.n >= 3;
  if (bare(bKey) && winsBare(w) && w.p === 0) {
    return {
      ...base,
      classKey: w.q > 0 ? "kQk" : w.r > 0 ? "kRk" : w.b >= 2 ? "kBBk" : "kBNk",
      verdict: "white-wins",
      theoretical: true,
      techniqueKeys: w.q > 0 ? ["boxKing"] : w.r > 0 ? ["ladderMate"] : w.b >= 2 ? ["twoBishops"] : ["bishopKnightCorner"],
    };
  }
  if (bare(wKey) && winsBare(b) && b.p === 0) {
    return {
      ...base,
      classKey: b.q > 0 ? "kQk" : b.r > 0 ? "kRk" : b.b >= 2 ? "kBBk" : "kBNk",
      verdict: "black-wins",
      theoretical: true,
      techniqueKeys: b.q > 0 ? ["boxKing"] : b.r > 0 ? ["ladderMate"] : b.b >= 2 ? ["twoBishops"] : ["bishopKnightCorner"],
    };
  }

  // ---- King and pawn vs king ----
  const onlyPawns = (s: Side) => s.q === 0 && s.r === 0 && s.b === 0 && s.n === 0;
  if (onlyPawns(w) && onlyPawns(b)) {
    if (w.p === 1 && b.p === 0) {
      const v = kpkVerdict(w as SideWithPawn, b, true, chess.turn() === "w");
      return {
        ...base,
        classKey: "kpk",
        verdict: v === "win" ? "white-wins" : v === "draw" ? "draw" : "white-better",
        theoretical: v !== null,
        techniqueKeys: v === "draw" ? ["holdKeySquares"] : ["keySquares", "kingLeadsPawn"],
      };
    }
    if (b.p === 1 && w.p === 0) {
      const v = kpkVerdict(b as SideWithPawn, w, false, chess.turn() === "b");
      return {
        ...base,
        classKey: "kpk",
        verdict: v === "win" ? "black-wins" : v === "draw" ? "draw" : "black-better",
        theoretical: v !== null,
        techniqueKeys: v === "draw" ? ["holdKeySquares"] : ["keySquares", "kingLeadsPawn"],
      };
    }
    return {
      ...base,
      classKey: "pawnEnding",
      verdict: w.p === b.p ? "unclear" : w.p > b.p ? "white-better" : "black-better",
      techniqueKeys: ["passedPawn", "kingActivity"],
    };
  }

  // ---- Rook endings ----
  const rookOnly = (s: Side) => s.q === 0 && s.b === 0 && s.n === 0 && s.r === 1;
  if (rookOnly(w) && rookOnly(b)) {
    const diff = w.p - b.p;
    const single = Math.abs(diff) === 1 && Math.min(w.p, b.p) === 0;
    return {
      ...base,
      classKey: single ? "rookPawn" : "rookEnding",
      verdict: diff === 0 ? "unclear" : diff > 0 ? "white-better" : "black-better",
      techniqueKeys: single ? ["lucena", "philidor", "activeRook"] : ["activeRook", "rookBehindPawn"],
    };
  }

  // ---- Opposite-coloured bishops ----
  if (
    w.b === 1 &&
    b.b === 1 &&
    w.q + w.r + w.n === 0 &&
    b.q + b.r + b.n === 0 &&
    isLightSquare(w.bishopSquares[0]!) !== isLightSquare(b.bishopSquares[0]!)
  ) {
    const diff = w.p - b.p;
    return {
      ...base,
      classKey: "oppositeBishops",
      verdict: Math.abs(diff) >= 2 ? (diff > 0 ? "white-better" : "black-better") : "draw",
      theoretical: false,
      techniqueKeys: ["drawTendency", "twoWeaknesses"],
    };
  }

  // ---- Queen endings ----
  if (w.q >= 1 && b.q >= 1 && w.r + w.b + w.n === 0 && b.r + b.b + b.n === 0) {
    const diff = w.p - b.p;
    return {
      ...base,
      classKey: "queenEnding",
      verdict: diff === 0 ? "unclear" : diff > 0 ? "white-better" : "black-better",
      techniqueKeys: ["perpetualRisk", "centralizeQueen"],
    };
  }

  // ---- Minor-piece endings ----
  if (w.q + w.r === 0 && b.q + b.r === 0 && w.b + w.n > 0 && b.b + b.n > 0) {
    const diff = w.value - b.value;
    return {
      ...base,
      classKey: "minorPieceEnding",
      verdict: Math.abs(diff) < 150 ? "unclear" : diff > 0 ? "white-better" : "black-better",
      techniqueKeys: ["kingActivity", "outpost"],
    };
  }

  const diff = w.value - b.value;
  return {
    ...base,
    classKey: "generic",
    verdict: Math.abs(diff) < 150 ? "unclear" : diff > 0 ? "white-better" : "black-better",
    techniqueKeys: ["kingActivity", "passedPawn"],
  };
}

/** Convert a UCI principal variation into SAN, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[], limit = 10): string[] {
  const out: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of pv.slice(0, limit)) {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
      if (!move) break;
      out.push(move.san);
    }
  } catch {
    return out;
  }
  return out;
}

export interface LineArrow {
  from: string;
  to: string;
  /** 0 = the move to play now, higher = deeper in the line */
  ply: number;
  side: "w" | "b";
}

/** First `depth` moves of a PV as board arrows for highlighting. */
export function pvToArrows(fen: string, pv: string[], depth = 4): LineArrow[] {
  const out: LineArrow[] = [];
  try {
    const chess = new Chess(fen);
    for (let i = 0; i < Math.min(depth, pv.length); i++) {
      const uci = pv[i]!;
      const side = chess.turn();
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined,
      });
      if (!move) break;
      out.push({ from: move.from, to: move.to, ply: i, side });
    }
  } catch {
    return out;
  }
  return out;
}

/** Is this evaluation decisive enough to call "a winning line"? */
export function isWinningScore(cp: number | null, mateIn: number | null): boolean {
  if (mateIn !== null) return mateIn > 0;
  return (cp ?? 0) >= 150;
}
