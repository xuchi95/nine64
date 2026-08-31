/**
 * ECO lookup over the embedded open dataset.
 *
 * Server-only on purpose: the book is ~380 KB, so it never ships to the
 * browser. Callers get the resolved `{ eco, name }` from a server function.
 */
import { ECO_BOOK, ECO_DATASET } from "./ecoBook.data";

export interface EcoEntry {
  eco: string;
  name: string;
  /** Space-joined SAN path from the start position. */
  path: string;
}

let byPath: Map<string, EcoEntry> | null = null;

function index(): Map<string, EcoEntry> {
  if (byPath) return byPath;
  const map = new Map<string, EcoEntry>();
  for (const [eco, name, path] of ECO_BOOK) map.set(path, { eco, name, path });
  byPath = map;
  return map;
}

/** Longest matching prefix wins, so deeper transpositions keep their name. */
export function ecoForPath(sans: readonly string[]): EcoEntry | null {
  const map = index();
  let found: EcoEntry | null = null;
  const limit = Math.min(sans.length, 30);
  for (let i = 1; i <= limit; i++) {
    const hit = map.get(sans.slice(0, i).join(" "));
    if (hit) found = hit;
  }
  return found;
}

/** Distinct ECO codes with a representative name, for admin listings. */
export function ecoSummary(): { eco: string; name: string; lines: number }[] {
  const groups = new Map<string, { eco: string; name: string; lines: number }>();
  for (const [eco, name] of ECO_BOOK) {
    const entry = groups.get(eco);
    if (entry) entry.lines += 1;
    else groups.set(eco, { eco, name, lines: 1 });
  }
  return [...groups.values()].sort((a, b) => a.eco.localeCompare(b.eco));
}

export function searchEco(query: string, limit = 50): EcoEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: EcoEntry[] = [];
  for (const [eco, name, path] of ECO_BOOK) {
    if (eco.toLowerCase().startsWith(q) || name.toLowerCase().includes(q)) {
      out.push({ eco, name, path });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export { ECO_DATASET };
