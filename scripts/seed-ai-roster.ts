/**
 * Server-only seeding entrypoint for the Nine64 AI Player Network.
 * Run with: bun scripts/seed-ai-roster.ts
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 * Idempotent: re-running repairs missing identities and never deletes.
 */
import { seedRankedAiRoster } from "@/lib/rankedAi/seed.server";

const result = await seedRankedAiRoster();
console.log(JSON.stringify({ ...result, errors: result.errors.slice(0, 10) }, null, 2));
if (result.errors.length) process.exit(1);
