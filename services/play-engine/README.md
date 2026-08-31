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

| Method | Path         | Purpose                                        |
| ------ | ------------ | ---------------------------------------------- |
| GET    | `/healthz`   | readiness + engine version + pool stats (open)  |
| POST   | `/bestmove`  | one search for a validated position (OIDC only) |
| POST   | `/benchmark` | `bench`, `speedtest`, `epd`, `positions` (OIDC) |

`/bestmove` request:

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

## Authentication

Deploy as a **private** Cloud Run service. Every request must carry
`Authorization: Bearer <Google ID token>` with:

- `PLAY_ENGINE_AUDIENCE` — the audience the backend mints tokens for
- `ALLOWED_SERVICE_ACCOUNTS` — comma-separated allowlist of caller emails

If either is unset the service answers `401 not_configured` — it never falls
back to open access.

## Environment

| Variable                   | Meaning                                  |
| -------------------------- | ---------------------------------------- |
| `PORT`                     | listen port (Cloud Run sets this)        |
| `STOCKFISH_PATH`           | engine binary path                       |
| `ENGINE_POOL_SIZE`         | engine processes (one search each)       |
| `ENGINE_THREADS`           | reported in benchmark hardware detail    |
| `PLAY_ENGINE_AUDIENCE`     | expected OIDC audience                   |
| `ALLOWED_SERVICE_ACCOUNTS` | allowlisted caller service accounts      |

## Manual GCP steps (cannot be done from Lovable)

1. Build and push: `gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/nine64/play-engine`.
2. Deploy privately: `gcloud run deploy play-engine --no-allow-unauthenticated
   --cpu 8 --memory 16Gi --concurrency 1 --min-instances 1 --max-instances N
   --set-env-vars PLAY_ENGINE_AUDIENCE=...,ALLOWED_SERVICE_ACCOUNTS=...`.
3. Grant `roles/run.invoker` to the Nine64 backend service account.
4. Set the backend secrets `PLAY_ENGINE_URL`, `PLAY_ENGINE_AUDIENCE`,
   `PLAY_ENGINE_SA_EMAIL`, `PLAY_ENGINE_SA_PRIVATE_KEY`.
5. Run the benchmarks from `/admin/engine` and publish the Titan profile only
   after they pass. No NPS or Elo figure is claimed until a real run is stored.

Set `Threads` to the vCPU count you actually deployed and `Hash` within the
memory you actually granted; `SyzygyPath`/`SyzygyProbeLimit` only when the
tablebase files are really mounted.
