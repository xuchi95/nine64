#!/usr/bin/env bash
set -euo pipefail
command -v docker >/dev/null || { echo "SKIP: Docker is unavailable"; exit 0; }

image="nine64/play-engine:smoke"
name="nine64-play-engine-smoke-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker build --build-arg SERVICE_BUILD_ID=play-engine-titan-v6.4-smoke -t "$image" .
docker run -d --name "$name" -p 127.0.0.1::8080 "$image" >/dev/null
port="$(docker port "$name" 8080/tcp | awk -F: '{print $NF}')"
for _ in $(seq 1 120); do
  payload="$(curl -s "http://127.0.0.1:$port/health" || true)"
  if HEALTH_PAYLOAD="$payload" node -e 'const h=JSON.parse(process.env.HEALTH_PAYLOAD||"{}"); process.exit(h.status==="ok"&&/stockfish\\s*18/i.test(h.engineVersion||"")?0:1)' 2>/dev/null; then
    echo "Docker smoke passed"
    exit 0
  fi
  sleep 2
done
echo "Docker smoke failed" >&2
docker logs "$name" >&2
exit 1