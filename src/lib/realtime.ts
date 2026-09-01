/**
 * Realtime topic helper.
 *
 * `supabase.channel(topic)` returns the EXISTING channel when one with the same
 * topic is still registered. React effects re-run (auth state change, strict
 * mode, dependency churn) faster than `removeChannel()` can unregister the old
 * socket, so the second run gets back an already-subscribed channel and
 * `.on("postgres_changes", ...)` throws:
 *
 *   cannot add `postgres_changes` callbacks for realtime:<topic> after `subscribe()`
 *
 * That throw happens inside the effect and crashes the route (blank/error page).
 * Suffixing every topic with a per-subscription nonce guarantees a fresh
 * channel instance, so a subscription can never inherit a subscribed one.
 */
let counter = 0;

export function uniqueTopic(topic: string): string {
  counter += 1;
  return `${topic}#${counter}-${Math.random().toString(36).slice(2, 8)}`;
}
