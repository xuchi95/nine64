import { useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitFairplaySignals } from "@/lib/fairplay.functions";
import type { TurnTelemetry } from "@/lib/fairplay/types";

interface Options {
  gameId: string | null;
  /** Only collect while the game is live and the viewer is a player. */
  enabled: boolean;
  /** True while it is this player's turn to move. */
  myTurn: boolean;
  /** Ply index the player is about to play (0-based). */
  ply: number;
}

interface TurnDraft {
  ply: number;
  startedAt: number;
  blurMs: number;
  blurCount: number;
  blurStartedAt: number | null;
  firstInteractionMs: number;
  interactions: number;
  pasted: boolean;
  duplicateTab: boolean;
}

/**
 * Layer 1 of the fair play engine: passive behavioural telemetry.
 *
 * Records, per own turn, the time spent, how long the tab was hidden, how
 * quickly and how directly the player interacted with the board, clipboard
 * pastes and duplicate tabs of the same game. Nothing here identifies a
 * cheater on its own — it feeds the model together with engine metrics.
 */
export function useFairplayTelemetry({ gameId, enabled, myTurn, ply }: Options) {
  const submit = useServerFn(submitFairplaySignals);
  const turnsRef = useRef<TurnTelemetry[]>([]);
  const draftRef = useRef<TurnDraft | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sentRef = useRef(false);

  const closeTurn = useCallback(() => {
    const d = draftRef.current;
    draftRef.current = null;
    if (!d) return;
    const now = Date.now();
    const blurMs = d.blurMs + (d.blurStartedAt ? now - d.blurStartedAt : 0);
    const spentMs = now - d.startedAt;
    if (spentMs < 30) return;
    turnsRef.current = [
      ...turnsRef.current.filter((t) => t.ply !== d.ply),
      {
        ply: d.ply,
        spentMs,
        blurMs,
        blurCount: d.blurCount,
        firstInteractionMs: d.firstInteractionMs > 0 ? d.firstInteractionMs : spentMs,
        directToTarget: d.interactions <= 2,
        exploredSquares: Math.max(0, d.interactions - 2),
        pasted: d.pasted,
        duplicateTab: d.duplicateTab,
      },
    ].slice(-400);
  }, []);

  // Turn boundaries.
  useEffect(() => {
    if (!enabled) {
      closeTurn();
      return;
    }
    if (myTurn) {
      if (!draftRef.current) {
        draftRef.current = {
          ply,
          startedAt: Date.now(),
          blurMs: 0,
          blurCount: 0,
          blurStartedAt: typeof document !== "undefined" && document.hidden ? Date.now() : null,
          firstInteractionMs: 0,
          interactions: 0,
          pasted: false,
          duplicateTab: false,
        };
      }
    } else {
      closeTurn();
    }
  }, [closeTurn, enabled, myTurn, ply]);

  // Focus / visibility, interaction and clipboard listeners.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const onHide = () => {
      const d = draftRef.current;
      if (!d || d.blurStartedAt) return;
      d.blurStartedAt = Date.now();
      d.blurCount += 1;
    };
    const onShow = () => {
      const d = draftRef.current;
      if (!d || !d.blurStartedAt) return;
      d.blurMs += Date.now() - d.blurStartedAt;
      d.blurStartedAt = null;
    };
    const onVisibility = () => (document.hidden ? onHide() : onShow());
    const onPointer = () => {
      const d = draftRef.current;
      if (!d) return;
      d.interactions += 1;
      if (d.firstInteractionMs === 0) d.firstInteractionMs = Date.now() - d.startedAt;
    };
    const onPaste = () => {
      const d = draftRef.current;
      if (d) d.pasted = true;
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onShow);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("paste", onPaste, true);
    };
  }, [enabled]);

  // Duplicate-tab detection for the same game.
  useEffect(() => {
    if (!enabled || !gameId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`nexus-fp:${gameId}`);
    channelRef.current = channel;
    const id = Math.random().toString(36).slice(2);
    channel.onmessage = (event: MessageEvent<{ id: string }>) => {
      if (event.data?.id && event.data.id !== id && draftRef.current) {
        draftRef.current.duplicateTab = true;
      }
    };
    const ping = window.setInterval(() => channel.postMessage({ id }), 4000);
    channel.postMessage({ id });
    return () => {
      window.clearInterval(ping);
      channel.close();
      channelRef.current = null;
    };
  }, [enabled, gameId]);

  /** Send the collected telemetry once the game is over. */
  const flush = useCallback(async () => {
    closeTurn();
    if (!gameId || sentRef.current || turnsRef.current.length === 0) return;
    sentRef.current = true;
    try {
      await submit({
        data: {
          gameId,
          turns: turnsRef.current,
          clientMeta: {
            ua: typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 200),
            cores: typeof navigator === "undefined" ? 0 : (navigator.hardwareConcurrency ?? 0),
          },
        },
      });
    } catch {
      sentRef.current = false;
    }
  }, [closeTurn, gameId, submit]);

  return { flush, turns: turnsRef };
}
