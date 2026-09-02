import { getEngineProfile } from "@/lib/engine/profiles.server";
import { runTitanQualification } from "@/lib/engine/qualification.server";
const p = await getEngineProfile("titan");
const cfg = p?.draftConfig ?? p!.config;
const r = await runTitanQualification({ slug: "titan", config: cfg, actorId: p!.updatedBy ?? "00000000-0000-0000-0000-000000000000" });
console.log(JSON.stringify({ ok: r.ok, reasons: r.reasons, steps: r.steps.map(s=>[s.id,s.status,s.reason,s.score]), ready: r.readiness?.ready, rr: r.readiness?.reasons }, null, 1));
