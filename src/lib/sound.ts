/**
 * Synthesised sound effects (WebAudio) — no binary assets, zero network cost,
 * works offline. Every cue in the game maps to a short, tasteful tone shape.
 */
export type SoundName =
  | "select"
  | "deselect"
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
  // Rất khẽ: cảm giác "nhấc quân" — một tap ngắn, âm lượng thấp.
  select: [{ freq: 540, dur: 0.035, type: "sine", gain: 0.16 }],
  // Đặt quân xuống / bỏ chọn — trầm hơn và nhẹ hơn nữa.
  deselect: [{ freq: 300, dur: 0.03, type: "sine", gain: 0.1 }],
  // Đặt quân: tap gỗ ấm, hai lớp rất ngắn thay vì một tiếng "bíp".
  move: [
    { freq: 330, dur: 0.045, type: "triangle", gain: 0.34 },
    { freq: 196, dur: 0.05, type: "sine", delay: 0.018, gain: 0.22 },
  ],

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

/**
 * "Nexus Shatter" — layered capture sound designed to land in sync with the
 * on-board shatter animation: a low impact thud, an expanding shockwave sweep
 * and a spray of crystalline shard pings over a short filtered noise burst.
 */
export function playShatter() {
  if (!enabled || volume <= 0) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  const master = audio.createGain();
  master.gain.setValueAtTime(volume, now);
  master.connect(audio.destination);

  // 1. Impact thud (the piece being struck).
  const thud = audio.createOscillator();
  const thudGain = audio.createGain();
  thud.type = "sine";
  thud.frequency.setValueAtTime(180, now);
  thud.frequency.exponentialRampToValueAtTime(52, now + 0.18);
  thudGain.gain.setValueAtTime(0.0001, now);
  thudGain.gain.exponentialRampToValueAtTime(0.5, now + 0.008);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  thud.connect(thudGain).connect(master);
  thud.start(now);
  thud.stop(now + 0.24);

  // 2. Shockwave sweep (matches the expanding ring).
  const sweep = audio.createOscillator();
  const sweepGain = audio.createGain();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(900, now + 0.01);
  sweep.frequency.exponentialRampToValueAtTime(240, now + 0.16);
  sweepGain.gain.setValueAtTime(0.0001, now + 0.01);
  sweepGain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  sweep.connect(sweepGain).connect(master);
  sweep.start(now + 0.01);
  sweep.stop(now + 0.2);

  // 3. Glass noise burst (the fracture itself).
  const len = Math.floor(audio.sampleRate * 0.26);
  const buffer = audio.createBuffer(1, len, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const hp = audio.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(1400, now);
  hp.frequency.exponentialRampToValueAtTime(3600, now + 0.2);
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  noise.connect(hp).connect(noiseGain).connect(master);
  noise.start(now);

  // 4. Shard pings flying outwards, staggered like the visual shards.
  const shards = [1560, 1980, 2430, 2870, 3320, 3900];
  shards.forEach((freq, i) => {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    const start = now + 0.02 + i * 0.022;
    const dur = 0.12 + (i % 3) * 0.05;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.075 / (1 + i * 0.3), start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}
