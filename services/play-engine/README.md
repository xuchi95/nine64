# Nine64 play-engine

Private HTTP service that runs **official Stockfish 18** for the Nine64 Titan
bot tier (bot level 16). It is not a public "analyse any FEN" endpoint: the
Nine64 backend is the only caller, and it only calls this service for bot
sessions that the requesting player owns.

## License / attribution

Stockfish is free software licensed under the **GNU General Public License v3**
(<https://github.com/official-stockfish/Stockfish>). This service is therefore
also distributed under **GPL-3.0-or-later** (see `LICENSE`). Stockfish is **not**
rebranded as Nine64 technology — the product surface says
"Nine64 Titan — powered by Stockfish 18".

Corresponding source and build instructions: the `Dockerfile` clones the exact
upstream tag (`STOCKFISH_REF`, default `sf_18`) and builds it unmodified with
`make profile-build ARCH=$ARCH && make net`. The upstream `Copying.txt` and
`AUTHORS` files are copied into the image at `/usr/share/doc/stockfish/`.

## Endpoints

| Method | Path         | Purpose                                         |
| ------ | ------------ | ----------------------------------------------- |
| GET    | `/healthz`   | readiness + engine version + pool stats (open)   |
| POST   | `/bestmove`  | one search for a validated position (OIDC only)  |
| POST   | `/benchmark` | `bench`, `speedtest`, `epd`, `positions` (OIDC)  |

### `/healthz` response contract (stable)

```json
{
  "status": "ok",
  "engineVersion": "Stockfish 18",
  "arch": "x64",
  "pool": { "size": 1, "busy": 0 },
  "stats": { "searches": 0, "timeouts": 0, "restarts": 0, "illegal": 0 }
}
```

`status` is `"starting"` (HTTP 503) until every engine process has completed
its UCI handshake. `pool.busy` is computed from the real engine process states.
The backend parses this defensively: any other shape is treated as
`unavailable`, never as healthy.

### `/bestmove` request

```json
{
  "fen": "startpos fen string",
  "moves": ["e2e4", "e7e5"],
  "options": { "Threads": 8, "Hash": 2048, "MultiPV": 1, "Skill Level": 20, "UCI_LimitStrength": false },
  "clock": { "whiteMs": 300000, "blackMs": 300000, "whiteIncMs": 2000, "blackIncMs": 2000 },
  "movetimeMs": 3000,
  "timeoutMs": 30000,
  "requestId": "correlation-id"
}
```

The position is replayed with `chess.js` before and after the search: an illegal
input is rejected with `400`, and an illegal engine reply returns `500` rather
than being passed on.

## Environment (service side)

| Variable                   | Meaning                                  |
| -------------------------- | ---------------------------------------- |
| `PORT`                     | listen port (Cloud Run sets this)        |
| `STOCKFISH_PATH`           | engine binary path                       |
| `ENGINE_POOL_SIZE`         | engine processes (one search each)       |
| `ENGINE_THREADS`           | threads reported in benchmark hardware   |
| `ENGINE_ARCH`              | optional arch label for `/healthz`       |
| `PLAY_ENGINE_AUDIENCE`     | expected OIDC audience (the Run URL)     |
| `ALLOWED_SERVICE_ACCOUNTS` | allowlisted caller service accounts      |

If `PLAY_ENGINE_AUDIENCE` or `ALLOWED_SERVICE_ACCOUNTS` is unset the service
answers `401 not_configured` — it never falls back to open access.

---

# Production deployment to Google Cloud Run

All commands run on your workstation. Replace `PROJECT_ID` and `REGION`
(example uses `asia-southeast1`). **No real credential belongs in this repo.**

### 1. Enable the required Google APIs

```bash
gcloud config set project PROJECT_ID
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com
```

### 2. Create the Artifact Registry repository

```bash
gcloud artifacts repositories create nine64 \
  --repository-format=docker --location=REGION
```

### 3. Create the two service accounts

```bash
# identity the Cloud Run service runs as
gcloud iam service-accounts create play-engine-run
# identity the Nine64 backend uses to call the service
gcloud iam service-accounts create nine64-backend
```

### 4. Build the image — build context is `services/play-engine`

```bash
cd services/play-engine
gcloud builds submit . \
  --tag REGION-docker.pkg.dev/PROJECT_ID/nine64/play-engine:sf18
```

The build compiles Stockfish from source (10–20 minutes on the first run).

### 5. Deploy privately

```bash
gcloud run deploy play-engine \
  --image REGION-docker.pkg.dev/PROJECT_ID/nine64/play-engine:sf18 \
  --region REGION \
  --no-allow-unauthenticated \
  --service-account play-engine-run@PROJECT_ID.iam.gserviceaccount.com \
  --cpu 8 --memory 16Gi --cpu-boost \
  --concurrency 1 --min-instances 1 --max-instances 4 --timeout 120 \
  --set-env-vars ENGINE_POOL_SIZE=1,ENGINE_THREADS=8,ALLOWED_SERVICE_ACCOUNTS=nine64-backend@PROJECT_ID.iam.gserviceaccount.com
```

- `--no-allow-unauthenticated` keeps the service private.
- `--concurrency 1` matches "one search per engine process".
- `--max-instances` is the **hard cost blast-radius control**. Set it to a
  number you are willing to pay for; there is no in-app USD cap.

### 6. Retrieve the generated Cloud Run URL and set the audience

```bash
SERVICE_URL=$(gcloud run services describe play-engine \
  --region REGION --format='value(status.url)')
echo "$SERVICE_URL"

gcloud run services update play-engine --region REGION \
  --update-env-vars PLAY_ENGINE_AUDIENCE="$SERVICE_URL"
```

`PLAY_ENGINE_AUDIENCE` must be **exactly** the generated URL — the backend mints
ID tokens for that audience and the service rejects anything else.

### 7. Grant the backend permission to invoke

```bash
gcloud run services add-iam-policy-binding play-engine --region REGION \
  --member serviceAccount:nine64-backend@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/run.invoker
```

### 8. Obtain credentials for the Nine64 backend

```bash
gcloud iam service-accounts keys create key.json \
  --iam-account nine64-backend@PROJECT_ID.iam.gserviceaccount.com
```

Open `key.json`, copy the `client_email` and `private_key` values, then **delete
the file**. Never commit it.

### 9. Set the four Lovable server secrets

In the Nine64 project backend secrets (server-only, no `VITE_` variants, never
returned by any API, log, error page or admin screen):

| Secret                      | Value                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `PLAY_ENGINE_URL`           | the Cloud Run URL from step 6                                 |
| `PLAY_ENGINE_AUDIENCE`      | the same URL, byte-for-byte                                   |
| `PLAY_ENGINE_SA_EMAIL`      | `nine64-backend@PROJECT_ID.iam.gserviceaccount.com`           |
| `PLAY_ENGINE_SA_PRIVATE_KEY`| the `private_key` value (keep the `\n` escapes)               |

### 10. Benchmark procedure (real runs only)

Open `/admin/engine` as an admin with MFA:

1. The **Cloud Engine** card must show `healthy`, a real engine version and the
   pool size/busy counts. `not_configured` means the secrets are not loaded.
2. In **Benchmarks**, run each kind with a reason (≥10 characters):
   `bench` → `speedtest` → `epd` → `positions`.
3. Every run stores the reported engine version, hardware, nodes/NPS/depth/score
   in `engine_benchmarks`. No value is ever typed in by hand.

### 11. Publish gate

Publishing the Titan profile is blocked until:

- a `bench` run exists and passed,
- an `epd` run exists and passed,
- no stored run reports `illegalMoves > 0`.

Set `Threads` to the vCPUs you actually deployed, `Hash` inside the memory you
actually granted, `Move Overhead` including real network latency, and enable
Syzygy only when the tablebase files are truly mounted. Publish with a reason;
use **Emergency disable** or rollback if anything regresses.

No NPS, Elo or "production ready" claim may be made before a real deployment has
produced these benchmark rows.
