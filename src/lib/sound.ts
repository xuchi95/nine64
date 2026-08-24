/**
 * Synthesised sound effects (WebAudio) — no binary assets, zero network cost,
 * works offline. Every cue in the game maps to a short, tasteful tone shape.
 */
export type SoundName =
  | "move"
  | "capture"
  | "castle"
  | "check"
  | "checkmate"
  | "promotion"
  | "draw"
  | "victory"
  | "defeat"
  | "lowTime"
  | "matchFound"
  | "notification"
  | "illegal";

interface Tone {
  freq: number;
  dur: number;
  type: OscillatorType;
  delay?: number;
  gain?: number;
  slideTo?: number;
}

const RECIPES: Record<SoundName, Tone[]> = {
  move: [{ freq: 320, dur: 0.06, type: "triangle", gain: 0.5 }],
  capture: [
    { freq: 190, dur: 0.08, type: "square", gain: 0.35 },
    { freq: 120, dur: 0.1, type: "triangle", delay: 0.03, gain: 0.4 },
  ],
  castle: [
    { freq: 260, dur: 0.06, type: "triangle" },
    { freq: 360, dur: 0.07, type: "triangle", delay: 0.07 },
  ],
  check: [
    { freq: 660, dur: 0.09, type: "sine" },
    { freq: 880, dur: 0.1, type: "sine", delay: 0.08 },
  ],
  checkmate: [
    { freq: 520, dur: 0.14, type: "sine" },
    { freq: 390, dur: 0.16, type: "sine", delay: 0.13 },
    { freq: 260, dur: 0.3, type: "sine", delay: 0.28 },
  ],
  promotion: [
    { freq: 520, dur: 0.08, type: "triangle" },
    { freq: 660, dur: 0.08, type: "triangle", delay: 0.07 },
    { freq: 880, dur: 0.16, type: "triangle", delay: 0.14 },
  ],
  draw: [
    { freq: 380, dur: 0.14, type: "sine" },
    { freq: 380, dur: 0.18, type: "sine", delay: 0.16 },
  ],
  victory: [
    { freq: 523, dur: 0.11, type: "triangle" },
    { freq: 659, dur: 0.11, type: "triangle", delay: 0.1 },
    { freq: 784, dur: 0.11, type: "triangle", delay: 0.2 },
    { freq: 1046, dur: 0.28, type: "triangle", delay: 0.3 },
  ],
  defeat: [
    { freq: 392, dur: 0.16, type: "sine" },
    { freq: 311, dur: 0.18, type: "sine", delay: 0.15 },
    { freq: 233, dur: 0.34, type: "sine", delay: 0.32 },
  ],
  lowTime: [{ freq: 980, dur: 0.06, type: "square", gain: 0.3 }],
  matchFound: [
    { freq: 660, dur: 0.09, type: "triangle" },
    { freq: 990, dur: 0.14, type: "triangle", delay: 0.09 },
  ],
  notification: [{ freq: 740, dur: 0.09, type: "sine", gain: 0.35 }],
  illegal: [{ freq: 150, dur: 0.09, type: "sawtooth", gain: 0.25, slideTo: 90 }],
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

let enabled = true;
let volume = 0.6;

export function configureSound(opts: { enabled: boolean; volume: number }) {
  enabled = opts.enabled;
  volume = opts.volume;
}

export function playSound(name: SoundName) {
  if (!enabled || volume <= 0) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;
  for (const tone of RECIPES[name]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const start = now + (tone.delay ?? 0);
    const peak = volume * (tone.gain ?? 0.45);
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.slideTo) osc.frequency.exponentialRampToValueAtTime(tone.slideTo, start + tone.dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + tone.dur + 0.03);
  }
}
