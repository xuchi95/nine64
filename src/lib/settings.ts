import { useSyncExternalStore } from "react";

export type AppearanceMode = "dark" | "light";

export interface Settings {
  appearance: AppearanceMode;
  boardTheme: string;
  pieceSet: string;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  animations: boolean;
  animationMs: number;
  soundEnabled: boolean;
  shatterSound: boolean;
  sfxVolume: number;
  autoQueen: boolean;
  premove: boolean;
  confirmResign: boolean;
  colorBlindMode: boolean;
  enginePerformance: "performance" | "balanced" | "maximum";
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: "dark",
  boardTheme: "walnut",
  pieceSet: "classic",
  showCoordinates: true,
  showLegalMoves: true,
  animations: true,
  animationMs: 160,
  soundEnabled: true,
  sfxVolume: 0.6,
  autoQueen: false,
  premove: true,
  confirmResign: true,
  colorBlindMode: false,
  enginePerformance: "balanced",
};

const KEY = "nexus-chess.settings.v1";

let state: Settings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function hydrateSettings() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = readStorage();
  applyAppearance(state.appearance);
  emit();
}

export function applyAppearance(mode: AppearanceMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — settings stay in memory for this session */
    }
    if (patch.appearance) applyAppearance(patch.appearance);
  }
  emit();
}

export function resetSettings() {
  updateSettings(DEFAULT_SETTINGS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return DEFAULT_SETTINGS;
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
