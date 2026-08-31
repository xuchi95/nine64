import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AUTH_GUARD_SCHEMA = z.object({
  intent: z.enum(["signup", "login", "reset"]),
  email: z.string().email().max(255),
  /** Required for sign-up (high-risk unauthenticated action). */
  captchaToken: z.string().max(4096).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

/**
 * Gate in front of Supabase auth calls: sign-up / login / password reset all
 * consume an IP bucket and an account-identifier bucket, and sign-up must pass
 * human verification. Fails closed — the client only proceeds when this
 * resolves.
 */
export const guardAuthAttempt = createServerFn({ method: "POST" })
  .inputValidator((input) => AUTH_GUARD_SCHEMA.parse(input))
  .handler(async ({ data }) => {
    const { enforceAll, ipSubject, emailSubject, requestIp } = await import(
      "@/lib/ratelimit/limiter.server"
    );

    await enforceAll([
      { action: "auth.ip", subject: ipSubject() },
      { action: "auth.identifier", subject: emailSubject(data.email) },
    ]);

    if (data.intent === "signup") {
      const { verifyTurnstile } = await import("@/lib/security/turnstile.server");
      await verifyTurnstile(data.captchaToken ?? "", {
        action: "signup",
        remoteIp: requestIp(),
        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
      });
    }

    return { ok: true } as const;
  });
