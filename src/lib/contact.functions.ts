import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CONTACT_SCHEMA = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  requestType: z.enum(["support", "data", "general", "bug", "feedback"]),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

export type ContactRequestInput = z.infer<typeof CONTACT_SCHEMA>;

export const submitContactRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => CONTACT_SCHEMA.parse(data))
  .handler(async ({ data }) => {
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
      console.error("[contact] insert failed:", error);
      throw new Error("Không thể gửi yêu cầu. Vui lòng thử lại sau.");
    }

    return { success: true };
  });
