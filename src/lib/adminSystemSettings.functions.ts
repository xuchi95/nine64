/**
 * Admin system console — typed settings, health, queues.
 *
 * Thin wrappers only: every implementation lives in `@/lib/system/*.server`
 * and is imported inside the handler so nothing server-only reaches the client
 * bundle. All handlers are admin + MFA gated through `assertAdmin("system")`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin/guard";
import { SETTING_KEYS, type SettingKey } from "@/lib/system/registry";
import { QUEUE_IDS, type QueueId } from "@/lib/system/queueTypes";

const settingKey = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]);
const queueId = z.enum(QUEUE_IDS as unknown as [QueueId, ...QueueId[]]);
const reason = z.string().trim().min(10).max(500);

export const getSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, "system");
    const { listSettingsForAdmin } = await import("@/lib/system/settings.server");
    const { recordAdminAction } = await import("@/lib/admin/auditLog.server");
    await recordAdminAction({
      actorId: context.userId,
      action: "system_console_view",
      detail: { view: "settings" },
    });
    return listSettingsForAdmin();
  });

export type SystemSettingsPayload = Awaited<ReturnType<typeof getSystemSettings>>;

export const getSystemSettingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ key: settingKey.nullish() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "system");
    const { listSettingHistory } = await import("@/lib/system/settings.server");
    return listSettingHistory((data.key as SettingKey | null) ?? null, 100);
  });

export type SystemSettingHistory = Awaited<ReturnType<typeof getSystemSettingHistory>>;

export const saveSystemSettingDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: settingKey,
        value: z.unknown(),
        expectedVersion: z.number().int().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "system");
    const { saveDraft } = await import("@/lib/system/settings.server");
    return saveDraft(
      data.key as SettingKey,
      data.value,
      identity.userId,
      data.expectedVersion,
    );
  });

export const publishSystemSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: settingKey,
        value: z.unknown(),
        reason,
        expectedVersion: z.number().int().nullable().default(null),
        rollbackOf: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "system");
    const { publishSetting, listSettingsForAdmin } = await import("@/lib/system/settings.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");
    const { settingDefinition } = await import("@/lib/system/registry");

    const before = (await listSettingsForAdmin()).rows.find((r) => r.key === data.key);
    const result = await publishSetting(
      data.key as SettingKey,
      data.value,
      data.reason,
      identity.userId,
      data.expectedVersion,
      data.rollbackOf,
    );
    if (!result.ok) return result;

    const isMaintenance = data.key === "maintenance_mode";
    await recordAdminActionStrict({
      actorId: identity.userId,
      action:
        data.rollbackOf !== undefined
          ? "system_setting_rollback"
          : isMaintenance
            ? "maintenance_change"
            : settingDefinition(data.key as SettingKey).group === "features"
              ? "feature_flag_change"
              : "system_setting_publish",
      note: data.reason,
      detail: { key: data.key, version: result.version, rollbackOf: data.rollbackOf ?? null },
      before: { value: before?.value ?? null, version: before?.version ?? 0 },
      after: { value: data.value, version: result.version },
    });
    return result;
  });

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context, "system");
    const { runHealthChecks } = await import("@/lib/system/health.server");
    return runHealthChecks();
  });

export type SystemHealthPayload = Awaited<ReturnType<typeof getSystemHealth>>;

export const getSystemQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ queue: queueId.nullish() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, "system");
    const { listQueues, listQueueJobs } = await import("@/lib/system/queues.server");
    const queues = await listQueues();
    const jobs = data.queue ? await listQueueJobs(data.queue as QueueId, 25) : [];
    return { queues, jobs, selected: (data.queue as QueueId | null) ?? null };
  });

export type SystemQueuesPayload = Awaited<ReturnType<typeof getSystemQueues>>;

export const runSystemQueueAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        queue: queueId,
        action: z.enum(["retry", "retry_failed", "process_now", "cancel"]),
        jobId: z.string().uuid().optional(),
        reason,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "system");
    const { runQueueAction } = await import("@/lib/system/queues.server");
    const { recordAdminActionStrict } = await import("@/lib/admin/auditLog.server");

    const result = await runQueueAction(
      data.queue as QueueId,
      data.action,
      data.jobId,
    );
    await recordAdminActionStrict({
      actorId: identity.userId,
      action: "fairplay_job_retry",
      note: data.reason,
      detail: {
        queue: data.queue,
        queueAction: data.action,
        jobId: data.jobId ?? null,
        affected: result.affected,
        ok: result.ok,
        code: result.code ?? null,
      },
    });
    return result;
  });
