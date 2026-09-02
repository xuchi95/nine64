/**
 * Idempotent seeding of the Nine64 AI Player Network — SERVER ONLY.
 *
 * Creates (or repairs) exactly one Supabase Auth identity per roster entry so
 * every AI has a real `profiles` row, a real user id and can therefore appear
 * in `games`, `game_moves` and the rating tables exactly like a human seat —
 * without any of the online code paths needing a special case.
 *
 * Re-running is safe: identities are looked up by their deterministic email,
 * profiles and `ai_players` rows are upserted, and nothing is ever deleted.
 */
import { AI_ROSTER, type AiRosterEntry } from "@/config/aiRoster";
import { engineLevelForRating } from "./strength.server";

/** Non-routable domain: these mailboxes must never receive mail. */
const AI_EMAIL_DOMAIN = "ai.nine64.invalid";

export function aiEmailFor(entry: Pick<AiRosterEntry, "key">): string {
  return `${entry.key}@${AI_EMAIL_DOMAIN}`;
}

/** Deterministic, public-safe avatar for an AI (no external requests needed). */
export function aiAvatarUrlFor(entry: Pick<AiRosterEntry, "avatarSeed">): string {
  return `/ai-avatars/${entry.avatarSeed}.svg`;
}

export interface SeedRankedAiResult {
  total: number;
  createdIdentities: number;
  existingIdentities: number;
  profilesUpserted: number;
  rostersUpserted: number;
  errors: string[];
}

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Seeds the roster. Requires the service role client; the caller is
 * responsible for verifying that an admin asked for this.
 */
export async function seedRankedAiRoster(): Promise<SeedRankedAiResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const result: SeedRankedAiResult = {
    total: AI_ROSTER.length,
    createdIdentities: 0,
    existingIdentities: 0,
    profilesUpserted: 0,
    rostersUpserted: 0,
    errors: [],
  };

  // Existing AI identities, resolved through the roster rows we already own.
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("ai_players")
    .select("ai_key, profile_id");
  if (existingError) {
    result.errors.push(`read_roster_failed: ${existingError.message}`);
    return result;
  }
  const knownIds = new Map<string, string>((existingRows ?? []).map((r) => [r.ai_key, r.profile_id]));

  for (const entry of AI_ROSTER) {
    try {
      let userId = knownIds.get(entry.key) ?? null;

      if (!userId) {
        const created = await supabaseAdmin.auth.admin.createUser({
          email: aiEmailFor(entry),
          password: randomPassword(),
          email_confirm: true,
          user_metadata: { display_name: entry.name, nine64_ai: true, ai_key: entry.key },
        });
        if (created.data.user) {
          userId = created.data.user.id;
          result.createdIdentities += 1;
        } else {
          // Most likely already registered from a previous partial run.
          const found = await findAuthUserByEmail(supabaseAdmin, aiEmailFor(entry));
          if (!found) {
            result.errors.push(`identity_failed:${entry.key}:${created.error?.message ?? "unknown"}`);
            continue;
          }
          userId = found;
          result.existingIdentities += 1;
        }
      } else {
        result.existingIdentities += 1;
      }

      const profile = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: userId,
            display_name: entry.name,
            avatar_url: aiAvatarUrlFor(entry),
            is_ai: true,
            rating: entry.targetRating,
          },
          { onConflict: "id" },
        )
        .select("id")
        .maybeSingle();
      if (profile.error) {
        result.errors.push(`profile_failed:${entry.key}:${profile.error.message}`);
        continue;
      }
      result.profilesUpserted += 1;

      const roster = await supabaseAdmin.from("ai_players").upsert(
        {
          ai_key: entry.key,
          profile_id: userId,
          base_target_rating: entry.targetRating,
          engine_level: engineLevelForRating(entry.targetRating),
          personality_id: entry.personality,
          enabled: true,
          standard_enabled: true,
          chess960_enabled: true,
        },
        { onConflict: "ai_key" },
      );
      if (roster.error) {
        result.errors.push(`roster_failed:${entry.key}:${roster.error.message}`);
        continue;
      }
      result.rostersUpserted += 1;
    } catch (error) {
      result.errors.push(`unexpected:${entry.key}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return result;
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Paginated lookup; Supabase has no direct get-user-by-email admin call. */
async function findAuthUserByEmail(client: AdminClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
