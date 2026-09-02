import { cloudEngineHealthCached } from "@/lib/engine/cloudEngine.server";
const h = await cloudEngineHealthCached(0);
console.log(JSON.stringify(h, null, 2).slice(0, 4000));
