#!/usr/bin/env bash
set -Eeuo pipefail

# Git based production deployment for the delivery platform.
# It preserves server-only .env, backups and Docker named volumes.

APP_DIR="${APP_DIR:-/www/wwwroot/delivery-platform}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
REF="${REF:-}"
COMPOSE_FILES="${COMPOSE_FILES:-docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-delivery-platform}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
ADOPT_EXISTING_PACKAGE="${ADOPT_EXISTING_PACKAGE:-NO}"
ALLOW_DIRTY="${ALLOW_DIRTY:-NO}"
SKIP_GIT_FETCH="${SKIP_GIT_FETCH:-NO}"
PRESERVE_PREVIOUS_REV="${PRESERVE_PREVIOUS_REV:-NO}"
QUIESCE_APP_BEFORE_BACKUP="${QUIESCE_APP_BEFORE_BACKUP:-YES}"
ROLLBACK_DATA_ON_FAILURE="${ROLLBACK_DATA_ON_FAILURE:-NO}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-NO}"
BACKUP_PATH="${BACKUP_PATH:-}"
export COMPOSE_PROJECT_NAME

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

COMPOSE=()
COMPOSE_ARGS=()
LOCK_DIR=""
CURRENT_BACKUP_DIR=""

log() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

normalize_app_dir() {
  case "$APP_DIR" in
    /*) ;;
    *) APP_DIR="$(pwd)/$APP_DIR" ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || err "missing command: $1"
}

build_compose_args() {
  COMPOSE_ARGS=()
  local files file
  IFS=':' read -r -a files <<< "$COMPOSE_FILES"
  for file in "${files[@]}"; do
    [ -n "$file" ] || continue
    [ -f "$file" ] || err "compose file not found: $file"
    COMPOSE_ARGS+=("-f" "$file")
  done
}

detect_compose() {
  require_command docker
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    err "Docker Compose is not installed"
  fi
  build_compose_args
}

compose() {
  "${COMPOSE[@]}" "${COMPOSE_ARGS[@]}" "$@"
}

release_id() {
  git rev-parse --short=12 HEAD
}

target_ref() {
  if [ -n "$REF" ]; then
    printf '%s\n' "$REF"
  else
    printf 'origin/%s\n' "$BRANCH"
  fi
}

init_or_adopt_repo() {
  normalize_app_dir
  require_command git

  if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    return
  fi

  if [ ! -d "$APP_DIR" ] || [ -z "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    [ -n "$REPO_URL" ] || err "REPO_URL is required for the first Git clone"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    return
  fi

  [ "$ADOPT_EXISTING_PACKAGE" = "YES" ] || err "APP_DIR exists but is not a Git repo. Set ADOPT_EXISTING_PACKAGE=YES to convert the package deployment directory."
  [ -n "$REPO_URL" ] || err "REPO_URL is required when converting an existing package deployment"
  [ -f "$APP_DIR/.env" ] || err "existing package directory has no .env; refusing to convert"

  local parent stamp clone_dir old_dir
  parent="$(dirname "$APP_DIR")"
  stamp="$(date +%Y%m%d_%H%M%S)"
  clone_dir="${APP_DIR}.git-clone-${stamp}"
  old_dir="${APP_DIR}.source-${stamp}"

  log "converting package deployment to Git deployment"
  cd "$parent"
  git clone --branch "$BRANCH" "$REPO_URL" "$clone_dir"
  cp -p "$APP_DIR/.env" "$clone_dir/.env"
  [ -d "$APP_DIR/backups" ] && cp -a "$APP_DIR/backups" "$clone_dir/backups"
  mv "$APP_DIR" "$old_dir"
  mv "$clone_dir" "$APP_DIR"
  cd "$APP_DIR"
  mkdir -p .deploy
  printf '%s\n' "$old_dir" > .deploy/adopted_source_dir
  log "old source preserved: $old_dir"
}

acquire_lock() {
  mkdir -p .deploy
  if command -v flock >/dev/null 2>&1; then
    exec 9>.deploy/deploy.lock
    flock -n 9 || err "another deployment is already running"
    return
  fi

  LOCK_DIR=".deploy/deploy.lockdir"
  mkdir "$LOCK_DIR" 2>/dev/null || err "another deployment is already running"
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

write_release_metadata() {
  local id
  id="$(release_id)"
  export RELEASE_ID="$id"
  printf '%s\n' "$id" > RELEASE_ID
  git ls-files > RELEASE_MANIFEST.txt
  log "release id: $id"
}

ensure_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      chmod 600 .env || true
      err ".env has been created from .env.example. Fill production values, then rerun deploy-git.sh."
    fi
    err "missing .env"
  fi
}

source_env() {
  ensure_env
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
}

validate_layout() {
  [ -f docker-compose.yml ] || err "missing docker-compose.yml"
  [ -f delivery-platform-web/Dockerfile ] || err "missing delivery-platform-web/Dockerfile"
  [ -f delivery-platform-server/Dockerfile ] || err "missing delivery-platform-server/Dockerfile"
  [ -f delivery-platform-server/prisma/schema.prisma ] || err "missing Prisma schema"
  [ -f delivery-platform-server/prisma/prepare-migrate.js ] || err "missing Prisma migration guard"
}

validate_env() {
  source_env
  local required_vars=(
    MYSQL_ROOT_PASSWORD MYSQL_DATABASE MYSQL_USER MYSQL_USER_PASSWORD
    REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_BUCKET
    MINIO_IMAGE MINIO_MC_IMAGE JWT_SECRET SEED_ADMIN_PASSWORD SEED_DEFAULT_PASSWORD
  )
  local name value
  for name in "${required_vars[@]}"; do
    value="${!name:-}"
    if [ -z "$value" ] || [[ "$value" == CHANGE_ME* ]]; then
      err ".env value is not configured: $name"
    fi
  done
  [ "${#JWT_SECRET}" -ge 32 ] || err "JWT_SECRET must contain at least 32 characters"
  [[ "${MINIO_IMAGE}" == minio/minio:RELEASE.* ]] || err "MINIO_IMAGE must use a fixed RELEASE tag"
  [[ "${MINIO_MC_IMAGE}" == minio/mc:RELEASE.* ]] || err "MINIO_MC_IMAGE must use a fixed RELEASE tag"
}

preflight() {
  validate_layout
  detect_compose
  validate_env
  compose config -q >/dev/null
  log "preflight passed"
}

checkout_target() {
  mkdir -p .deploy
  local dirty previous target
  dirty="$(git status --porcelain --untracked-files=no)"
  if [ -n "$dirty" ] && [ "$ALLOW_DIRTY" != "YES" ]; then
    printf '%s\n' "$dirty" >&2
    err "tracked files are modified on the server; commit, revert or set ALLOW_DIRTY=YES"
  fi

  if [ "$PRESERVE_PREVIOUS_REV" = "YES" ] && [ -s .deploy/previous_rev ]; then
    previous="$(cat .deploy/previous_rev)"
  else
    previous="$(git rev-parse --verify HEAD 2>/dev/null || true)"
  fi
  [ -n "$previous" ] && printf '%s\n' "$previous" > .deploy/previous_rev

  if [ "$SKIP_GIT_FETCH" = "YES" ]; then
    warn "SKIP_GIT_FETCH=YES; using current server Git object database"
  else
    git fetch --tags --prune origin
  fi
  target="$(target_ref)"
  if [ -n "$REF" ]; then
    git checkout --detach "$target"
    git reset --hard "$target"
  else
    git checkout -B "$BRANCH" "$target"
    git reset --hard "$target"
  fi
  write_release_metadata
}

start_infra() {
  compose up -d mysql redis minio
  compose up -d minio-init || warn "minio-init did not finish cleanly; continuing"
  wait_mysql
}

wait_mysql() {
  source_env
  local attempt
  for attempt in $(seq 1 60); do
    if compose exec -T mysql sh -c 'mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  err "mysql did not become ready"
}

quiesce_app() {
  if [ "$QUIESCE_APP_BEFORE_BACKUP" = "YES" ]; then
    log "stopping application containers before backup and migration"
    compose stop backend frontend >/dev/null 2>&1 || true
  fi
}

resume_existing_app() {
  compose start backend frontend >/dev/null 2>&1 || true
}

write_table_audit() {
  local output="$1"
  compose exec -T mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT TABLE_NAME,TABLE_ROWS FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='\''BASE TABLE'\'' ORDER BY TABLE_NAME;"' > "$output" 2>/dev/null || true
}

backup_database() {
  source_env
  local sql_file="$CURRENT_BACKUP_DIR/mysql.sql"
  log "backing up MySQL"
  compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --hex-blob "$MYSQL_DATABASE"' > "$sql_file"
  gzip -f "$sql_file"
  gzip -t "${sql_file}.gz"
}

minio_volume_name() {
  local container_id
  container_id="$(compose ps -q minio 2>/dev/null || true)"
  [ -n "$container_id" ] || return 0
  docker inspect "$container_id" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true
}

backup_minio() {
  local volume_name
  volume_name="$(minio_volume_name)"
  if [ -z "$volume_name" ]; then
    warn "MinIO data volume was not found; skipping MinIO backup"
    return 0
  fi
  log "backing up MinIO volume: $volume_name"
  docker run --rm \
    -v "${volume_name}:/data:ro" \
    -v "$(pwd)/${CURRENT_BACKUP_DIR}:/backup" \
    alpine sh -c 'tar czf /backup/minio.tar.gz -C /data .'
  gzip -t "$CURRENT_BACKUP_DIR/minio.tar.gz" >/dev/null 2>&1 || true
}

create_backup() {
  local stamp id
  stamp="$(date +%Y%m%d_%H%M%S)"
  id="$(release_id)"
  CURRENT_BACKUP_DIR="backups/git-deploy/${stamp}-${id}"
  mkdir -p "$CURRENT_BACKUP_DIR"
  cp -p .env "$CURRENT_BACKUP_DIR/env.snapshot"
  chmod 600 "$CURRENT_BACKUP_DIR/env.snapshot" || true
  git rev-parse HEAD > "$CURRENT_BACKUP_DIR/git-revision.txt"
  compose config > "$CURRENT_BACKUP_DIR/docker-compose.resolved.yml" || true
  write_table_audit "$CURRENT_BACKUP_DIR/table-counts.before.tsv"
  backup_database
  backup_minio
  printf '%s\n' "$CURRENT_BACKUP_DIR" > .deploy/latest_backup
  log "backup saved: $CURRENT_BACKUP_DIR"
}

rotate_backups() {
  [ -d backups/git-deploy ] || return 0
  find backups/git-deploy -mindepth 1 -maxdepth 1 -type d -mtime +"$BACKUP_RETENTION_DAYS" -exec rm -rf -- {} +
}

build_images() {
  log "building application images"
  compose build backend backend-migrate frontend
}

run_migrations() {
  log "running guarded Prisma migration and idempotent seed"
  compose run --rm backend-migrate
  write_table_audit "$CURRENT_BACKUP_DIR/table-counts.after.tsv"
}

check_url() {
  local name="$1"
  local url="$2"
  local attempt
  for attempt in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$name healthy"
      return 0
    fi
    sleep 3
  done
  warn "$name did not respond: $url"
  return 1
}

verify_release_version() {
  local expected response actual url
  expected="$(release_id)"
  url="http://127.0.0.1:${FRONTEND_PORT:-8080}/build-info.json"
  response="$(curl -fsS -H 'Cache-Control: no-cache' "$url" 2>/dev/null)" || return 1
  actual="$(printf '%s' "$response" | sed -n 's/.*"releaseId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  [ "$actual" = "$expected" ] || {
    warn "release id mismatch: expected $expected, got ${actual:-empty}"
    return 1
  }
  log "frontend release id verified: $actual"
}

switch_app() {
  log "switching application containers"
  compose up -d --force-recreate backend frontend
  check_url "backend" "http://127.0.0.1:${BACKEND_PORT:-3000}/api/v1/health"
  check_url "frontend" "http://127.0.0.1:${FRONTEND_PORT:-8080}"
  verify_release_version
}

capture_failure_diagnostics() {
  local stamp output
  stamp="$(date +%Y%m%d_%H%M%S)"
  mkdir -p backups/failures
  output="backups/failures/git_deploy_failure_${stamp}.log"
  {
    echo "captured_at=$(date -Iseconds)"
    echo "release_id=$(release_id 2>/dev/null || true)"
    echo "backup_dir=${CURRENT_BACKUP_DIR:-}"
    echo
    echo "===== git ====="
    git status --short || true
    git rev-parse HEAD || true
    echo
    echo "===== compose ps ====="
    compose ps -a || true
    echo
    echo "===== logs ====="
    compose logs --no-color --tail=300 backend backend-migrate frontend mysql minio || true
  } > "$output" 2>&1
  warn "failure diagnostics saved: $output"
}

rollback_code_to_previous() {
  local previous
  previous="$(cat .deploy/previous_rev 2>/dev/null || true)"
  [ -n "$previous" ] || {
    warn "previous git revision is unknown; skipping code rollback"
    return 1
  }
  warn "rolling code back to $previous"
  git checkout --detach "$previous"
  git reset --hard "$previous"
  write_release_metadata
  build_images
  compose up -d --force-recreate backend frontend
}

restore_data_from_backup() {
  [ "$CONFIRM_RESTORE" = "YES" ] || err "data restore is destructive. Set CONFIRM_RESTORE=YES and BACKUP_PATH=... to continue."
  source_env
  local backup volume_name
  backup="$BACKUP_PATH"
  if [ -z "$backup" ]; then
    backup="$(cat .deploy/latest_backup 2>/dev/null || true)"
  fi
  [ -n "$backup" ] && [ -d "$backup" ] || err "backup directory not found: ${backup:-empty}"
  [ -f "$backup/mysql.sql.gz" ] || err "missing database backup: $backup/mysql.sql.gz"

  start_infra
  compose stop backend frontend >/dev/null 2>&1 || true
  log "restoring MySQL from $backup/mysql.sql.gz"
  compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
  gunzip -c "$backup/mysql.sql.gz" | compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'

  if [ -f "$backup/minio.tar.gz" ]; then
    volume_name="$(minio_volume_name)"
    [ -n "$volume_name" ] || err "MinIO volume not found"
    log "restoring MinIO volume: $volume_name"
    compose stop minio >/dev/null 2>&1 || true
    docker run --rm \
      -v "${volume_name}:/data" \
      -v "$(pwd)/${backup}:/backup:ro" \
      alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/minio.tar.gz -C /data'
    compose up -d minio
  fi

  log "data restore finished"
}

handle_deploy_failure() {
  local reason="$1"
  capture_failure_diagnostics
  if [ "$ROLLBACK_DATA_ON_FAILURE" = "YES" ]; then
    warn "ROLLBACK_DATA_ON_FAILURE=YES, restoring latest backup"
    CONFIRM_RESTORE=YES BACKUP_PATH="${CURRENT_BACKUP_DIR:-$BACKUP_PATH}" restore_data_from_backup || warn "data restore failed"
  fi
  rollback_code_to_previous || resume_existing_app
  err "$reason"
}

deploy() {
  init_or_adopt_repo
  acquire_lock
  checkout_target
  preflight
  if ! build_images; then
    handle_deploy_failure "image build failed"
  fi
  start_infra
  quiesce_app
  if ! create_backup; then
    resume_existing_app
    handle_deploy_failure "backup failed"
  fi
  if ! run_migrations; then
    handle_deploy_failure "database migration failed"
  fi
  if ! switch_app; then
    handle_deploy_failure "health check failed after switching containers"
  fi
  rotate_backups
  log "deployment completed"
}

show_status() {
  init_or_adopt_repo
  detect_compose
  echo "app_dir=$APP_DIR"
  echo "branch=$BRANCH"
  echo "ref=${REF:-}"
  echo "release_id=$(release_id 2>/dev/null || true)"
  echo
  git --no-pager log -1 --oneline || true
  echo
  compose ps
}

manual_backup() {
  init_or_adopt_repo
  acquire_lock
  preflight
  start_infra
  quiesce_app
  if ! create_backup; then
    resume_existing_app
    err "backup failed"
  fi
  resume_existing_app
}

show_logs() {
  init_or_adopt_repo
  detect_compose
  compose logs -f --tail=200 backend frontend backend-migrate
}

case "${1:-deploy}" in
  deploy) deploy ;;
  preflight) init_or_adopt_repo; acquire_lock; preflight ;;
  backup) manual_backup ;;
  status) show_status ;;
  logs) show_logs ;;
  rollback-code) init_or_adopt_repo; acquire_lock; preflight; rollback_code_to_previous; switch_app ;;
  restore-data) init_or_adopt_repo; acquire_lock; preflight; restore_data_from_backup ;;
  *)
    cat <<'USAGE'
Usage:
  bash deploy-git.sh deploy
  bash deploy-git.sh status
  bash deploy-git.sh backup
  bash deploy-git.sh rollback-code
  CONFIRM_RESTORE=YES BACKUP_PATH=backups/git-deploy/<stamp> bash deploy-git.sh restore-data

Important environment variables:
  REPO_URL=git@your-git-server:group/delivery-platform.git
  BRANCH=main
  REF=v20260704.1            # optional tag or commit
  APP_DIR=/www/wwwroot/delivery-platform
  ADOPT_EXISTING_PACKAGE=YES # first conversion from package deployment
  COMPOSE_FILES=docker-compose.yml
  SKIP_GIT_FETCH=YES         # use current local Git objects, for CI artifact deployment
  PRESERVE_PREVIOUS_REV=YES  # keep .deploy/previous_rev created before artifact extraction
USAGE
    ;;
esac
