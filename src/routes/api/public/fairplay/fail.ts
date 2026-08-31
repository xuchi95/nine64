import { createFileRoute } from "@tanstack/react-router";
import { verifyWorkerRequest } from "@/lib/fairplay/oidc.server";
import { failJob } from "@/lib/fairplay/workerApi.server";

export const Route = createFileRoute("/api/public/fairplay/fail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyWorkerRequest(request);
        if (!auth.ok) {
          return Response.json({ ok: false, code: auth.code }, { status: auth.status });
        }
        try {
          const body = await request.json().catch(() => ({}));
          return Response.json(await failJob(body));
        } catch (error) {
          return Response.json(
            { ok: false, code: "FAIL_RECORD_FAILED", message: (error as Error).message },
            { status: 400 },
          );
        }
      },
    },
  },
});
