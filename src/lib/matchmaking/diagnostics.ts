/**
 * Client-side matchmaking diagnostics log.
 *
 * A tiny module-level ring buffer so the diagnostics screen can show what the
 * matchmaking hook actually did: queue joins, realtime channel state changes,
 * postgres_changes payloads and RPC/server-function failures.
 */

export type MmEventLevel = "info" | "warn" | "error";

export type MmEvent = {
  id: number;
  at: number;
  level: MmEventLevel;
  source: "queue" | "realtime" | "rpc" | "navigate";
  message: string;
  detail?: Record<string, unknown> | undefined;
};

const MAX_EVENTS = 120;
const STORAGE_KEY = "nine64.mm.diagnostics.v1";

let seq = 1;
let events: MmEvent[] = [];
const listeners = new Set<(events: MmEvent[]) => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, 60)));
  } catch {
    // storage full or unavailable — diagnostics are best-effort
  }
}

function hydrate() {
  if (typeof window === "undefined" || events.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as MmEvent[];
    if (Array.isArray(parsed)) {
      events = parsed.filter((e) => e && typeof e.at === "number");
      seq = events.reduce((m, e) => Math.max(m, e.id + 1), 1);
    }
  } catch {
    events = [];
  }
}

export function logMmEvent(
  level: MmEventLevel,
  source: MmEvent["source"],
  message: string,
  detail?: Record<string, unknown>,
) {
  hydrate();
  const event: MmEvent = { id: seq++, at: Date.now(), level, source, message, detail };
  events = [event, ...events].slice(0, MAX_EVENTS);
  persist();
  for (const fn of listeners) fn(events);
}

export function getMmEvents(): MmEvent[] {
  hydrate();
  return events;
}

export function clearMmEvents() {
  events = [];
  persist();
  for (const fn of listeners) fn(events);
}

export function subscribeMmEvents(fn: (events: MmEvent[]) => void): () => void {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function errorDetail(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { name: e.name, message: e.message };
  if (typeof e === "object" && e !== null) {
    try {
      return JSON.parse(JSON.stringify(e)) as Record<string, unknown>;
    } catch {
      return { message: String(e) };
    }
  }
  return { message: String(e) };
}
