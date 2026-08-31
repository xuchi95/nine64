/**
 * Public runtime settings for the app shell.
 *
 * Returns ONLY `public_runtime` scoped, published values — server-only keys
 * (grace periods, matchmaking internals, notification delivery) never appear
 * in a browser payload. No authentication needed: the payload is intentionally
 * safe for anonymous visitors.
 */
import { createServerFn } from "@tanstack/react-start";

export const getRuntimeSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicRuntimeSettings } = await import("@/lib/system/settings.server");
  return getPublicRuntimeSettings();
});

export type RuntimeSettingsPayload = Awaited<ReturnType<typeof getRuntimeSettings>>;
