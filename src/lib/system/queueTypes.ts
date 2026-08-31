/** Client-safe queue identifiers shared by the server module and the UI. */
export type QueueId =
  | "fairplay_jobs"
  | "notification_outbox"
  | "timeout_finalizer"
  | "account_deletion";

export const QUEUE_IDS: readonly QueueId[] = [
  "fairplay_jobs",
  "notification_outbox",
  "timeout_finalizer",
  "account_deletion",
];
