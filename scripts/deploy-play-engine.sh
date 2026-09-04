#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-chess-nine64}"
REGION="${REGION:-asia-southeast1}"
REPOSITORY="${REPOSITORY:-nine64}"
SERVICE="${SERVICE:-play-engine-v2}"
MAX_INSTANCES="${MAX_INSTANCES:-4}"
RUN_SERVICE_ACCOUNT="${RUN_SERVICE_ACCOUNT:-play-engine-run@$PROJECT_ID.iam.gserviceaccount.com}"
CALLER_SERVICE_ACCOUNT="${CALLER_SERVICE_ACCOUNT:-nine64-backend@$PROJECT_ID.iam.gserviceaccount.com}"
SUITE="titan-v6-4"

command -v gcloud >/dev/null || { echo "gcloud is required" >&2; exit 1; }
sha="$(git rev-parse --short=12 HEAD)"
build_id="play-engine-titan-v6.4-$sha"
image="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/play-engine:$SUITE"

gcloud artifacts repositories describe "$REPOSITORY" --project "$PROJECT_ID" --location "$REGION" >/dev/null
gcloud builds submit services/play-engine \
  --project "$PROJECT_ID" \
  --config services/play-engine/cloudbuild.yaml \
  --substitutions "_IMAGE=$image,_SERVICE_BUILD_ID=$build_id"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" --image "$image" \
  --no-allow-unauthenticated --service-account "$RUN_SERVICE_ACCOUNT" \
  --cpu 8 --memory 16Gi --cpu-boost --concurrency 1 --min-instances 1 \
  --max-instances "$MAX_INSTANCES" --timeout 120 \
  --set-env-vars "ENGINE_POOL_SIZE=1,ENGINE_THREADS=8,ALLOWED_SERVICE_ACCOUNTS=$CALLER_SERVICE_ACCOUNT"

service_url="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
test -n "$service_url"
gcloud run services update "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --update-env-vars "PLAY_ENGINE_AUDIENCE=$service_url" >/dev/null
gcloud run services add-iam-policy-binding "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --member "serviceAccount:$CALLER_SERVICE_ACCOUNT" --role roles/run.invoker >/dev/null
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --format='value(status.conditions[0].status)' | grep -qx True

PLAY_ENGINE_URL="$service_url" EXPECTED_SUITE="$SUITE" EXPECTED_SERVICE_VERSION="play-engine-titan-v6.4" \
  ./scripts/verify-play-engine.sh