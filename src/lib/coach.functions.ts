import { createServerFn } from "@tanstack/react-start";
import type { CoachDigest } from "@/lib/coach/digest";
import type { CoachReport } from "@/lib/coach/types";

export const coachGame = createServerFn({ method: "POST" })
  .inputValidator((input: { digest: CoachDigest; locale?: "vi" | "en" }) => input)
  .handler(async ({ data }): Promise<CoachReport> => {
    const { requestCoachReport } = await import("@/lib/coach/gateway.server");
    return requestCoachReport(data.digest, data.locale ?? "vi");
  });
