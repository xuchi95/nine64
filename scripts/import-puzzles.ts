#!/usr/bin/env bun
/**
 * Nine64 puzzle catalog importer.
 *
 * Streams a large CSV or NDJSON dataset into `puzzle_catalog` / `puzzle_lines`
 * in batches. Never run an import from the browser: files are millions of rows.
 *
 * Every import requires source + license metadata, stored in `puzzle_datasets`.
 * Proprietary catalogues (e.g. Chess.com puzzles) must NOT be imported.
 *
 * Usage:
 *   bun scripts/import-puzzles.ts \
 *     --file lichess_db_puzzle.csv --format lichess \
 *     --dataset lichess-2026-01 --name "Lichess puzzles" \
 *     --license CC0-1.0 --license-url https://database.lichess.org \
 *     --source-url https://database.lichess.org/#puzzles \
 *     --version 2026-01 [--limit 50000] [--min-rating 800] [--max-rating 2600] [--dry-run]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { createClient } from "@supabase/supabase-js";
import { detectThemesFromLine, mapExternalThemes, type ThemeKey } from "../src/lib/puzzles/themes";

interface Args {
  [key: string]: string | boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const BANNED_SOURCES = ["chess.com", "chesscom", "chess24"];

export interface RawPuzzle {
  sourceId: string;
  fen: string;
  /** UCI moves. For Lichess rows the first move is the opponent's setup move. */
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  themes: string[];
  gameUrl: string | null;
  opening: string | null;
}

/** Split a CSV line honouring quoted fields. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseLichessRow(line: string): RawPuzzle | null {
  const cols = splitCsv(line);
  if (cols.length < 8) return null;
  const [id, fen, moves, rating, rd, popularity, , themes, gameUrl, openingTags] = cols;
  if (!id || !fen || !moves || id === "PuzzleId") return null;
  return {
    sourceId: id,
    fen,
    moves: moves.trim().split(/\s+/),
    rating: Number(rating ?? 1500) || 1500,
    ratingDeviation: Number(rd ?? 100) || 100,
    popularity: Number(popularity ?? 0) || 0,
    themes: (themes ?? "").trim().split(/\s+/).filter(Boolean),
    gameUrl: gameUrl || null,
    opening: openingTags ? openingTags.split(/\s+/)[0] ?? null : null,
  };
}

export function parseNdjsonRow(line: string): RawPuzzle | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    const moves = Array.isArray(raw["moves"])
      ? (raw["moves"] as string[])
      : String(raw["moves"] ?? "").trim().split(/\s+/);
    if (!raw["fen"] || moves.length === 0) return null;
    return {
      sourceId: String(raw["id"] ?? raw["puzzleId"] ?? ""),
      fen: String(raw["fen"]),
      moves,
      rating: Number(raw["rating"] ?? 1500),
      ratingDeviation: Number(raw["ratingDeviation"] ?? 100),
      popularity: Number(raw["popularity"] ?? 0),
      themes: Array.isArray(raw["themes"]) ? (raw["themes"] as string[]) : [],
      gameUrl: (raw["gameUrl"] as string | null) ?? null,
      opening: (raw["opening"] as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export interface NormalisedPuzzle {
  id: string;
  fen: string;
  color: "w" | "b";
  moves: { uci: string; san: string }[];
  themes: ThemeKey[];
  phase: "opening" | "middlegame" | "endgame";
  rating: number;
  ratingDeviation: number;
  popularity: number;
  opening: string | null;
  gameUrl: string | null;
}

/**
 * Validate the whole tactical sequence and canonicalise it. Rows whose line does
 * not replay legally are dropped — a puzzle must have a full valid solution.
 */
export function normalise(
  raw: RawPuzzle,
  datasetSlug: string,
  opts: { applyFirstMove: boolean },
): NormalisedPuzzle | null {
  let chess: Chess;
  try {
    chess = new Chess(raw.fen);
  } catch {
    return null;
  }
  const uciMoves = [...raw.moves];
  if (opts.applyFirstMove) {
    const setup = uciMoves.shift();
    if (!setup) return null;
    try {
      const applied = chess.move({
        from: setup.slice(0, 2),
        to: setup.slice(2, 4),
        promotion: (setup[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      if (!applied) return null;
    } catch {
      return null;
    }
  }
  const startFen = chess.fen();
  const color = chess.turn();
  const line: { uci: string; san: string }[] = [];
  for (const uci of uciMoves) {
    try {
      const applied = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
      });
      if (!applied) return null;
      line.push({ uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`, san: applied.san });
    } catch {
      return null;
    }
  }
  if (line.length === 0) return null;
  // The solver must always play the final move of the sequence.
  if (line.length % 2 === 0) line.pop();
  if (line.length === 0) return null;

  const mapped = mapExternalThemes(raw.themes);
  const themes = mapped.length > 0 ? mapped : detectThemesFromLine(startFen, line);
  const pieceCount = new Chess(startFen).board().flat().filter(Boolean).length;
  const phase: NormalisedPuzzle["phase"] =
    themes.includes("endgame") || pieceCount <= 12
      ? "endgame"
      : themes.includes("opening_tactics")
        ? "opening"
        : "middlegame";

  return {
    id: `${datasetSlug}:${raw.sourceId}`,
    fen: startFen,
    color,
    moves: line,
    themes,
    phase,
    rating: Math.max(400, Math.min(3000, Math.round(raw.rating))),
    ratingDeviation: Math.max(30, Math.min(300, Math.round(raw.ratingDeviation))),
    popularity: raw.popularity,
    opening: raw.opening,
    gameUrl: raw.gameUrl,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = String(args["file"] ?? "");
  const format = String(args["format"] ?? "lichess");
  const slug = String(args["dataset"] ?? "");
  const license = String(args["license"] ?? "");
  const sourceUrl = String(args["source-url"] ?? "");
  const dryRun = Boolean(args["dry-run"]);
  const limit = Number(args["limit"] ?? Infinity);
  const minRating = Number(args["min-rating"] ?? 0);
  const maxRating = Number(args["max-rating"] ?? 4000);

  if (!file || !slug || !license) {
    console.error("--file, --dataset and --license are required (license metadata is mandatory).");
    process.exit(1);
  }
  if (BANNED_SOURCES.some((b) => (sourceUrl + slug).toLowerCase().includes(b))) {
    console.error("Refusing to import a proprietary puzzle source.");
    process.exit(1);
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!dryRun && (!url || !key)) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (omit with --dry-run).");
    process.exit(1);
  }
  const supabase = dryRun ? null : createClient(url!, key!, { auth: { persistSession: false } });

  let datasetId: string | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("puzzle_datasets")
      .upsert(
        {
          slug,
          name: String(args["name"] ?? slug),
          license,
          license_url: String(args["license-url"] ?? ""),
          source_url: sourceUrl,
          attribution: String(args["attribution"] ?? ""),
          version: String(args["version"] ?? "v1"),
          notes: String(args["notes"] ?? ""),
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw error;
    datasetId = String((data as { id: string }).id);
  }

  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  const applyFirstMove = format === "lichess";
  let read = 0;
  let kept = 0;
  let rejected = 0;
  let batch: NormalisedPuzzle[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    if (supabase) {
      const { error } = await supabase.from("puzzle_catalog").upsert(
        batch.map((p) => ({
          id: p.id,
          dataset_id: datasetId,
          source: slug,
          source_id: p.id.split(":")[1] ?? p.id,
          fen: p.fen,
          color: p.color,
          rating: p.rating,
          rating_deviation: p.ratingDeviation,
          popularity: p.popularity,
          plies: p.moves.length,
          themes: p.themes,
          phase: p.phase,
          opening: p.opening,
          game_url: p.gameUrl,
        })),
        { onConflict: "id" },
      );
      if (error) throw error;
      const { error: lineError } = await supabase.from("puzzle_lines").upsert(
        batch.map((p) => ({ puzzle_id: p.id, line_index: 0, kind: "solution", ply_from: 0, moves: p.moves })),
        { onConflict: "puzzle_id,line_index" },
      );
      if (lineError) throw lineError;
    }
    kept += batch.length;
    batch = [];
    process.stdout.write(`\r read=${read} kept=${kept} rejected=${rejected}`);
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    read += 1;
    const raw = format === "ndjson" ? parseNdjsonRow(line) : parseLichessRow(line);
    if (!raw) {
      rejected += 1;
      continue;
    }
    if (raw.rating < minRating || raw.rating > maxRating) continue;
    const puzzle = normalise(raw, slug, { applyFirstMove });
    if (!puzzle) {
      rejected += 1;
      continue;
    }
    batch.push(puzzle);
    if (batch.length >= 500) await flush();
    if (kept >= limit) break;
  }
  await flush();

  if (supabase && datasetId) {
    await supabase.from("puzzle_datasets").update({ imported_count: kept }).eq("id", datasetId);
  }
  console.log(`\nimported=${kept} rejected=${rejected} read=${read} dataset=${slug} license=${license}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
