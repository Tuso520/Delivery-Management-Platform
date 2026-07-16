#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="delivery-platform-seed-contract-test"
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"

random_secret() {
  openssl rand -hex 24
}

cleanup() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
}

finish() {
  local status="$?"
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --all || true
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs --no-color --tail=120 mysql || true
  fi
  cleanup
  exit "$status"
}
trap finish EXIT

export MYSQL_ROOT_PASSWORD="$(random_secret)"
export MYSQL_DATABASE="delivery_platform"
export MYSQL_USER="delivery_user"
export MYSQL_USER_PASSWORD="$(random_secret)"
export MYSQL_PORT="${MYSQL_PORT:-23306}"
export REDIS_PORT="${REDIS_PORT:-26379}"
export MINIO_ROOT_USER="contract-minio"
export MINIO_ROOT_PASSWORD="$(random_secret)"
export MINIO_BUCKET="delivery-contract"
export MINIO_API_PORT="${MINIO_API_PORT:-29000}"
export MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-29001}"
export BACKEND_PORT="${BACKEND_PORT:-23000}"
export FRONTEND_PORT="${FRONTEND_PORT:-28080}"
export REDIS_PASSWORD="$(random_secret)"
export JWT_SECRET="$(random_secret)"
export SEED_ADMIN_PASSWORD="$(random_secret)"
export SEED_DEFAULT_PASSWORD="$(random_secret)"
export INTEGRATION_SECRET_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export RELEASE_ID="seed-contract-runtime"

cd "$ROOT_DIR"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" build backend-migrate
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" run --rm backend-migrate
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" run --rm --no-deps \
  -e DEPLOY_ENV=test \
  -e CONFIRM_TEST_DATA_SEED=YES \
  -e TEST_DATA_MIN_COUNT=20 \
  -e TEST_DATA_SEED=contract-seed \
  backend-migrate \
  ./node_modules/.bin/ts-node --transpile-only prisma/seed-test-data.ts
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" run --rm --no-deps \
  -e DEPLOY_ENV=test \
  -e TEST_DATA_MIN_COUNT=20 \
  backend-migrate \
  ./node_modules/.bin/ts-node --transpile-only prisma/verify-test-data.ts

printf 'test data runtime verification passed\n'
