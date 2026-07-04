#!/bin/sh
set -eu

BASE_URL="${BASE_URL:-http://delivery-platform.localhost:${FRONTEND_PORT:-18080}}"
API_URL="${API_URL:-${BASE_URL}/api/v1/health}"

check_url() {
  name="$1"
  url="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" >/dev/null
  else
    wget -q --spider "$url" >/dev/null
  fi
  echo "[healthcheck] ${name}: ok"
}

check_url "frontend" "${BASE_URL}/health"
check_url "backend" "${API_URL}"
check_url "build-info" "${BASE_URL}/build-info.json"

echo "[healthcheck] all checks passed: ${BASE_URL}"
