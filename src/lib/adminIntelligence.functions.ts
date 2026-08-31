/**
 * Admin intelligence console (AI Coach + Deep Review).
 *
 * Prompts are versioned with draft/publish/rollback; models come from a server
 * allowlist so no admin can point the coach at an arbitrary endpoint.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin/guard";
import { ALLOWED_MODELS, PROMPT_KEYS, PROMPT_MAX_CHARS } from "@/lib/intelligence/promptTypes";

const reason = z.string().trim().min(10).max(500);
const promptKey = z.enum(PROMPT_KEYS as unknown as [string, ...string[]]);
const model = z.enum(ALLOWED_MODELS as unknown as [string, ...string[]]);
const body = z.string().trim().min(40).max(PROMPT_MAX_CHARS);

export const getIntelligenceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, "intelligence");
    const { listPrompts } = await import("@/lib/intelligence/prompts.server");
    const { coachUsageMetrics } = await import("@/lib/intelligence/metrics.server");
    const { listSettingsForAdmin } = await import("@/lib/system/settings.server");
    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");

    const [prompts, metrics, settings] = await Promise.all([
      listPrompts(true),
      coachUsageMetrics(),
      listSettingsForAdmin(),
    ]);
    await recordAdminAction({
      actorId: context.userId,
      action: "system_console_view",
      detail: { view: "intelligence" },
    });
    return {
      prompts: prompts.rows,
      degraded: prompts.degraded,
      metrics,
      models: ALLOWED_MODELS,
      settings: settings.rows.filter((r) =>
        [
          "ai_coach_enabled",
          "quick_review_enabled",
          "deep_review_enabled",
          "coach_model",
          "coach_daily_quota",
          "deep_review_move_time_ms",
          "deep_review_multipv",
          "turning_point_threshold_cp",
          "turning_point_max",
        ].includes(r.key),
      ),
    };
  });

export type IntelligenceOverview = Awaited<ReturnType<typeof getIntelligenceOverview>>;

export const saveAiPromptDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: promptKey, body, model }).parse(input))
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "intelligence");
    const { savePromptDraft } = await import("@/lib/intelligence/prompts.server");
    return savePromptDraft({
      key: data.key as never,
      body: data.body,
      model: data.model,
      actorId: identity.userId,
    });
  });

export const publishAiPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: promptKey,
        body,
        model,
        reason,
        expectedVersion: z.number().int().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "intelligence");
    const { publishPrompt, listPrompts } = await import("@/lib/intelligence/prompts.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");
    const before = (await listPrompts(true)).rows.find((r) => r.key === data.key);
    const result = await publishPrompt({
      key: data.key as never,
      body: data.body,
      model: data.model,
      reason: data.reason,
      expectedVersion: data.expectedVersion,
      actorId: identity.userId,
    });
    if (!result.ok) return result;
    await recordAdminActionStrict({
      actorId: identity.userId,
      action: "ai_prompt_publish",
      note: data.reason,
      detail: { key: data.key, version: result.version, model: data.model },
      before: { version: before?.version ?? 0, model: before?.model ?? null },
      after: { version: result.version, model: data.model },
    });
    return result;
  });

export const rollbackAiPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: promptKey,
        toVersion: z.number().int().min(1),
        reason,
        expectedVersion: z.number().int().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "intelligence");
    const { rollbackPrompt } = await import("@/lib/intelligence/prompts.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");
    const result = await rollbackPrompt({
      key: data.key as never,
      toVersion: data.toVersion,
      reason: data.reason,
      expectedVersion: data.expectedVersion,
      actorId: identity.userId,
    });
    if (!result.ok) return result;
    await recordAdminActionStrict({
      actorId: identity.userId,
      action: "ai_prompt_rollback",
      note: data.reason,
      detail: { key: data.key, toVersion: data.toVersion, version: result.version },
    });
    return result;
  });

export const getAiPromptVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: promptKey }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "intelligence");
    const { listPromptVersions } = await import("@/lib/intelligence/prompts.server");
    return listPromptVersions(data.key as never, 50);
  });
