import { createFileRoute } from "@tanstack/react-router";
import { verifyWorkerRequest } from "@/lib/fairplay/oidc.server";
import { submitResult } from "@/lib/fairplay/workerApi.server";

export const Route = createFileRoute("/api/public/fairplay/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyWorkerRequest(request);
        if (!auth.ok) {
          return Response.json({ ok: false, code: auth.code }, { status: auth.status });
        }
        try {
          const body = await request.json().catch(() => ({}));
          const result = await submitResult(body);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (error) {
          return Response.json(
            { ok: false, code: "RESULT_FAILED", message: (error as Error).message },
            { status: 400 },
          );
        }
      },
    },
  },
});
