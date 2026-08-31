/**
 * Server-only implementation of the Admin Center user module.
 *
 * Everything that touches the Auth Admin API or the service-role client lives
 * here. `*.server.ts` is blocked from client bundles, and the thin
 * `adminUsers.functions.ts` wrappers only `await import(...)` it inside their
 * handlers, so no service-role code can reach the browser.
 */
import {
  maskEmail,
  type AdminActionResult,
  type AdminUserDetail,
  type AdminUserListInput,
  type AdminUserListResult,
  type AdminUserRow,
  type TimelineEntry,
  type UserAdminStatus,
  USER_SORT_FIELDS,
  DELETION_GRACE_HOURS,
} from "./userTypes";
import { recordAdminAction, recordAdminActionStrict, newRequestId } from "./auditLog.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function fail(code: string, message?: string): AdminActionResult {
  return { ok: false, code, message: message ?? code };
}

/** Reason gate shared by every mutation. */
export function checkReason(reason: string): AdminActionResult | null {
  return reason && reason.trim().length >= 10 ? null : fail("REASON_TOO_SHORT");
}

/** Typed-confirmation gate: admin must retype the display name or a UUID chunk. */
export function checkConfirmation(
  confirmation: string | undefined,
  displayName: string,
  userId: string,
): AdminActionResult | null {
  const value = (confirmation ?? "").trim();
  if (!value) return fail("CONFIRMATION_MISMATCH");
  const ok = value === displayName.trim() || userId.toLowerCase().startsWith(value.toLowerCase());
  return ok ? null : fail("CONFIRMATION_MISMATCH");
}

async function emailIdsFor(query: string): Promise<string[]> {
  const sb = await admin();
  const needle = query.toLowerCase();
  const ids: string[] = [];
  // The Auth Admin API has no server-side email search; scan a bounded number
  // of pages so a huge project can never stall the request.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) {
      if ((u.email ?? "").toLowerCase().includes(needle)) ids.push(u.id);
    }
    if (data.users.length < 200) break;
  }
  return ids;
}

export async function listUsers(
  input: AdminUserListInput,
  actorId: string,
): Promise<AdminUserListResult> {
  const sb = await admin();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, input.pageSize ?? 20));
  const sort = USER_SORT_FIELDS.includes(input.sort as never) ? input.sort! : "created_at";
  const ascending = input.dir === "asc";

  let restrictIds: string[] | null = null;
  const q = (input.q ?? "").trim();
  if (q) {
    if (UUID_RE.test(q)) restrictIds = [q];
    else if (q.includes("@")) restrictIds = await emailIdsFor(q);
  }

  // Role / status / fair-play filters narrow the id set before paging.
  const intersect = (next: string[]) => {
    restrictIds = restrictIds ? restrictIds.filter((id) => next.includes(id)) : next;
  };

  if (input.role && input.role !== "any") {
    if (input.role === "user") {
      const { data } = await sb.from("user_roles").select("user_id").in("role", ["admin", "moderator"]);
      const privileged = new Set((data ?? []).map((r) => r.user_id));
      const { data: all } = await sb.from("profiles").select("id").limit(5000);
      intersect((all ?? []).map((p) => p.id).filter((id) => !privileged.has(id)));
    } else {
      const { data } = await sb.from("user_roles").select("user_id").eq("role", input.role);
      intersect((data ?? []).map((r) => r.user_id));
    }
  }

  if (input.status && input.status !== "any") {
    if (input.status === "active") {
      const { data } = await sb.from("user_admin_state").select("user_id").neq("status", "active");
      const nonActive = new Set((data ?? []).map((r) => r.user_id));
      const { data: all } = await sb.from("profiles").select("id").limit(5000);
      intersect((all ?? []).map((p) => p.id).filter((id) => !nonActive.has(id)));
    } else {
      const { data } = await sb.from("user_admin_state").select("user_id").eq("status", input.status);
      intersect((data ?? []).map((r) => r.user_id));
    }
  }

  if (input.fairplay && input.fairplay !== "any") {
    const query = sb.from("fairplay_status").select("user_id, action, rating_locked");
    const { data } = await query;
    const rows = data ?? [];
    if (input.fairplay === "locked") intersect(rows.filter((r) => r.rating_locked).map((r) => r.user_id));
    else if (input.fairplay === "flagged")
      intersect(rows.filter((r) => r.action && r.action !== "none").map((r) => r.user_id));
    else {
      const flagged = new Set(rows.filter((r) => r.action && r.action !== "none").map((r) => r.user_id));
      const { data: all } = await sb.from("profiles").select("id").limit(5000);
      intersect((all ?? []).map((p) => p.id).filter((id) => !flagged.has(id)));
    }
  }

  let base = sb
    .from("profiles")
    .select(
      "id, display_name, avatar_url, rating, peak_rating, rating_deviation, volatility, games_played, wins, losses, draws, created_at, last_rated_at",
      { count: "exact" },
    );

  if (restrictIds) {
    if (restrictIds.length === 0) return { rows: [], total: 0, page, pageSize };
    base = base.in("id", restrictIds.slice(0, 1000));
  } else if (q) {
    base = base.ilike("display_name", `%${q}%`);
  }
  if (typeof input.ratingMin === "number") base = base.gte("rating", input.ratingMin);
  if (typeof input.ratingMax === "number") base = base.lte("rating", input.ratingMax);
  if (input.createdFrom) base = base.gte("created_at", input.createdFrom);
  if (input.createdTo) base = base.lte("created_at", input.createdTo);

  const from = (page - 1) * pageSize;
  // Secondary key on `id` keeps paging stable (no duplicates across pages).
  const { data, count, error } = await base
    .order(sort, { ascending })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  const profiles = data ?? [];
  const ids = profiles.map((p) => p.id);
  const rows: AdminUserRow[] = [];

  if (ids.length) {
    const [roles, states, fp, reports, authUsers] = await Promise.all([
      sb.from("user_roles").select("user_id, role").in("user_id", ids),
      sb.from("user_admin_state").select("*").in("user_id", ids),
      sb.from("fairplay_status").select("user_id, action, score, rating_locked").in("user_id", ids),
      sb.from("player_reports").select("subject_id").in("subject_id", ids),
      Promise.all(ids.map((id) => sb.auth.admin.getUserById(id).catch(() => null))),
    ]);

    const roleOf = new Map<string, "admin" | "moderator">();
    for (const r of roles.data ?? []) {
      const role = r.role as string;
      if (role === "admin") roleOf.set(r.user_id, "admin");
      else if (role === "moderator" && roleOf.get(r.user_id) !== "admin")
        roleOf.set(r.user_id, "moderator");
    }
    const stateOf = new Map((states.data ?? []).map((s) => [s.user_id, s]));
    const fpOf = new Map((fp.data ?? []).map((s) => [s.user_id, s]));
    const reportCount = new Map<string, number>();
    for (const r of reports.data ?? [])
      reportCount.set(r.subject_id, (reportCount.get(r.subject_id) ?? 0) + 1);

    profiles.forEach((p, i) => {
      const authUser = authUsers[i]?.data?.user ?? null;
      const state = stateOf.get(p.id);
      const fps = fpOf.get(p.id);
      const identities = (authUser?.identities ?? []).map((x) => x.provider);
      rows.push({
        userId: p.id,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
        emailMasked: maskEmail(authUser?.email ?? null),
        emailConfirmed: Boolean(authUser?.email_confirmed_at),
        providers: identities.length ? identities : ["email"],
        createdAt: authUser?.created_at ?? p.created_at,
        lastSignInAt: authUser?.last_sign_in_at ?? null,
        bannedUntil: (authUser as { banned_until?: string } | null)?.banned_until ?? null,
        role: roleOf.get(p.id) ?? "user",
        status: (state?.status as UserAdminStatus) ?? "active",
        suspendedUntil: state?.suspended_until ?? null,
        stateVersion: state?.version ?? 0,
        rating: p.rating,
        peakRating: p.peak_rating,
        ratingDeviation: Number(p.rating_deviation),
        volatility: Number(p.volatility),
        gamesPlayed: p.games_played,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        fairplayAction: fps?.action ?? null,
        fairplayScore: fps?.score ?? null,
        ratingLocked: Boolean(fps?.rating_locked),
        reportCount: reportCount.get(p.id) ?? 0,
        onlineGames: p.games_played,
        lastActivityAt: p.last_rated_at ?? authUser?.last_sign_in_at ?? null,
      });
    });
  }

  await recordAdminAction({
    actorId,
    action: "user_list_view",
    detail: { page, pageSize, q: q ? "[set]" : null, role: input.role, status: input.status },
  });

  return { rows, total: count ?? rows.length, page, pageSize };
}

function entry(
  id: string,
  at: string,
  kind: string,
  title: string,
  detail?: string | null,
  href?: string | null,
): TimelineEntry {
  return { id, at, kind, title, detail: detail ?? null, href: href ?? null };
}

export async function getUserDetail(userId: string, actorId: string): Promise<AdminUserDetail> {
  const sb = await admin();
  const list = await listUsers({ q: userId, pageSize: 5 }, actorId);
  const base = list.rows.find((r) => r.userId === userId);
  if (!base) throw new Error("PROFILE_NOT_FOUND");

  const [authUser, state, games, ratings, adjustments, fpReports, reports, security, notifications, history, job] =
    await Promise.all([
      sb.auth.admin.getUserById(userId).catch(() => null),
      sb.from("user_admin_state").select("*").eq("user_id", userId).maybeSingle(),
      sb
        .from("games")
        .select("id, status, result, end_reason, variant, time_control, created_at, white_id, black_id")
        .or(`white_id.eq.${userId},black_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("rating_events")
        .select("id, created_at, game_id, white_id, white_delta, black_delta, result")
        .or(`white_id.eq.${userId},black_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("admin_rating_adjustments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("fairplay_reports")
        .select("id, created_at, score, action, model, game_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("player_reports")
        .select("id, created_at, reason, status, game_id")
        .eq("subject_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("security_events")
        .select("id, created_at, kind, resource, message")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("notifications")
        .select("id, created_at, type, title, read")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("admin_audit_log")
        .select("id, created_at, action, note, actor_id")
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      sb
        .from("account_deletion_jobs")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["pending", "processing"])
        .maybeSingle(),
    ]);

  await recordAdminAction({ actorId, action: "user_view", targetUserId: userId });

  return {
    overview: {
      ...base,
      email: authUser?.data?.user?.email ?? null,
      internalNote: state.data?.internal_note ?? null,
      reason: state.data?.reason ?? null,
    },
    games: (games.data ?? []).map((g) =>
      entry(
        g.id,
        g.created_at,
        "game",
        `${g.variant} · ${g.time_control}`,
        `${g.status}${g.result ? ` · ${g.result}` : ""}${g.end_reason ? ` · ${g.end_reason}` : ""}`,
        `/games/${g.id}`,
      ),
    ),
    ratings: (ratings.data ?? []).map((r) =>
      entry(
        r.id,
        r.created_at,
        "rating",
        `${r.white_id === userId ? r.white_delta : r.black_delta > 0 ? `+${r.black_delta}` : r.black_delta}`,
        r.result,
        r.game_id ? `/games/${r.game_id}` : null,
      ),
    ),
    adjustments: (adjustments.data ?? []).map((a) =>
      entry(
        a.id,
        a.created_at,
        "adjustment",
        `${a.rating_before} → ${a.rating_after}`,
        a.reason,
        a.game_id ? `/games/${a.game_id}` : null,
      ),
    ),
    fairplay: (fpReports.data ?? []).map((f) =>
      entry(f.id, f.created_at, "fairplay", `${f.action} · ${f.score}`, f.model, `/admin/fairplay`),
    ),
    reports: (reports.data ?? []).map((r) =>
      entry(r.id, r.created_at, "report", r.reason, r.status, r.game_id ? `/games/${r.game_id}` : null),
    ),
    security: (security.data ?? []).map((s) =>
      entry(s.id, s.created_at, "security", s.kind, s.message ?? s.resource, "/admin/security"),
    ),
    notifications: (notifications.data ?? []).map((n) =>
      entry(n.id, n.created_at, "notification", n.title, n.read ? "read" : "unread"),
    ),
    adminHistory: (history.data ?? []).map((h) =>
      entry(h.id, h.created_at, "admin", h.action, h.note, "/admin/audit"),
    ),
    deletionJob: job.data
      ? {
          id: job.data.id,
          status: job.data.status,
          mode: job.data.mode,
          graceUntil: job.data.grace_until,
          reason: job.data.reason,
        }
      : null,
  };
}

async function setState(params: {
  userId: string;
  status: UserAdminStatus;
  reason: string;
  actorId: string;
  suspendedUntil?: string | null;
  internalNote?: string | null;
  expectedVersion?: number | null;
}): Promise<
  { ok: true; state: { version: number; status: UserAdminStatus }; before: unknown } | AdminActionResult
> {
  const sb = await admin();
  const { data, error } = await sb.rpc("admin_set_user_state", {
    _user_id: params.userId,
    _status: params.status,
    _reason: params.reason,
    _actor: params.actorId,
    // Optional RPC args are omitted (not sent as null) so PostgREST uses defaults.
    ...(params.suspendedUntil ? { _suspended_until: params.suspendedUntil } : {}),
    ...(params.internalNote ? { _internal_note: params.internalNote } : {}),
    ...(params.expectedVersion !== undefined && params.expectedVersion !== null
      ? { _expected_version: params.expectedVersion }
      : {}),
  });

  if (error) return fail("STATE_WRITE_FAILED", error.message);
  const res = data as { ok: boolean; code?: string; state?: Record<string, unknown>; before?: unknown };
  if (!res.ok) return fail(res.code ?? "STATE_WRITE_FAILED");
  return {
    ok: true,
    state: {
      version: Number(res.state?.["version"] ?? 1),
      status: String(res.state?.["status"]) as UserAdminStatus,
    },
    before: res.before ?? null,
  };
}

async function displayNameOf(userId: string): Promise<string> {
  const sb = await admin();
  const { data } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name ?? "";
}

export async function suspendUser(params: {
  actorId: string;
  userId: string;
  hours: number;
  reason: string;
  expectedVersion?: number | null;
  confirmation?: string;
  requireConfirmation: boolean;
}): Promise<AdminActionResult> {
  if (params.actorId === params.userId) return fail("SELF_TARGET");
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  if (params.requireConfirmation) {
    const name = await displayNameOf(params.userId);
    const mismatch = checkConfirmation(params.confirmation, name, params.userId);
    if (mismatch) return mismatch;
  }

  const sb = await admin();
  const until = new Date(Date.now() + params.hours * 3600_000).toISOString();

  // Auth is the source of truth for sign-in; the business state mirrors it.
  const { error: authError } = await sb.auth.admin.updateUserById(params.userId, {
    ban_duration: `${Math.max(1, Math.round(params.hours))}h`,
  });
  if (authError) return fail("AUTH_UPDATE_FAILED", authError.message);

  const state = await setState({
    userId: params.userId,
    status: "suspended",
    reason: params.reason,
    actorId: params.actorId,
    suspendedUntil: until,
    expectedVersion: params.expectedVersion ?? null,
  });
  if (!("state" in state)) return state;

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_suspend",
    targetUserId: params.userId,
    note: params.reason,
    requestId: newRequestId(),
    after: { status: "suspended", suspended_until: until, hours: params.hours },
  });
  return { ok: true, state: state.state };
}

export async function unsuspendUser(params: {
  actorId: string;
  userId: string;
  reason: string;
  expectedVersion?: number | null;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const sb = await admin();
  const { error: authError } = await sb.auth.admin.updateUserById(params.userId, { ban_duration: "none" });
  if (authError) return fail("AUTH_UPDATE_FAILED", authError.message);

  const state = await setState({
    userId: params.userId,
    status: "active",
    reason: params.reason,
    actorId: params.actorId,
    suspendedUntil: null,
    expectedVersion: params.expectedVersion ?? null,
  });
  if (!("state" in state)) return state;

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_unsuspend",
    targetUserId: params.userId,
    note: params.reason,
    after: { status: "active" },
  });
  return { ok: true, state: state.state };
}

/**
 * Force sign-out. `auth.admin.signOut()` needs the target user's own JWT,
 * which an admin never holds, so there is no supported way to revoke another
 * user's sessions with this SDK — we report `not_supported` instead of
 * pretending. Suspend (ban) does invalidate the session and is the documented
 * workaround.
 */
export async function forceLogout(params: {
  actorId: string;
  userId: string;
  reason: string;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_force_logout",
    targetUserId: params.userId,
    note: params.reason,
    detail: { outcome: "not_supported" },
  });
  return {
    ok: false,
    code: "NOT_SUPPORTED",
    message: "auth.admin.signOut requires the target user's JWT; use a short suspension instead.",
  };
}

export async function sendPasswordRecovery(params: {
  actorId: string;
  userId: string;
  reason: string;
  redirectTo?: string;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const sb = await admin();
  const { data: authUser } = await sb.auth.admin.getUserById(params.userId);
  const email = authUser?.user?.email;
  if (!email) return fail("NO_EMAIL", "Tài khoản không có email.");

  const { error } = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    ...(params.redirectTo ? { options: { redirectTo: params.redirectTo } } : {}),
  });
  if (error) return fail("RECOVERY_FAILED", error.message);

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_view",
    targetUserId: params.userId,
    note: params.reason,
    detail: { operation: "password_recovery_sent" },
  });
  return { ok: true, code: "RECOVERY_SENT" };
}

export async function sendSystemNotification(params: {
  actorId: string;
  userId: string;
  title: string;
  body: string;
  reason: string;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const sb = await admin();
  const { error } = await sb.from("notifications").insert({
    user_id: params.userId,
    type: "system",
    title: params.title.slice(0, 120),
    body: params.body.slice(0, 1000),
    event_key: `admin_system:${newRequestId()}`,
    data: { url: "/account", actor: "admin" } as never,
  });
  if (error) return fail("NOTIFY_FAILED", error.message);
  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_view",
    targetUserId: params.userId,
    note: params.reason,
    detail: { operation: "system_notification", title: params.title.slice(0, 120) },
  });
  return { ok: true, code: "NOTIFICATION_SENT" };
}

export async function resetProfileIdentity(params: {
  actorId: string;
  userId: string;
  reason: string;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const sb = await admin();
  const { data: before } = await sb
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", params.userId)
    .maybeSingle();
  const newName = `Player-${params.userId.slice(0, 8)}`;
  const { error } = await sb
    .from("profiles")
    .update({ display_name: newName, avatar_url: null })
    .eq("id", params.userId);
  if (error) return fail("PROFILE_UPDATE_FAILED", error.message);

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_view",
    targetUserId: params.userId,
    note: params.reason,
    before: before ?? null,
    after: { display_name: newName, avatar_url: null },
    detail: { operation: "reset_identity" },
  });
  return { ok: true, code: "IDENTITY_RESET" };
}

export async function setUserRole(params: {
  actorId: string;
  actorRole: "admin" | "moderator";
  userId: string;
  role: "admin" | "moderator";
  grant: boolean;
  reason: string;
  confirmation?: string;
}): Promise<AdminActionResult> {
  if (params.actorRole !== "admin") return fail("FORBIDDEN");
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  if (params.userId === params.actorId && !params.grant) return fail("SELF_TARGET");

  const sb = await admin();

  if (params.role === "admin") {
    const name = await displayNameOf(params.userId);
    const mismatch = checkConfirmation(params.confirmation, name, params.userId);
    if (mismatch) return mismatch;
    if (!params.grant) {
      const { count } = await sb
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) return fail("LAST_ADMIN");
    }
  }

  if (params.grant) {
    const { error } = await sb
      .from("user_roles")
      .upsert({ user_id: params.userId, role: params.role }, { onConflict: "user_id,role" });
    if (error) return fail("ROLE_WRITE_FAILED", error.message);
  } else {
    const { error } = await sb
      .from("user_roles")
      .delete()
      .eq("user_id", params.userId)
      .eq("role", params.role);
    if (error) return fail("ROLE_WRITE_FAILED", error.message);
  }

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_role_change",
    targetUserId: params.userId,
    note: params.reason,
    after: { role: params.role, granted: params.grant },
  });
  return { ok: true, code: params.grant ? "ROLE_GRANTED" : "ROLE_REVOKED" };
}

export async function adjustRating(params: {
  actorId: string;
  userId: string;
  targetRating: number;
  reason: string;
  idempotencyKey: string;
  gameId?: string | null;
  confirmation?: string;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const name = await displayNameOf(params.userId);
  const mismatch = checkConfirmation(params.confirmation, name, params.userId);
  if (mismatch) return mismatch;

  const sb = await admin();
  const { data, error } = await sb.rpc("admin_apply_rating_adjustment", {
    _user_id: params.userId,
    _target_rating: params.targetRating,
    _reason: params.reason,
    _actor: params.actorId,
    _idempotency_key: params.idempotencyKey,
    ...(params.gameId ? { _game_id: params.gameId } : {}),
  });
  if (error) return fail("RATING_WRITE_FAILED", error.message);
  const res = data as { ok: boolean; code?: string; replayed?: boolean; adjustment?: Record<string, unknown> };
  if (!res.ok) return fail(res.code ?? "RATING_WRITE_FAILED");

  if (!res.replayed) {
    await recordAdminActionStrict({
      actorId: params.actorId,
      action: "rating_adjustment",
      targetUserId: params.userId,
      targetGameId: params.gameId ?? null,
      note: params.reason,
      before: { rating: res.adjustment?.["rating_before"] },
      after: { rating: res.adjustment?.["rating_after"] },
      detail: { idempotency_key: params.idempotencyKey },
    });
  }
  return { ok: true, code: res.replayed ? "REPLAYED" : "RATING_ADJUSTED" };
}

export async function requestAnonymize(params: {
  actorId: string;
  userId: string;
  mode: "anonymize" | "delete";
  reason: string;
  confirmation?: string;
  expectedVersion?: number | null;
}): Promise<AdminActionResult> {
  if (params.actorId === params.userId) return fail("SELF_TARGET");
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const name = await displayNameOf(params.userId);
  const mismatch = checkConfirmation(params.confirmation, name, params.userId);
  if (mismatch) return mismatch;

  const sb = await admin();
  const { count } = await sb
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  const { data: targetIsAdmin } = await sb
    .from("user_roles")
    .select("id")
    .eq("user_id", params.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (targetIsAdmin && (count ?? 0) <= 1) return fail("LAST_ADMIN");

  const graceUntil = new Date(Date.now() + DELETION_GRACE_HOURS * 3600_000).toISOString();
  const { error } = await sb.from("account_deletion_jobs").insert({
    user_id: params.userId,
    mode: params.mode,
    reason: params.reason,
    requested_by: params.actorId,
    grace_until: graceUntil,
  });
  if (error) return fail("DELETION_JOB_FAILED", error.message);

  // Revoke access immediately; the destructive step only runs after the grace period.
  await sb.auth.admin.updateUserById(params.userId, { ban_duration: "876000h" });
  const state = await setState({
    userId: params.userId,
    status: "pending_deletion",
    reason: params.reason,
    actorId: params.actorId,
    expectedVersion: params.expectedVersion ?? null,
  });
  if (!("state" in state)) return state;

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_anonymize_request",
    targetUserId: params.userId,
    note: params.reason,
    after: { status: "pending_deletion", mode: params.mode, grace_until: graceUntil },
  });
  return { ok: true, code: "DELETION_SCHEDULED", state: state.state };
}

export async function cancelAnonymize(params: {
  actorId: string;
  userId: string;
  reason: string;
  expectedVersion?: number | null;
}): Promise<AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const sb = await admin();
  const { data: job } = await sb
    .from("account_deletion_jobs")
    .select("id, grace_until, status")
    .eq("user_id", params.userId)
    .in("status", ["pending"])
    .maybeSingle();
  if (!job) return fail("NO_PENDING_JOB");
  if (new Date(job.grace_until).getTime() < Date.now()) return fail("GRACE_EXPIRED");

  await sb.from("account_deletion_jobs").update({ status: "cancelled" }).eq("id", job.id);
  await sb.auth.admin.updateUserById(params.userId, { ban_duration: "none" });
  const state = await setState({
    userId: params.userId,
    status: "active",
    reason: params.reason,
    actorId: params.actorId,
    expectedVersion: params.expectedVersion ?? null,
  });
  if (!("state" in state)) return state;

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_anonymize_request",
    targetUserId: params.userId,
    note: params.reason,
    after: { status: "active", cancelled_job: job.id },
  });
  return { ok: true, code: "DELETION_CANCELLED", state: state.state };
}

/** Scope-limited export: profile, ratings and admin state — no auth secrets. */
export async function exportUserData(params: {
  actorId: string;
  userId: string;
  reason: string;
}): Promise<{ ok: true; data: Record<string, unknown> } | AdminActionResult> {
  const reasonError = checkReason(params.reason);
  if (reasonError) return reasonError;
  const sb = await admin();
  const [profile, state, ratings, adjustments, reports] = await Promise.all([
    sb.from("profiles").select("*").eq("id", params.userId).maybeSingle(),
    sb.from("user_admin_state").select("status, suspended_until, reason").eq("user_id", params.userId).maybeSingle(),
    sb.from("rating_events").select("*").or(`white_id.eq.${params.userId},black_id.eq.${params.userId}`).limit(500),
    sb.from("admin_rating_adjustments").select("*").eq("user_id", params.userId).limit(200),
    sb.from("player_reports").select("id, reason, status, created_at").eq("subject_id", params.userId).limit(200),
  ]);

  await recordAdminActionStrict({
    actorId: params.actorId,
    action: "user_view",
    targetUserId: params.userId,
    note: params.reason,
    detail: { operation: "export" },
  });

  return {
    ok: true,
    data: {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      admin_state: state.data,
      rating_events: ratings.data ?? [],
      rating_adjustments: adjustments.data ?? [],
      reports: reports.data ?? [],
    },
  };
}
