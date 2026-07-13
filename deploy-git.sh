#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

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
DEPLOY_ACTIVE="NO"
DEPLOY_SUCCEEDED="NO"
INTEGRATION_SECRET_KEY_SOURCE="existing"
PREPARED_INTEGRATION_SECRET_KEY=""
DECLARED_COMPOSE_SERVICES=""
APPLICATION_SERVICES=()
WORKER_SERVICES=()
APP_SWITCH_STARTED="NO"

log() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

restore_deployment_env() {
  local deploy_dir="${APP_DIR}/.deploy"
  if [ -f "$deploy_dir/env.before-deploy" ]; then
    mv -f "$deploy_dir/env.before-deploy" "$APP_DIR/.env" || return 1
    rm -f "$deploy_dir/env.was_absent"
    warn "restored the environment file from before this deployment"
  elif [ -f "$deploy_dir/env.was_absent" ]; then
    rm -f "$APP_DIR/.env" "$deploy_dir/env.was_absent" || return 1
    warn "removed the environment file created by the failed deployment"
  fi
}

discard_deployment_env_backup() {
  rm -f "$APP_DIR/.deploy/env.before-deploy" "$APP_DIR/.deploy/env.was_absent"
}

on_exit() {
  local status="$?"
  set +e
  if [ "$status" -ne 0 ] && [ "$DEPLOY_ACTIVE" = "YES" ] && [ "$DEPLOY_SUCCEEDED" != "YES" ]; then
    restore_deployment_env || warn "failed to restore the pre-deployment environment file"
  fi
  [ -n "$LOCK_DIR" ] && rmdir "$LOCK_DIR" 2>/dev/null
  return "$status"
}

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

compose_service_declared() {
  local service="$1"
  grep -Fxq -- "$service" <<< "$DECLARED_COMPOSE_SERVICES"
}

load_app_topology() {
  local policy="${1:-required}"
  local has_file_worker="NO"
  local has_outbox_worker="NO"
  DECLARED_COMPOSE_SERVICES="$(compose config --services)" || return 1
  compose_service_declared backend || {
    warn "backend service is missing from the Compose topology"
    return 1
  }
  compose_service_declared frontend || {
    warn "frontend service is missing from the Compose topology"
    return 1
  }
  compose_service_declared file-worker && has_file_worker="YES"
  compose_service_declared outbox-worker && has_outbox_worker="YES"

  WORKER_SERVICES=()
  if [ "$has_file_worker" = "YES" ]; then
    WORKER_SERVICES+=(file-worker)
  fi
  if [ "$has_outbox_worker" = "YES" ]; then
    WORKER_SERVICES+=(outbox-worker)
  fi
  if [ "$policy" != "available" ] && [ "$has_file_worker" != "$has_outbox_worker" ]; then
    warn "partial worker topology detected; file-worker and outbox-worker must be declared together"
    return 1
  fi
  if [ "$policy" = "required" ] && [ "${#WORKER_SERVICES[@]}" -ne 2 ]; then
    warn "target topology requires file-worker and outbox-worker"
    return 1
  fi
  APPLICATION_SERVICES=(backend "${WORKER_SERVICES[@]}" frontend)
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

write_revision_file() {
  local path="$1"
  local revision="$2"
  local temporary="${path}.tmp.$$"
  printf '%s\n' "$revision" > "$temporary" || return 1
  mv -f "$temporary" "$path" || return 1
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
}

write_release_metadata() {
  local id
  id="$(release_id)"
  export RELEASE_ID="$id"
  printf '%s\n' "$id" > RELEASE_ID
  ensure_env
  if grep -q '^RELEASE_ID=' .env; then
    sed -i "s|^RELEASE_ID=.*|RELEASE_ID=$id|" .env
  else
    printf '\nRELEASE_ID=%s\n' "$id" >> .env
  fi
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

valid_integration_secret_key() {
  local value="$1"
  local decoded_length canonical
  [ -n "$value" ] || return 1
  decoded_length="$(printf '%s' "$value" | openssl base64 -d -A 2>/dev/null | wc -c | tr -d '[:space:]')" || return 1
  [ "$decoded_length" = "32" ] || return 1
  canonical="$(printf '%s' "$value" | openssl base64 -d -A 2>/dev/null | openssl base64 -A 2>/dev/null)" || return 1
  [ "$canonical" = "$value" ]
}

read_previous_integration_secret_key() {
  local file="$APP_DIR/.deploy/env.before-deploy"
  [ -f "$file" ] || return 1
  (
    unset INTEGRATION_SECRET_ENCRYPTION_KEY
    set -a
    # shellcheck disable=SC1090
    . "$file" >/dev/null 2>&1
    set +a
    printf '%s' "${INTEGRATION_SECRET_ENCRYPTION_KEY:-}"
  )
}

prepare_integration_secret_key() {
  local configured="${INTEGRATION_SECRET_ENCRYPTION_KEY:-}"
  local previous=""
  require_command openssl

  if [ -z "$configured" ] || [[ "$configured" == CHANGE_ME* ]]; then
    previous="$(read_previous_integration_secret_key 2>/dev/null || true)"
    if [ -n "$previous" ] && [[ "$previous" != CHANGE_ME* ]]; then
      valid_integration_secret_key "$previous" || {
        warn "the pre-deployment INTEGRATION_SECRET_ENCRYPTION_KEY is not a canonical 32-byte Base64 value"
        return 1
      }
      configured="$previous"
      INTEGRATION_SECRET_KEY_SOURCE="restored"
    else
      configured="$(openssl rand -base64 32 | tr -d '\r\n')" || return 1
      INTEGRATION_SECRET_KEY_SOURCE="generated"
    fi
  fi

  valid_integration_secret_key "$configured" || {
    warn "INTEGRATION_SECRET_ENCRYPTION_KEY must be a canonical 32-byte Base64 value"
    return 1
  }
  PREPARED_INTEGRATION_SECRET_KEY="$configured"
  export INTEGRATION_SECRET_ENCRYPTION_KEY="$configured"
  export INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME="${INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME:-admin}"
}

write_env_assignment() {
  local file="$1"
  local name="$2"
  local value="$3"
  local temporary="${file}.tmp.$$"
  [ -f "$file" ] || return 1
  : > "$temporary" || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$name="*) ;;
      *) printf '%s\n' "$line" >> "$temporary" || return 1 ;;
    esac
  done < "$file"
  printf '%s=%s\n' "$name" "$value" >> "$temporary" || return 1
  chmod 600 "$temporary" || return 1
  mv -f "$temporary" "$file" || return 1
}

encrypted_integration_config_count() {
  local column_count ciphertext_count
  column_count="$(
    compose exec -T mysql sh -c \
      'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=0x696e746567726174696f6e5f636f6e66696773 AND column_name=0x656e637279707465645f636f6e666967;"' \
      2>/dev/null | tr -d '[:space:]'
  )" || return 1
  case "$column_count" in
    0) printf '0\n'; return 0 ;;
    1) ;;
    *) return 1 ;;
  esac
  ciphertext_count="$(
    compose exec -T mysql sh -c \
      'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM integration_configs WHERE encrypted_config IS NOT NULL AND CHAR_LENGTH(encrypted_config) > 0;"' \
      2>/dev/null | tr -d '[:space:]'
  )" || return 1
  [[ "$ciphertext_count" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$ciphertext_count"
}

persist_prepared_integration_secret_key() {
  local ciphertext_count
  valid_integration_secret_key "$PREPARED_INTEGRATION_SECRET_KEY" || {
    warn "the prepared integration encryption key is unavailable or invalid"
    return 1
  }
  export INTEGRATION_SECRET_ENCRYPTION_KEY="$PREPARED_INTEGRATION_SECRET_KEY"
  case "$INTEGRATION_SECRET_KEY_SOURCE" in
    existing) return 0 ;;
    restored) ;;
    generated)
      ciphertext_count="$(encrypted_integration_config_count)" || {
        warn "could not verify whether encrypted integration configuration already exists"
        return 1
      }
      if [ "$ciphertext_count" != "0" ]; then
        warn "encrypted integration configuration exists but its original encryption key is unavailable; refusing key replacement"
        return 1
      fi
      ;;
    *) return 1 ;;
  esac

  write_env_assignment "$APP_DIR/.env" INTEGRATION_SECRET_ENCRYPTION_KEY "$PREPARED_INTEGRATION_SECRET_KEY" || return 1
  if [ "$INTEGRATION_SECRET_KEY_SOURCE" = "generated" ]; then
    if [ -f "$APP_DIR/.deploy/env.before-deploy" ]; then
      write_env_assignment "$APP_DIR/.deploy/env.before-deploy" INTEGRATION_SECRET_ENCRYPTION_KEY "$PREPARED_INTEGRATION_SECRET_KEY" || return 1
    elif [ -f "$APP_DIR/.deploy/env.was_absent" ]; then
      cp -p "$APP_DIR/.env" "$APP_DIR/.deploy/env.before-deploy" || return 1
      chmod 600 "$APP_DIR/.deploy/env.before-deploy" || return 1
      rm -f "$APP_DIR/.deploy/env.was_absent" || return 1
    fi
    log "generated and persisted a new integration encryption key after confirming no existing ciphertext"
  else
    log "preserved the pre-deployment integration encryption key"
  fi
  INTEGRATION_SECRET_KEY_SOURCE="existing"
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
  prepare_integration_secret_key || err "integration secret encryption key preflight failed"
  local required_vars=(
    MYSQL_ROOT_PASSWORD MYSQL_DATABASE MYSQL_USER MYSQL_USER_PASSWORD
    REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_BUCKET
    MINIO_IMAGE MINIO_MC_IMAGE JWT_SECRET SEED_ADMIN_PASSWORD SEED_DEFAULT_PASSWORD
    INTEGRATION_SECRET_ENCRYPTION_KEY INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME
  )
  local name value
  for name in "${required_vars[@]}"; do
    value="${!name:-}"
    if [ -z "$value" ] || [[ "$value" == CHANGE_ME* ]]; then
      err ".env value is not configured: $name"
    fi
  done
  [ "${#JWT_SECRET}" -ge 32 ] || err "JWT_SECRET must contain at least 32 characters"
  for value in "$JWT_SECRET" "$MYSQL_ROOT_PASSWORD" "$MYSQL_USER_PASSWORD" "$REDIS_PASSWORD" "$MINIO_ROOT_PASSWORD"; do
    [ "$INTEGRATION_SECRET_ENCRYPTION_KEY" != "$value" ] || err "INTEGRATION_SECRET_ENCRYPTION_KEY must not reuse another platform credential"
  done
  [[ "${MINIO_IMAGE}" =~ ^(minio/minio|quay\.io/minio/minio):RELEASE\. ]] || err "MINIO_IMAGE must use a fixed RELEASE tag from minio/minio or quay.io/minio/minio"
  [[ "${MINIO_MC_IMAGE}" =~ ^(minio/mc|quay\.io/minio/mc):RELEASE\. ]] || err "MINIO_MC_IMAGE must use a fixed RELEASE tag from minio/mc or quay.io/minio/mc"
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
  local dirty current target
  dirty="$(git status --porcelain --untracked-files=normal)"
  if [ -n "$dirty" ] && [ "$ALLOW_DIRTY" != "YES" ]; then
    printf '%s\n' "$dirty" >&2
    err "the server worktree contains tracked or untracked source changes; commit, preserve and remove them, or set ALLOW_DIRTY=YES"
  fi

  if [ ! -s .deploy/last_successful_rev ]; then
    current="$(git rev-parse --verify HEAD 2>/dev/null || true)"
    if [ -n "$current" ]; then
      write_revision_file .deploy/last_successful_rev "$current" || return 1
    fi
  fi

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
  git clean -ffd
  write_release_metadata
}

start_infra() {
  compose up -d mysql redis minio
  compose up -d minio-init
  local minio_init_id minio_init_status
  minio_init_id="$(compose ps --all --quiet minio-init)"
  [ -n "$minio_init_id" ] || err "minio-init container was not created"
  minio_init_status="$(docker wait "$minio_init_id")"
  [ "$minio_init_status" = "0" ] || err "minio-init failed with exit code $minio_init_status"
  wait_mysql
}

wait_mysql() {
  source_env
  local remaining=60
  while [ "$remaining" -gt 0 ]; do
    if compose exec -T mysql sh -c 'mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; then
      return 0
    fi
    remaining=$((remaining - 1))
    sleep 2
  done
  err "mysql did not become ready"
}

quiesce_app() {
  local policy="${1:-required}"
  load_app_topology "$policy" || return 1
  log "stopping workers and application containers before backup and migration"
  if [ "${#WORKER_SERVICES[@]}" -gt 0 ]; then
    compose stop "${WORKER_SERVICES[@]}" >/dev/null 2>&1 || return 1
  fi
  compose stop backend frontend >/dev/null 2>&1 || return 1
}

resume_existing_app() {
  local policy="${1:-compatible}"
  local service
  load_app_topology "$policy" || return 1
  compose start backend >/dev/null 2>&1 || return 1
  check_url "backend readiness" "http://127.0.0.1:${BACKEND_PORT:-3000}/api/v1/ready" || return 1
  if [ "${#WORKER_SERVICES[@]}" -gt 0 ]; then
    compose start "${WORKER_SERVICES[@]}" >/dev/null 2>&1 || return 1
    for service in "${WORKER_SERVICES[@]}"; do
      check_service_stable "$service" || return 1
    done
  fi
  compose start frontend >/dev/null 2>&1 || return 1
  check_url "frontend" "http://127.0.0.1:${FRONTEND_PORT:-8080}" || return 1
  verify_release_version || return 1
  verify_service_release "${APPLICATION_SERVICES[@]}" || return 1
}

write_table_audit() {
  local output="$1"
  compose exec -T mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT TABLE_NAME,TABLE_ROWS FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='\''BASE TABLE'\'' ORDER BY TABLE_NAME;"' > "$output" 2>/dev/null || true
}

backup_database() {
  source_env
  local sql_file="$CURRENT_BACKUP_DIR/mysql.sql"
  log "backing up MySQL"
  compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --hex-blob "$MYSQL_DATABASE"' > "$sql_file" || return 1
  gzip -f "$sql_file" || return 1
  gzip -t "${sql_file}.gz" || return 1
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
    alpine sh -c 'tar czf /backup/minio.tar.gz -C /data .' || return 1
  tar -tzf "$CURRENT_BACKUP_DIR/minio.tar.gz" >/dev/null || return 1
}

create_backup() {
  local stamp id
  stamp="$(date +%Y%m%d_%H%M%S)"
  id="$(release_id)"
  CURRENT_BACKUP_DIR="backups/git-deploy/${stamp}-${id}"
  mkdir -p "$CURRENT_BACKUP_DIR" || return 1
  chmod 700 "$CURRENT_BACKUP_DIR" || return 1
  cp -p .env "$CURRENT_BACKUP_DIR/env.snapshot" || return 1
  chmod 600 "$CURRENT_BACKUP_DIR/env.snapshot" || true
  git rev-parse HEAD > "$CURRENT_BACKUP_DIR/git-revision.txt" || return 1
  compose config > "$CURRENT_BACKUP_DIR/docker-compose.resolved.yml" || return 1
  chmod 600 "$CURRENT_BACKUP_DIR/docker-compose.resolved.yml" || return 1
  write_table_audit "$CURRENT_BACKUP_DIR/table-counts.before.tsv" || return 1
  backup_database || return 1
  backup_minio || return 1
  printf '%s\n' "$CURRENT_BACKUP_DIR" > .deploy/latest_backup || return 1
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
  compose run --rm backend-migrate || return 1
  write_table_audit "$CURRENT_BACKUP_DIR/table-counts.after.tsv" || return 1
}

check_url() {
  local name="$1"
  local url="$2"
  local remaining=40
  while [ "$remaining" -gt 0 ]; do
    if curl -fsS --connect-timeout 3 --max-time 10 "$url" >/dev/null 2>&1; then
      log "$name healthy"
      return 0
    fi
    remaining=$((remaining - 1))
    sleep 3
  done
  warn "$name did not respond: $url"
  return 1
}

check_service_stable() {
  local service="$1"
  local remaining=20 container_id stable_container_id initial_restarts final_restarts
  while [ "$remaining" -gt 0 ]; do
    container_id="$(compose ps --status running --quiet "$service" 2>/dev/null || true)"
    if [ -n "$container_id" ]; then
      initial_restarts="$(docker inspect "$container_id" --format '{{.RestartCount}}' 2>/dev/null)" || return 1
      sleep 5
      stable_container_id="$(compose ps --status running --quiet "$service" 2>/dev/null || true)"
      final_restarts="$(docker inspect "$container_id" --format '{{.RestartCount}}' 2>/dev/null)" || return 1
      if [ "$stable_container_id" = "$container_id" ] && [ "$final_restarts" = "$initial_restarts" ]; then
        log "$service stable"
        return 0
      fi
    fi
    remaining=$((remaining - 1))
    sleep 3
  done
  warn "$service did not remain stable"
  return 1
}

verify_service_release() {
  local expected service container_id actual
  [ "$#" -gt 0 ] || return 1
  expected="$(release_id)"
  for service in "$@"; do
    container_id="$(compose ps --all --quiet "$service")"
    [ -n "$container_id" ] || {
      warn "$service container was not found"
      return 1
    }
    actual="$(docker inspect "$container_id" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' 2>/dev/null)" || return 1
    [ "$actual" = "$expected" ] || {
      warn "$service release mismatch: expected $expected, got ${actual:-empty}"
      return 1
    }
  done
  log "declared application release labels verified: $expected"
}

verify_release_version() {
  local expected response actual url
  expected="$(release_id)"
  url="http://127.0.0.1:${FRONTEND_PORT:-8080}/build-info.json"
  response="$(curl -fsS --connect-timeout 3 --max-time 10 -H 'Cache-Control: no-cache' "$url" 2>/dev/null)" || return 1
  actual="$(printf '%s' "$response" | sed -n 's/.*"releaseId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  [ "$actual" = "$expected" ] || {
    warn "release id mismatch: expected $expected, got ${actual:-empty}"
    return 1
  }
  log "frontend release id verified: $actual"
}

switch_app() {
  local policy="${1:-required}"
  load_app_topology "$policy" || return 1
  log "switching application containers"
  APP_SWITCH_STARTED="YES"
  compose up -d --no-deps --force-recreate --remove-orphans backend || return 1
  check_url "backend readiness" "http://127.0.0.1:${BACKEND_PORT:-3000}/api/v1/ready" || return 1
  if [ "${#WORKER_SERVICES[@]}" -gt 0 ]; then
    compose up -d --no-deps --force-recreate "${WORKER_SERVICES[@]}" || return 1
    for service in "${WORKER_SERVICES[@]}"; do
      check_service_stable "$service" || return 1
    done
  fi
  compose up -d --no-deps --force-recreate frontend || return 1
  check_url "frontend" "http://127.0.0.1:${FRONTEND_PORT:-8080}" || return 1
  verify_release_version || return 1
  verify_service_release "${APPLICATION_SERVICES[@]}" || return 1
}

mark_deployment_successful() {
  local current previous
  current="$(git rev-parse --verify HEAD)" || return 1
  previous="$(cat .deploy/last_successful_rev 2>/dev/null || true)"
  if [ -n "$previous" ] && [ "$previous" != "$current" ]; then
    write_revision_file .deploy/previous_successful_rev "$previous" || return 1
  fi
  write_revision_file .deploy/last_successful_rev "$current" || return 1
  log "successful revision recorded: $current"
}

capture_failure_diagnostics() {
  local stamp output
  local -a log_services=(backend backend-migrate frontend mysql redis minio)
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
    if load_app_topology available; then
      log_services=("${APPLICATION_SERVICES[@]}" backend-migrate mysql redis minio)
    fi
    compose logs --no-color --tail=300 "${log_services[@]}" || true
  } > "$output" 2>&1
  warn "failure diagnostics saved: $output"
}

rollback_source_from_revision_file() {
  local revision_file="$1"
  local revision_label="$2"
  local revision
  revision="$(cat "$revision_file" 2>/dev/null || true)"
  [ -n "$revision" ] || {
    warn "$revision_label git revision is unknown; skipping code rollback"
    return 1
  }
  warn "rolling code back to $revision"
  git checkout --detach "$revision" || return 1
  git reset --hard "$revision" || return 1
  write_release_metadata || return 1
}

rollback_source_to_last_successful() {
  rollback_source_from_revision_file .deploy/last_successful_rev "last successful"
}

rollback_source_to_previous_successful() {
  rollback_source_from_revision_file .deploy/previous_successful_rev "previous successful"
}

restore_data_from_backup() {
  [ "$CONFIRM_RESTORE" = "YES" ] || {
    warn "data restore is destructive. Set CONFIRM_RESTORE=YES and BACKUP_PATH=... to continue."
    return 1
  }
  source_env
  local backup volume_name
  backup="$BACKUP_PATH"
  if [ -z "$backup" ]; then
    backup="$(cat .deploy/latest_backup 2>/dev/null || true)"
  fi
  [ -n "$backup" ] && [ -d "$backup" ] || {
    warn "backup directory not found: ${backup:-empty}"
    return 1
  }
  [ -f "$backup/mysql.sql.gz" ] || {
    warn "missing database backup: $backup/mysql.sql.gz"
    return 1
  }
  gzip -t "$backup/mysql.sql.gz" || return 1
  if [ -f "$backup/minio.tar.gz" ]; then
    tar -tzf "$backup/minio.tar.gz" >/dev/null || return 1
  fi

  start_infra || return 1
  quiesce_app compatible || return 1
  log "restoring MySQL from $backup/mysql.sql.gz"
  compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"' || return 1
  gunzip -c "$backup/mysql.sql.gz" | compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' || return 1

  if [ -f "$backup/minio.tar.gz" ]; then
    volume_name="$(minio_volume_name)"
    [ -n "$volume_name" ] || {
      warn "MinIO volume not found"
      return 1
    }
    log "restoring MinIO volume: $volume_name"
    compose stop minio >/dev/null 2>&1 || true
    docker run --rm \
      -v "${volume_name}:/data" \
      -v "$(pwd)/${backup}:/backup:ro" \
      alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/minio.tar.gz -C /data' || return 1
    compose up -d minio || return 1
  fi

  log "data restore finished"
}

handle_deploy_failure() {
  local reason="$1"
  quiesce_app available || warn "failed to fully quiesce the current application topology"
  capture_failure_diagnostics || warn "failure diagnostics could not be saved"
  if [ "$ROLLBACK_DATA_ON_FAILURE" = "YES" ]; then
    warn "ROLLBACK_DATA_ON_FAILURE=YES, restoring latest backup"
    if ! CONFIRM_RESTORE=YES BACKUP_PATH="${CURRENT_BACKUP_DIR:-$BACKUP_PATH}" restore_data_from_backup; then
      err "data restore failed; application remains stopped for manual recovery"
    fi
  fi
  restore_deployment_env || warn "failed to restore the pre-deployment environment file"
  if rollback_source_to_last_successful; then
    if [ "$APP_SWITCH_STARTED" = "NO" ]; then
      if ! resume_existing_app compatible; then
        warn "existing containers could not be resumed; recreating them from retained release images"
        switch_app compatible || warn "rollback completed but health verification failed"
      fi
    elif ! switch_app compatible; then
      warn "rollback completed but health verification failed"
      resume_existing_app available || true
    fi
  else
    resume_existing_app available || true
  fi
  err "$reason"
}

handle_pre_quiesce_failure() {
  local reason="$1"
  capture_failure_diagnostics || warn "failure diagnostics could not be saved"
  restore_deployment_env || warn "failed to restore the pre-deployment environment file"
  rollback_source_to_last_successful || warn "failed to restore the last successful source revision"
  err "$reason"
}

deploy() {
  DEPLOY_ACTIVE="YES"
  init_or_adopt_repo
  acquire_lock
  checkout_target
  preflight
  if ! build_images; then
    handle_pre_quiesce_failure "image build failed"
  fi
  start_infra
  if ! persist_prepared_integration_secret_key; then
    handle_pre_quiesce_failure "integration secret encryption key preflight failed"
  fi
  if ! quiesce_app; then
    handle_deploy_failure "workers or application containers could not be stopped safely"
  fi
  if ! create_backup; then
    handle_deploy_failure "backup failed"
  fi
  if ! run_migrations; then
    handle_deploy_failure "database migration failed"
  fi
  if ! switch_app; then
    handle_deploy_failure "health check failed after switching containers"
  fi
  if ! mark_deployment_successful; then
    handle_deploy_failure "deployment succeeded but the successful revision could not be recorded"
  fi
  discard_deployment_env_backup
  DEPLOY_SUCCEEDED="YES"
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
  if ! quiesce_app compatible; then
    resume_existing_app available || true
    err "workers or application containers could not be stopped safely"
  fi
  if ! create_backup; then
    resume_existing_app available || true
    err "backup failed"
  fi
  resume_existing_app compatible
}

show_logs() {
  init_or_adopt_repo
  detect_compose
  load_app_topology available || return 1
  compose logs -f --tail=200 "${APPLICATION_SERVICES[@]}" backend-migrate
}

main() {
  trap on_exit EXIT
  case "${1:-deploy}" in
    deploy) deploy ;;
    preflight) init_or_adopt_repo; acquire_lock; preflight ;;
    backup) manual_backup ;;
    status) show_status ;;
    logs) show_logs ;;
    rollback-code) init_or_adopt_repo; acquire_lock; preflight; quiesce_app compatible; rollback_source_to_previous_successful; switch_app compatible; mark_deployment_successful ;;
    restore-data) init_or_adopt_repo; acquire_lock; preflight; restore_data_from_backup; switch_app ;;
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
USAGE
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
