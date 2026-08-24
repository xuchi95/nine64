export interface TimeControlSpec {
  id: string;
  label: string;
  baseMs: number;
  incrementMs: number;
  category: "bullet" | "blitz" | "rapid" | "classical";
}

const SPECS: TimeControlSpec[] = [
  { id: "blitz1m", label: "1+0", baseMs: 60_000, incrementMs: 0, category: "bullet" },
  { id: "blitz3m", label: "3+2", baseMs: 180_000, incrementMs: 2_000, category: "blitz" },
  { id: "blitz5m", label: "5+0", baseMs: 300_000, incrementMs: 0, category: "blitz" },
  { id: "rapid10m", label: "10+0", baseMs: 600_000, incrementMs: 0, category: "rapid" },
  { id: "rapid15m", label: "15+10", baseMs: 900_000, incrementMs: 10_000, category: "rapid" },
  { id: "rapid30m", label: "30+0", baseMs: 1_800_000, incrementMs: 0, category: "classical" },
];

const FALLBACK: TimeControlSpec = {
  id: "blitz5m",
  label: "5+0",
  baseMs: 300_000,
  incrementMs: 0,
  category: "blitz",
};

export function timeControlSpec(id: string): TimeControlSpec {
  return SPECS.find((s) => s.id === id) ?? { ...FALLBACK, id };
}

export function timeControlBaseMs(id: string): number {
  return timeControlSpec(id).baseMs;
}

export function timeControlIncrementMs(id: string): number {
  return timeControlSpec(id).incrementMs;
}

export function formatTimeControl(id: string): string {
  return timeControlSpec(id).label;
}

/** Canonical clock rendering used by every mode (realtime + fallback). */
export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (safe < 20_000) {
    const tenths = Math.floor((safe % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 100) / 10;
  return `${s.toFixed(1)}s`;
}
