import { memo } from "react";
import { cn } from "@/lib/utils";
import type { PieceSet } from "@/lib/chess/themes";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";

interface Props {
  type: PieceType;
  color: PieceColor;
  set: PieceSet;
  size: number;
  className?: string;
  /** Highlight the piece (hover/focus/selected) with a glow and lift effect. */
  glow?: boolean;
}

/**
 * "Nexus" piece set — bespoke faceted vector sculptures drawn as real SVG
 * geometry (no symbol font).
 *
 * Perf notes: geometry is pre-merged so each piece renders a minimal node set
 * (shared plinth + body + one engrave path + one gloss path). Gradient ids are
 * deterministic per set/colour instead of per instance, so 32 pieces on a board
 * reuse the same paint definitions, and the filter/transform strings are static
 * constants to avoid re-allocating style objects on every board update.
 */

/** Plinth + collar merged into a single subpath-compound path. */
const PLINTH =
  "M31 70h38l3.5 8.5c.8 2-.6 4-2.8 4H29.3c-2.2 0-3.6-2-2.8-4zM35 64h30l1.5 6h-33z";

const BODIES: Record<PieceType, string> = {
  // Pawn — sphere head, cinched collar, flared cone.
  p: "M50 17c6.1 0 11 4.9 11 11 0 3.3-1.5 6.3-3.8 8.3 2.9 1.5 4.8 3.7 4.8 6.4 0 1.9-.9 3.5-2.4 4.9 4 6.2 6.6 13.6 7.6 22.4H32.8c1-8.8 3.6-16.2 7.6-22.4-1.5-1.4-2.4-3-2.4-4.9 0-2.7 1.9-4.9 4.8-6.4A11 11 0 0 1 39 28c0-6.1 4.9-11 11-11z",
  // Rook — crenellated tower with a chamfered waist.
  r: "M30 22h9.5v7h7v-7h7v7h7v-7H70v15l-5.5 5.5 2.5 27.5H33l2.5-27.5L30 37z",
  // Knight — faceted destrier, angular jaw and cropped mane.
  n: "M55.5 14c1.7 4 4.6 6.6 8.4 9.6 6.3 5 9.6 12 10.3 21.3.6 8 .3 16.2-.6 25.1H35.2c-.9-9.9 1.1-18.2 6.1-25.2l-6.6 3.1-3.7-3.5 3.6-8.2-4.9-1.7 1.3-6.5 8.4-1.7 3.4-6.9 5.9 2.1z",
  // Bishop — mitre with finial orb merged in.
  b: "M50 20c7.7 8.2 15.5 17 15.5 27.1 0 9.6-6.9 15.9-15.5 15.9s-15.5-6.3-15.5-15.9C34.5 37 42.3 28.2 50 20zM54.2 17a4.2 4.2 0 1 1-8.4 0 4.2 4.2 0 0 1 8.4 0z",
  // Queen — coronet, orbs and gown merged.
  q: "M25.5 44.5 30 24l9.5 12.5L50 18l10.5 18.5L70 24l4.5 20.5zM31 49h38l-3.5 21.5H34.5zM29.5 42a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM78.5 42a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM54 15.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  // King — crown, cross and shoulders merged.
  k: "M46.5 12h7v7H61v7h-7.5V33h-7v-7H39v-7h7.5zM28.5 45c1-11.5 9-17 21.5-17s20.5 5.5 21.5 17l-3.5 25.5h-36zM32.1 46a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 0 1 7.2 0zM75.1 46a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 0 1 7.2 0z",
};

/** Facet highlight — a soft gloss on the light-source side of each sculpture. */
const FACETS: Record<PieceType, string> = {
  p: "M50 21c-4 0-7 3.2-7 7 0 2.3 1 4.2 2.7 5.5-2.6 1.6-4 3.4-4 5.4 0 1.3.6 2.4 1.7 3.4-3.2 5.4-5.4 11.9-6.4 19.4h5.3c.9-8.4 3-15.4 6.3-21z",
  r: "M33.5 25h4.5v7h4v-7h3v45h-6.5l2-27.5-4.5-4.5h-2.5z",
  n: "M52.5 18.5 47.3 17l-2.8 5.8-7.4 1.5-.7 3.5 4.6 1.6-3 6.8 2.6 2.4 6.6-3.1c-4.3 6.2-6.3 13.4-6 21.5h5.2c-.4-9 1.7-16.5 6.4-22.7-3.5-3.3-4.6-8.7-.3-15.8z",
  b: "M50 24.5c-5.6 6.2-11.5 13.3-11.5 22.6 0 6.6 3.6 11.2 8.6 13.1-2.4-3-3.6-7-3.6-11.9 0-8.4 3.2-16.3 6.5-23.8z",
  q: "M29.5 44.5 33 28.5l6.5 8.5L48 21l1.4 2.5L42 41.5l-4.5 3 3 25.5h-5.5L31.5 49h-2z",
  k: "M50 30.5c-9.5.6-16.4 5.6-19.7 14h-1.8c3.5-9.5 11-14.5 21.5-14.5zM39.5 44.5c2.4-6.4 6.5-10.3 12.5-11.4l-1.2-1.6c-7.4.8-12.6 5.1-15.6 13z",
};

/** Engrave accents merged with the shared base line into one path per type. */
const ENGRAVE: Record<PieceType, string> = {
  p: "M41.5 43h17M35.5 67.5h29",
  r: "M35.5 43h29M35.5 67.5h29",
  n: "M60 30c3.5 3.5 5.3 8.4 5.6 14.8M35.5 67.5h29",
  b: "M53 32 44 46M35.5 67.5h29",
  q: "M33 55h34M35.5 67.5h29",
  k: "M38 52h24M35.5 67.5h29",
};

const FILTER_IDLE_DARK =
  "drop-shadow(0 0 1.4px rgba(255,255,255,0.5)) drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.5))";
const FILTER_IDLE_LIGHT = "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.38))";
const FILTER_GLOW_DARK =
  "drop-shadow(0 0 3px rgba(255,215,120,1)) drop-shadow(0 0 10px rgba(255,255,255,0.7)) drop-shadow(0 2px 2px rgba(0,0,0,0.55))";
const FILTER_GLOW_LIGHT =
  "drop-shadow(0 0 3px rgba(0,0,0,0.8)) drop-shadow(0 0 10px rgba(255,200,90,0.6)) drop-shadow(0 2px 2px rgba(0,0,0,0.35))";

// Static style objects — shared by every piece so React skips style diffing.
const STYLES = {
  "b-0": { transform: "scale(1)", filter: FILTER_IDLE_DARK },
  "b-1": { transform: "scale(1.08)", filter: FILTER_GLOW_DARK },
  "w-0": { transform: "scale(1)", filter: FILTER_IDLE_LIGHT },
  "w-1": { transform: "scale(1.08)", filter: FILTER_GLOW_LIGHT },
} as const;

function PieceImpl({ type, color, set, size, className, glow = false }: Props) {
  const isDark = color === "b";
  const fill = isDark ? set.darkFill : set.lightFill;
  const stroke = isDark ? set.darkStroke : set.lightStroke;
  const strokeWidth = Math.max(1.6, set.stroke * 100 * (isDark ? 1.35 : 1));
  // Deterministic ids: identical definitions are shared across all instances.
  const bodyId = `nxb-${set.id}-${color}`;
  const glossId = `nxg-${color}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      className={cn("transition-transform duration-200 ease-out will-change-transform", className)}
      aria-hidden="true"
      focusable="false"
      style={STYLES[`${color}-${glow ? 1 : 0}` as keyof typeof STYLES]}
    >
      <defs>
        <linearGradient id={bodyId} x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={fill} />
          <stop offset="0.55" stopColor={fill} />
          <stop
            offset="1"
            stopColor={isDark ? "#000000" : "#b9a889"}
            stopOpacity={isDark ? 0.55 : 0.5}
          />
        </linearGradient>
        <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={isDark ? 0.28 : 0.75} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {set.shadow && <ellipse cx="50" cy="90" rx="25" ry="4.2" fill="rgba(0,0,0,0.24)" />}

      <g
        fill={`url(#${bodyId})`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        paintOrder="stroke"
      >
        <path d={PLINTH} />
        <path d={BODIES[type]} fillRule="evenodd" />
      </g>

      {/* engraved detail lines — brass-cut accents */}
      <path
        d={ENGRAVE[type]}
        fill="none"
        stroke={isDark ? "rgba(255,255,255,0.34)" : "rgba(60,42,20,0.34)"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* facet gloss */}
      <path d={FACETS[type]} fill={`url(#${glossId})`} />
      {type === "n" && (
        <circle
          cx="58.5"
          cy="30"
          r="2"
          fill={isDark ? "rgba(255,255,255,0.75)" : "rgba(40,28,14,0.8)"}
        />
      )}
    </svg>
  );
}

export const Piece = memo(PieceImpl);

export const PIECE_NAMES: Record<PieceType, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};
