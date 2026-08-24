/**
 * Fair Play Engine — shared types.
 *
 * The system is layered:
 *  1. behavioural telemetry collected in the browser during online games
 *  2. engine-derived move quality metrics computed after the game
 *  3. a calibrated logistic model that fuses both into a suspicion score
 *  4. sequential testing (SPRT) across games + collusion detection
 *  5. server-authoritative actions (rating hold, unrated game, admin case)
 */

export type FairplayColor = "w" | "b";

/** Raw per-turn behavioural record produced by the client. */
export interface TurnTelemetry {
  /** Ply index of the move the player made (0-based, matches game move list). */
  ply: number;
  /** Time the player spent on this turn in ms. */
  spentMs: number;
  /** Total ms the tab was hidden / window unfocused while it was this player's turn. */
  blurMs: number;
  /** How many times focus was lost during this turn. */
  blurCount: number;
  /** ms between the turn starting and the first board interaction. */
  firstInteractionMs: number;
  /** True when the very first interaction already targeted the final destination square. */
  directToTarget: boolean;
  /** Number of squares the player "tried" (selected then abandoned) before moving. */
  exploredSquares: number;
  /** Clipboard paste detected during this turn (FEN/PGN fishing). */
  pasted: boolean;
  /** Another tab/window of the same game reported itself active during this turn. */
  duplicateTab: boolean;
}

/** Per-move engine observation, distilled from the deep review. */
export interface MoveObservation {
  ply: number;
  /** Played move equals the engine's first choice. */
  isTop1: boolean;
  /** Win-percentage loss versus the engine move (0-100). */
  loss: number;
  /** Position complexity 0-1 (engine spread + legal move count). */
  complexity: number;
  /** Per-move accuracy 0-100. */
  accuracy: number;
  spentMs: number | null;
}

/** The full numeric feature vector fed to the model. */
export interface FairplayFeatures {
  moves: number;
  /** Number of own moves played in complex positions (sample size for hard-* signals). */
  hardMoves: number;
  /** Number of own turns with a meaningful focus loss (sample size for blur signals). */
  blurTurns: number;
  /** Reference rating used to pick population expectations. */
  rating: number;
  engineMatch: number;
  hardMatch: number;
  hardAccuracy: number;
  cplMean: number;
  cplCv: number;
  timeCv: number;
  hardFastShare: number;
  blurShare: number;
  blurMatchLift: number;
  noHesitationShare: number;
  pasteCount: number;
  duplicateTabCount: number;
  /** Noise-corrected strength of the most engine-like contiguous segment (in sd). */
  segmentZ: number;
}

export type FairplayAction =
  | "none"
  | "monitor"
  | "unrated"
  | "rating_hold";

export interface FairplayVerdict {
  /** 0-100 suspicion score (calibrated probability x 100). */
  score: number;
  /** Model probability 0-1. */
  probability: number;
  /** Confidence 0-1 driven by the sample size. */
  confidence: number;
  /** Human-readable evidence, strongest first. */
  reasons: string[];
  /** Per-feature z-scores, for the admin case view. */
  contributions: { feature: string; z: number; weight: number; impact: number }[];
  action: FairplayAction;
  /** Model version so old reports stay interpretable. */
  model: string;
}

export const FAIRPLAY_MODEL_VERSION = "nexus-fp-1";
