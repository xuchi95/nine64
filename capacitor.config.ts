/**
 * Capacitor shell configuration for the Nine64 iOS/Android apps.
 *
 * The web build stays untouched: this file is only read by the Capacitor CLI
 * (`npx cap add ios|android`) and is not bundled into the site. Deep links are
 * handled by `src/lib/native/bridge.ts`.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nine64.app",
  appName: "Nine64",
  webDir: "dist/client",
  ios: { contentInset: "always", scheme: "nine64" },
  android: { allowMixedContent: false },
  server: {
    androidScheme: "https",
    // Universal links / App Links resolve to the published site.
    hostname: "nine64.com",
  },
};

export default config;
