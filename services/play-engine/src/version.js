/** Canonical, public-safe identity for the play-engine deployment contract. */
export const BENCHMARK_SUITE_VERSION = "titan-v6-3";
export const SERVICE_VERSION = "play-engine-titan-v6.3";

/** Build identity injected by Cloud Build. Invalid values fail back safely. */
export const SERVICE_BUILD_ID = (() => {
  const raw = (process.env.SERVICE_BUILD_ID ?? "").trim();
  return /^[\w.-]{1,64}$/.test(raw) ? raw : SERVICE_VERSION;
})();
