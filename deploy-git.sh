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
DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-manual-$(date +%Y%m%d_%H%M%S)-$$}"
DEPLOY_ENV_UPLOAD_PATH="${DEPLOY_ENV_UPLOAD_PATH:-}"
DEPLOY_ENV_UPLOAD_SHA256="${DEPLOY_ENV_UPLOAD_SHA256:-}"
DEPLOY_GIT_BUNDLE_PATH="${DEPLOY_GIT_BUNDLE_PATH:-}"
ALLOW_RELEASE_OVERLAY_RECOVERY="${ALLOW_RELEASE_OVERLAY_RECOVERY:-NO}"
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
RESTORE_INTEGRATION_SECRET_KEY=""
RESTORE_ENV_CANDIDATE=""
RESTORED_BACKUP_DIR=""
DATA_RESTORE_STARTED="NO"
DATA_RESTORE_COMPLETED="NO"
DATABASE_MUTATION_STARTED="NO"
DEPLOY_ENV_ROLLBACK_DISABLED="NO"
PAIRED_RESTORE_AVAILABLE="NO"
BACKUP_RUNTIME_REVISION=""
BACKUP_RUNTIME_SELECTION="unavailable"
RESTORE_RUNTIME_ACTIVE="NO"
PRE_MUTATION_RUNTIME_RECOVERED="NO"
PAIRED_RUNTIME_HEALTHY="NO"
SOURCE_SWITCH_STARTED="NO"
ALLOW_INCOMPLETE_RESTORE_RETRY="NO"

log() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

env_backup_owned_by_current_run() {
  local deploy_dir="${APP_DIR}/.deploy"
  local owner
  [ -n "$DEPLOY_RUN_ID" ] || return 1
  [ -f "$deploy_dir/env.backup-owner" ] || return 1
  owner="$(cat "$deploy_dir/env.backup-owner" 2>/dev/null || true)"
  [ "$owner" = "$DEPLOY_RUN_ID" ]
}

restore_deployment_env() {
  local deploy_dir="${APP_DIR}/.deploy"
  if ! env_backup_owned_by_current_run; then
    if [ -f "$deploy_dir/env.before-deploy" ] || [ -f "$deploy_dir/env.was_absent" ]; then
      warn "ignoring an environment backup that is not owned by deployment run $DEPLOY_RUN_ID"
    fi
    return 0
  fi
  if [ -f "$deploy_dir/env.before-deploy" ]; then
    mv -f "$deploy_dir/env.before-deploy" "$APP_DIR/.env" || return 1
    rm -f "$deploy_dir/env.was_absent"
    warn "restored the environment file from before this deployment"
  elif [ -f "$deploy_dir/env.was_absent" ]; then
    rm -f "$APP_DIR/.env" "$deploy_dir/env.was_absent" || return 1
    warn "removed the environment file created by the failed deployment"
  fi
  rm -f "$deploy_dir/env.backup-owner" || return 1
  [ ! -f "$APP_DIR/.env" ] || source_env || return 1
}

discard_deployment_env_backup() {
  env_backup_owned_by_current_run || return 0
  rm -f "$APP_DIR/.deploy/env.backup-owner" || return 1
  rm -f "$APP_DIR/.deploy/env.before-deploy" "$APP_DIR/.deploy/env.was_absent" || \
    warn "inactive environment backup files could not be removed"
}

install_deployment_env_upload() {
  local deploy_dir="$APP_DIR/.deploy"
  local owner_file="$deploy_dir/env.backup-owner"
  local owner_tmp="$deploy_dir/env.backup-owner.tmp.$$"
  local actual_sha
  [ -n "$DEPLOY_ENV_UPLOAD_PATH" ] || return 0
  require_command sha256sum
  mkdir -p "$deploy_dir" || return 1
  case "$DEPLOY_ENV_UPLOAD_PATH" in
    "$deploy_dir"/env-*.upload) ;;
    *)
      warn "deployment environment upload must be located below $deploy_dir"
      return 1
      ;;
  esac
  if [ ! -f "$DEPLOY_ENV_UPLOAD_PATH" ] || [ -L "$DEPLOY_ENV_UPLOAD_PATH" ]; then
    warn "deployment environment upload is missing or is not a regular file"
    return 1
  fi
  [[ "$DEPLOY_ENV_UPLOAD_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
    warn "deployment environment upload checksum is invalid"
    return 1
  }
  actual_sha="$(sha256sum "$DEPLOY_ENV_UPLOAD_PATH" | awk '{print $1}')" || return 1
  [ "$actual_sha" = "$DEPLOY_ENV_UPLOAD_SHA256" ] || {
    warn "deployment environment upload checksum does not match"
    return 1
  }
  if [ -e "$owner_file" ] || [ -e "$deploy_dir/env.before-deploy" ] || [ -e "$deploy_dir/env.was_absent" ]; then
    warn "an unresolved deployment environment backup already exists; refusing to overwrite it"
    return 1
  fi

  if [ -f "$APP_DIR/.env" ]; then
    cp -p "$APP_DIR/.env" "$deploy_dir/env.before-deploy" || return 1
    chmod 600 "$deploy_dir/env.before-deploy" || return 1
  else
    install -m 600 /dev/null "$deploy_dir/env.was_absent" || return 1
  fi
  printf '%s\n' "$DEPLOY_RUN_ID" > "$owner_tmp" || return 1
  chmod 600 "$owner_tmp" || return 1
  mv -f "$owner_tmp" "$owner_file" || return 1
  mv -f "$DEPLOY_ENV_UPLOAD_PATH" "$APP_DIR/.env" || return 1
  chmod 600 "$APP_DIR/.env" || return 1
  log "installed the checksummed deployment environment after acquiring the deployment lock"
}

preserve_deployment_env_backup_for_recovery() {
  local deploy_dir="${APP_DIR}/.deploy"
  local recovery_dir="$deploy_dir/recovery-env/$DEPLOY_RUN_ID"
  local recovery_owner="recovery:$DEPLOY_RUN_ID"
  local owner_tmp="$deploy_dir/env.backup-owner.recovery.tmp.$$"
  DEPLOY_ENV_ROLLBACK_DISABLED="YES"
  if ! env_backup_owned_by_current_run; then
    return 0
  fi

  # Change ownership first so neither this script nor the outer workflow can
  # restore the source environment after a potentially mutating migration.
  printf '%s\n' "$recovery_owner" > "$owner_tmp" || return 1
  chmod 600 "$owner_tmp" || return 1
  mv -f "$owner_tmp" "$deploy_dir/env.backup-owner" || return 1
  mkdir -p "$recovery_dir" || return 1
  chmod 700 "$recovery_dir" || return 1
  if [ -f "$deploy_dir/env.before-deploy" ]; then
    mv -f "$deploy_dir/env.before-deploy" "$recovery_dir/env.before-deploy" || return 1
  fi
  if [ -f "$deploy_dir/env.was_absent" ]; then
    mv -f "$deploy_dir/env.was_absent" "$recovery_dir/env.was_absent" || return 1
  fi
  printf '%s\n' "$DEPLOY_RUN_ID" > "$recovery_dir/owner" || return 1
  chmod 600 "$recovery_dir/owner" || return 1
  rm -f "$deploy_dir/env.backup-owner" || return 1
  warn "pre-deployment environment snapshot preserved for manual recovery: $recovery_dir"
}

on_exit() {
  local status="$?"
  set +e
  if [ "$status" -ne 0 ] && [ "$DEPLOY_ACTIVE" = "YES" ] && [ "$DEPLOY_SUCCEEDED" != "YES" ]; then
    if [ "$DATABASE_MUTATION_STARTED" = "YES" ]; then
      if [ "$PAIRED_RUNTIME_HEALTHY" != "YES" ]; then
        quiesce_app available || warn "failed to stop the application after an unexpected post-migration failure"
      fi
      if [ "$DEPLOY_ENV_ROLLBACK_DISABLED" != "YES" ]; then
        preserve_deployment_env_backup_for_recovery || \
          warn "failed to preserve the source environment snapshot after an unexpected post-migration failure"
      fi
    elif [ "$PRE_MUTATION_RUNTIME_RECOVERED" != "YES" ] && [ "$SOURCE_SWITCH_STARTED" = "YES" ]; then
      recover_pre_mutation_runtime || warn "failed to recover the pre-deployment runtime during exit handling"
    elif [ "$PRE_MUTATION_RUNTIME_RECOVERED" != "YES" ]; then
      restore_deployment_env || warn "failed to restore the pre-deployment environment file during exit handling"
    fi
  fi
  [ -z "$RESTORE_ENV_CANDIDATE" ] || rm -f "$RESTORE_ENV_CANDIDATE"
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

validate_no_reserved_env_assignments() {
  local reserved
  reserved='APP_DIR|REPO_URL|BRANCH|REF|COMPOSE_FILES|ADOPT_EXISTING_PACKAGE|ALLOW_DIRTY|SKIP_GIT_FETCH|ROLLBACK_DATA_ON_FAILURE|CONFIRM_RESTORE|BACKUP_PATH|DEPLOY_RUN_ID|DEPLOY_ENV_UPLOAD_PATH|DEPLOY_ENV_UPLOAD_SHA256|DEPLOY_GIT_BUNDLE_PATH|ALLOW_RELEASE_OVERLAY_RECOVERY|LOCK_DIR|CURRENT_BACKUP_DIR|DEPLOY_ACTIVE|DEPLOY_SUCCEEDED|INTEGRATION_SECRET_KEY_SOURCE|PREPARED_INTEGRATION_SECRET_KEY|DECLARED_COMPOSE_SERVICES|APPLICATION_SERVICES|WORKER_SERVICES|APP_SWITCH_STARTED|RESTORE_INTEGRATION_SECRET_KEY|RESTORE_ENV_CANDIDATE|RESTORED_BACKUP_DIR|DATA_RESTORE_STARTED|DATA_RESTORE_COMPLETED|DATABASE_MUTATION_STARTED|DEPLOY_ENV_ROLLBACK_DISABLED|PAIRED_RESTORE_AVAILABLE|BACKUP_RUNTIME_REVISION|BACKUP_RUNTIME_SELECTION|RESTORE_RUNTIME_ACTIVE|PRE_MUTATION_RUNTIME_RECOVERED|PAIRED_RUNTIME_HEALTHY|SOURCE_SWITCH_STARTED|ALLOW_INCOMPLETE_RESTORE_RETRY'
  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?(${reserved})=" .env; then
    warn ".env contains a reserved deployment-control assignment"
    return 1
  fi
}

source_env() {
  ensure_env
  validate_no_reserved_env_assignments || return 1
  # The deployment environment file is authoritative for the encryption key.
  # An inherited shell value must not make a missing key look persistent.
  unset INTEGRATION_SECRET_ENCRYPTION_KEY
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
}

mysql_query() {
  local query="$1"
  # Variables in this command are intentionally expanded by the MySQL container shell.
  # shellcheck disable=SC2016
  compose exec -T mysql sh -c \
    'mysql --batch --raw --skip-column-names -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "$1"' \
    sh "$query"
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
  env_backup_owned_by_current_run || return 1
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
    # Variables in this command are intentionally expanded by the MySQL container shell.
    # shellcheck disable=SC2016
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
    # Variables in this command are intentionally expanded by the MySQL container shell.
    # shellcheck disable=SC2016
    compose exec -T mysql sh -c \
      'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM integration_configs WHERE encrypted_config IS NOT NULL AND CHAR_LENGTH(encrypted_config) > 0;"' \
      2>/dev/null | tr -d '[:space:]'
  )" || return 1
  [[ "$ciphertext_count" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$ciphertext_count"
}

persist_prepared_integration_secret_key() {
  local ciphertext_count previous_key=""
  valid_integration_secret_key "$PREPARED_INTEGRATION_SECRET_KEY" || {
    warn "the prepared integration encryption key is unavailable or invalid"
    return 1
  }
  export INTEGRATION_SECRET_ENCRYPTION_KEY="$PREPARED_INTEGRATION_SECRET_KEY"
  previous_key="$(read_previous_integration_secret_key 2>/dev/null || true)"
  if [ -n "$previous_key" ] && valid_integration_secret_key "$previous_key" && [ "$previous_key" != "$PREPARED_INTEGRATION_SECRET_KEY" ]; then
    ciphertext_count="$(encrypted_integration_config_count)" || {
      warn "could not verify existing integration ciphertext before changing its encryption key"
      return 1
    }
    if [ "$ciphertext_count" != "0" ]; then
      warn "the uploaded integration encryption key differs from the source environment while ciphertext exists; use the dedicated key-rotation procedure"
      return 1
    fi
  fi
  case "$INTEGRATION_SECRET_KEY_SOURCE" in
    existing) ;;
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
  if [ "$INTEGRATION_SECRET_KEY_SOURCE" = "generated" ] && env_backup_owned_by_current_run; then
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
  [[ "$DEPLOY_RUN_ID" =~ ^[A-Za-z0-9._:-]+$ ]] || err "DEPLOY_RUN_ID contains unsupported characters"
  [ -f docker-compose.yml ] || err "missing docker-compose.yml"
  [ -f delivery-platform-web/Dockerfile ] || err "missing delivery-platform-web/Dockerfile"
  [ -f delivery-platform-server/Dockerfile ] || err "missing delivery-platform-server/Dockerfile"
  [ -f delivery-platform-server/prisma/schema.prisma ] || err "missing Prisma schema"
  [ -f delivery-platform-server/prisma/prepare-migrate.js ] || err "missing Prisma migration guard"
}

validate_env() {
  source_env
  require_command sha256sum
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
  assert_no_incomplete_data_restore || return 1
  validate_layout
  detect_compose
  validate_env
  compose config -q >/dev/null
  log "preflight passed"
}

assert_no_incomplete_data_restore() {
  local marker="$APP_DIR/.deploy/data-restore-incomplete"
  [ ! -e "$marker" ] || {
    if [ "$ALLOW_INCOMPLETE_RESTORE_RETRY" = "YES" ] && [ -d "$marker" ] && [ ! -L "$marker" ]; then
      return 0
    fi
    warn "an incomplete paired data restore is recorded; ordinary deploy, backup and code rollback are blocked"
    return 1
  }
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
  SOURCE_SWITCH_STARTED="YES"
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

import_deployment_bundle() {
  local fetched_ref
  [ -n "$DEPLOY_GIT_BUNDLE_PATH" ] || return 0
  case "$DEPLOY_GIT_BUNDLE_PATH" in
    /tmp/delivery-platform-release-*.bundle) ;;
    *)
      warn "deployment Git bundle path is outside the approved temporary namespace"
      return 1
      ;;
  esac
  if [ ! -f "$DEPLOY_GIT_BUNDLE_PATH" ] || [ -L "$DEPLOY_GIT_BUNDLE_PATH" ]; then
    warn "deployment Git bundle is missing or is not a regular file"
    return 1
  fi
  [ -n "$REF" ] || {
    warn "an exact REF is required when importing a deployment bundle"
    return 1
  }
  git bundle verify "$DEPLOY_GIT_BUNDLE_PATH" >/dev/null || return 1
  git fetch "$DEPLOY_GIT_BUNDLE_PATH" HEAD || return 1
  fetched_ref="$(git rev-parse FETCH_HEAD)" || return 1
  [ "$fetched_ref" = "$REF" ] || {
    warn "deployment bundle HEAD does not match the requested target revision"
    return 1
  }
  git cat-file -e "${REF}^{commit}" || return 1
}

recover_release_overlay() {
  local -a overlay_paths=()
  local -a untracked_paths=()
  local actual_hashes expected_hashes candidate revision path
  local stamp recovery_dir destination candidate_short
  [ ! -e "$APP_DIR/.deploy/release-overlay-recovery-consumed" ] || return 1
  git diff --cached --quiet || return 1
  mapfile -d '' -t overlay_paths < <(
    git diff --name-only -z
    git ls-files --others --exclude-standard -z
  )
  [ "${#overlay_paths[@]}" -gt 0 ] || return 1
  for path in "${overlay_paths[@]}"; do
    [ -f "$path" ] || return 1
    case "$path" in
      *$'\n'*) return 1 ;;
    esac
  done
  actual_hashes="$(printf '%s\n' "${overlay_paths[@]}" | git hash-object --stdin-paths)" || return 1
  candidate=""
  while IFS= read -r revision; do
    expected_hashes="$({
      for path in "${overlay_paths[@]}"; do
        printf '%s:%s\n' "$revision" "$path"
      done
    } | git cat-file --batch-check='%(objectname)')" || return 1
    if [ "$actual_hashes" = "$expected_hashes" ]; then
      candidate="$revision"
      break
    fi
  done < <(git rev-list --max-count=32 "$(target_ref)")
  [ -n "$candidate" ] || return 1

  stamp="$(date +%Y%m%d_%H%M%S)"
  candidate_short="${candidate:0:12}"
  recovery_dir="$APP_DIR/.deploy/recovered-overlays/${stamp}-${candidate_short}"
  mkdir -p "$recovery_dir/untracked" || return 1
  git status --porcelain=v1 -z --untracked-files=normal > "$recovery_dir/status.z" || return 1
  git diff --binary > "$recovery_dir/tracked.patch" || return 1
  mapfile -d '' -t untracked_paths < <(git ls-files --others --exclude-standard -z)
  for path in "${untracked_paths[@]}"; do
    destination="$recovery_dir/untracked/$path"
    mkdir -p "$(dirname "$destination")" || return 1
    mv "$path" "$destination" || return 1
  done
  git restore --source=HEAD --worktree -- . || return 1
  [ -z "$(git status --porcelain --untracked-files=normal)" ] || return 1
  printf '%s\n' "$candidate" > "$recovery_dir/recovered-release.txt" || return 1
  printf '%s\n' "$candidate" > "$APP_DIR/.deploy/release-overlay-recovery-consumed" || return 1
  warn "recovered an exact historical archive overlay from release $candidate_short"
}

prepare_deployment_source() {
  import_deployment_bundle || return 1
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    [ "$ALLOW_RELEASE_OVERLAY_RECOVERY" = "YES" ] || return 1
    recover_release_overlay || return 1
  fi
}

start_infra() {
  compose up -d mysql redis minio || return 1
  compose up -d minio-init || return 1
  local minio_init_id minio_init_status
  minio_init_id="$(compose ps --all --quiet minio-init)" || return 1
  [ -n "$minio_init_id" ] || {
    warn "minio-init container was not created"
    return 1
  }
  minio_init_status="$(docker wait "$minio_init_id")" || return 1
  [ "$minio_init_status" = "0" ] || {
    warn "minio-init failed with exit code $minio_init_status"
    return 1
  }
  wait_mysql || return 1
}

wait_mysql() {
  # Every public operation performs preflight/source_env before starting
  # infrastructure. Reloading .env here would discard a freshly prepared
  # integration key before it can be checked against live ciphertext and
  # persisted atomically.
  local remaining=60
  while [ "$remaining" -gt 0 ]; do
    # Variables in this command are intentionally expanded by the MySQL container shell.
    # shellcheck disable=SC2016
    if compose exec -T mysql sh -c 'mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; then
      return 0
    fi
    remaining=$((remaining - 1))
    sleep 2
  done
  warn "mysql did not become ready"
  return 1
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
  local tables table count
  tables="$(mysql_query "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;")" || return 1
  : > "$output" || return 1
  while IFS= read -r table; do
    [ -n "$table" ] || continue
    [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || {
      warn "database audit rejected an unsafe table identifier"
      return 1
    }
    count="$(mysql_query "SELECT COUNT(*) FROM \`$table\`;")" || return 1
    count="$(printf '%s' "$count" | tr -d '[:space:]')"
    [[ "$count" =~ ^[0-9]+$ ]] || return 1
    printf '%s\t%s\n' "$table" "$count" >> "$output" || return 1
  done <<< "$tables"
}

write_foreign_key_audit() {
  local output="$1"
  local metadata constraint child_table parent_table ordinal child_column parent_column identifier
  local key prefix query orphan_count status=0
  local -a keys=()
  local -A child_tables=()
  local -A parent_tables=()
  local -A join_conditions=()
  local -A nonnull_conditions=()
  local -A first_parent_columns=()

  metadata="$(mysql_query "SELECT CONSTRAINT_NAME,TABLE_NAME,REFERENCED_TABLE_NAME,ORDINAL_POSITION,COLUMN_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION;")" || return 1
  : > "$output" || return 1
  [ -n "$metadata" ] || return 0

  while IFS=$'\t' read -r constraint child_table parent_table ordinal child_column parent_column; do
    for identifier in "$constraint" "$child_table" "$parent_table" "$child_column" "$parent_column"; do
      [[ "$identifier" =~ ^[A-Za-z0-9_]+$ ]] || {
        warn "foreign-key audit rejected an unsafe database identifier"
        return 1
      }
    done
    [[ "$ordinal" =~ ^[0-9]+$ ]] || return 1
    key="${child_table}|${constraint}"
    if [ -z "${child_tables[$key]+set}" ]; then
      keys+=("$key")
      child_tables["$key"]="$child_table"
      parent_tables["$key"]="$parent_table"
      first_parent_columns["$key"]="$parent_column"
      prefix=""
    else
      [ "${child_tables[$key]}" = "$child_table" ] || return 1
      [ "${parent_tables[$key]}" = "$parent_table" ] || return 1
      prefix=" AND "
    fi
    join_conditions["$key"]+="${prefix}child.\`$child_column\` = parent.\`$parent_column\`"
    nonnull_conditions["$key"]+="${prefix}child.\`$child_column\` IS NOT NULL"
  done <<< "$metadata"

  for key in "${keys[@]}"; do
    child_table="${child_tables[$key]}"
    parent_table="${parent_tables[$key]}"
    constraint="${key#*|}"
    query="SELECT COUNT(*) FROM \`$child_table\` child LEFT JOIN \`$parent_table\` parent ON ${join_conditions[$key]} WHERE ${nonnull_conditions[$key]} AND parent.\`${first_parent_columns[$key]}\` IS NULL;"
    orphan_count="$(mysql_query "$query")" || return 1
    orphan_count="$(printf '%s' "$orphan_count" | tr -d '[:space:]')"
    [[ "$orphan_count" =~ ^[0-9]+$ ]] || return 1
    printf '%s.%s\t%s\n' "$child_table" "$constraint" "$orphan_count" >> "$output" || return 1
    if [ "$orphan_count" != "0" ]; then
      warn "foreign-key audit found $orphan_count orphan row(s) for $child_table.$constraint"
      status=1
    fi
  done
  return "$status"
}

verify_table_counts_preserved() {
  local before="$1"
  local after="$2"
  local output="$3"
  local table count extra before_count after_count delta status=0
  local -A after_counts=()
  local -A before_tables=()
  if [ ! -f "$before" ] || [ ! -f "$after" ]; then
    return 1
  fi
  : > "$output" || return 1

  while IFS=$'\t' read -r table count extra; do
    [ -n "$table" ] || continue
    [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || return 1
    [[ "$count" =~ ^[0-9]+$ ]] || return 1
    [ -z "$extra" ] || return 1
    [ -z "${after_counts[$table]+set}" ] || return 1
    after_counts["$table"]="$count"
  done < "$after"

  while IFS=$'\t' read -r table before_count extra; do
    [ -n "$table" ] || continue
    [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || return 1
    [[ "$before_count" =~ ^[0-9]+$ ]] || return 1
    [ -z "$extra" ] || return 1
    [ -z "${before_tables[$table]+set}" ] || return 1
    before_tables["$table"]="$before_count"
    if [ -z "${after_counts[$table]+set}" ]; then
      printf '%s\t%s\tMISSING\tMISSING\n' "$table" "$before_count" >> "$output" || return 1
      warn "database migration removed audited table $table"
      status=1
      continue
    fi
    after_count="${after_counts[$table]}"
    delta=$((after_count - before_count))
    printf '%s\t%s\t%s\t%s\n' "$table" "$before_count" "$after_count" "$delta" >> "$output" || return 1
    if [ "$delta" -lt 0 ]; then
      warn "database migration reduced $table row count from $before_count to $after_count"
      status=1
    fi
  done < "$before"

  while IFS=$'\t' read -r table after_count extra; do
    [ -n "$table" ] || continue
    if [ -z "${before_tables[$table]+set}" ]; then
      printf '%s\tNEW\t%s\tNEW\n' "$table" "$after_count" >> "$output" || return 1
    fi
  done < "$after"
  return "$status"
}

deployment_data_revision() {
  local revision
  revision="$(cat .deploy/last_successful_rev 2>/dev/null || true)"
  if [ -z "$revision" ]; then
    revision="$(git rev-parse --verify HEAD 2>/dev/null || true)"
  fi
  [ -n "$revision" ] || return 1
  git cat-file -e "${revision}^{commit}" 2>/dev/null || return 1
  printf '%s\n' "$revision"
}

integration_secret_key_fingerprint() {
  local key="$1"
  valid_integration_secret_key "$key" || return 1
  printf '%s' "$key" | openssl base64 -d -A | sha256sum | awk '{print $1}'
}

write_database_migration_manifest() {
  local output="$1"
  local state_output="$2"
  local table_count unfinished rows name checksum extra
  : > "$output" || return 1
  table_count="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=0x5f707269736d615f6d6967726174696f6e73;")" || return 1
  table_count="$(printf '%s' "$table_count" | tr -d '[:space:]')"
  case "$table_count" in
    0)
      printf 'CLEAN\n' > "$state_output" || return 1
      return 0
      ;;
    1) ;;
    *) return 1 ;;
  esac
  unfinished="$(mysql_query "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;")" || return 1
  unfinished="$(printf '%s' "$unfinished" | tr -d '[:space:]')"
  [[ "$unfinished" =~ ^[0-9]+$ ]] || return 1
  if [ "$unfinished" != "0" ]; then
    printf 'UNSAFE_UNFINISHED_MIGRATION\n' > "$state_output" || return 1
  else
    printf 'CLEAN\n' > "$state_output" || return 1
  fi
  rows="$(mysql_query "SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;")" || return 1
  while IFS=$'\t' read -r name checksum extra; do
    [ -n "$name" ] || continue
    [[ "$name" =~ ^[A-Za-z0-9_-]+$ ]] || return 1
    [[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || return 1
    [ -z "$extra" ] || return 1
    printf '%s\t%s\n' "$name" "$checksum" >> "$output" || return 1
  done <<< "$rows"
}

write_revision_migration_manifest() {
  local revision="$1"
  local output="$2"
  local paths path directory name checksum
  : > "$output" || return 1
  paths="$(git ls-tree -r --name-only "$revision" -- delivery-platform-server/prisma/migrations)" || return 1
  while IFS= read -r path; do
    case "$path" in
      delivery-platform-server/prisma/migrations/*/migration.sql) ;;
      *) continue ;;
    esac
    directory="${path%/migration.sql}"
    name="${directory##*/}"
    [[ "$name" =~ ^[A-Za-z0-9_-]+$ ]] || return 1
    checksum="$(git show "$revision:$path" | sha256sum | awk '{print $1}')" || return 1
    [[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || return 1
    printf '%s\t%s\n' "$name" "$checksum" >> "$output" || return 1
  done <<< "$paths"
  LC_ALL=C sort -o "$output" "$output" || return 1
}

validate_code_only_rollback_revision() {
  local revision_file="$1"
  local revision_label="$2"
  local revision validation_prefix database_manifest database_state revision_manifest
  if [ -f .deploy/database-mutation-target ]; then
    warn "a database mutation recovery marker exists; refusing a code-only rollback"
    return 1
  fi
  revision="$(cat "$revision_file" 2>/dev/null || true)"
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || {
    warn "$revision_label git revision is missing or invalid"
    return 1
  }
  git cat-file -e "${revision}^{commit}" 2>/dev/null || {
    warn "$revision_label git revision is unavailable"
    return 1
  }

  validation_prefix="$APP_DIR/.deploy/code-rollback-validation-${DEPLOY_RUN_ID}"
  database_manifest="${validation_prefix}.database.tsv"
  database_state="${validation_prefix}.database-state.txt"
  revision_manifest="${validation_prefix}.revision.tsv"
  if ! write_database_migration_manifest "$database_manifest" "$database_state" || \
     ! grep -Fxq 'CLEAN' "$database_state" || \
     ! write_revision_migration_manifest "$revision" "$revision_manifest" || \
     ! cmp -s "$database_manifest" "$revision_manifest"; then
    rm -f "$database_manifest" "$database_state" "$revision_manifest"
    warn "$revision_label code does not exactly match the live Prisma migration manifest"
    return 1
  fi
  rm -f "$database_manifest" "$database_state" "$revision_manifest"
}

select_backup_runtime_revision() {
  local source_revision="$1"
  local target_revision="$2"
  local backup_dir="$3"
  local recovery_revision=""
  write_database_migration_manifest \
    "$backup_dir/database-migrations.before.tsv" \
    "$backup_dir/database-migration-state.txt" || return 1
  write_revision_migration_manifest "$source_revision" "$backup_dir/source-migrations.tsv" || return 1
  write_revision_migration_manifest "$target_revision" "$backup_dir/target-migrations.tsv" || return 1
  : > "$backup_dir/recovery-migrations.tsv" || return 1
  recovery_revision="$(cat .deploy/database-mutation-target 2>/dev/null || true)"
  if [[ "$recovery_revision" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "${recovery_revision}^{commit}" 2>/dev/null; then
    write_revision_migration_manifest "$recovery_revision" "$backup_dir/recovery-migrations.tsv" || return 1
  else
    recovery_revision=""
  fi

  BACKUP_RUNTIME_REVISION="$target_revision"
  BACKUP_RUNTIME_SELECTION="unavailable"
  PAIRED_RESTORE_AVAILABLE="NO"
  if grep -Fxq 'CLEAN' "$backup_dir/database-migration-state.txt"; then
    if [ -n "$recovery_revision" ] && cmp -s "$backup_dir/database-migrations.before.tsv" "$backup_dir/recovery-migrations.tsv"; then
      BACKUP_RUNTIME_REVISION="$recovery_revision"
      BACKUP_RUNTIME_SELECTION="recovery"
      PAIRED_RESTORE_AVAILABLE="YES"
    elif cmp -s "$backup_dir/database-migrations.before.tsv" "$backup_dir/source-migrations.tsv"; then
      BACKUP_RUNTIME_REVISION="$source_revision"
      BACKUP_RUNTIME_SELECTION="source"
      PAIRED_RESTORE_AVAILABLE="YES"
    elif cmp -s "$backup_dir/database-migrations.before.tsv" "$backup_dir/target-migrations.tsv"; then
      BACKUP_RUNTIME_REVISION="$target_revision"
      BACKUP_RUNTIME_SELECTION="target"
      PAIRED_RESTORE_AVAILABLE="YES"
    fi
  fi
  printf '%s\n' "$BACKUP_RUNTIME_SELECTION" > "$backup_dir/runtime-selection.txt" || return 1
  printf '%s\n' "$PAIRED_RESTORE_AVAILABLE" > "$backup_dir/paired-restore.status" || return 1
  if [ "$PAIRED_RESTORE_AVAILABLE" != "YES" ]; then
    warn "no source or target revision exactly matches the applied Prisma migration manifest; this backup is data-recovery-only"
  fi
}

validate_compose_file_list() {
  local compose_files="$1"
  local file
  local -a files
  IFS=':' read -r -a files <<< "$compose_files"
  [ "${#files[@]}" -gt 0 ] || return 1
  for file in "${files[@]}"; do
    [ -n "$file" ] || return 1
    case "$file" in
      /*|..|../*|*/../*|*/..) return 1 ;;
    esac
  done
}

render_revision_compose() (
  local revision="$1"
  local env_file="$2"
  local compose_files="$3"
  local config_output="$4"
  local services_output="$5"
  local override_file="${6:-}"
  local tree="$APP_DIR/.deploy/runtime-tree-${DEPLOY_RUN_ID}-$$"
  local raw_config="$APP_DIR/.deploy/runtime-config-${DEPLOY_RUN_ID}-$$.raw"
  local file line
  local -a files args
  trap 'rm -rf "$tree" "$raw_config"' EXIT
  validate_compose_file_list "$compose_files" || return 1
  mkdir -p "$tree" || return 1
  git archive "$revision" | tar -x -C "$tree" || return 1
  IFS=':' read -r -a files <<< "$compose_files"
  args=()
  for file in "${files[@]}"; do
    [ -f "$tree/$file" ] || return 1
    args+=("-f" "$file")
  done
  if [ -n "$override_file" ]; then
    [ -f "$override_file" ] || return 1
    args+=("-f" "$override_file")
  fi
  (
    cd "$tree"
    "${COMPOSE[@]}" --env-file "$env_file" -p "$COMPOSE_PROJECT_NAME" "${args[@]}" config
  ) > "$raw_config" || return 1
  : > "$config_output" || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s\n' "${line//$tree/__RUNTIME_TREE__}" >> "$config_output" || return 1
  done < "$raw_config"
  (
    cd "$tree"
    "${COMPOSE[@]}" --env-file "$env_file" -p "$COMPOSE_PROJECT_NAME" "${args[@]}" config --services
  ) > "$services_output" || return 1
  grep -Fxq backend "$services_output" || return 1
  grep -Fxq frontend "$services_output" || return 1
  local has_file_worker="NO" has_outbox_worker="NO"
  grep -Fxq file-worker "$services_output" && has_file_worker="YES"
  grep -Fxq outbox-worker "$services_output" && has_outbox_worker="YES"
  [ "$has_file_worker" = "$has_outbox_worker" ] || return 1
)

runtime_service_container_id() {
  local service="$1"
  docker ps -a \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
    --filter "label=com.docker.compose.service=$service" \
    --format '{{.ID}}' | sed -n '1p'
}

image_identity() {
  local image="$1"
  docker image inspect "$image" \
    --format '{{.Id}}\t{{index .Config.Labels "org.opencontainers.image.title"}}\t{{index .Config.Labels "org.opencontainers.image.version"}}'
}

write_retained_runtime_images() {
  local backup_dir="$1"
  local runtime_revision="$2"
  local runtime_selection="$3"
  local services_file="$4"
  local runtime_id="${runtime_revision:0:12}"
  local service expected_title tag container_id image_id identity actual_id title version extra backend_id=""
  : > "$backup_dir/retained-images.tsv" || return 1
  {
    printf 'services:\n'
  } > "$backup_dir/restore-images.override.yml" || return 1
  for service in backend file-worker outbox-worker frontend; do
    grep -Fxq "$service" "$services_file" || continue
    if [ "$service" = "frontend" ]; then
      expected_title="delivery-platform-frontend"
      tag="delivery-platform-frontend:$runtime_id"
    else
      expected_title="delivery-platform-backend"
      tag="delivery-platform-backend:$runtime_id"
    fi
    if [ "$runtime_selection" = "source" ]; then
      container_id="$(runtime_service_container_id "$service")" || return 1
      [ -n "$container_id" ] || {
        warn "source runtime container is unavailable: $service"
        return 1
      }
      image_id="$(docker inspect "$container_id" --format '{{.Image}}')" || return 1
      identity="$(image_identity "$image_id")" || return 1
    else
      identity="$(image_identity "$tag")" || return 1
    fi
    IFS=$'\t' read -r actual_id title version extra <<< "$identity"
    [[ "$actual_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
    [ "$title" = "$expected_title" ] || return 1
    [ "$version" = "$runtime_id" ] || return 1
    [ -z "$extra" ] || return 1
    if [ "$service" = "backend" ]; then
      backend_id="$actual_id"
    elif [ "$service" != "frontend" ] && [ "$actual_id" != "$backend_id" ]; then
      warn "$service does not use the same immutable image as backend"
      return 1
    fi
    if [ "$runtime_selection" = "source" ] && { [ "$service" = "backend" ] || [ "$service" = "frontend" ]; }; then
      docker image tag "$actual_id" "$tag" || return 1
      [ "$(docker image inspect "$tag" --format '{{.Id}}')" = "$actual_id" ] || return 1
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$service" "$tag" "$actual_id" "$title" "$version" >> "$backup_dir/retained-images.tsv" || return 1
    {
      printf '  %s:\n' "$service"
      printf '    image: %s\n' "$tag"
    } >> "$backup_dir/restore-images.override.yml" || return 1
  done
}

validate_retained_runtime_images() {
  local backup_dir="$1"
  local revision runtime_id service tag expected_id expected_title expected_version extra identity actual_id title version
  local expected_tag expected_service_title
  local seen_backend="NO" seen_frontend="NO" seen_file_worker="NO" seen_outbox_worker="NO"
  revision="$(tr -d '[:space:]' < "$backup_dir/git-revision.txt")" || return 1
  runtime_id="${revision:0:12}"
  while IFS=$'\t' read -r service tag expected_id expected_title expected_version extra; do
    [ -n "$service" ] || continue
    [[ "$service" =~ ^(backend|file-worker|outbox-worker|frontend)$ ]] || return 1
    [[ "$expected_id" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
    [ -z "$extra" ] || return 1
    if [ "$service" = "frontend" ]; then
      expected_tag="delivery-platform-frontend:$runtime_id"
      expected_service_title="delivery-platform-frontend"
      seen_frontend="YES"
    else
      expected_tag="delivery-platform-backend:$runtime_id"
      expected_service_title="delivery-platform-backend"
      case "$service" in
        backend) seen_backend="YES" ;;
        file-worker) seen_file_worker="YES" ;;
        outbox-worker) seen_outbox_worker="YES" ;;
      esac
    fi
    [ "$tag" = "$expected_tag" ] || return 1
    [ "$expected_title" = "$expected_service_title" ] || return 1
    [ "$expected_version" = "$runtime_id" ] || return 1
    identity="$(image_identity "$tag")" || return 1
    IFS=$'\t' read -r actual_id title version extra <<< "$identity"
    [ "$actual_id" = "$expected_id" ] || return 1
    [ "$title" = "$expected_title" ] || return 1
    [ "$version" = "$expected_version" ] || return 1
    [ -z "$extra" ] || return 1
  done < "$backup_dir/retained-images.tsv"
  if [ "$seen_backend" != "YES" ] || [ "$seen_frontend" != "YES" ]; then
    return 1
  fi
  [ "$seen_file_worker" = "$seen_outbox_worker" ] || return 1
  if grep -Fxq file-worker "$backup_dir/runtime-topology.services"; then
    [ "$seen_file_worker" = "YES" ] || return 1
  else
    [ "$seen_file_worker" = "NO" ] || return 1
  fi
}

write_backup_checksums() {
  local backup_dir="$1"
  local temporary="$backup_dir/checksums.sha256.tmp.$$"
  local file
  local -a required_files=(
    backup-format-version
    env.snapshot
    integration-secret-key.sha256
    git-revision.txt
    previous-successful-revision.txt
    target-git-revision.txt
    compose-files.txt
    docker-compose.resolved.yml
    runtime-selection.txt
    paired-restore.status
    database-migration-state.txt
    database-migrations.before.tsv
    source-migrations.tsv
    target-migrations.tsv
    recovery-migrations.tsv
    runtime-compose.resolved.yml
    runtime-topology.services
    runtime-compose-with-images.resolved.yml
    retained-images.tsv
    restore-images.override.yml
    table-counts.before.tsv
    foreign-keys.before.tsv
    mysql.sql.gz
    minio.tar.gz
  )
  local -a optional_files=(
    table-counts.after.tsv
    foreign-keys.after.tsv
    table-count-deltas.tsv
  )
  : > "$temporary" || return 1
  for file in "${required_files[@]}"; do
    [ -f "$backup_dir/$file" ] || {
      warn "required backup artifact is missing: $file"
      rm -f "$temporary"
      return 1
    }
    (cd "$backup_dir" && sha256sum -- "$file") >> "$temporary" || return 1
  done
  for file in "${optional_files[@]}"; do
    [ -f "$backup_dir/$file" ] || continue
    (cd "$backup_dir" && sha256sum -- "$file") >> "$temporary" || return 1
  done
  chmod 600 "$temporary" || return 1
  mv -f "$temporary" "$backup_dir/checksums.sha256" || return 1
}

verify_backup_checksums() {
  local backup_dir="$1"
  [ -f "$backup_dir/checksums.sha256" ] || {
    warn "backup checksum manifest is missing"
    return 1
  }
  (cd "$backup_dir" && sha256sum --check --strict checksums.sha256 >/dev/null) || {
    warn "backup checksum verification failed"
    return 1
  }
}

data_restore_backup_digest() {
  local backup="$1"
  sha256sum "$backup/checksums.sha256" | awk '{print $1}'
}

validate_incomplete_data_restore_binding() {
  local backup="$1"
  local marker="$APP_DIR/.deploy/data-restore-incomplete"
  local recorded_backup recorded_digest recorded_revision actual_digest actual_revision file
  [ -d "$marker" ] && [ ! -L "$marker" ] || return 1
  for file in backup-path.txt checksums.sha256.digest git-revision.txt run-id.txt; do
    [ -f "$marker/$file" ] && [ ! -L "$marker/$file" ] || return 1
  done
  recorded_backup="$(tr -d '\r\n' < "$marker/backup-path.txt")" || return 1
  recorded_digest="$(tr -d '[:space:]' < "$marker/checksums.sha256.digest")" || return 1
  recorded_revision="$(tr -d '[:space:]' < "$marker/git-revision.txt")" || return 1
  actual_digest="$(data_restore_backup_digest "$backup")" || return 1
  actual_revision="$(tr -d '[:space:]' < "$backup/git-revision.txt")" || return 1
  [ "$recorded_backup" = "$backup" ] || return 1
  [[ "$recorded_digest" =~ ^[0-9a-f]{64}$ ]] || return 1
  [ "$recorded_digest" = "$actual_digest" ] || return 1
  [[ "$recorded_revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  [ "$recorded_revision" = "$actual_revision" ]
}

write_incomplete_data_restore_marker() {
  local backup="$1"
  local marker="$APP_DIR/.deploy/data-restore-incomplete"
  local temporary="$APP_DIR/.deploy/data-restore-incomplete.tmp.$DEPLOY_RUN_ID.$$"
  local digest revision
  case "$backup" in
    /*) ;;
    *) return 1 ;;
  esac
  case "$backup" in
    *$'\n'*|*$'\r'*) return 1 ;;
  esac
  if [ -e "$marker" ]; then
    validate_incomplete_data_restore_binding "$backup" || {
      warn "the requested backup does not match the recorded incomplete data restore"
      return 1
    }
    log "continuing the recorded incomplete paired data restore"
    return 0
  fi
  [ ! -e "$temporary" ] || return 1
  digest="$(data_restore_backup_digest "$backup")" || return 1
  revision="$(tr -d '[:space:]' < "$backup/git-revision.txt")" || return 1
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  mkdir "$temporary" || return 1
  chmod 700 "$temporary" || return 1
  printf '%s\n' "$backup" > "$temporary/backup-path.txt" || return 1
  printf '%s\n' "$digest" > "$temporary/checksums.sha256.digest" || return 1
  printf '%s\n' "$revision" > "$temporary/git-revision.txt" || return 1
  printf '%s\n' "$DEPLOY_RUN_ID" > "$temporary/run-id.txt" || return 1
  chmod 600 "$temporary"/* || return 1
  mv "$temporary" "$marker" || return 1
  warn "recorded an incomplete paired data restore marker before destructive replacement"
}

clear_incomplete_data_restore_marker() {
  local backup="$1"
  local marker="$APP_DIR/.deploy/data-restore-incomplete"
  validate_incomplete_data_restore_binding "$backup" || return 1
  rm -f \
    "$marker/backup-path.txt" \
    "$marker/checksums.sha256.digest" \
    "$marker/git-revision.txt" \
    "$marker/run-id.txt" || return 1
  rmdir "$marker" || return 1
  log "cleared the completed paired data restore marker"
}

read_env_assignment() {
  local file="$1"
  local name="$2"
  local count line
  [ -f "$file" ] || return 1
  count="$(grep -c "^${name}=" "$file" 2>/dev/null || true)"
  [ "$count" = "1" ] || return 1
  line="$(grep -m1 "^${name}=" "$file")" || return 1
  printf '%s' "${line#*=}"
}

prepare_restore_environment() {
  local backup_dir="$1"
  local expected_fingerprint actual_fingerprint candidate
  RESTORE_INTEGRATION_SECRET_KEY="$(read_env_assignment "$backup_dir/env.snapshot" INTEGRATION_SECRET_ENCRYPTION_KEY)" || {
    warn "backup environment does not contain exactly one integration encryption key"
    return 1
  }
  valid_integration_secret_key "$RESTORE_INTEGRATION_SECRET_KEY" || {
    warn "backup integration encryption key is invalid"
    return 1
  }
  expected_fingerprint="$(tr -d '[:space:]' < "$backup_dir/integration-secret-key.sha256")" || return 1
  [[ "$expected_fingerprint" =~ ^[0-9a-f]{64}$ ]] || return 1
  actual_fingerprint="$(integration_secret_key_fingerprint "$RESTORE_INTEGRATION_SECRET_KEY")" || return 1
  [ "$actual_fingerprint" = "$expected_fingerprint" ] || {
    warn "backup integration encryption key fingerprint does not match"
    return 1
  }

  candidate="$APP_DIR/.deploy/env.restore-${DEPLOY_RUN_ID}.candidate"
  cp -p "$backup_dir/env.snapshot" "$candidate" || return 1
  chmod 600 "$candidate" || return 1
  RESTORE_ENV_CANDIDATE="$candidate"
}

commit_restore_environment() {
  local expected actual
  if [ -z "$RESTORE_ENV_CANDIDATE" ] || [ ! -f "$RESTORE_ENV_CANDIDATE" ]; then
    return 1
  fi
  expected="$(integration_secret_key_fingerprint "$RESTORE_INTEGRATION_SECRET_KEY")" || return 1
  mv -f "$RESTORE_ENV_CANDIDATE" "$APP_DIR/.env" || return 1
  RESTORE_ENV_CANDIDATE=""
  source_env
  actual="$(integration_secret_key_fingerprint "$INTEGRATION_SECRET_ENCRYPTION_KEY")" || return 1
  [ "$actual" = "$expected" ] || return 1
  PREPARED_INTEGRATION_SECRET_KEY="$INTEGRATION_SECRET_ENCRYPTION_KEY"
  INTEGRATION_SECRET_KEY_SOURCE="existing"
}

verify_restored_table_counts() {
  local expected="$1"
  local actual="$2"
  cmp -s "$expected" "$actual" || {
    warn "restored database table counts do not exactly match the backup manifest"
    return 1
  }
}

verify_integration_ciphertext_readable() {
  local ciphertext_count
  ciphertext_count="$(encrypted_integration_config_count)" || return 1
  [ "$ciphertext_count" != "0" ] || return 0
  compose run --rm --no-deps backend-migrate \
    sh -c './node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts --verify' || return 1
}

backup_database() {
  source_env
  local sql_file="$CURRENT_BACKUP_DIR/mysql.sql"
  log "backing up MySQL"
  # Variables in this command are intentionally expanded by the MySQL container shell.
  # shellcheck disable=SC2016
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
    warn "MinIO data volume was not found; refusing an unpaired database-only backup"
    return 1
  fi
  log "backing up MinIO volume: $volume_name"
  docker run --rm \
    -v "${volume_name}:/data:ro" \
    -v "$(pwd)/${CURRENT_BACKUP_DIR}:/backup" \
    alpine sh -c 'tar czf /backup/minio.tar.gz -C /data .' || return 1
  tar -tzf "$CURRENT_BACKUP_DIR/minio.tar.gz" >/dev/null || return 1
}

create_backup() {
  local stamp id source_revision source_id target_revision runtime_id key_fingerprint source_env_file
  local runtime_config runtime_services runtime_config_with_images runtime_services_with_images
  source_env
  stamp="$(date +%Y%m%d_%H%M%S)"
  id="$(release_id)"
  source_revision="$(deployment_data_revision)" || return 1
  source_id="${source_revision:0:12}"
  target_revision="$(git rev-parse --verify HEAD)" || return 1
  CURRENT_BACKUP_DIR="backups/git-deploy/${stamp}-${source_id}-to-${id}"
  mkdir -p "$CURRENT_BACKUP_DIR" || return 1
  chmod 700 "$CURRENT_BACKUP_DIR" || return 1
  printf '3\n' > "$CURRENT_BACKUP_DIR/backup-format-version" || return 1
  select_backup_runtime_revision "$source_revision" "$target_revision" "$CURRENT_BACKUP_DIR" || return 1
  runtime_id="${BACKUP_RUNTIME_REVISION:0:12}"
  source_env_file="$APP_DIR/.env"
  if [ "$BACKUP_RUNTIME_SELECTION" != "target" ] && env_backup_owned_by_current_run && [ -f "$APP_DIR/.deploy/env.before-deploy" ]; then
    source_env_file="$APP_DIR/.deploy/env.before-deploy"
  fi
  cp -p "$source_env_file" "$CURRENT_BACKUP_DIR/env.snapshot" || return 1
  chmod 600 "$CURRENT_BACKUP_DIR/env.snapshot" || true
  write_env_assignment "$CURRENT_BACKUP_DIR/env.snapshot" RELEASE_ID "$runtime_id" || return 1
  write_env_assignment "$CURRENT_BACKUP_DIR/env.snapshot" INTEGRATION_SECRET_ENCRYPTION_KEY "$INTEGRATION_SECRET_ENCRYPTION_KEY" || return 1
  key_fingerprint="$(integration_secret_key_fingerprint "$INTEGRATION_SECRET_ENCRYPTION_KEY")" || return 1
  printf '%s\n' "$key_fingerprint" > "$CURRENT_BACKUP_DIR/integration-secret-key.sha256" || return 1
  printf '%s\n' "$BACKUP_RUNTIME_REVISION" > "$CURRENT_BACKUP_DIR/git-revision.txt" || return 1
  printf '%s\n' "$source_revision" > "$CURRENT_BACKUP_DIR/previous-successful-revision.txt" || return 1
  printf '%s\n' "$target_revision" > "$CURRENT_BACKUP_DIR/target-git-revision.txt" || return 1
  printf '%s\n' "$COMPOSE_FILES" > "$CURRENT_BACKUP_DIR/compose-files.txt" || return 1
  compose config > "$CURRENT_BACKUP_DIR/docker-compose.resolved.yml" || return 1
  chmod 600 "$CURRENT_BACKUP_DIR/docker-compose.resolved.yml" || return 1
  runtime_config="$CURRENT_BACKUP_DIR/runtime-compose.resolved.yml"
  runtime_services="$CURRENT_BACKUP_DIR/runtime-topology.services"
  render_revision_compose \
    "$BACKUP_RUNTIME_REVISION" "$CURRENT_BACKUP_DIR/env.snapshot" "$COMPOSE_FILES" \
    "$runtime_config" "$runtime_services" || return 1
  write_retained_runtime_images \
    "$CURRENT_BACKUP_DIR" "$BACKUP_RUNTIME_REVISION" "$BACKUP_RUNTIME_SELECTION" "$runtime_services" || return 1
  runtime_config_with_images="$CURRENT_BACKUP_DIR/runtime-compose-with-images.resolved.yml"
  runtime_services_with_images="$CURRENT_BACKUP_DIR/runtime-topology-with-images.services"
  render_revision_compose \
    "$BACKUP_RUNTIME_REVISION" "$CURRENT_BACKUP_DIR/env.snapshot" "$COMPOSE_FILES" \
    "$runtime_config_with_images" "$runtime_services_with_images" \
    "$APP_DIR/$CURRENT_BACKUP_DIR/restore-images.override.yml" || return 1
  cmp -s "$runtime_services" "$runtime_services_with_images" || return 1
  rm -f "$runtime_services_with_images"
  write_table_audit "$CURRENT_BACKUP_DIR/table-counts.before.tsv" || return 1
  write_foreign_key_audit "$CURRENT_BACKUP_DIR/foreign-keys.before.tsv" || return 1
  backup_database || return 1
  backup_minio || return 1
  write_backup_checksums "$CURRENT_BACKUP_DIR" || return 1
  if [ "$ROLLBACK_DATA_ON_FAILURE" = "YES" ] && [ "$PAIRED_RESTORE_AVAILABLE" != "YES" ]; then
    warn "automatic paired rollback was requested, but no code revision exactly matches the current database migration state"
    return 1
  fi
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
  local target_revision
  log "running guarded Prisma migration and idempotent seed"
  DATABASE_MUTATION_STARTED="YES"
  target_revision="$(git rev-parse --verify HEAD)" || return 1
  write_revision_file .deploy/database-mutation-target "$target_revision" || return 1
  compose run --rm backend-migrate || return 1
  write_table_audit "$CURRENT_BACKUP_DIR/table-counts.after.tsv" || return 1
  write_foreign_key_audit "$CURRENT_BACKUP_DIR/foreign-keys.after.tsv" || return 1
  verify_table_counts_preserved \
    "$CURRENT_BACKUP_DIR/table-counts.before.tsv" \
    "$CURRENT_BACKUP_DIR/table-counts.after.tsv" \
    "$CURRENT_BACKUP_DIR/table-count-deltas.tsv" || return 1
  write_backup_checksums "$CURRENT_BACKUP_DIR" || return 1
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
  local -a build_policy=()
  if [ "$RESTORE_RUNTIME_ACTIVE" = "YES" ]; then
    build_policy+=(--no-build)
  fi
  load_app_topology "$policy" || return 1
  log "switching application containers"
  APP_SWITCH_STARTED="YES"
  compose up -d "${build_policy[@]}" --no-deps --force-recreate --remove-orphans backend || return 1
  check_url "backend readiness" "http://127.0.0.1:${BACKEND_PORT:-3000}/api/v1/ready" || return 1
  if [ "${#WORKER_SERVICES[@]}" -gt 0 ]; then
    compose up -d "${build_policy[@]}" --no-deps --force-recreate "${WORKER_SERVICES[@]}" || return 1
    for service in "${WORKER_SERVICES[@]}"; do
      check_service_stable "$service" || return 1
    done
  fi
  compose up -d "${build_policy[@]}" --no-deps --force-recreate frontend || return 1
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
  rm -f .deploy/database-mutation-target || warn "successful revision recorded, but the prior mutation marker could not be removed"
  log "successful revision recorded: $current"
}

capture_failure_diagnostics() {
  local stamp output
  local -a log_services=(backend backend-migrate frontend mysql redis minio)
  stamp="$(date +%Y%m%d_%H%M%S)"
  mkdir -p backups/failures
  output="backups/failures/git_deploy_failure_${stamp}_${DEPLOY_RUN_ID}.log"
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

validate_backup_for_restore() {
  local backup="$1"
  local format revision source_id file compose_files release_id
  local validation_prefix rendered_config rendered_services rendered_with_images rendered_services_with_images
  local -a required=(
    env.snapshot
    integration-secret-key.sha256
    git-revision.txt
    previous-successful-revision.txt
    target-git-revision.txt
    compose-files.txt
    docker-compose.resolved.yml
    runtime-selection.txt
    paired-restore.status
    database-migration-state.txt
    database-migrations.before.tsv
    source-migrations.tsv
    target-migrations.tsv
    recovery-migrations.tsv
    runtime-compose.resolved.yml
    runtime-topology.services
    runtime-compose-with-images.resolved.yml
    retained-images.tsv
    restore-images.override.yml
    table-counts.before.tsv
    foreign-keys.before.tsv
    mysql.sql.gz
    minio.tar.gz
    checksums.sha256
  )
  [ -f "$backup/backup-format-version" ] || {
    warn "backup format marker is missing"
    return 1
  }
  format="$(tr -d '[:space:]' < "$backup/backup-format-version")" || return 1
  [ "$format" = "3" ] || {
    warn "unsupported backup format: ${format:-empty}"
    return 1
  }
  for file in "${required[@]}"; do
    [ -f "$backup/$file" ] || {
      warn "backup artifact is missing: $file"
      return 1
    }
  done
  verify_backup_checksums "$backup" || return 1
  gzip -t "$backup/mysql.sql.gz" || return 1
  tar -tzf "$backup/minio.tar.gz" >/dev/null || return 1
  grep -Fxq 'YES' "$backup/paired-restore.status" || {
    warn "backup is marked data-recovery-only and cannot be used for an automatic paired runtime restore"
    return 1
  }
  revision="$(tr -d '[:space:]' < "$backup/git-revision.txt")" || return 1
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  git cat-file -e "${revision}^{commit}" 2>/dev/null || {
    warn "backup source revision is not available in the local Git object database"
    return 1
  }
  source_id="${revision:0:12}"
  release_id="$(read_env_assignment "$backup/env.snapshot" RELEASE_ID)" || {
    warn "backup environment does not contain exactly one release id"
    return 1
  }
  [ "$release_id" = "$source_id" ] || {
    warn "backup environment release id does not match its runtime revision"
    return 1
  }
  compose_files="$(tr -d '\r\n' < "$backup/compose-files.txt")" || return 1
  validate_compose_file_list "$compose_files" || return 1
  validation_prefix="$APP_DIR/.deploy/restore-runtime-${DEPLOY_RUN_ID}"
  rendered_config="${validation_prefix}.resolved.yml"
  rendered_services="${validation_prefix}.services"
  rendered_with_images="${validation_prefix}.images.resolved.yml"
  rendered_services_with_images="${validation_prefix}.images.services"
  render_revision_compose \
    "$revision" "$backup/env.snapshot" "$compose_files" \
    "$rendered_config" "$rendered_services" || return 1
  cmp -s "$backup/runtime-compose.resolved.yml" "$rendered_config" || {
    warn "backup runtime Compose rendering no longer matches its checksummed source topology"
    return 1
  }
  cmp -s "$backup/runtime-topology.services" "$rendered_services" || return 1
  validate_retained_runtime_images "$backup" || {
    warn "retained runtime image identity or OCI release labels do not match the backup manifest"
    return 1
  }
  render_revision_compose \
    "$revision" "$backup/env.snapshot" "$compose_files" \
    "$rendered_with_images" "$rendered_services_with_images" \
    "$backup/restore-images.override.yml" || return 1
  cmp -s "$backup/runtime-compose-with-images.resolved.yml" "$rendered_with_images" || return 1
  cmp -s "$backup/runtime-topology.services" "$rendered_services_with_images" || return 1
  rm -f "$rendered_config" "$rendered_services" "$rendered_with_images" "$rendered_services_with_images"
  prepare_restore_environment "$backup" || return 1
}

activate_restored_runtime() {
  local backup="$1"
  local revision compose_files
  revision="$(tr -d '[:space:]' < "$backup/git-revision.txt")" || return 1
  [ "$(git rev-parse --verify HEAD)" = "$revision" ] || return 1
  compose_files="$(tr -d '\r\n' < "$backup/compose-files.txt")" || return 1
  validate_compose_file_list "$compose_files" || return 1
  COMPOSE_FILES="$compose_files:$backup/restore-images.override.yml"
  RESTORE_RUNTIME_ACTIVE="YES"
  detect_compose || return 1
  load_app_topology compatible || return 1
}

restore_data_from_backup() {
  [ "$CONFIRM_RESTORE" = "YES" ] || {
    warn "data restore is destructive. Set CONFIRM_RESTORE=YES and BACKUP_PATH=... to continue."
    return 1
  }
  source_env
  local backup volume_name validation_prefix restored_counts restored_foreign_keys restored_migrations restored_migration_state restore_revision
  backup="$BACKUP_PATH"
  if [ -z "$backup" ]; then
    backup="$(cat .deploy/latest_backup 2>/dev/null || true)"
  fi
  if [ -z "$backup" ] || [ ! -d "$backup" ]; then
    warn "backup directory not found: ${backup:-empty}"
    return 1
  fi
  backup="$(cd "$backup" && pwd)" || return 1
  RESTORED_BACKUP_DIR="$backup"
  validate_backup_for_restore "$backup" || return 1

  start_infra || return 1
  quiesce_app compatible || return 1
  volume_name="$(minio_volume_name)"
  [ -n "$volume_name" ] || {
    warn "MinIO volume not found"
    return 1
  }
  compose stop minio >/dev/null 2>&1 || return 1
  restore_revision="$(tr -d '[:space:]' < "$backup/git-revision.txt")" || return 1
  write_revision_file .deploy/database-mutation-target "$restore_revision" || return 1
  write_incomplete_data_restore_marker "$backup" || return 1
  DATABASE_MUTATION_STARTED="YES"
  log "restoring MySQL from $backup/mysql.sql.gz"
  DATA_RESTORE_STARTED="YES"
  # Variables in these commands are intentionally expanded by the MySQL container shell.
  # shellcheck disable=SC2016
  compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"' || return 1
  # shellcheck disable=SC2016
  gunzip -c "$backup/mysql.sql.gz" | compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' || return 1
  commit_restore_environment || return 1

  log "restoring MinIO volume: $volume_name"
  docker run --rm \
    -v "${volume_name}:/data" \
    -v "${backup}:/backup:ro" \
    alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/minio.tar.gz -C /data' || return 1
  compose up -d minio || return 1

  validation_prefix="$APP_DIR/.deploy/restore-validation-${DEPLOY_RUN_ID}"
  restored_counts="${validation_prefix}.table-counts.tsv"
  restored_foreign_keys="${validation_prefix}.foreign-keys.tsv"
  restored_migrations="${validation_prefix}.migrations.tsv"
  restored_migration_state="${validation_prefix}.migration-state.txt"
  write_table_audit "$restored_counts" || return 1
  verify_restored_table_counts "$backup/table-counts.before.tsv" "$restored_counts" || return 1
  write_foreign_key_audit "$restored_foreign_keys" || return 1
  write_database_migration_manifest "$restored_migrations" "$restored_migration_state" || return 1
  grep -Fxq 'CLEAN' "$restored_migration_state" || return 1
  cmp -s "$backup/database-migrations.before.tsv" "$restored_migrations" || {
    warn "restored Prisma migration manifest does not exactly match the backup"
    return 1
  }
  verify_integration_ciphertext_readable || return 1
  clear_incomplete_data_restore_marker "$backup" || return 1
  DATA_RESTORE_COMPLETED="YES"
  log "data restore finished"
}

handle_deploy_failure() {
  local reason="$1"
  local allow_data_restore="${2:-YES}"
  local paired_data_restored="NO"
  quiesce_app available || warn "failed to fully quiesce the current application topology"
  capture_failure_diagnostics || warn "failure diagnostics could not be saved"
  if [ "$DATABASE_MUTATION_STARTED" = "YES" ]; then
    if [ "$ROLLBACK_DATA_ON_FAILURE" = "YES" ] && [ "$allow_data_restore" = "YES" ]; then
      warn "ROLLBACK_DATA_ON_FAILURE=YES, restoring the paired database and object-storage backup"
      if CONFIRM_RESTORE=YES BACKUP_PATH="${CURRENT_BACKUP_DIR:-$BACKUP_PATH}" restore_data_from_backup && \
         [ "$DATA_RESTORE_COMPLETED" = "YES" ]; then
        paired_data_restored="YES"
      else
        preserve_deployment_env_backup_for_recovery || warn "failed to preserve the source environment snapshot for manual recovery"
        err "paired data restore failed after database mutation started; target source and current environment are retained, and the application remains stopped"
      fi
    else
      preserve_deployment_env_backup_for_recovery || warn "failed to preserve the source environment snapshot for manual recovery"
      err "database mutation may have started and no verified paired data restore completed; target source and current environment are retained, and the application remains stopped"
    fi
  elif [ "$ROLLBACK_DATA_ON_FAILURE" = "YES" ]; then
    warn "automatic data restore skipped because database mutation did not start"
  fi

  if [ "$paired_data_restored" = "YES" ]; then
    DEPLOY_ENV_ROLLBACK_DISABLED="YES"
    discard_deployment_env_backup || warn "paired data was restored, but the inactive uploaded-environment backup could not be removed"
    if ! rollback_source_from_revision_file "$RESTORED_BACKUP_DIR/git-revision.txt" "backup runtime"; then
      err "paired data was restored but its runtime revision could not be checked out; application remains stopped"
    fi
    if ! activate_restored_runtime "$RESTORED_BACKUP_DIR"; then
      err "paired data was restored but its checksummed Compose/image runtime could not be activated; application remains stopped"
    fi
    if ! switch_app compatible; then
      err "paired data and runtime were restored but health verification failed; application remains stopped"
    fi
    mark_deployment_successful || err "paired rollback is healthy but its runtime revision could not be recorded"
    PAIRED_RUNTIME_HEALTHY="YES"
    err "$reason; verified paired data/runtime rollback completed"
  elif ! restore_deployment_env; then
    warn "failed to restore the pre-deployment environment file"
  fi
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
    if [ "$paired_data_restored" = "YES" ]; then
      err "paired data was restored but the matching source revision could not be checked out; application remains stopped"
    fi
    resume_existing_app available || true
  fi
  PRE_MUTATION_RUNTIME_RECOVERED="YES"
  err "$reason"
}

handle_pre_quiesce_failure() {
  local reason="$1"
  capture_failure_diagnostics || warn "failure diagnostics could not be saved"
  recover_pre_mutation_runtime || warn "the pre-deployment runtime could not be fully recovered"
  err "$reason"
}

recover_pre_mutation_runtime() {
  restore_deployment_env || return 1
  if [ "$SOURCE_SWITCH_STARTED" = "YES" ]; then
    rollback_source_to_last_successful || return 1
  fi
  detect_compose || return 1
  start_infra || return 1
  if ! resume_existing_app compatible; then
    warn "existing application containers could not be resumed; trying the retained source images"
    switch_app compatible || return 1
  fi
  PRE_MUTATION_RUNTIME_RECOVERED="YES"
  log "pre-deployment runtime recovered"
}

deploy() {
  init_or_adopt_repo
  acquire_lock
  DEPLOY_ACTIVE="YES"
  assert_no_incomplete_data_restore || err "deployment is blocked until the recorded paired data restore is retried from its bound backup"
  prepare_deployment_source || err "deployment source import failed or the server worktree is not safely recoverable"
  install_deployment_env_upload || err "deployment environment upload could not be installed safely"
  checkout_target
  preflight
  if ! build_images; then
    handle_pre_quiesce_failure "image build failed"
  fi
  if ! start_infra; then
    handle_pre_quiesce_failure "infrastructure startup failed"
  fi
  if ! quiesce_app; then
    handle_deploy_failure "workers or application containers could not be stopped safely"
  fi
  if ! persist_prepared_integration_secret_key; then
    handle_pre_quiesce_failure "integration secret encryption key preflight failed"
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
  DEPLOY_SUCCEEDED="YES"
  discard_deployment_env_backup || warn "deployment is healthy, but its inactive environment backup could not be removed"
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
  if [ -e "$APP_DIR/.deploy/data-restore-incomplete" ]; then
    echo "incomplete_data_restore=YES"
  else
    echo "incomplete_data_restore=NO"
  fi
  echo
  git --no-pager log -1 --oneline || true
  echo
  compose ps
}

manual_backup() {
  init_or_adopt_repo
  acquire_lock
  DEPLOY_ACTIVE="YES"
  preflight
  if ! start_infra; then
    handle_pre_quiesce_failure "infrastructure startup failed"
  fi
  if ! quiesce_app compatible; then
    resume_existing_app available || true
    err "workers or application containers could not be stopped safely"
  fi
  if ! persist_prepared_integration_secret_key; then
    handle_pre_quiesce_failure "integration secret encryption key preflight failed"
  fi
  if ! create_backup; then
    resume_existing_app available || true
    err "backup failed"
  fi
  if ! resume_existing_app compatible; then
    capture_failure_diagnostics || true
    err "backup completed but the application could not be resumed"
  fi
  DEPLOY_SUCCEEDED="YES"
}

manual_rollback_code() {
  init_or_adopt_repo
  acquire_lock
  DEPLOY_ACTIVE="YES"
  preflight
  if ! start_infra; then
    handle_pre_quiesce_failure "infrastructure startup failed before code rollback"
  fi
  if ! validate_code_only_rollback_revision .deploy/previous_successful_rev "previous successful"; then
    handle_pre_quiesce_failure "code-only rollback refused because the target runtime does not exactly match the live database"
  fi
  if ! quiesce_app compatible; then
    handle_deploy_failure "application containers could not be stopped for code rollback" NO
  fi
  if ! persist_prepared_integration_secret_key; then
    handle_pre_quiesce_failure "integration secret encryption key preflight failed before code rollback"
  fi
  if ! rollback_source_to_previous_successful; then
    handle_deploy_failure "previous successful source revision is unavailable" NO
  fi
  if ! switch_app compatible; then
    handle_deploy_failure "code rollback health verification failed" NO
  fi
  if ! mark_deployment_successful; then
    handle_deploy_failure "code rollback succeeded but its revision could not be recorded" NO
  fi
  DEPLOY_SUCCEEDED="YES"
  log "code rollback completed"
}

manual_restore_data() {
  init_or_adopt_repo
  acquire_lock
  DEPLOY_ACTIVE="YES"
  ALLOW_INCOMPLETE_RESTORE_RETRY="YES"
  preflight
  if ! restore_data_from_backup; then
    capture_failure_diagnostics || true
    if [ "$DATA_RESTORE_STARTED" = "NO" ] && [ ! -e "$APP_DIR/.deploy/data-restore-incomplete" ]; then
      start_infra || warn "the original infrastructure could not be restarted after restore preflight failure"
      resume_existing_app compatible || warn "the original application could not be verified after restore preflight failure"
    fi
    err "data restore failed; application remains stopped if database replacement had started"
  fi
  if [ "$DATA_RESTORE_COMPLETED" != "YES" ] || [ -z "$RESTORED_BACKUP_DIR" ]; then
    err "data restore did not reach its verified state"
  fi
  if ! rollback_source_from_revision_file "$RESTORED_BACKUP_DIR/git-revision.txt" "backup source"; then
    capture_failure_diagnostics || true
    err "restored data is verified but matching source checkout failed; application remains stopped"
  fi
  if ! activate_restored_runtime "$RESTORED_BACKUP_DIR"; then
    capture_failure_diagnostics || true
    err "restored data is verified but its checksummed Compose/image runtime could not be activated"
  fi
  if ! switch_app compatible; then
    capture_failure_diagnostics || true
    err "restored data and source are paired but application health verification failed; application remains stopped"
  fi
  if ! mark_deployment_successful; then
    capture_failure_diagnostics || true
    err "restored application is healthy but its revision could not be recorded"
  fi
  DEPLOY_SUCCEEDED="YES"
  log "paired data and code restore completed"
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
    rollback-code) manual_rollback_code ;;
    restore-data) manual_restore_data ;;
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
