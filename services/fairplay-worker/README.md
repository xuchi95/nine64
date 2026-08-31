# Nine64 Fair Play worker

Trusted, server-side analysis service. It replays the **canonical move ledger**
of finished games with Stockfish and posts structured signals back to the app.

Guarantees:

- Browsers never produce enforcement evidence. Client-side Stockfish remains
  only for training and post-game analysis features.
- The worker holds **no database credentials**. It authenticates with a
  Google-signed OIDC ID token; the app performs all writes with its own service
  identity.
- The worker cannot sanction anyone. Automatic outcomes are capped at
  `review_required`; rating locks and any other moderation action require an
  admin decision, which is audit-logged.
- Retries are idempotent: results are keyed by job id and upserted per
  `(game, player)`, so a re-run never creates a second verdict.

## Contract

| Endpoint | Body | Purpose |
| --- | --- | --- |
| `POST /api/public/fairplay/claim` | `{ worker, limit, leaseSeconds }` | Lease a bounded batch of queued jobs plus their canonical moves |
| `POST /api/public/fairplay/result` | `{ jobId, engineVersion, depth, timeBudgetMs, subjects[] }` | Store observations; the app scores them and marks the job `succeeded` |
| `POST /api/public/fairplay/fail` | `{ jobId, error }` | Record an attempt failure (re-queued until `max_attempts`) |

Every request requires `Authorization: Bearer <Google OIDC ID token>`.
Missing/invalid token → `401`, non-allowlisted service account → `403`,
missing app configuration → `503 NOT_CONFIGURED`.

## App configuration (server env, never committed)

| Variable | Meaning |
| --- | --- |
| `FAIRPLAY_WORKER_AUDIENCE` | Audience the worker mints its ID token for (the app URL) |
| `FAIRPLAY_WORKER_SERVICE_ACCOUNTS` | Comma-separated allowlist of worker service-account e-mails |

Until both are set, the admin console shows the worker as `not_configured`,
the endpoints refuse every call, and no analysis runs. Nothing is faked and no
client-side fallback exists.

## Worker configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `FAIRPLAY_APP_URL` | – | Base URL of the Nine64 app |
| `FAIRPLAY_AUDIENCE` | `FAIRPLAY_APP_URL` | ID token audience |
| `FAIRPLAY_WORKER_NAME` | `fairplay-worker` | Recorded in `fairplay_jobs.claimed_by` |
| `FAIRPLAY_BATCH_SIZE` | `2` | Jobs per loop (bounded work per run) |
| `FAIRPLAY_LEASE_SECONDS` | `600` | Lease before another worker may re-claim |
| `FAIRPLAY_DEPTH` / `FAIRPLAY_MOVE_TIME_MS` | `16` / `250` | Engine budget, stored with each job |
| `FAIRPLAY_MIN_MOVES` | `12` | Games shorter than this are not analysed |

## Deploy to Cloud Run (manual, requires GCP credentials)

```bash
gcloud iam service-accounts create nine64-fairplay-worker

gcloud run deploy nine64-fairplay-worker \
  --source services/fairplay-worker \
  --service-account nine64-fairplay-worker@PROJECT_ID.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars FAIRPLAY_APP_URL=https://nine64.com

# Only the invoker identity (e.g. Cloud Scheduler) may start the service.
gcloud run services add-iam-policy-binding nine64-fairplay-worker \
  --member serviceAccount:nine64-scheduler@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.invoker
```

Then set in the app runtime environment:

- `FAIRPLAY_WORKER_AUDIENCE=https://nine64.com`
- `FAIRPLAY_WORKER_SERVICE_ACCOUNTS=nine64-fairplay-worker@PROJECT_ID.iam.gserviceaccount.com`

Least privilege: the worker service account needs no GCP data roles — only the
ability to mint its own ID token (granted implicitly) and, if pushed by a
scheduler, `roles/run.invoker` on itself for that scheduler. Secrets belong in
Secret Manager or the Cloud Run environment; never in this repository.

## Tests

```bash
cd services/fairplay-worker && node --test
```
