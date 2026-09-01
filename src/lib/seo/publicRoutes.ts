/**
 * Public, indexable static routes for the sitemap.
 *
 * Anything requiring a session (`/_authenticated/*`), the auth flow, the
 * account area and admin tooling are deliberately absent — they are also
 * blocked in robots.txt and carry `noindex`.
 */

export interface StaticSitemapEntry {
  path: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
}

export const STATIC_SITEMAP_ROUTES: StaticSitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/play", changefreq: "weekly", priority: "0.9" },
  { path: "/play/ai", changefreq: "weekly", priority: "0.8" },
  { path: "/play/local", changefreq: "monthly", priority: "0.6" },
  { path: "/play/coach", changefreq: "monthly", priority: "0.7" },
  { path: "/play/variants", changefreq: "monthly", priority: "0.7" },
  { path: "/play/share", changefreq: "monthly", priority: "0.5" },
  { path: "/analysis", changefreq: "monthly", priority: "0.8" },
  { path: "/puzzles", changefreq: "weekly", priority: "0.8" },
  { path: "/drills", changefreq: "monthly", priority: "0.6" },
  { path: "/endgames", changefreq: "monthly", priority: "0.6" },
  { path: "/openings", changefreq: "weekly", priority: "0.8" },
  { path: "/learn", changefreq: "weekly", priority: "0.8" },
  { path: "/insights", changefreq: "monthly", priority: "0.5" },
  { path: "/progress", changefreq: "monthly", priority: "0.5" },
  { path: "/games", changefreq: "weekly", priority: "0.5" },
  { path: "/watch", changefreq: "hourly", priority: "0.7" },
  { path: "/news", changefreq: "hourly", priority: "0.8" },
  { path: "/events", changefreq: "daily", priority: "0.7" },
  { path: "/settings", changefreq: "yearly", priority: "0.3" },
  { path: "/contact", changefreq: "yearly", priority: "0.4" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/data-rights", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/cookie-policy", changefreq: "yearly", priority: "0.3" },
];

/** Paths crawlers must never index (also enforced with per-route `noindex`). */
export const DISALLOWED_PATHS = [
  "/admin",
  "/account",
  "/auth",
  "/studies",
  "/game/",
  "/games/online/",
  "/online",
  "/skills",
  "/training-plan",
  "/tournaments",
  "/puzzles/train",
  "/watch/platform",
  "/api/",
];
