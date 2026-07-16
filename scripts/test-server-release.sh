#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$PWD/deploy-git.sh}"
DEPLOY_ENV="${DEPLOY_ENV:-}"
CONFIRM_TEST_SERVER_RESET="${CONFIRM_TEST_SERVER_RESET:-NO}"
CONFIRM_TEST_DATA_SEED="${CONFIRM_TEST_DATA_SEED:-NO}"
TEST_DATA_MIN_COUNT="${TEST_DATA_MIN_COUNT:-20}"

die() {
  printf '[test-release:error] %s\n' "$*" >&2
  exit 1
}

log_test_release() {
  printf '[test-release] %s\n' "$*"
}

require_test_environment() {
  [ "$DEPLOY_ENV" = "test" ] || die "DEPLOY_ENV must be exactly test"
  case "${COMPOSE_PROJECT_NAME:-}" in
    *test*|*testing*) ;;
    *) die "COMPOSE_PROJECT_NAME must identify an isolated test project" ;;
  esac
  [[ "${REF:-}" =~ ^[0-9a-f]{40}$ ]] || die "REF must be the immutable 40-character release commit"
  [ -f "$DEPLOY_SCRIPT" ] && [ ! -L "$DEPLOY_SCRIPT" ] || \
    die "DEPLOY_SCRIPT must be a regular file"
}

load_deployment_runtime() {
  # shellcheck source=../deploy-git.sh
  source "$DEPLOY_SCRIPT"
  normalize_app_dir
  init_or_adopt_repo
  cd "$APP_DIR"
  acquire_lock
  source_env
  case "$COMPOSE_PROJECT_NAME" in
    *test*|*testing*) ;;
    *) die "server .env must keep COMPOSE_PROJECT_NAME isolated as a test project" ;;
  esac
  detect_compose
  load_app_topology required
}

assert_managed_path() {
  local path="$1"
  case "$path" in
    "$APP_DIR/backups/git-deploy"|"$APP_DIR/backups/git-deploy-audits"|"$APP_DIR/backups/git-deploy-staging") ;;
    *) die "refusing unmanaged cleanup path: $path" ;;
  esac
  [ ! -L "$path" ] || die "refusing symbolic-link cleanup path: $path"
}

remove_managed_test_history() {
  local path
  for path in \
    "$APP_DIR/backups/git-deploy" \
    "$APP_DIR/backups/git-deploy-audits" \
    "$APP_DIR/backups/git-deploy-staging"; do
    assert_managed_path "$path"
    [ ! -e "$path" ] || rm -rf -- "$path"
  done

  rm -rf -- \
    "$APP_DIR/.deploy/data-restore-incomplete" \
    "$APP_DIR/.deploy/recovery-env"
  rm -f -- \
    "$APP_DIR/.deploy/latest_backup" \
    "$APP_DIR/.deploy/latest_migration_audit" \
    "$APP_DIR/.deploy/database-mutation-target" \
    "$APP_DIR/.deploy/last_successful_rev" \
    "$APP_DIR/.deploy/previous_successful_rev"
}

reset_test_server() {
  [ "$CONFIRM_TEST_SERVER_RESET" = "YES" ] || \
    die "CONFIRM_TEST_SERVER_RESET=YES is required"
  require_test_environment
  trap on_exit EXIT
  load_deployment_runtime

  log_test_release "stopping the isolated test stack and removing its named volumes"
  compose down --volumes --remove-orphans

  local remaining_volumes
  remaining_volumes="$(
    docker volume ls --quiet \
      --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME"
  )"
  [ -z "$remaining_volumes" ] || \
    die "Compose project volumes remain after reset: $remaining_volumes"

  remove_managed_test_history
  DEPLOY_SUCCEEDED="YES"
  log_test_release "test database, cache, object storage and managed deployment backups were removed"
}

seed_test_server() {
  [ "$CONFIRM_TEST_DATA_SEED" = "YES" ] || \
    die "CONFIRM_TEST_DATA_SEED=YES is required"
  [[ "$TEST_DATA_MIN_COUNT" =~ ^[0-9]+$ ]] || die "TEST_DATA_MIN_COUNT must be an integer"
  [ "$TEST_DATA_MIN_COUNT" -ge 20 ] && [ "$TEST_DATA_MIN_COUNT" -le 200 ] || \
    die "TEST_DATA_MIN_COUNT must be between 20 and 200"
  require_test_environment
  trap on_exit EXIT
  load_deployment_runtime

  log_test_release "generating at least $TEST_DATA_MIN_COUNT rows for each test dataset"
  compose run --rm --no-deps \
    -e DEPLOY_ENV=test \
    -e CONFIRM_TEST_DATA_SEED=YES \
    -e "TEST_DATA_MIN_COUNT=$TEST_DATA_MIN_COUNT" \
    -e "TEST_DATA_SEED=${REF:0:12}" \
    backend-migrate \
    ./node_modules/.bin/ts-node --transpile-only prisma/seed-test-data.ts

  compose run --rm --no-deps \
    -e DEPLOY_ENV=test \
    -e "TEST_DATA_MIN_COUNT=$TEST_DATA_MIN_COUNT" \
    backend-migrate \
    ./node_modules/.bin/ts-node --transpile-only prisma/verify-test-data.ts

  DEPLOY_SUCCEEDED="YES"
  log_test_release "test data generation and minimum-count verification completed"
}

case "${1:-}" in
  reset) reset_test_server ;;
  seed) seed_test_server ;;
  *)
    cat <<'USAGE'
Usage:
  DEPLOY_ENV=test CONFIRM_TEST_SERVER_RESET=YES bash scripts/test-server-release.sh reset
  DEPLOY_ENV=test CONFIRM_TEST_DATA_SEED=YES TEST_DATA_MIN_COUNT=20 \
    bash scripts/test-server-release.sh seed
USAGE
    exit 1
    ;;
esac
