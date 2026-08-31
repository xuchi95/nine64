import { createFileRoute } from "@tanstack/react-router";
import { verifyWorkerRequest } from "@/lib/fairplay/oidc.server";
import { claimJobs } from "@/lib/fairplay/workerApi.server";

export const Route = createFileRoute("/api/public/fairplay/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyWorkerRequest(request);
        if (!auth.ok) {
          return Response.json({ ok: false, code: auth.code }, { status: auth.status });
        }
        try {
          const body = await request.json().catch(() => ({}));
          return Response.json(await claimJobs(body));
        } catch (error) {
          return Response.json(
            { ok: false, code: "CLAIM_FAILED", message: (error as Error).message },
            { status: 400 },
          );
        }
      },
    },
  },
});
