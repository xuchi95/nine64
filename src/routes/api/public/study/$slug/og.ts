/**
 * Dynamic social card for a shared study: the position, the players, the
 * result and Nine64 branding, rendered as SVG (no rasteriser needed in the
 * Worker runtime).
 */
import { createFileRoute } from "@tanstack/react-router";
import { studyOgSvg } from "@/lib/study/boardSvg";
import { isValidSlug } from "@/lib/study/slug";

export const Route = createFileRoute("/api/public/study/$slug/og")({
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
          await enforceRateLimit("study.og", `ip:${hashSubject(ip)}`);
        } catch {
          return new Response("Too many requests", { status: 429 });
        }

        const { readStudyBySlug } = await import("@/lib/study/studies.server");
        const study = await readStudyBySlug(slug).catch(() => null);
        if (!study) return new Response("Not found", { status: 404 });

        const svg = studyOgSvg({
          fen: study.previewFen,
          title: study.title,
          white: study.white,
          black: study.black,
          result: study.result,
          subtitle: study.description ?? (study.ownerName ? `Chia sẻ bởi ${study.ownerName}` : ""),
        });

        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
