#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/delivery-platform}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-$APP_ROOT/config/runtime.env}"
APP_COMPOSE_FILE="${APP_COMPOSE_FILE:-$APP_ROOT/control/app.yml}"
DATA_COMPOSE_FILE="${DATA_COMPOSE_FILE:-$APP_ROOT/control/data.yml}"
RELEASE_MANIFEST="${RELEASE_MANIFEST:-}"
FRONTEND_BUNDLE="${FRONTEND_BUNDLE:-}"
DEPLOY_ENV="${DEPLOY_ENV:-}"
DEPLOY_TARGET_ID="${DEPLOY_TARGET_ID:-}"
INTERNAL_ORIGIN="${INTERNAL_ORIGIN:-}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
RESET_TEST_DATA="${RESET_TEST_DATA:-false}"
NGINX_CONTROL='/usr/local/sbin/dmp-nginx-control'

STATE_DIR=""
RELEASES_DIR=""
BACKUPS_DIR=""
LOCK_FILE=""
RELEASE_ID=""
SHORT_RELEASE_ID=""
BACKEND_IMAGE=""
MIGRATION_IMAGE=""
FRONTEND_SHA256=""
FRONTEND_BYTES=""
EXPECTED_MIGRATION_COUNT=""
RELEASE_ENV_FILE=""
MINIO_STOPPED="NO"
APPLICATION_STOPPED="NO"
DATABASE_MUTATION_STARTED="NO"
DEPLOY_ACTIVE="NO"
DEPLOY_SUCCEEDED="NO"
PULL_PID=""

log() { printf '[release] %s\n' "$*"; }
warn() { printf '[release][warn] %s\n' "$*" >&2; }
die() { printf '[release][error] %s\n' "$*" >&2; exit 1; }

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

initialize_paths() {
  local canonical_root
  case "$DEPLOY_ENV" in
    test|production) ;;
    *) die 'DEPLOY_ENV must be test or production' ;;
  esac
  [[ "$DEPLOY_TARGET_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$ ]] || \
    die 'DEPLOY_TARGET_ID must be an explicit stable identifier'
  [ -d "$APP_ROOT" ] && [ ! -L "$APP_ROOT" ] || die "unsafe APP_ROOT: $APP_ROOT"
  canonical_root="$(canonical_directory "$APP_ROOT")" || die 'APP_ROOT cannot be resolved'
  APP_ROOT="$canonical_root"
  STATE_DIR="$APP_ROOT/state"
  RELEASES_DIR="$APP_ROOT/releases"
  BACKUPS_DIR="$APP_ROOT/backups"
  LOCK_FILE="$STATE_DIR/deploy.lock"
  install -d -m 700 "$STATE_DIR" "$BACKUPS_DIR"
  # Nginx workers only need to traverse this directory to the immutable
  # frontend selected by `current`; listing releases remains disabled.
  install -d -m 711 "$RELEASES_DIR"

  [ -f "$STATE_DIR/target-id" ] && [ ! -L "$STATE_DIR/target-id" ] || \
    die 'server target identity file is missing or unsafe'
  [ "$(tr -d '\r\n' < "$STATE_DIR/target-id")" = "$DEPLOY_TARGET_ID" ] || \
    die 'server target identity does not match DEPLOY_TARGET_ID'

  RUNTIME_ENV_FILE="$(canonical_file "$RUNTIME_ENV_FILE")" || die 'runtime env file is missing or unsafe'
  APP_COMPOSE_FILE="$(canonical_file "$APP_COMPOSE_FILE")" || die 'application Compose file is missing or unsafe'
  DATA_COMPOSE_FILE="$(canonical_file "$DATA_COMPOSE_FILE")" || die 'data Compose file is missing or unsafe'
  [ "$(stat -c '%a' "$RUNTIME_ENV_FILE")" = '600' ] || die 'runtime env file permissions must be 0600'
}

acquire_lock() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || die 'another deployment is already active'
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

on_signal() {
  local signal="$1"
  local status="$2"
  warn "received $signal; cancelling the active deployment"
  if [[ "$PULL_PID" =~ ^[1-9][0-9]*$ ]] && kill -0 "$PULL_PID" 2>/dev/null; then
    kill -TERM "$PULL_PID" 2>/dev/null || true
    wait "$PULL_PID" 2>/dev/null || true
  fi
  exit "$status"
}

pull_application_images() {
  local attempt pull_status
  for attempt in 1 2 3; do
    timeout --foreground 20m \
      docker compose --env-file "$RUNTIME_ENV_FILE" --env-file "$RELEASE_ENV_FILE" \
        -f "$APP_COMPOSE_FILE" pull \
        backend backend-migrate file-worker outbox-worker &
    PULL_PID="$!"
    if wait "$PULL_PID"; then
      pull_status=0
    else
      pull_status="$?"
    fi
    PULL_PID=""
    if [ "$pull_status" -eq 0 ]; then
      return 0
    fi
    warn "immutable image pull attempt $attempt failed or timed out"
    [ "$attempt" -lt 3 ] || die 'immutable image pull failed after 3 attempts'
    sleep $((attempt * 5))
  done
}

read_manifest() {
  RELEASE_MANIFEST="$(canonical_file "$RELEASE_MANIFEST")" || die 'release manifest is missing or unsafe'
  FRONTEND_BUNDLE="$(canonical_file "$FRONTEND_BUNDLE")" || die 'frontend bundle is missing or unsafe'
  RELEASE_ID="$(jq -er '.releaseId' "$RELEASE_MANIFEST")" || die 'manifest releaseId is missing'
  SHORT_RELEASE_ID="$(jq -er '.shortReleaseId' "$RELEASE_MANIFEST")" || die 'manifest shortReleaseId is missing'
  BACKEND_IMAGE="$(jq -er '.components.backend.image' "$RELEASE_MANIFEST")" || die 'backend image is missing'
  MIGRATION_IMAGE="$(jq -er '.components.migrator.image' "$RELEASE_MANIFEST")" || die 'migrator image is missing'
  FRONTEND_SHA256="$(jq -er '.components.frontend.sha256' "$RELEASE_MANIFEST")" || die 'frontend checksum is missing'
  FRONTEND_BYTES="$(jq -er '.components.frontend.bytes' "$RELEASE_MANIFEST")" || die 'frontend size is missing'
  EXPECTED_MIGRATION_COUNT="$(jq -er '.migrations.expectedCount' "$RELEASE_MANIFEST")" || \
    die 'manifest migration count is missing'

  [[ "$RELEASE_ID" =~ ^[0-9a-f]{40}$ ]] || die 'manifest releaseId is invalid'
  [ "$SHORT_RELEASE_ID" = "${RELEASE_ID:0:12}" ] || die 'manifest shortReleaseId is inconsistent'
  [[ "$BACKEND_IMAGE" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_./-]+@sha256:[0-9a-f]{64}$ ]] || \
    die 'backend image is not an immutable GHCR digest reference'
  [[ "$MIGRATION_IMAGE" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_./-]+@sha256:[0-9a-f]{64}$ ]] || \
    die 'migrator image is not an immutable GHCR digest reference'
  [[ "$FRONTEND_SHA256" =~ ^[0-9a-f]{64}$ ]] || die 'frontend checksum is invalid'
  [[ "$FRONTEND_BYTES" =~ ^[1-9][0-9]*$ ]] || die 'frontend size is invalid'
  [[ "$EXPECTED_MIGRATION_COUNT" =~ ^[1-9][0-9]*$ ]] || \
    die 'manifest migration count is invalid'
  [ "$(sha256sum "$FRONTEND_BUNDLE" | awk '{print $1}')" = "$FRONTEND_SHA256" ] || \
    die 'frontend bundle checksum mismatch'
  [ "$(stat -c '%s' "$FRONTEND_BUNDLE")" = "$FRONTEND_BYTES" ] || \
    die 'frontend bundle size mismatch'

  RELEASE_ENV_FILE="$RELEASES_DIR/.${RELEASE_ID}.env"
  umask 077
  {
    printf 'RELEASE_ID=%s\n' "$SHORT_RELEASE_ID"
    printf 'DEPLOY_ENV=%s\n' "$DEPLOY_ENV"
    printf 'BACKEND_IMAGE=%s\n' "$BACKEND_IMAGE"
    printf 'MIGRATION_IMAGE=%s\n' "$MIGRATION_IMAGE"
    printf 'EXPECTED_MIGRATION_COUNT=%s\n' "$EXPECTED_MIGRATION_COUNT"
  } > "$RELEASE_ENV_FILE.part"
  mv -f "$RELEASE_ENV_FILE.part" "$RELEASE_ENV_FILE"
}

validate_frontend_archive() {
  local entry
  while IFS= read -r entry; do
    case "$entry" in
      /*|../*|*/../*|*/..) die "frontend archive contains an unsafe path: $entry" ;;
    esac
  done < <(tar -tzf "$FRONTEND_BUNDLE")
  if tar -tvzf "$FRONTEND_BUNDLE" | awk '$1 ~ /^[lh]/ { found=1 } END { exit found ? 0 : 1 }'; then
    die 'frontend archive must not contain symbolic or hard links'
  fi
}

prepare_frontend() {
  local stage="$RELEASES_DIR/.stage-${RELEASE_ID}-$$"
  local final="$RELEASES_DIR/$RELEASE_ID"
  [ ! -e "$stage" ] && [ ! -L "$stage" ] || die 'frontend staging path already exists'
  if [ -e "$final" ] || [ -L "$final" ]; then
    [ -d "$final/frontend" ] && [ ! -L "$final" ] || die 'existing release directory is unsafe'
    [ "$(jq -er '.releaseId' "$final/frontend/build-info.json")" = "$SHORT_RELEASE_ID" ] || \
      die 'existing frontend release identity is inconsistent'
    log "reusing verified frontend release $RELEASE_ID"
    return
  fi
  validate_frontend_archive
  install -d -m 700 "$stage/frontend"
  tar -xzf "$FRONTEND_BUNDLE" -C "$stage/frontend" --no-same-owner --no-same-permissions
  [ -f "$stage/frontend/index.html" ] && [ ! -L "$stage/frontend/index.html" ] || \
    die 'frontend archive does not contain index.html'
  [ -f "$stage/frontend/build-info.json" ] && [ ! -L "$stage/frontend/build-info.json" ] || \
    die 'frontend archive does not contain build-info.json'
  [ "$(jq -er '.releaseId' "$stage/frontend/build-info.json")" = "$SHORT_RELEASE_ID" ] || \
    die 'frontend build-info releaseId does not match the manifest'
  cp -- "$RELEASE_MANIFEST" "$stage/release-manifest.json"
  # The deploy account owns releases, while the unprivileged host Nginx worker
  # must be able to traverse directories and read static files.
  find "$stage/frontend" -type d -exec chmod 0555 {} +
  find "$stage/frontend" -type f -exec chmod 0444 {} +
  chmod 0511 "$stage"
  mv -T -- "$stage" "$final"
  log "frontend release prepared: $final"
}

wait_container_healthy() {
  local container_id="$1"
  local attempts="${2:-60}"
  local status
  while [ "$attempts" -gt 0 ]; do
    status="$(docker inspect "$container_id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    [ "$status" = 'healthy' ] && return 0
    [ "$status" = 'running' ] && return 0
    attempts=$((attempts - 1))
    sleep 3
  done
  return 1
}

log_image_size() {
  local role="$1"
  local image="$2"
  local bytes mib
  bytes="$(docker image inspect "$image" --format '{{.Size}}')" || \
    die "cannot inspect the pulled $role image"
  [[ "$bytes" =~ ^[0-9]+$ ]] || die "invalid $role image size"
  mib=$(( (bytes + 1048575) / 1048576 ))
  log "$role image size: ${mib} MiB (${bytes} bytes)"
}

ensure_data_layer() {
  data_compose config -q
  data_compose up -d mysql redis minio
  local service container_id
  for service in mysql redis minio; do
    container_id="$(data_compose ps -q "$service")"
    [ -n "$container_id" ] || die "data service is unavailable: $service"
    wait_container_healthy "$container_id" || die "data service did not become healthy: $service"
  done
  data_compose run --rm minio-init
}

stop_application() {
  app_compose_with "$RELEASE_ENV_FILE" stop file-worker outbox-worker backend >/dev/null 2>&1 || true
  APPLICATION_STOPPED='YES'
}

create_backup() {
  local timestamp backup_stage backup_final minio_id minio_volume configured_volume
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_stage="$BACKUPS_DIR/.stage-${timestamp}-${RELEASE_ID}-$$"
  backup_final="$BACKUPS_DIR/${timestamp}-${RELEASE_ID}"
  install -d -m 700 "$backup_stage"

  log 'creating consistent MySQL backup'
  data_compose exec -T mysql sh -ec \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --single-transaction --routines --triggers --events -uroot "$MYSQL_DATABASE"' \
    | gzip -9 > "$backup_stage/mysql.sql.gz.part"
  gzip -t "$backup_stage/mysql.sql.gz.part"
  mv "$backup_stage/mysql.sql.gz.part" "$backup_stage/mysql.sql.gz"

  minio_id="$(data_compose ps -q minio)"
  [ -n "$minio_id" ] || die 'MinIO container is unavailable for backup'
  minio_volume="$(docker inspect "$minio_id" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}{{end}}')"
  configured_volume="$(data_compose config --format json | jq -er '.volumes.minio_data.name')"
  [ -n "$minio_volume" ] && [ "$minio_volume" = "$configured_volume" ] || \
    die 'MinIO /data volume does not match the declared data volume'

  log 'stopping MinIO for a filesystem-consistent object backup'
  data_compose stop minio
  MINIO_STOPPED='YES'
  docker run --rm --user 0:0 --network none --read-only \
    -v "$minio_volume:/source:ro" -v "$backup_stage:/backup" \
    --entrypoint sh "$MIGRATION_IMAGE" -ec \
    'tar -C /source -czf /backup/minio.tar.gz.part .'
  mv "$backup_stage/minio.tar.gz.part" "$backup_stage/minio.tar.gz"
  tar -tzf "$backup_stage/minio.tar.gz" >/dev/null
  data_compose start minio
  wait_container_healthy "$minio_id" || die 'MinIO did not recover after backup'
  MINIO_STOPPED='NO'

  cp -- "$RELEASE_MANIFEST" "$backup_stage/target-release-manifest.json"
  if [ -f "$STATE_DIR/current-release-manifest.json" ] && [ ! -L "$STATE_DIR/current-release-manifest.json" ]; then
    cp -- "$STATE_DIR/current-release-manifest.json" "$backup_stage/source-release-manifest.json"
    [ -f "$STATE_DIR/current-release.env" ] && [ ! -L "$STATE_DIR/current-release.env" ] || \
      die 'current release environment is missing or unsafe'
    cp -- "$STATE_DIR/current-release.env" "$backup_stage/source-release.env"
  else
    printf 'initial-or-legacy-runtime\n' > "$backup_stage/source-runtime.txt"
  fi
  (
    cd "$backup_stage"
    find . -maxdepth 1 -type f ! -name checksums.sha256 -printf '%f\n' \
      | LC_ALL=C sort \
      | xargs sha256sum -- > checksums.sha256
    sha256sum --check --strict checksums.sha256 >/dev/null
  )
  mv -T -- "$backup_stage" "$backup_final"
  printf '%s\n' "$backup_final" > "$STATE_DIR/latest-backup.part"
  mv -f "$STATE_DIR/latest-backup.part" "$STATE_DIR/latest-backup"
  log "backup published: $backup_final"
}

run_migrations() {
  log 'running guarded schema and data migrations'
  DATABASE_MUTATION_STARTED='YES'
  app_compose_with "$RELEASE_ENV_FILE" run --rm --no-deps backend-migrate
}

verify_clean_test_baseline() {
  [ "$RESET_TEST_DATA" = 'true' ] || return 0
  [ "$DEPLOY_ENV" = 'test' ] || die 'clean baseline verification is test-only'
  log 'verifying clean test baseline and all foreign-key relations'
  app_compose_with "$RELEASE_ENV_FILE" run --rm --no-deps \
    -e DEPLOY_ENV=test \
    -e CONFIRM_CLEAN_TEST_BASELINE=YES \
    -e "DEPLOY_TARGET_ID=$DEPLOY_TARGET_ID" \
    backend-migrate ts-node --transpile-only prisma/verify-clean-test-baseline.ts
}

wait_backend_ready() {
  local backend_id host_port attempts=60
  backend_id="$(app_compose_with "$RELEASE_ENV_FILE" ps -q backend)"
  [ -n "$backend_id" ] || return 1
  host_port="$(docker port "$backend_id" 3000/tcp | awk -F: 'NR == 1 {print $NF}')"
  [[ "$host_port" =~ ^[0-9]+$ ]] || return 1
  while [ "$attempts" -gt 0 ]; do
    if curl -fsS --connect-timeout 3 --max-time 10 "http://127.0.0.1:$host_port/api/v1/ready" >/dev/null; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 3
  done
  return 1
}

start_application() {
  log 'starting immutable backend release'
  app_compose_with "$RELEASE_ENV_FILE" up -d --no-deps --force-recreate backend
  wait_backend_ready || die 'backend readiness check failed after migration'
  app_compose_with "$RELEASE_ENV_FILE" up -d --no-deps --force-recreate file-worker outbox-worker
  local service first_id second_id first_restarts second_restarts
  for service in file-worker outbox-worker; do
    first_id="$(app_compose_with "$RELEASE_ENV_FILE" ps -q "$service")"
    [ -n "$first_id" ] || die "$service did not start"
    first_restarts="$(docker inspect "$first_id" --format '{{.RestartCount}}')"
    sleep 5
    second_id="$(app_compose_with "$RELEASE_ENV_FILE" ps -q "$service")"
    [ -n "$second_id" ] || die "$service disappeared after startup"
    second_restarts="$(docker inspect "$second_id" --format '{{.RestartCount}}')"
    [ "$first_id" = "$second_id" ] && [ "$first_restarts" = "$second_restarts" ] || \
      die "$service is not stable"
  done
}

switch_frontend() {
  local target="releases/$RELEASE_ID"
  local current="$APP_ROOT/current"
  local next="$APP_ROOT/.current-${RELEASE_ID}-$$"
  [ -d "$APP_ROOT/$target/frontend" ] || die 'prepared frontend release disappeared'
  ln -s "$target" "$next"
  sudo -n "$NGINX_CONTROL" check
  mv -Tf "$next" "$current"
  sudo -n "$NGINX_CONTROL" reload
  log "frontend symlink switched to $target"
}

check_origin() {
  local name="$1"
  local origin="${2%/}"
  local release
  [ -n "$origin" ] || die "$name origin is required"
  curl -fsS --connect-timeout 5 --max-time 20 "$origin/api/v1/ready" >/dev/null || \
    die "$name API readiness check failed: $origin"
  release="$(curl -fsS --connect-timeout 5 --max-time 20 -H 'Cache-Control: no-cache' "$origin/build-info.json" | jq -er '.releaseId')" || \
    die "$name frontend release check failed: $origin"
  [ "$release" = "$SHORT_RELEASE_ID" ] || die "$name frontend release mismatch: $origin"
}

publish_state() {
  if [ -f "$STATE_DIR/current-release-manifest.json" ]; then
    cp -- "$STATE_DIR/current-release-manifest.json" "$STATE_DIR/previous-release-manifest.json.part"
    mv -f "$STATE_DIR/previous-release-manifest.json.part" "$STATE_DIR/previous-release-manifest.json"
  fi
  cp -- "$RELEASE_MANIFEST" "$STATE_DIR/current-release-manifest.json.part"
  mv -f "$STATE_DIR/current-release-manifest.json.part" "$STATE_DIR/current-release-manifest.json"
  cp -- "$RELEASE_ENV_FILE" "$STATE_DIR/current-release.env.part"
  mv -f "$STATE_DIR/current-release.env.part" "$STATE_DIR/current-release.env"
  rm -f "$STATE_DIR/failed-release"
}

on_exit() {
  local status="$?"
  trap - EXIT
  if [ "$MINIO_STOPPED" = 'YES' ]; then
    data_compose start minio >/dev/null 2>&1 || true
  fi
  if [ "$DEPLOY_ACTIVE" = 'YES' ] && [ "$DEPLOY_SUCCEEDED" != 'YES' ]; then
    if [ "$APPLICATION_STOPPED" = 'YES' ] && [ "$DATABASE_MUTATION_STARTED" = 'NO' ] && \
       [ -f "$STATE_DIR/current-release.env" ] && [ ! -L "$STATE_DIR/current-release.env" ]; then
      warn 'failure happened before database mutation; resuming the last v2 application release'
      app_compose_with "$STATE_DIR/current-release.env" up -d --no-deps backend file-worker outbox-worker >/dev/null 2>&1 || \
        warn 'the last application release could not be resumed automatically'
    fi
    printf '%s\n' "${RELEASE_ID:-unknown}" > "$STATE_DIR/failed-release" 2>/dev/null || true
    warn 'deployment did not complete; do not perform a code-only rollback after a migration attempt'
  fi
  exit "$status"
}

deploy_release() {
  initialize_paths
  acquire_lock
  DEPLOY_ACTIVE='YES'
  read_manifest
  prepare_frontend
  app_compose_with "$RELEASE_ENV_FILE" config -q
  ensure_data_layer
  log 'pulling immutable application images while the current release remains online'
  pull_application_images
  log_image_size backend "$BACKEND_IMAGE"
  log_image_size migrator "$MIGRATION_IMAGE"
  stop_application
  create_backup
  run_migrations
  verify_clean_test_baseline
  start_application
  switch_frontend
  check_origin internal "$INTERNAL_ORIGIN"
  check_origin public "$PUBLIC_ORIGIN"
  publish_state
  DEPLOY_SUCCEEDED='YES'
  log "release completed: $RELEASE_ID"
}

show_status() {
  initialize_paths
  local manifest="$STATE_DIR/current-release-manifest.json"
  if [ -f "$manifest" ] && [ ! -L "$manifest" ]; then
    jq '{releaseId, components, migrations}' "$manifest"
  else
    warn 'no v2 release has completed on this server'
  fi
  if [ -f "$STATE_DIR/current-release.env" ]; then
    app_compose_with "$STATE_DIR/current-release.env" ps
  fi
  data_compose ps
  readlink "$APP_ROOT/current" 2>/dev/null || true
}

main() {
  trap on_exit EXIT
  trap 'on_signal HUP 129' HUP
  trap 'on_signal INT 130' INT
  trap 'on_signal TERM 143' TERM
  for command in docker jq sha256sum tar gzip curl flock realpath stat sudo timeout; do
    require_command "$command"
  done
  case "${1:-deploy}" in
    deploy) deploy_release ;;
    status) show_status ;;
    *) die 'usage: deploy-release.sh <deploy|status>' ;;
  esac
}

main "$@"
