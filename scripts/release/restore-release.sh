#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/delivery-platform}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-$APP_ROOT/config/runtime.env}"
APP_COMPOSE_FILE="${APP_COMPOSE_FILE:-$APP_ROOT/control/app.yml}"
DATA_COMPOSE_FILE="${DATA_COMPOSE_FILE:-$APP_ROOT/control/data.yml}"
DEPLOY_ENV="${DEPLOY_ENV:-}"
DEPLOY_TARGET_ID="${DEPLOY_TARGET_ID:-}"
INTERNAL_ORIGIN="${INTERNAL_ORIGIN:-}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
BACKUP_PATH="${BACKUP_PATH:-}"
CONFIRM_DATA_RESTORE="${CONFIRM_DATA_RESTORE:-}"
NGINX_CONTROL='/usr/local/sbin/dmp-nginx-control'

STATE_DIR=""
BACKUPS_DIR=""
RELEASES_DIR=""
SOURCE_MANIFEST=""
SOURCE_ENV=""
SOURCE_RELEASE_ID=""
SOURCE_SHORT_RELEASE_ID=""
MIGRATION_IMAGE=""
RESTORE_STARTED="NO"
RESTORE_SUCCEEDED="NO"

log() { printf '[restore] %s\n' "$*"; }
warn() { printf '[restore][warn] %s\n' "$*" >&2; }
die() { printf '[restore][error] %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

canonical_file() {
  local value="$1"
  [ -f "$value" ] && [ ! -L "$value" ] || return 1
  realpath -e -- "$value"
}

canonical_directory() {
  local value="$1"
  [ -d "$value" ] && [ ! -L "$value" ] || return 1
  realpath -e -- "$value"
}

initialize() {
  local canonical_root canonical_backup
  case "$DEPLOY_ENV" in
    test|production) ;;
    *) die 'DEPLOY_ENV must be test or production' ;;
  esac
  [[ "$DEPLOY_TARGET_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$ ]] || \
    die 'DEPLOY_TARGET_ID must be an explicit stable identifier'
  [ "$CONFIRM_DATA_RESTORE" = 'RESTORE' ] || \
    die 'set CONFIRM_DATA_RESTORE=RESTORE to acknowledge the destructive paired restore'

  canonical_root="$(canonical_directory "$APP_ROOT")" || die 'APP_ROOT is missing or unsafe'
  APP_ROOT="$canonical_root"
  STATE_DIR="$APP_ROOT/state"
  BACKUPS_DIR="$APP_ROOT/backups"
  RELEASES_DIR="$APP_ROOT/releases"
  [ -f "$STATE_DIR/target-id" ] && [ ! -L "$STATE_DIR/target-id" ] || \
    die 'server target identity file is missing or unsafe'
  [ "$(tr -d '\r\n' < "$STATE_DIR/target-id")" = "$DEPLOY_TARGET_ID" ] || \
    die 'server target identity does not match DEPLOY_TARGET_ID'

  RUNTIME_ENV_FILE="$(canonical_file "$RUNTIME_ENV_FILE")" || die 'runtime env file is missing or unsafe'
  APP_COMPOSE_FILE="$(canonical_file "$APP_COMPOSE_FILE")" || die 'application Compose file is missing or unsafe'
  DATA_COMPOSE_FILE="$(canonical_file "$DATA_COMPOSE_FILE")" || die 'data Compose file is missing or unsafe'
  [ "$(stat -c '%a' "$RUNTIME_ENV_FILE")" = '600' ] || die 'runtime env file permissions must be 0600'

  canonical_backup="$(canonical_directory "$BACKUP_PATH")" || die 'BACKUP_PATH is missing or unsafe'
  [ "$(dirname -- "$canonical_backup")" = "$BACKUPS_DIR" ] || \
    die 'BACKUP_PATH must be a direct child of the server backups directory'
  BACKUP_PATH="$canonical_backup"
  SOURCE_MANIFEST="$(canonical_file "$BACKUP_PATH/source-release-manifest.json")" || \
    die 'backup has no restorable v2 source release; legacy backups require the legacy recovery procedure'
  SOURCE_ENV="$(canonical_file "$BACKUP_PATH/source-release.env")" || \
    die 'backup source release environment is missing or unsafe'
  canonical_file "$BACKUP_PATH/mysql.sql.gz" >/dev/null || die 'MySQL backup is missing or unsafe'
  canonical_file "$BACKUP_PATH/minio.tar.gz" >/dev/null || die 'MinIO backup is missing or unsafe'
  canonical_file "$BACKUP_PATH/checksums.sha256" >/dev/null || die 'backup checksums are missing or unsafe'

  (
    cd "$BACKUP_PATH"
    sha256sum --check --strict checksums.sha256 >/dev/null
  ) || die 'backup checksum verification failed'
  gzip -t "$BACKUP_PATH/mysql.sql.gz" || die 'MySQL backup is corrupt'
  tar -tzf "$BACKUP_PATH/minio.tar.gz" >/dev/null || die 'MinIO backup is corrupt'

  SOURCE_RELEASE_ID="$(jq -er '.releaseId' "$SOURCE_MANIFEST")" || die 'source releaseId is missing'
  SOURCE_SHORT_RELEASE_ID="$(jq -er '.shortReleaseId' "$SOURCE_MANIFEST")" || die 'source shortReleaseId is missing'
  [[ "$SOURCE_RELEASE_ID" =~ ^[0-9a-f]{40}$ ]] || die 'source releaseId is invalid'
  [ "$SOURCE_SHORT_RELEASE_ID" = "${SOURCE_RELEASE_ID:0:12}" ] || die 'source release identity is inconsistent'
  [ -d "$RELEASES_DIR/$SOURCE_RELEASE_ID/frontend" ] && \
    [ ! -L "$RELEASES_DIR/$SOURCE_RELEASE_ID" ] || die 'source frontend release is unavailable or unsafe'
  [ "$(jq -er '.releaseId' "$RELEASES_DIR/$SOURCE_RELEASE_ID/frontend/build-info.json")" = "$SOURCE_SHORT_RELEASE_ID" ] || \
    die 'source frontend build identity is inconsistent'

  MIGRATION_IMAGE="$(awk -F= '$1 == "MIGRATION_IMAGE" { print substr($0, index($0, "=") + 1) }' "$SOURCE_ENV")"
  [[ "$MIGRATION_IMAGE" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_./-]+@sha256:[0-9a-f]{64}$ ]] || \
    die 'source migration image is not an immutable GHCR digest reference'
}

data_compose() {
  docker compose --env-file "$RUNTIME_ENV_FILE" -f "$DATA_COMPOSE_FILE" "$@"
}

app_compose_with() {
  local release_env="$1"
  shift
  docker compose --env-file "$RUNTIME_ENV_FILE" --env-file "$release_env" \
    -f "$APP_COMPOSE_FILE" "$@"
}

wait_healthy() {
  local service="$1" attempts=60 container_id status
  container_id="$(data_compose ps -q "$service")"
  [ -n "$container_id" ] || return 1
  while [ "$attempts" -gt 0 ]; do
    status="$(docker inspect "$container_id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    [ "$status" = 'healthy' ] && return 0
    attempts=$((attempts - 1))
    sleep 3
  done
  return 1
}

restore_storage() {
  local configured_minio_volume configured_mysql_volume
  configured_minio_volume="$(data_compose config --format json | jq -er '.volumes.minio_data.name')"
  configured_mysql_volume="$(data_compose config --format json | jq -er '.volumes.mysql_data.name')"
  [[ "$configured_minio_volume" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]+$ ]] || die 'declared MinIO volume name is unsafe'
  [[ "$configured_mysql_volume" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]+$ ]] || die 'declared MySQL volume name is unsafe'
  docker volume inspect "$configured_minio_volume" >/dev/null || die 'declared MinIO volume does not exist'
  docker volume inspect "$configured_mysql_volume" >/dev/null || die 'declared MySQL volume does not exist'

  log 'stopping application and data services for a paired restore'
  if [ -f "$STATE_DIR/current-release.env" ] && [ ! -L "$STATE_DIR/current-release.env" ]; then
    app_compose_with "$STATE_DIR/current-release.env" stop file-worker outbox-worker backend
  fi
  data_compose stop redis minio mysql
  RESTORE_STARTED='YES'
  printf '%s\n' "$BACKUP_PATH" > "$STATE_DIR/data-restore-incomplete"

  log 'restoring the validated MinIO volume snapshot'
  docker pull "$MIGRATION_IMAGE"
  docker run --rm --user 0:0 --network none --read-only \
    -v "$configured_minio_volume:/target" -v "$BACKUP_PATH:/backup:ro" \
    --entrypoint sh "$MIGRATION_IMAGE" -ec \
    'find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /target -xzf /backup/minio.tar.gz'

  log 'restoring the validated MySQL logical backup'
  data_compose up -d mysql
  wait_healthy mysql || die 'MySQL did not become healthy for restore'
  data_compose exec -T mysql sh -ec \
    'case "$MYSQL_DATABASE" in (""|*[!A-Za-z0-9_]*) exit 64;; esac; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"'
  gzip -dc "$BACKUP_PATH/mysql.sql.gz" | data_compose exec -T mysql sh -ec \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"'

  data_compose up -d redis minio
  wait_healthy redis || die 'Redis did not become healthy after restore'
  wait_healthy minio || die 'MinIO did not become healthy after restore'
  data_compose exec -T redis sh -ec 'redis-cli -a "$REDIS_PASSWORD" FLUSHALL >/dev/null'
  data_compose run --rm minio-init
}

wait_backend_ready() {
  local backend_id host_port attempts=60
  backend_id="$(app_compose_with "$SOURCE_ENV" ps -q backend)"
  [ -n "$backend_id" ] || return 1
  host_port="$(docker port "$backend_id" 3000/tcp | awk -F: 'NR == 1 {print $NF}')"
  [[ "$host_port" =~ ^[0-9]+$ ]] || return 1
  while [ "$attempts" -gt 0 ]; do
    curl -fsS --connect-timeout 3 --max-time 10 "http://127.0.0.1:$host_port/api/v1/ready" >/dev/null && return 0
    attempts=$((attempts - 1))
    sleep 3
  done
  return 1
}

check_workers_stable() {
  local service first_id second_id first_restarts second_restarts
  for service in file-worker outbox-worker; do
    first_id="$(app_compose_with "$SOURCE_ENV" ps -q "$service")"
    [ -n "$first_id" ] || die "$service did not start during restore"
    first_restarts="$(docker inspect "$first_id" --format '{{.RestartCount}}')"
    sleep 5
    second_id="$(app_compose_with "$SOURCE_ENV" ps -q "$service")"
    [ -n "$second_id" ] || die "$service disappeared during restore"
    second_restarts="$(docker inspect "$second_id" --format '{{.RestartCount}}')"
    [ "$first_id" = "$second_id" ] && [ "$first_restarts" = "$second_restarts" ] || \
      die "$service is not stable after restore"
  done
}

switch_frontend() {
  local target="releases/$SOURCE_RELEASE_ID"
  local next="$APP_ROOT/.current-restore-${SOURCE_RELEASE_ID}-$$"
  ln -s "$target" "$next"
  sudo -n "$NGINX_CONTROL" check
  mv -Tf "$next" "$APP_ROOT/current"
  sudo -n "$NGINX_CONTROL" reload
}

check_origin() {
  local name="$1" origin="${2%/}" release
  [ -n "$origin" ] || die "$name origin is required"
  curl -fsS --connect-timeout 5 --max-time 20 "$origin/api/v1/ready" >/dev/null || \
    die "$name API readiness check failed: $origin"
  release="$(curl -fsS --connect-timeout 5 --max-time 20 -H 'Cache-Control: no-cache' "$origin/build-info.json" | jq -er '.releaseId')" || \
    die "$name frontend release check failed: $origin"
  [ "$release" = "$SOURCE_SHORT_RELEASE_ID" ] || die "$name frontend release mismatch: $origin"
}

publish_state() {
  if [ -f "$STATE_DIR/current-release-manifest.json" ] && [ ! -L "$STATE_DIR/current-release-manifest.json" ]; then
    cp -- "$STATE_DIR/current-release-manifest.json" "$STATE_DIR/previous-release-manifest.json.part"
    mv -f "$STATE_DIR/previous-release-manifest.json.part" "$STATE_DIR/previous-release-manifest.json"
  fi
  cp -- "$SOURCE_MANIFEST" "$STATE_DIR/current-release-manifest.json.part"
  mv -f "$STATE_DIR/current-release-manifest.json.part" "$STATE_DIR/current-release-manifest.json"
  cp -- "$SOURCE_ENV" "$STATE_DIR/current-release.env.part"
  mv -f "$STATE_DIR/current-release.env.part" "$STATE_DIR/current-release.env"
  rm -f "$STATE_DIR/failed-release" "$STATE_DIR/data-restore-incomplete"
}

on_exit() {
  local status="$?"
  trap - EXIT
  if [ "$RESTORE_STARTED" = 'YES' ] && [ "$RESTORE_SUCCEEDED" != 'YES' ]; then
    data_compose up -d mysql redis minio >/dev/null 2>&1 || true
    warn "paired restore did not complete; leave $STATE_DIR/data-restore-incomplete in place and do not start the application"
  fi
  exit "$status"
}

main() {
  trap on_exit EXIT
  for command in docker jq sha256sum tar gzip curl flock realpath stat sudo awk; do
    require_command "$command"
  done
  initialize
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || die 'another deployment or restore is already active'
  app_compose_with "$SOURCE_ENV" config -q
  data_compose config -q
  restore_storage
  log "starting source release $SOURCE_RELEASE_ID"
  app_compose_with "$SOURCE_ENV" up -d --no-deps --force-recreate backend
  wait_backend_ready || die 'restored backend readiness check failed'
  app_compose_with "$SOURCE_ENV" up -d --no-deps --force-recreate file-worker outbox-worker
  check_workers_stable
  switch_frontend
  check_origin internal "$INTERNAL_ORIGIN"
  check_origin public "$PUBLIC_ORIGIN"
  publish_state
  RESTORE_SUCCEEDED='YES'
  log "paired release restore completed: $SOURCE_RELEASE_ID"
}

main "$@"
