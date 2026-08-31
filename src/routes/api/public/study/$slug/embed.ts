/**
 * Sandboxed read-only embed for a shared study.
 *
 * Deliberately NOT part of the React app: it is a standalone HTML document
 * with an inline SVG board, `sandbox` CSP (no scripts, no same-origin access)
 * and no Supabase client, so an iframe on a third-party site can never reach
 * the visitor's Nine64 session, cookies or storage.
 */
import { createFileRoute } from "@tanstack/react-router";
import { boardSvgFragment, escapeXml, BOARD_COLORS } from "@/lib/study/boardSvg";
import { isValidSlug } from "@/lib/study/slug";

export const Route = createFileRoute("/api/public/study/$slug/embed")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slug = params.slug;
        if (!isValidSlug(slug)) return new Response("Not found", { status: 404 });

        const { enforceRateLimit, hashSubject } = await import("@/lib/ratelimit/limiter.server");
        const ip =
          request.headers.get("cf-connecting-ip") ??
          (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
          "unknown-ip";
        try {
          await enforceRateLimit("study.embed", `ip:${hashSubject(ip)}`);
        } catch {
          return new Response("Too many requests", { status: 429 });
        }

        const { readStudyBySlug } = await import("@/lib/study/studies.server");
        const study = await readStudyBySlug(slug).catch(() => null);
        if (!study) return new Response("Not found", { status: 404 });

        const board = boardSvgFragment(study.previewFen, { size: 380, x: 10, y: 10 });
        const players =
          study.white || study.black ? `${study.white ?? "?"} — ${study.black ?? "?"}` : "";
        const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(study.title)} · Nine64</title>
<style>
html,body{margin:0;background:${BOARD_COLORS.bg};color:${BOARD_COLORS.text};font-family:system-ui,sans-serif}
.wrap{padding:12px;max-width:420px;margin:0 auto}
h1{font-size:15px;margin:10px 0 2px;font-weight:700}
p{margin:0;font-size:12px;color:${BOARD_COLORS.muted}}
a{color:${BOARD_COLORS.border};font-size:12px;text-decoration:none;letter-spacing:.08em}
.row{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
</style></head>
<body><div class="wrap">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%">${board}</svg>
<h1>${escapeXml(study.title)}</h1>
<p>${escapeXml(players)}${study.result ? ` · ${escapeXml(study.result)}` : ""}</p>
<div class="row"><span></span><a href="https://nine64.com/s/${escapeXml(slug)}" target="_blank" rel="noopener noreferrer">NINE64 →</a></div>
</div></body></html>`;

        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
            // `sandbox` without allow-scripts/allow-same-origin: the document
            // cannot run JS or read any Nine64 origin state.
            "content-security-policy":
              "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox allow-popups allow-popups-to-escape-sandbox",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
