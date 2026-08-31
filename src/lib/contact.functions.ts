import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CONTACT_SCHEMA = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  requestType: z.enum(["support", "data", "general", "bug", "feedback"]),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
  /** Cloudflare Turnstile token collected by the widget. */
  captchaToken: z.string().min(1).max(4096),
  /** Stable key so a retried submission reuses the same verification. */
  idempotencyKey: z.string().uuid().optional(),
});

export type ContactRequestInput = z.infer<typeof CONTACT_SCHEMA>;

/**
 * Public contact form. Unauthenticated, so it fails closed: human verification
 * must succeed and both the IP bucket and the email bucket must have quota
 * before anything is written.
 */
export const submitContactRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => CONTACT_SCHEMA.parse(data))
  .handler(async ({ data }) => {
    const { enforceAll, ipSubject, emailSubject, requestIp } = await import(
      "@/lib/ratelimit/limiter.server"
    );
    const { verifyTurnstile } = await import("@/lib/security/turnstile.server");

    await enforceAll([
      { action: "contact.ip", subject: ipSubject() },
      { action: "contact.email", subject: emailSubject(data.email) },
    ]);

    await verifyTurnstile(data.captchaToken, {
      action: "contact",
      remoteIp: requestIp(),
      ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseAdmin as any)
      .from("contact_requests")
      .insert({
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        request_type: data.requestType,
        subject: data.subject.trim(),
        message: data.message.trim(),
        status: "open",
      });

    if (error) {
      console.error("[contact] insert failed:", { code: error.code });
      throw new Error("Không thể gửi yêu cầu. Vui lòng thử lại sau.");
    }

    return { success: true };
  });
