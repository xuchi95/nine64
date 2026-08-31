/**
 * Client mirror of the database `tc_spec()` function.
 *
 * The database remains the only authority: it re-parses every time-control id
 * it is handed and refuses anything invalid. This module exists purely so the
 * UI can label, group and validate a control before a round trip.
 */

export type Pace = "realtime" | "daily";
export type RatingPool = "bullet" | "blitz" | "rapid" | "classical" | "daily" | "chess960";

export type TimeControlSpec = {
  id: string;
  valid: boolean;
  pace: Pace;
  baseMs: number;
  incMs: number;
  dailyMoveMs: number;
  pool: Exclude<RatingPool, "chess960">;
  label: string;
};

const LEGACY: Record<string, { base: number; inc: number }> = {
  blitz1m: { base: 60, inc: 0 },
  blitz3m: { base: 180, inc: 2 },
  blitz5m: { base: 300, inc: 0 },
  rapid10m: { base: 600, inc: 0 },
  rapid15m: { base: 900, inc: 10 },
  rapid30m: { base: 1800, inc: 0 },
};

const INVALID: TimeControlSpec = {
  id: "",
  valid: false,
  pace: "realtime",
  baseMs: 0,
  incMs: 0,
  dailyMoveMs: 0,
  pool: "blitz",
  label: "—",
};

export function poolForEstimate(baseSeconds: number, incSeconds: number): TimeControlSpec["pool"] {
  const estimate = baseSeconds + 40 * incSeconds;
  if (estimate < 180) return "bullet";
  if (estimate < 480) return "blitz";
  if (estimate < 1500) return "rapid";
  return "classical";
}

export function parseTimeControl(id: string | null | undefined): TimeControlSpec {
  if (!id) return INVALID;

  const daily = /^daily(\d{1,2})$/.exec(id);
  if (daily) {
    const days = Number(daily[1]);
    if (![1, 2, 3, 7].includes(days)) return INVALID;
    return {
      id,
      valid: true,
      pace: "daily",
      baseMs: 0,
      incMs: 0,
      dailyMoveMs: days * 86_400_000,
      pool: "daily",
      label: `${days}d`,
    };
  }

  let base: number;
  let inc: number;
  const legacy = LEGACY[id];
  if (legacy) {
    base = legacy.base;
    inc = legacy.inc;
  } else {
    const match = /^(\d{1,5})\+(\d{1,3})$/.exec(id);
    if (!match) return INVALID;
    base = Number(match[1]);
    inc = Number(match[2]);
  }

  if (base < 15 || base > 10_800 || inc < 0 || inc > 180) return INVALID;

  const minutes = base % 60 === 0 ? String(base / 60) : (base / 60).toFixed(1);
  return {
    id,
    valid: true,
    pace: "realtime",
    baseMs: base * 1000,
    incMs: inc * 1000,
    dailyMoveMs: 0,
    pool: poolForEstimate(base, inc),
    label: `${minutes}+${inc}`,
  };
}

export function ratingPoolFor(variant: string, timeControl: string): RatingPool {
  if (variant === "chess960") return "chess960";
  const spec = parseTimeControl(timeControl);
  return spec.valid ? spec.pool : "blitz";
}

export type TimeControlPreset = {
  id: string;
  label: string;
  pool: TimeControlSpec["pool"];
};

function preset(id: string): TimeControlPreset {
  const spec = parseTimeControl(id);
  return { id, label: spec.label, pool: spec.pool };
}

/** The full ladder offered in the lobby: 1+0 through 30+20. */
export const REALTIME_PRESETS: TimeControlPreset[] = [
  "60+0",
  "60+1",
  "120+1",
  "180+0",
  "180+2",
  "300+0",
  "300+3",
  "600+0",
  "600+5",
  "900+10",
  "1800+0",
  "1800+20",
].map(preset);

export const DAILY_PRESETS: TimeControlPreset[] = [
  { id: "daily1", label: "1 ngày", pool: "daily" },
  { id: "daily2", label: "2 ngày", pool: "daily" },
  { id: "daily3", label: "3 ngày", pool: "daily" },
  { id: "daily7", label: "7 ngày", pool: "daily" },
];

export const POOL_LABELS: Record<RatingPool, { vi: string; en: string }> = {
  bullet: { vi: "Bullet", en: "Bullet" },
  blitz: { vi: "Chớp", en: "Blitz" },
  rapid: { vi: "Nhanh", en: "Rapid" },
  classical: { vi: "Tiêu chuẩn", en: "Classical" },
  daily: { vi: "Theo ngày", en: "Daily" },
  chess960: { vi: "Chess960", en: "Chess960" },
};

/** Human label for any control, including legacy ids still stored on games. */
export function timeControlLabel(id: string): string {
  const spec = parseTimeControl(id);
  return spec.valid ? spec.label : id;
}

/** Initial clock in ms; daily games do not use a running clock. */
export function timeControlBaseMs(id: string): number {
  const spec = parseTimeControl(id);
  if (!spec.valid) return 300_000;
  return spec.pace === "daily" ? 0 : spec.baseMs;
}
