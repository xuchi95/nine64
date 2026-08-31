import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin/guard";
import type {
  AdminActionResult,
  AdminUserDetail,
  AdminUserListResult,
} from "@/lib/admin/userTypes";

const uuid = z.string().uuid();
const reason = z.string().min(10).max(500);

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(20),
        q: z.string().max(120).optional(),
        role: z.enum(["any", "admin", "moderator", "user"]).default("any"),
        status: z
          .enum(["any", "active", "restricted", "suspended", "pending_deletion", "anonymized"])
          .default("any"),
        fairplay: z.enum(["any", "clean", "flagged", "locked"]).default("any"),
        ratingMin: z.number().int().optional(),
        ratingMax: z.number().int().optional(),
        createdFrom: z.string().optional(),
        createdTo: z.string().optional(),
        sort: z
          .enum(["created_at", "rating", "peak_rating", "games_played", "display_name"])
          .default("created_at"),
        dir: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminUserListResult> => {
    const identity = await assertAdmin(context, "users");
    const { listUsers } = await import("@/lib/admin/users.server");
    return listUsers(data, identity.userId);
  });

export const getAdminUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AdminUserDetail> => {
    const identity = await assertAdmin(context, "users");
    const { getUserDetail } = await import("@/lib/admin/users.server");
    return getUserDetail(data.userId, identity.userId);
  });

export const suspendAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: uuid,
        hours: z.number().int().min(1).max(24 * 365),
        reason,
        expectedVersion: z.number().int().nullable().optional(),
        confirmation: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { suspendUser } = await import("@/lib/admin/users.server");
    const { LONG_SUSPENSION_HOURS } = await import("@/lib/admin/userTypes");
    return suspendUser({
      actorId: identity.userId,
      userId: data.userId,
      hours: data.hours,
      reason: data.reason,
      expectedVersion: data.expectedVersion ?? null,
      confirmation: data.confirmation ?? "",
      requireConfirmation: data.hours >= LONG_SUSPENSION_HOURS,
    });
  });

export const unsuspendAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: uuid, reason, expectedVersion: z.number().int().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { unsuspendUser } = await import("@/lib/admin/users.server");
    return unsuspendUser({
      actorId: identity.userId,
      userId: data.userId,
      reason: data.reason,
      expectedVersion: data.expectedVersion ?? null,
    });
  });

export const forceLogoutAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: uuid, reason }).parse(input))
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { forceLogout } = await import("@/lib/admin/users.server");
    return forceLogout({ actorId: identity.userId, userId: data.userId, reason: data.reason });
  });

export const sendAdminPasswordRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: uuid, reason }).parse(input))
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { sendPasswordRecovery } = await import("@/lib/admin/users.server");
    return sendPasswordRecovery({
      actorId: identity.userId,
      userId: data.userId,
      reason: data.reason,
    });
  });

export const sendAdminUserNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: uuid, title: z.string().min(3).max(120), body: z.string().min(3).max(1000), reason })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { sendSystemNotification } = await import("@/lib/admin/users.server");
    return sendSystemNotification({
      actorId: identity.userId,
      userId: data.userId,
      title: data.title,
      body: data.body,
      reason: data.reason,
    });
  });

export const resetAdminUserIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: uuid, reason }).parse(input))
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { resetProfileIdentity } = await import("@/lib/admin/users.server");
    return resetProfileIdentity({
      actorId: identity.userId,
      userId: data.userId,
      reason: data.reason,
    });
  });

export const setAdminUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: uuid,
        role: z.enum(["admin", "moderator"]),
        grant: z.boolean(),
        reason,
        confirmation: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { setUserRole } = await import("@/lib/admin/users.server");
    return setUserRole({
      actorId: identity.userId,
      actorRole: identity.role,
      userId: data.userId,
      role: data.role,
      grant: data.grant,
      reason: data.reason,
      confirmation: data.confirmation ?? "",
    });
  });

export const adjustAdminUserRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: uuid,
        targetRating: z.number().int().min(100).max(4000),
        reason,
        idempotencyKey: z.string().min(8).max(120),
        gameId: uuid.nullable().optional(),
        confirmation: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { adjustRating } = await import("@/lib/admin/users.server");
    return adjustRating({
      actorId: identity.userId,
      userId: data.userId,
      targetRating: data.targetRating,
      reason: data.reason,
      idempotencyKey: data.idempotencyKey,
      gameId: data.gameId ?? null,
      confirmation: data.confirmation ?? "",
    });
  });

export const requestAdminUserAnonymize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: uuid,
        mode: z.enum(["anonymize", "delete"]).default("anonymize"),
        reason,
        confirmation: z.string().max(120).optional(),
        expectedVersion: z.number().int().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { requestAnonymize } = await import("@/lib/admin/users.server");
    return requestAnonymize({
      actorId: identity.userId,
      userId: data.userId,
      mode: data.mode,
      reason: data.reason,
      confirmation: data.confirmation ?? "",
      expectedVersion: data.expectedVersion ?? null,
    });
  });

export const cancelAdminUserAnonymize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: uuid, reason, expectedVersion: z.number().int().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminActionResult> => {
    const identity = await assertAdmin(context, "users");
    const { cancelAnonymize } = await import("@/lib/admin/users.server");
    return cancelAnonymize({
      actorId: identity.userId,
      userId: data.userId,
      reason: data.reason,
      expectedVersion: data.expectedVersion ?? null,
    });
  });

export const exportAdminUserData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: uuid, reason }).parse(input))
  .handler(async ({ data, context }) => {
    const identity = await assertAdmin(context, "users");
    const { exportUserData } = await import("@/lib/admin/users.server");
    return exportUserData({ actorId: identity.userId, userId: data.userId, reason: data.reason });
  });
