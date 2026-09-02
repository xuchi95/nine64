import { getEngineProfile } from "@/lib/engine/profiles.server";
import { runSelfPlayRegression } from "@/lib/engine/selfplay.server";
const p = await getEngineProfile("titan");
const r = await runSelfPlayRegression({ slug: "titan", candidate: (p!.draftConfig ?? p!.config), actorId: p!.updatedBy ?? "00000000-0000-0000-0000-000000000000", games: 2, moveTimeMs: 100, maxPlies: 40 });
console.log(JSON.stringify(r, null, 1));
