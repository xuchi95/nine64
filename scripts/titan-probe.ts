import { getEngineProfile } from "@/lib/engine/profiles.server";
import { runTitanQualification } from "@/lib/engine/qualification.server";
const p = await getEngineProfile("titan");
const cfg = p?.draftConfig ?? p!.config;
console.log("profile", p?.version, p?.status, p?.enabled, "hasDraft", Boolean(p?.draftConfig));
const r = await runTitanQualification({ slug: "titan", config: cfg, actorId: p!.updatedBy ?? "00000000-0000-0000-0000-000000000000" });
console.log(JSON.stringify({ ok: r.ok, sig: r.configSignature, reasons: r.reasons, durationMs: r.durationMs, steps: r.steps.map(s=>({id:s.id,status:s.status,reason:s.reason,ms:s.durationMs,nps:s.nps,depth:s.depth,score:s.score})), readiness: r.readiness?.reasons }, null, 2));
