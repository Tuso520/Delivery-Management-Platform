#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/delivery-platform}"
DEPLOY_ENV="${DEPLOY_ENV:-}"
DEPLOY_TARGET_ID="${DEPLOY_TARGET_ID:-}"
INTERNAL_ORIGIN="${INTERNAL_ORIGIN:-}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-$APP_ROOT/config/runtime.env}"
APP_COMPOSE_FILE="${APP_COMPOSE_FILE:-}"
DATA_COMPOSE_FILE="${DATA_COMPOSE_FILE:-}"
NGINX_CONTROL='/usr/local/sbin/dmp-nginx-control'
PREFLIGHT_RELEASE_ENV=""

log() { printf '[server-preflight] %s\n' "$*"; }
die() { printf '[server-preflight][error] %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [ -n "$PREFLIGHT_RELEASE_ENV" ]; then
    rm -f -- "$PREFLIGHT_RELEASE_ENV"
  fi
}

trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

require_file() {
  [ -f "$1" ] && [ ! -L "$1" ] || die "required regular file is missing or unsafe: $1"
}

require_directory() {
  [ -d "$1" ] && [ ! -L "$1" ] || die "required directory is missing or unsafe: $1"
}

require_mode_owner() {
  local path="$1"
  local expected_mode="$2"
  local expected_owner="$3"
  [ "$(stat -c '%a' "$path")" = "$expected_mode" ] || \
    die "unexpected permissions for $path; expected $expected_mode"
  [ "$(stat -c '%U:%G' "$path")" = "$expected_owner" ] || \
    die "unexpected owner for $path; expected $expected_owner"
}

env_value() {
  local key="$1"
  local count value
  count="$(grep -c "^${key}=" "$RUNTIME_ENV_FILE" || true)"
  [ "$count" = '1' ] || die "runtime configuration must define $key exactly once"
  value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$RUNTIME_ENV_FILE")"
  [ -n "$value" ] || die "runtime configuration value is empty: $key"
  printf '%s' "$value"
}

check_origin() {
  local name="$1"
  local origin="${2%/}"
  curl -fsS --connect-timeout 5 --max-time 20 "$origin/api/v1/ready" >/dev/null || \
    die "$name origin is not ready"
}

main() {
  case "$DEPLOY_ENV" in
    test|production) ;;
    *) die 'DEPLOY_ENV must be test or production' ;;
  esac
  [[ "$DEPLOY_TARGET_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$ ]] || \
    die 'DEPLOY_TARGET_ID is invalid'
  [[ "$INTERNAL_ORIGIN" =~ ^https?://[^/]+/?$ ]] || die 'INTERNAL_ORIGIN must be an origin'
  [[ "$PUBLIC_ORIGIN" =~ ^https://[^/]+/?$ ]] || die 'PUBLIC_ORIGIN must be an HTTPS origin'

  for command in awk base64 curl df docker flock grep gzip id jq mktemp realpath rm sed sha256sum stat sudo tar tr wc; do
    require_command "$command"
  done
  [ "$(id -un)" = 'dmpdeploy' ] || die 'preflight must run as dmpdeploy'
  docker info >/dev/null 2>&1 || die 'dmpdeploy cannot access Docker Engine'
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is unavailable'

  require_directory "$APP_ROOT"
  APP_ROOT="$(realpath -e -- "$APP_ROOT")"
  local owner
  owner="$(id -un):$(id -gn)"
  require_mode_owner "$APP_ROOT" 751 "$owner"
  for directory in config control incoming backups state; do
    require_directory "$APP_ROOT/$directory"
    require_mode_owner "$APP_ROOT/$directory" 700 "$owner"
  done
  require_directory "$APP_ROOT/releases"
  require_mode_owner "$APP_ROOT/releases" 711 "$owner"

  require_file "$APP_ROOT/state/target-id"
  require_mode_owner "$APP_ROOT/state/target-id" 600 "$owner"
  [ "$(tr -d '\r\n' < "$APP_ROOT/state/target-id")" = "$DEPLOY_TARGET_ID" ] || \
    die 'server target identity does not match DEPLOY_TARGET_ID'

  require_file "$RUNTIME_ENV_FILE"
  require_mode_owner "$RUNTIME_ENV_FILE" 600 "$owner"
  if grep -q '<[^>]*>' "$RUNTIME_ENV_FILE"; then
    die 'runtime configuration still contains placeholders'
  fi

  local required_keys=(
    DATA_PROJECT_NAME APP_PROJECT_NAME DATA_NETWORK_NAME
    MYSQL_VOLUME_NAME REDIS_VOLUME_NAME MINIO_VOLUME_NAME
    MYSQL_IMAGE MYSQL_DATABASE MYSQL_USER MYSQL_ROOT_PASSWORD MYSQL_USER_PASSWORD MYSQL_HOST_PORT
    REDIS_IMAGE REDIS_PASSWORD REDIS_HOST_PORT MINIO_IMAGE MINIO_MC_IMAGE MINIO_ROOT_USER
    MINIO_ROOT_PASSWORD MINIO_BUCKET MINIO_API_HOST_PORT MINIO_CONSOLE_HOST_PORT
    BACKEND_HOST_PORT CORS_ORIGIN JWT_SECRET
    INTEGRATION_SECRET_ENCRYPTION_KEY EXPECTED_MIGRATION_COUNT
    INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME SEED_RESET_EXISTING_USER_PASSWORDS SEED_INCLUDE_DEMO_DATA
    SEED_ADMIN_PASSWORD SEED_DEFAULT_PASSWORD
  )
  local key
  for key in "${required_keys[@]}"; do
    env_value "$key" >/dev/null
  done

  [ "$(env_value DATA_PROJECT_NAME)" = "delivery-platform-${DEPLOY_ENV}-data" ] || \
    die 'DATA_PROJECT_NAME does not match DEPLOY_ENV'
  [ "$(env_value APP_PROJECT_NAME)" = "delivery-platform-${DEPLOY_ENV}-app" ] || \
    die 'APP_PROJECT_NAME does not match DEPLOY_ENV'
  [ "$(env_value DATA_NETWORK_NAME)" = "delivery-platform-${DEPLOY_ENV}-data" ] || \
    die 'DATA_NETWORK_NAME does not match DEPLOY_ENV'
  [ "$(env_value EXPECTED_MIGRATION_COUNT)" = '46' ] || \
    die 'EXPECTED_MIGRATION_COUNT must be 46'
  [ "$(env_value SEED_RESET_EXISTING_USER_PASSWORDS)" = 'false' ] || \
    die 'SEED_RESET_EXISTING_USER_PASSWORDS must remain false during takeover'
  [ "$(env_value SEED_INCLUDE_DEMO_DATA)" = 'false' ] || \
    die 'SEED_INCLUDE_DEMO_DATA must remain false on servers'
  [ "${PUBLIC_ORIGIN%/}" = "$(env_value CORS_ORIGIN | sed 's:/*$::')" ] || \
    die 'CORS_ORIGIN must match PUBLIC_ORIGIN'

  local port_value
  declare -A seen_ports=()
  for key in MYSQL_HOST_PORT REDIS_HOST_PORT MINIO_API_HOST_PORT MINIO_CONSOLE_HOST_PORT BACKEND_HOST_PORT; do
    port_value="$(env_value "$key")"
    [[ "$port_value" =~ ^[0-9]+$ ]] && [ "$port_value" -ge 1 ] && [ "$port_value" -le 65535 ] || \
      die "$key must be a valid TCP port"
    [ -z "${seen_ports[$port_value]:-}" ] || die "host port is configured more than once: $key"
    seen_ports[$port_value]="$key"
  done

  local encryption_key_bytes
  if ! encryption_key_bytes="$(printf '%s' "$(env_value INTEGRATION_SECRET_ENCRYPTION_KEY)" | \
    base64 --decode 2>/dev/null | wc -c | tr -d ' ')"; then
    die 'INTEGRATION_SECRET_ENCRYPTION_KEY is not valid Base64'
  fi
  [ "$encryption_key_bytes" = '32' ] || \
    die 'INTEGRATION_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes'

  local volume_name
  for key in MYSQL_VOLUME_NAME REDIS_VOLUME_NAME MINIO_VOLUME_NAME; do
    volume_name="$(env_value "$key")"
    [[ "$volume_name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]+$ ]] || \
      die "$key is not a safe Docker volume name"
    docker volume inspect "$volume_name" >/dev/null 2>&1 || \
      die "declared existing Docker volume was not found: $key"
  done

  require_file "$APP_COMPOSE_FILE"
  require_file "$DATA_COMPOSE_FILE"
  require_file "$NGINX_CONTROL"
  require_mode_owner "$NGINX_CONTROL" 755 'root:root'
  docker compose --env-file "$RUNTIME_ENV_FILE" -f "$DATA_COMPOSE_FILE" config -q

  umask 077
  PREFLIGHT_RELEASE_ENV="$(mktemp)"
  {
    printf 'RELEASE_ID=000000000000\n'
    printf 'BACKEND_IMAGE=ghcr.io/delivery-platform/preflight@sha256:%064d\n' 0
    printf 'MIGRATION_IMAGE=ghcr.io/delivery-platform/preflight@sha256:%064d\n' 0
  } > "$PREFLIGHT_RELEASE_ENV"
  docker compose --env-file "$RUNTIME_ENV_FILE" --env-file "$PREFLIGHT_RELEASE_ENV" \
    -f "$APP_COMPOSE_FILE" config -q

  sudo -n "$NGINX_CONTROL" check >/dev/null
  check_origin internal "$INTERNAL_ORIGIN"
  check_origin public "$PUBLIC_ORIGIN"

  local available_bytes
  available_bytes="$(df -PB1 "$APP_ROOT" | awk 'NR == 2 { print $4 }')"
  [[ "$available_bytes" =~ ^[0-9]+$ ]] || die 'cannot determine available disk space'
  log "available bytes on application filesystem: $available_bytes"
  log "PASS environment=$DEPLOY_ENV target identity matched"
}

main "$@"
