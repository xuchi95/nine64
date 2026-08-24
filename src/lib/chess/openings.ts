/**
 * Extensible opening book. Keys are space-joined SAN prefixes; the longest
 * matching prefix wins, so adding deeper lines never breaks shallower ones.
 */
const BOOK: Record<string, string> = {
  e4: "King's Pawn Opening",
  "e4 e5": "Open Game",
  "e4 e5 Nf3": "King's Knight Opening",
  "e4 e5 Nf3 Nc6 Bb5": "Ruy Lopez",
  "e4 e5 Nf3 Nc6 Bc4": "Italian Game",
  "e4 e5 Nf3 Nc6 Bc4 Bc5": "Giuoco Piano",
  "e4 e5 Nf3 Nc6 d4": "Scotch Game",
  "e4 e5 Nf3 Nf6": "Petrov Defense",
  "e4 e5 Nc3": "Vienna Game",
  "e4 e5 f4": "King's Gambit",
  "e4 e5 Bc4": "Bishop's Opening",
  "e4 c5": "Sicilian Defense",
  "e4 c5 Nf3 d6": "Sicilian Defense: Najdorf-bound",
  "e4 c5 Nf3 Nc6": "Sicilian Defense: Old Sicilian",
  "e4 c5 Nf3 e6": "Sicilian Defense: French Variation",
  "e4 c5 c3": "Sicilian Defense: Alapin Variation",
  "e4 c5 Nc3": "Sicilian Defense: Closed",
  "e4 e6": "French Defense",
  "e4 e6 d4 d5 Nc3": "French Defense: Classical",
  "e4 e6 d4 d5 e5": "French Defense: Advance Variation",
  "e4 c6": "Caro-Kann Defense",
  "e4 c6 d4 d5 Nc3": "Caro-Kann: Main Line",
  "e4 d5": "Scandinavian Defense",
  "e4 d6": "Pirc Defense",
  "e4 g6": "Modern Defense",
  "e4 Nf6": "Alekhine Defense",
  "e4 b6": "Owen Defense",
  d4: "Queen's Pawn Opening",
  "d4 d5": "Closed Game",
  "d4 d5 c4": "Queen's Gambit",
  "d4 d5 c4 dxc4": "Queen's Gambit Accepted",
  "d4 d5 c4 e6": "Queen's Gambit Declined",
  "d4 d5 c4 c6": "Slav Defense",
  "d4 d5 Nf3": "Queen's Pawn Game",
  "d4 d5 Bf4": "London System",
  "d4 Nf6": "Indian Defense",
  "d4 Nf6 c4 g6": "King's Indian Defense",
  "d4 Nf6 c4 g6 Nc3 d5": "Grunfeld Defense",
  "d4 Nf6 c4 e6": "Indian Defense: East Indian",
  "d4 Nf6 c4 e6 Nc3 Bb4": "Nimzo-Indian Defense",
  "d4 Nf6 c4 e6 Nf3 b6": "Queen's Indian Defense",
  "d4 Nf6 c4 c5": "Benoni Defense",
  "d4 Nf6 Bf4": "London System",
  "d4 Nf6 Bg5": "Trompowsky Attack",
  "d4 f5": "Dutch Defense",
  "d4 e6": "Queen's Pawn: Horwitz Defense",
  c4: "English Opening",
  "c4 e5": "English Opening: Reversed Sicilian",
  "c4 c5": "English Opening: Symmetrical",
  "c4 Nf6": "English Opening: Anglo-Indian",
  Nf3: "Zukertort Opening",
  "Nf3 d5 g3": "Reti Opening: King's Indian Attack",
  "Nf3 Nf6 c4": "Reti Opening",
  g3: "Benko Opening",
  b3: "Nimzo-Larsen Attack",
  f4: "Bird's Opening",
  b4: "Polish Opening",
  Nc3: "Dunst Opening",
};

export interface OpeningInfo {
  name: string;
  ply: number;
}

export function detectOpening(sanMoves: string[]): OpeningInfo | null {
  let found: OpeningInfo | null = null;
  const limit = Math.min(sanMoves.length, 12);
  for (let i = 1; i <= limit; i++) {
    const key = sanMoves.slice(0, i).join(" ");
    const name = BOOK[key];
    if (name) found = { name, ply: i };
  }
  return found;
}

export function bookMovesFor(sanMoves: string[]): string[] {
  const prefix = sanMoves.join(" ");
  const candidates = new Set<string>();
  for (const key of Object.keys(BOOK)) {
    if (prefix === "" ? key.split(" ").length === 1 : key.startsWith(prefix + " ")) {
      const rest = key.slice(prefix === "" ? 0 : prefix.length + 1).split(" ")[0];
      if (rest) candidates.add(rest);
    }
  }
  return [...candidates];
}
