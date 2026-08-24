import { parseFen, phaseMaterial, attackersOf, indexToSquare } from "./board";

export type GamePhase = "opening" | "middlegame" | "endgame";

const START_MATERIAL = 2 * (2 * 320 + 2 * 330 + 2 * 500 + 900); // 7300

export function detectPhase(fen: string, moveNumber: number): GamePhase {
  const { squares } = parseFen(fen);
  const material = phaseMaterial(squares);
  if (material <= 2000) return "endgame";
  if (moveNumber <= 12 && material >= START_MATERIAL * 0.8) return "opening";
  if (material >= START_MATERIAL * 0.55) return "middlegame";
  return material <= 3200 ? "endgame" : "middlegame";
}

export interface StructureReport {
  phase: GamePhase;
  material: number;
  isolatedPawns: { w: number; b: number };
  doubledPawns: { w: number; b: number };
  passedPawns: { w: number; b: number };
  openFiles: number;
  kingSafety: { w: number; b: number };
  plans: string[];
}

function pawnFiles(squares: ReturnType<typeof parseFen>["squares"], color: "w" | "b") {
  const files = Array.from({ length: 8 }, () => 0 as number);
  const ranks: number[][] = Array.from({ length: 8 }, () => []);
  squares.forEach((p, i) => {
    if (p && p.type === "p" && p.color === color) {
      const f = i % 8;
      files[f] = (files[f] ?? 0) + 1;
      ranks[f]!.push(7 - Math.floor(i / 8));
    }
  });
  return { files, ranks };
}

/** Attack units around the enemy king — a compact king-safety proxy. */
function kingAttackUnits(
  squares: ReturnType<typeof parseFen>["squares"],
  defender: "w" | "b",
): number {
  const kingIdx = squares.findIndex((p) => p && p.type === "k" && p.color === defender);
  if (kingIdx < 0) return 0;
  const attacker = defender === "w" ? "b" : "w";
  const file = kingIdx % 8;
  const rank = 7 - Math.floor(kingIdx / 8);
  let units = 0;
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const f = file + df;
      const r = rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const idx = (7 - r) * 8 + f;
      units += attackersOf(squares, idx, attacker).length;
    }
  }
  return units;
}

export function analyseStructure(fen: string, moveNumber: number): StructureReport {
  const { squares } = parseFen(fen);
  const phase = detectPhase(fen, moveNumber);
  const white = pawnFiles(squares, "w");
  const black = pawnFiles(squares, "b");

  const isolated = (p: typeof white) =>
    p.files.reduce(
      (acc, count, f) =>
        count > 0 && (p.files[f - 1] ?? 0) === 0 && (p.files[f + 1] ?? 0) === 0 ? acc + count : acc,
      0,
    );
  const doubled = (p: typeof white) =>
    p.files.reduce((acc, count) => (count > 1 ? acc + (count - 1) : acc), 0);

  const passed = (own: typeof white, enemy: typeof white, color: "w" | "b") => {
    let n = 0;
    own.ranks.forEach((rs, f) => {
      for (const r of rs) {
        const blockers = [f - 1, f, f + 1]
          .filter((x) => x >= 0 && x <= 7)
          .flatMap((x) => enemy.ranks[x] ?? []);
        const ahead = blockers.some((er) => (color === "w" ? er > r : er < r));
        if (!ahead) n += 1;
      }
    });
    return n;
  };

  const openFiles = white.files.reduce(
    (acc, wc, f) => (wc === 0 && (black.files[f] ?? 0) === 0 ? acc + 1 : acc),
    0,
  );

  const kingSafety = { w: kingAttackUnits(squares, "w"), b: kingAttackUnits(squares, "b") };
  const material = phaseMaterial(squares);

  const plans: string[] = [];
  if (phase === "opening") plans.push("Finish development and castle before opening lines.");
  if (openFiles > 0) plans.push(`Occupy the ${openFiles} open file(s) with a rook.`);
  if (kingSafety.b > kingSafety.w + 2) plans.push("Black's king is under pressure — keep attacking.");
  if (kingSafety.w > kingSafety.b + 2) plans.push("White's king is exposed — look for a counterattack.");
  const wPassed = passed(white, black, "w");
  const bPassed = passed(black, white, "b");
  if (wPassed > 0) plans.push(`White has ${wPassed} passed pawn(s) — push them in the endgame.`);
  if (bPassed > 0) plans.push(`Black has ${bPassed} passed pawn(s) — blockade or race them.`);
  if (isolated(white) > 0 || isolated(black) > 0)
    plans.push("Target the isolated pawn with pieces rather than pawns.");
  if (phase === "endgame") plans.push("Activate the king; it is a fighting piece now.");

  return {
    phase,
    material,
    isolatedPawns: { w: isolated(white), b: isolated(black) },
    doubledPawns: { w: doubled(white), b: doubled(black) },
    passedPawns: { w: wPassed, b: bPassed },
    openFiles,
    kingSafety,
    plans,
  };
}

/** Squares of every hanging (attacked and undefended) piece of `color`. */
export function hangingPieces(fen: string, color: "w" | "b"): string[] {
  const { squares } = parseFen(fen);
  const enemy = color === "w" ? "b" : "w";
  const out: string[] = [];
  squares.forEach((p, i) => {
    if (!p || p.color !== color || p.type === "k") return;
    const attackers = attackersOf(squares, i, enemy);
    if (attackers.length === 0) return;
    const defenders = attackersOf(squares, i, color);
    if (defenders.length === 0) out.push(indexToSquare(i));
  });
  return out;
}
