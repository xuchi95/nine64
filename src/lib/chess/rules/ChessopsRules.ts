/**
 * Variant rule engine backed by `chessops` (the rule library Lichess uses).
 *
 * Every non-classical variant in Nine64 VariantKit routes through this file:
 * three-check, king of the hill, crazyhouse, atomic, horde, racing kings,
 * giveaway (antichess) and no-castling. Rules are NEVER hand-rolled inside a
 * React component or a hook — the board only ever talks to `RulesPosition`.
 *
 * Guarantees this adapter provides on top of chessops:
 *   - castling is exposed to the UI as the FINAL KING square (g/c file), even
 *     though chessops encodes castling internally as king-takes-rook;
 *   - three-check counters come from position state (`remainingChecks`), not
 *     from counting "+" in SAN;
 *   - crazyhouse exposes pocket / drop / promoted-piece reversion;
 *   - atomic explosions and horde's asymmetric win condition are decided by
 *     chessops' own variant terminal logic, surfaced via `variantOutcome()`.
 */

import { defaultPosition, setupPosition, type Position } from "chessops/variant";
import { makeFen, parseFen } from "chessops/fen";
import { makeSanAndPlay } from "chessops/san";
import { makeSquare, parseSquare } from "chessops/util";
import { normalizeMove } from "chessops/chess";
import type { Move, Role, Rules, Square } from "chessops/types";

import {
  RulesError,
  type AppliedMove,
  type BoardPiece,
  type ChessRulesAdapter,
  type PieceColor,
  type PieceType,
  type PromotionPiece,
  type RulesPosition,
} from "./ChessRulesAdapter";

const ROLE_TO_LETTER: Record<Role, PieceType> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};

const LETTER_TO_ROLE: Record<PieceType, Role> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const ALL_TYPES: PieceType[] = ["p", "n", "b", "r", "q", "k"];

function colorOf(c: "white" | "black"): PieceColor {
  return c === "white" ? "w" : "b";
}

function repetitionKey(fen: string): string {
  // Board + side to move + castling + en passant; halfmove/fullmove excluded.
  return fen.split(" ").slice(0, 4).join(" ");
}

export interface ChessopsVariantConfig {
  /** chessops rule set. */
  rules: Rules;
  /** PGN `Variant` tag; null only for classical chess. */
  pgnVariantTag: string | null;
  /** Starting FEN. Defaults to the chessops default position for the rules. */
  startingFen?: string;
  /** Strip castling rights from any loaded FEN (No Castling variant). */
  stripCastling?: boolean;
  /** True when the side reaching a terminal variant goal is a win, not a draw. */
  hasPockets?: boolean;
}

class ChessopsPosition implements RulesPosition {
  private pos: Position;
  private readonly config: ChessopsVariantConfig;
  private readonly sanHistory: string[] = [];
  private readonly fenHistory: string[] = [];

  constructor(config: ChessopsVariantConfig, fen: string) {
    this.config = config;
    this.pos = ChessopsPosition.build(config, fen);
    this.fenHistory.push(repetitionKey(this.fen()));
  }

  private static build(config: ChessopsVariantConfig, fen: string): Position {
    const normalized = config.stripCastling ? stripCastlingFromFen(fen) : fen;
    const setup = parseFen(normalized);
    if (setup.isErr) {
      throw new RulesError("INVALID_FEN", `Invalid FEN for ${config.rules}: ${normalized}`);
    }
    const pos = setupPosition(config.rules, setup.unwrap());
    if (pos.isErr) {
      throw new RulesError("INVALID_FEN", `Illegal ${config.rules} setup: ${normalized}`);
    }
    return pos.unwrap();
  }

  fen(): string {
    return makeFen(this.pos.toSetup());
  }

  turn(): PieceColor {
    return colorOf(this.pos.turn);
  }

  pieceAt(square: string): BoardPiece | null {
    const sq = parseSquare(square);
    if (sq === undefined) return null;
    const piece = this.pos.board.get(sq);
    if (!piece) return null;
    return { square, type: ROLE_TO_LETTER[piece.role], color: colorOf(piece.color) };
  }

  boardPieces(): BoardPiece[] {
    const out: BoardPiece[] = [];
    for (const [sq, piece] of this.pos.board) {
      out.push({ square: makeSquare(sq), type: ROLE_TO_LETTER[piece.role], color: colorOf(piece.color) });
    }
    return out;
  }

  /** Convert a chessops king-takes-rook castle destination to the king's final square. */
  private castleTargetOf(from: Square, to: Square): string {
    const piece = this.pos.board.get(from);
    const rook = this.pos.board.get(to);
    if (piece?.role === "king" && rook?.role === "rook" && rook.color === piece.color) {
      const rank = makeSquare(from).slice(1);
      const kingside = (to % 8) > (from % 8);
      return `${kingside ? "g" : "c"}${rank}`;
    }
    return makeSquare(to);
  }

  legalTargets(square: string): string[] {
    const from = parseSquare(square);
    if (from === undefined) return [];
    const dests = this.pos.dests(from);
    return [...dests].map((to) => this.castleTargetOf(from, to));
  }

  legalMoves() {
    const out: { from: string; to: string; san: string; promotion?: PromotionPiece }[] = [];
    for (const [from, dests] of this.pos.allDests()) {
      for (const to of dests) {
        const fromSq = makeSquare(from);
        const toSq = this.castleTargetOf(from, to);
        const probe = this.clone();
        const applied = probe.move(fromSq, toSq, "q");
        if (!applied) continue;
        out.push({
          from: fromSq,
          to: toSq,
          san: applied.san,
          ...(applied.promotion ? { promotion: applied.promotion } : {}),
        });
      }
    }
    return out;
  }

  private applied(move: Move, before: Position, san: string): AppliedMove {
    const color = colorOf(before.turn);
    if ("role" in move) {
      const to = makeSquare(move.to);
      return {
        san,
        uci: `${ROLE_TO_LETTER[move.role].toUpperCase()}@${to}`,
        from: to,
        to,
        color,
        fen: this.fen(),
        drop: ROLE_TO_LETTER[move.role],
      } as AppliedMove;
    }
    const fromSq = makeSquare(move.from);
    const rawTo = makeSquare(move.to);
    const movingPiece = before.board.get(move.from);
    const targetPiece = before.board.get(move.to);
    const isCastle =
      movingPiece?.role === "king" &&
      targetPiece?.role === "rook" &&
      targetPiece.color === movingPiece.color;
    const kingTo = isCastle ? this.castleFinalSquares(move, before) : null;
    const to = kingTo ? kingTo.kingTo : rawTo;
    return {
      san,
      uci: `${fromSq}${to}${move.promotion ? ROLE_TO_LETTER[move.promotion] : ""}`,
      from: fromSq,
      to,
      color,
      captured: !isCastle && targetPiece ? ROLE_TO_LETTER[targetPiece.role] : undefined,
      promotion: move.promotion ? (ROLE_TO_LETTER[move.promotion] as PromotionPiece) : undefined,
      fen: this.fen(),
      castle: kingTo ?? undefined,
    };
  }

  private castleFinalSquares(move: Move, before: Position) {
    if ("role" in move) return null;
    const rank = makeSquare(move.from).slice(1);
    const kingside = move.to % 8 > move.from % 8;
    void before;
    return {
      side: (kingside ? "king" : "queen") as "king" | "queen",
      kingFrom: makeSquare(move.from),
      kingTo: `${kingside ? "g" : "c"}${rank}`,
      rookFrom: makeSquare(move.to),
      rookTo: `${kingside ? "f" : "d"}${rank}`,
    };
  }

  move(from: string, to: string, promotion?: PromotionPiece): AppliedMove | null {
    const fromSq = parseSquare(from);
    const toSq = parseSquare(to);
    if (fromSq === undefined || toSq === undefined) return null;

    let move: Move = { from: fromSq, to: toSq };
    if (this.needsPromotion(from, to)) {
      move = { ...move, promotion: LETTER_TO_ROLE[(promotion ?? "q") as PieceType] };
    }
    // chessops encodes castling as king-takes-rook; normalizeMove maps e1g1.
    move = normalizeMove(this.pos as never, move);
    if (!this.pos.isLegal(move)) return null;

    const before = this.pos.clone();
    const san = makeSanAndPlay(this.pos, move);
    this.sanHistory.push(san);
    this.fenHistory.push(repetitionKey(this.fen()));
    return this.applied(move, before, san);
  }

  // ---- crazyhouse ---------------------------------------------------------

  pocket(color: PieceColor): Record<PieceType, number> {
    const empty = Object.fromEntries(ALL_TYPES.map((t) => [t, 0])) as Record<PieceType, number>;
    const pockets = this.pos.pockets;
    if (!pockets) return empty;
    const side = pockets[color === "w" ? "white" : "black"];
    for (const type of ALL_TYPES) {
      empty[type] = side[LETTER_TO_ROLE[type]] ?? 0;
    }
    return empty;
  }

  dropTargets(type: PieceType): string[] {
    if (!this.pos.pockets) return [];
    const role = LETTER_TO_ROLE[type];
    if (this.pocket(this.turn())[type] <= 0) return [];
    // dropDests() is role-agnostic (it only masks pawn back ranks when the
    // pocket holds pawns alone), so each square is re-checked per role.
    return [...this.pos.dropDests()]
      .filter((sq) => this.pos.isLegal({ role, to: sq }))
      .map(makeSquare);
  }

  drop(type: PieceType, to: string): AppliedMove | null {
    if (!this.pos.pockets) return null;
    const toSq = parseSquare(to);
    if (toSq === undefined) return null;
    const move: Move = { role: LETTER_TO_ROLE[type], to: toSq };
    if (!this.pos.isLegal(move)) return null;
    const before = this.pos.clone();
    const san = makeSanAndPlay(this.pos, move);
    const normalized = san.startsWith("@") ? `P${san}` : san;
    this.sanHistory.push(normalized);
    this.fenHistory.push(repetitionKey(this.fen()));
    return { ...this.applied(move, before, normalized), san: normalized };
  }

  // ---- state --------------------------------------------------------------

  checkCount(): { w: number; b: number } {
    const remaining = this.pos.remainingChecks;
    if (!remaining) return { w: 0, b: 0 };
    // chessops stores REMAINING checks; Nine64 shows delivered checks.
    return { w: 3 - remaining.white, b: 3 - remaining.black };
  }

  variantOutcome(): { over: boolean; winner?: PieceColor | "draw"; reason?: string } | null {
    if (!this.pos.isVariantEnd()) return null;
    const outcome = this.pos.variantOutcome();
    if (!outcome) return null;
    return {
      over: true,
      winner: outcome.winner ? colorOf(outcome.winner) : "draw",
      reason: "variant_end",
    };
  }

  historySan(): string[] {
    return [...this.sanHistory];
  }

  isCheck(): boolean {
    return this.pos.isCheck();
  }

  isCheckmate(): boolean {
    return this.pos.isCheckmate();
  }

  isStalemate(): boolean {
    return this.pos.isStalemate();
  }

  isInsufficientMaterial(): boolean {
    return this.pos.isInsufficientMaterial();
  }

  isThreefoldRepetition(): boolean {
    const current = this.fenHistory[this.fenHistory.length - 1];
    return this.fenHistory.filter((k) => k === current).length >= 3;
  }

  isDraw(): boolean {
    if (this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition())
      return true;
    return this.pos.halfmoves >= 100;
  }

  isGameOver(): boolean {
    return this.pos.isEnd() || this.isThreefoldRepetition();
  }

  needsPromotion(from: string, to: string): boolean {
    const fromSq = parseSquare(from);
    const toSq = parseSquare(to);
    if (fromSq === undefined || toSq === undefined) return false;
    const piece = this.pos.board.get(fromSq);
    if (!piece || piece.role !== "pawn") return false;
    const rank = Math.floor(toSq / 8);
    return piece.color === "white" ? rank === 7 : rank === 0;
  }

  kingSquare(color: PieceColor): string | null {
    const king = this.pos.board.kingOf(color === "w" ? "white" : "black");
    return king === undefined ? null : makeSquare(king);
  }

  clone(): RulesPosition {
    const copy = new ChessopsPosition(this.config, this.fen());
    copy.sanHistory.push(...this.sanHistory);
    copy.fenHistory.length = 0;
    copy.fenHistory.push(...this.fenHistory);
    return copy;
  }
}

export function stripCastlingFromFen(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length < 3) return fen;
  parts[2] = "-";
  return parts.join(" ");
}

export function createChessopsRules(config: ChessopsVariantConfig): ChessRulesAdapter {
  // Each rule set owns its own array (horde's pawn wall, racing kings' rank 1/2).
  const startingFen = config.startingFen ?? makeFen(defaultPosition(config.rules).toSetup());

  return {
    engine: "chessops-variant",
    supported: true,
    supportsArbitraryCastling: false,
    pgnVariantTag: config.pgnVariantTag,
    startingFen: () => (config.stripCastling ? stripCastlingFromFen(startingFen) : startingFen),
    createPosition: (fen?: string) =>
      new ChessopsPosition(config, fen ?? (config.stripCastling ? stripCastlingFromFen(startingFen) : startingFen)),
    validateMove: (fen, from, to, promotion) => {
      const position = new ChessopsPosition(config, fen);
      return position.move(from, to, promotion);
    },
  };
}
