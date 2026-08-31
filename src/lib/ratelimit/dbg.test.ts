import { describe, it, expect, vi } from "vitest";
const buckets = new Map<string,{start:number;count:number}>();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: async (_n: string, a: any) => {
  const key=a._key, w=a._window_seconds, l=a._limit; const now=Date.now();
  let r=buckets.get(key); if(!r||r.start+w*1000<=now){r={start:now,count:0};buckets.set(key,r);} 
  if(r.count+1>l) return {data:{allowed:false,limit:l,remaining:0,reset_at:new Date(r.start+w*1000).toISOString(),retry_after_seconds:5},error:null};
  r.count++; return {data:{allowed:true,limit:l,remaining:l-r.count,reset_at:new Date(r.start+w*1000).toISOString(),retry_after_seconds:0},error:null};
}}}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://x.com"), setResponseHeader: () => {}, setResponseStatus: () => {} }));
describe("d", () => { it("x", async () => {
  const m = await import("@/lib/ratelimit/limiter.server");
  const res = await Promise.all(Array.from({length:11},()=>m.checkRateLimit("coach.burst", m.userSubject("z"))));
  console.log(JSON.stringify(res));
  expect(1).toBe(1);
});});
