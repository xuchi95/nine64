/**
 * Deterministic chat personas for the Nine64 AI Player Network (client-safe).
 *
 * Each AI profile always gets the same personality, so a returning opponent
 * feels like the same person, while the pool as a whole is varied and hard to
 * predict: some are chatty, some barely answer, some are dry, some joke.
 */

export type ChatTone =
  | "friendly"
  | "quiet"
  | "cocky"
  | "sporty"
  | "nerdy"
  | "grumpy"
  | "playful"
  | "zen";

export interface AiChatPersona {
  tone: ChatTone;
  /** 0..1 — probability the AI answers a given message at all. */
  replyChance: number;
  /** Typical message length in words. */
  maxWords: number;
  usesEmoji: boolean;
  /** Writes in lowercase and abbreviates, like a fast mobile typer. */
  sloppyTyping: boolean;
  /** Says something unprompted at the start of the game. */
  greets: boolean;
}

const TONES: ChatTone[] = [
  "friendly",
  "quiet",
  "cocky",
  "sporty",
  "nerdy",
  "grumpy",
  "playful",
  "zen",
];

/** Small stable string hash (FNV-1a). */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pick(seed: string, salt: string, mod: number): number {
  return hash(`${seed}:${salt}`) % mod;
}

export function chatPersonaFor(profileId: string): AiChatPersona {
  const tone = TONES[pick(profileId, "tone", TONES.length)] ?? "friendly";
  const chatty = pick(profileId, "chatty", 100) / 100;
  return {
    tone,
    replyChance: tone === "quiet" ? 0.25 + chatty * 0.25 : 0.5 + chatty * 0.45,
    maxWords: 4 + pick(profileId, "len", 12),
    usesEmoji: pick(profileId, "emoji", 100) < 35,
    sloppyTyping: pick(profileId, "sloppy", 100) < 45,
    greets: pick(profileId, "greet", 100) < 55,
  };
}

export const TONE_BRIEF: Record<ChatTone, string> = {
  friendly: "warm and polite, wishes the opponent well",
  quiet: "extremely short, often just an acknowledgement",
  cocky: "confident, a bit teasing, never insulting",
  sporty: "casual gamer talk, 'gl', 'nice one', 'my bad'",
  nerdy: "mentions openings or plans briefly, matter-of-fact",
  grumpy: "blunt and dry, low energy, still civil",
  playful: "joky and light, uses wordplay",
  zen: "calm, philosophical one-liners about the game",
};
