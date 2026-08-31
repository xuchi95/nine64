/**
 * Offline packs: user-chosen content downloaded into Cache Storage so it keeps
 * working with no network — saved lessons, downloaded puzzles and repertoire
 * training data, plus the routes that render them.
 *
 * Packs live in their own cache (`nine64-offline-packs`) which the service
 * worker never version-wipes; only the user removes them.
 */

export const PACK_CACHE = "nine64-offline-packs";
const INDEX_KEY = "nine64.offline.packs.v1";
/** Synthetic same-origin prefix used to key JSON payloads inside the cache. */
export const PACK_DATA_PREFIX = "/__offline__/";

export type PackKind = "lesson" | "puzzles" | "repertoire" | "engine";

export interface OfflinePack {
  id: string;
  kind: PackKind;
  title: string;
  /** Routes cached so the page shell opens offline. */
  routes: string[];
  bytes: number;
  savedAt: string;
}

function readIndex(): OfflinePack[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OfflinePack[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(packs: OfflinePack[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(packs));
  } catch {
    /* storage full or blocked */
  }
}

/** Cache Storage is unavailable in SSR, old browsers and some private modes. */
export function offlineSupported(): boolean {
  return typeof caches !== "undefined" && typeof localStorage !== "undefined";
}

export function listPacks(): OfflinePack[] {
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function packDataUrl(id: string): string {
  return `${PACK_DATA_PREFIX}${encodeURIComponent(id)}.json`;
}

export interface SavePackInput {
  id: string;
  kind: PackKind;
  title: string;
  /** JSON payload read back offline through `readPackData`. */
  data: unknown;
  /** Optional routes to precache so the screen opens with no network. */
  routes?: string[];
  /** Extra same-origin URLs (engine binaries, images) to precache. */
  assets?: string[];
}

/** Download a pack into Cache Storage and record it in the local index. */
export async function savePack(input: SavePackInput): Promise<OfflinePack> {
  if (!offlineSupported()) throw new Error("OFFLINE_UNSUPPORTED");
  const cache = await caches.open(PACK_CACHE);
  const body = JSON.stringify(input.data ?? null);
  await cache.put(
    packDataUrl(input.id),
    new Response(body, { headers: { "Content-Type": "application/json" } }),
  );

  const routes = input.routes ?? [];
  await Promise.allSettled([...routes, ...(input.assets ?? [])].map((url) => cache.add(url)));

  const pack: OfflinePack = {
    id: input.id,
    kind: input.kind,
    title: input.title,
    routes,
    bytes: new Blob([body]).size,
    savedAt: new Date().toISOString(),
  };
  writeIndex([...readIndex().filter((p) => p.id !== pack.id), pack]);
  return pack;
}

/** Read a downloaded pack payload back, or null when it is not stored. */
export async function readPackData<T = unknown>(id: string): Promise<T | null> {
  if (!offlineSupported()) return null;
  const cache = await caches.open(PACK_CACHE);
  const hit = await cache.match(packDataUrl(id));
  if (!hit) return null;
  return (await hit.json()) as T;
}

export async function removePack(id: string): Promise<void> {
  if (!offlineSupported()) return;
  const cache = await caches.open(PACK_CACHE);
  const pack = readIndex().find((p) => p.id === id);
  await cache.delete(packDataUrl(id));
  await Promise.allSettled((pack?.routes ?? []).map((route) => cache.delete(route)));
  writeIndex(readIndex().filter((p) => p.id !== id));
}

export async function clearPacks(): Promise<void> {
  if (!offlineSupported()) return;
  await caches.delete(PACK_CACHE);
  writeIndex([]);
}

/** Rough storage usage in bytes, when the browser exposes an estimate. */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

/** Stockfish WASM + the local-play routes: everything needed to play a bot offline. */
export const ENGINE_PACK_ASSETS = [
  "/engine/stockfish-18-lite-single.js",
  "/engine/stockfish-18-lite-single.wasm",
  "/engine/stockfish-18-lite.js",
  "/engine/stockfish-18-lite.wasm",
];

export const ENGINE_PACK_ROUTES = ["/play/ai", "/play/local", "/analysis", "/play/variants"];
