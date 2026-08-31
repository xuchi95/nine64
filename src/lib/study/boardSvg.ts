/**
 * Dependency-free SVG board renderer used on the server (social card + the
 * sandboxed embed HTML). It never imports React or the client board so it can
 * run inside the Worker, and it only needs a FEN.
 */

const GLYPHS: Record<string, string> = {
  K: "\u2654",
  Q: "\u2655",
  R: "\u2656",
  B: "\u2657",
  N: "\u2658",
  P: "\u2659",
  k: "\u265A",
  q: "\u265B",
  r: "\u265C",
  b: "\u265D",
  n: "\u265E",
  p: "\u265F",
};

export const BOARD_COLORS = {
  light: "#e6dcc6",
  dark: "#9b7b48",
  border: "#c8a24a",
  bg: "#101217",
  text: "#f4f1ea",
  muted: "#a7a196",
  whitePiece: "#fbfaf7",
  blackPiece: "#16181d",
} as const;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Expand the piece-placement field of a FEN into 64 cells (a8 -> h1). */
export function fenToCells(fen: string): (string | null)[] {
  const placement = (fen || "").split(" ")[0] ?? "";
  const cells: (string | null)[] = [];
  for (const ch of placement) {
    if (ch === "/") continue;
    if (/\d/.test(ch)) {
      for (let i = 0; i < Number(ch); i++) cells.push(null);
    } else {
      cells.push(ch);
    }
  }
  while (cells.length < 64) cells.push(null);
  return cells.slice(0, 64);
}

export interface BoardSvgOptions {
  size?: number;
  x?: number;
  y?: number;
  flipped?: boolean;
}

/** Board-only `<g>` fragment, positioned at (x, y). */
export function boardSvgFragment(fen: string, options: BoardSvgOptions = {}): string {
  const size = options.size ?? 480;
  const ox = options.x ?? 0;
  const oy = options.y ?? 0;
  const square = size / 8;
  const cells = fenToCells(fen);
  const parts: string[] = [];
  parts.push(
    `<rect x="${ox - 6}" y="${oy - 6}" width="${size + 12}" height="${size + 12}" rx="10" fill="${BOARD_COLORS.bg}" stroke="${BOARD_COLORS.border}" stroke-width="2"/>`,
  );
  for (let index = 0; index < 64; index++) {
    const view = options.flipped ? 63 - index : index;
    const row = Math.floor(index / 8);
    const col = index % 8;
    const piece = cells[view];
    const isDark = (row + col) % 2 === 1;
    const px = ox + col * square;
    const py = oy + row * square;
    parts.push(
      `<rect x="${px}" y="${py}" width="${square}" height="${square}" fill="${isDark ? BOARD_COLORS.dark : BOARD_COLORS.light}"/>`,
    );
    if (!piece) continue;
    const glyph = GLYPHS[piece];
    if (!glyph) continue;
    const isWhite = piece === piece.toUpperCase();
    parts.push(
      `<text x="${px + square / 2}" y="${py + square * 0.78}" font-size="${square * 0.86}" text-anchor="middle" font-family="'Noto Sans Symbols 2','DejaVu Sans','Segoe UI Symbol',serif" fill="${isWhite ? BOARD_COLORS.whitePiece : BOARD_COLORS.blackPiece}" stroke="${isWhite ? "#2b2b2b" : "#000000"}" stroke-width="${square * 0.012}">${glyph}</text>`,
    );
  }
  return `<g>${parts.join("")}</g>`;
}

export interface OgCardInput {
  fen: string;
  title: string;
  white?: string | null;
  black?: string | null;
  result?: string | null;
  subtitle?: string | null;
}

/** 1200x630 branded social card with the position on the left. */
export function studyOgSvg(input: OgCardInput): string {
  const board = boardSvgFragment(input.fen, { size: 500, x: 70, y: 65 });
  const title = escapeXml(input.title.slice(0, 60));
  const players =
    input.white || input.black
      ? escapeXml(`${input.white ?? "?"} vs ${input.black ?? "?"}`.slice(0, 52))
      : "";
  const subtitle = escapeXml((input.subtitle ?? "").slice(0, 70));
  const result = escapeXml(input.result ?? "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#0d0f14"/><stop offset="100%" stop-color="#1b1e26"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<rect x="0" y="0" width="1200" height="6" fill="${BOARD_COLORS.border}"/>
${board}
<text x="640" y="150" font-size="46" font-family="'Sora','DejaVu Sans',sans-serif" font-weight="700" fill="${BOARD_COLORS.text}">${title}</text>
<text x="640" y="205" font-size="28" font-family="'Manrope','DejaVu Sans',sans-serif" fill="${BOARD_COLORS.muted}">${players}</text>
<text x="640" y="262" font-size="26" font-family="'Manrope','DejaVu Sans',sans-serif" fill="${BOARD_COLORS.muted}">${subtitle}</text>
${result ? `<text x="640" y="335" font-size="40" font-family="'JetBrains Mono',monospace" fill="${BOARD_COLORS.border}">${result}</text>` : ""}
<text x="640" y="540" font-size="34" letter-spacing="8" font-family="'Sora','DejaVu Sans',sans-serif" font-weight="700" fill="${BOARD_COLORS.border}">NINE64</text>
<text x="640" y="580" font-size="22" font-family="'Manrope','DejaVu Sans',sans-serif" fill="${BOARD_COLORS.muted}">nine64.com</text>
</svg>`;
}
