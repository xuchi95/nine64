/**
 * Deep-link mapping shared by the web app and any native shell.
 *
 * Pure functions only — no Capacitor imports — so the web build never pulls in
 * native code and the mapping stays unit-testable.
 */

/** Custom scheme + universal-link hosts the native shell claims. */
export const APP_SCHEME = "nine64";
export const UNIVERSAL_LINK_HOSTS = ["nine64.com", "www.nine64.com"];

/** Supported deep-link targets: game, puzzle, lesson, study. */
export type DeepLinkTarget =
  | { kind: "game"; id: string }
  | { kind: "puzzle"; id: string }
  | { kind: "lesson"; slug: string }
  | { kind: "study"; slug: string }
  | { kind: "path"; path: string };

/**
 * Resolve any inbound URL (`nine64://study/abc`, `https://nine64.com/s/abc`)
 * into an in-app path. Returns null for links that belong to another origin.
 */
export function resolveDeepLink(rawUrl: string): { target: DeepLinkTarget; path: string } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  let segments: string[];
  if (url.protocol === `${APP_SCHEME}:`) {
    // nine64://study/abc -> host "study", pathname "/abc"
    segments = [url.hostname, ...url.pathname.split("/")].filter(Boolean);
  } else if (url.protocol === "https:" || url.protocol === "http:") {
    if (!UNIVERSAL_LINK_HOSTS.includes(url.hostname)) return null;
    segments = url.pathname.split("/").filter(Boolean);
  } else {
    return null;
  }

  const [head, second] = segments;
  if (!head) return { target: { kind: "path", path: "/" }, path: "/" };

  const id = second ? decodeURIComponent(second) : "";

  if ((head === "game" || head === "games") && id) {
    return { target: { kind: "game", id }, path: `/games/${encodeURIComponent(id)}` };
  }
  if (head === "puzzle" && id) {
    return { target: { kind: "puzzle", id }, path: `/puzzles?id=${encodeURIComponent(id)}` };
  }
  if ((head === "lesson" || (head === "learn" && second === "lesson")) && segments[head === "learn" ? 2 : 1]) {
    const slug = decodeURIComponent(segments[head === "learn" ? 2 : 1]!);
    return { target: { kind: "lesson", slug }, path: `/learn/lesson/${encodeURIComponent(slug)}` };
  }
  if ((head === "study" || head === "s") && id) {
    return { target: { kind: "study", slug: id }, path: `/s/${encodeURIComponent(id)}` };
  }

  const path = `/${segments.map((s) => encodeURIComponent(decodeURIComponent(s))).join("/")}`;
  return { target: { kind: "path", path }, path };
}

/** Build a shareable universal link for a deep-link target. */
export function buildDeepLink(target: DeepLinkTarget): string {
  const base = `https://${UNIVERSAL_LINK_HOSTS[0]}`;
  switch (target.kind) {
    case "game":
      return `${base}/games/${encodeURIComponent(target.id)}`;
    case "puzzle":
      return `${base}/puzzles?id=${encodeURIComponent(target.id)}`;
    case "lesson":
      return `${base}/learn/lesson/${encodeURIComponent(target.slug)}`;
    case "study":
      return `${base}/s/${encodeURIComponent(target.slug)}`;
    default:
      return `${base}${target.path}`;
  }
}
