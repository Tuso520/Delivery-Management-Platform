#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_calls() {
  local expected="$1"
  local actual
  actual="$(cat "$calls_file")"
  [ "$actual" = "$expected" ] || {
    printf 'Expected calls:\n%s\nActual calls:\n%s\n' "$expected" "$actual" >&2
    fail "deployment call order mismatch"
  }
}

record_call() {
  printf '%s\n' "$*" >> "$calls_file"
}

current_services() {
  printf '%s\n' mysql redis minio minio-init backend backend-migrate file-worker outbox-worker frontend
}

legacy_services() {
  printf '%s\n' mysql redis minio minio-init backend backend-migrate frontend
}

test_switch_order() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  unset BACKEND_PORT FRONTEND_PORT
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT

  compose() {
    record_call "compose $*"
    case "$*" in
      "config --services") current_services ;;
      "ps --status running --quiet file-worker") printf '%s\n' file-worker-id ;;
      "ps --status running --quiet outbox-worker") printf '%s\n' outbox-worker-id ;;
    esac
  }
  check_url() { record_call "check-url $1 $2"; }
  check_service_stable() { record_call "check-stable $1"; }
  verify_release_version() { record_call "verify-frontend-release"; }
  verify_service_release() { record_call "verify-service-releases $*"; }

  switch_app
  assert_calls "$(cat <<'EXPECTED'
compose config --services
compose up -d --no-deps --force-recreate --remove-orphans backend
check-url backend readiness http://127.0.0.1:3000/api/v1/ready
compose up -d --no-deps --force-recreate file-worker outbox-worker
check-stable file-worker
check-stable outbox-worker
compose up -d --no-deps --force-recreate frontend
check-url frontend http://127.0.0.1:8080
verify-frontend-release
verify-service-releases backend file-worker outbox-worker frontend
EXPECTED
)"
)

test_legacy_rollback_switch() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  unset BACKEND_PORT FRONTEND_PORT
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT

  compose() {
    record_call "compose $*"
    [ "$*" != "config --services" ] || legacy_services
  }
  check_url() { record_call "check-url $1 $2"; }
  check_service_stable() { record_call "check-stable $1"; }
  verify_release_version() { record_call "verify-frontend-release"; }
  verify_service_release() { record_call "verify-service-releases $*"; }

  switch_app compatible
  assert_calls "$(cat <<'EXPECTED'
compose config --services
compose up -d --no-deps --force-recreate --remove-orphans backend
check-url backend readiness http://127.0.0.1:3000/api/v1/ready
compose up -d --no-deps --force-recreate frontend
check-url frontend http://127.0.0.1:8080
verify-frontend-release
verify-service-releases backend frontend
EXPECTED
)"
)

test_forward_switch_requires_complete_workers() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  compose() {
    record_call "compose $*"
    if [ "$*" = "config --services" ]; then
      printf '%s\n' backend frontend file-worker
    fi
  }

  if switch_app required; then
    fail "target switch accepted a partial worker topology"
  fi
  assert_calls "compose config --services"

  : > "$calls_file"
  compose() {
    record_call "compose $*"
    if [ "$*" = "config --services" ]; then
      printf '%s\n' backend frontend
    fi
  }
  if switch_app required; then
    fail "target switch accepted a workerless topology"
  fi
  assert_calls "compose config --services"
)

test_quiesce_and_resume_order() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  compose() {
    record_call "compose $*"
    [ "$*" != "config --services" ] || current_services
  }
  check_url() { record_call "check-url $1 $2"; }
  check_service_stable() { record_call "check-stable $1"; }
  verify_release_version() { record_call "verify-frontend-release"; }
  verify_service_release() { record_call "verify-service-releases $*"; }

  quiesce_app
  assert_calls "$(cat <<'EXPECTED'
compose config --services
compose stop file-worker outbox-worker
compose stop backend frontend
EXPECTED
)"

  : > "$calls_file"
  resume_existing_app
  assert_calls "$(cat <<'EXPECTED'
compose config --services
compose start backend
check-url backend readiness http://127.0.0.1:3000/api/v1/ready
compose start file-worker outbox-worker
check-stable file-worker
check-stable outbox-worker
compose start frontend
check-url frontend http://127.0.0.1:8080
verify-frontend-release
verify-service-releases backend file-worker outbox-worker frontend
EXPECTED
)"
)

test_release_label_gate() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  mock_release="release-test"
  release_id() { printf '%s\n' release-test; }
  compose() {
    case "$*" in
      "ps --all --quiet backend") printf '%s\n' backend-id ;;
      "ps --all --quiet file-worker") printf '%s\n' file-worker-id ;;
      "ps --all --quiet outbox-worker") printf '%s\n' outbox-worker-id ;;
      "ps --all --quiet frontend") printf '%s\n' frontend-id ;;
      *) return 1 ;;
    esac
  }
  docker() { printf '%s\n' "$mock_release"; }

  verify_service_release backend file-worker outbox-worker frontend
  mock_release="stale-release"
  if verify_service_release backend file-worker outbox-worker frontend; then
    fail "release label mismatch was accepted"
  fi
)

test_integration_secret_key_gate() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local_key="$(printf '01234567890123456789012345678901' | openssl base64 -A)"
  valid_integration_secret_key "$local_key" || fail "valid 32-byte Base64 key was rejected"
  if valid_integration_secret_key 'not-base64'; then
    fail "invalid Base64 key was accepted"
  fi
  if valid_integration_secret_key "$(printf 'short' | openssl base64 -A)"; then
    fail "wrong-length key was accepted"
  fi

  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  mkdir -p "$APP_DIR/.deploy"
  printf 'EXISTING=value\nINTEGRATION_SECRET_ENCRYPTION_KEY=CHANGE_ME\n' > "$APP_DIR/.env"
  export INTEGRATION_SECRET_ENCRYPTION_KEY="$local_key"
  PREPARED_INTEGRATION_SECRET_KEY="$local_key"
  INTEGRATION_SECRET_KEY_SOURCE="generated"
  encrypted_integration_config_count() { printf '0\n'; }
  persist_prepared_integration_secret_key
  [ "$(grep -c '^INTEGRATION_SECRET_ENCRYPTION_KEY=' "$APP_DIR/.env")" = "1" ] || fail "key assignment was duplicated"
  grep -Fxq "INTEGRATION_SECRET_ENCRYPTION_KEY=$local_key" "$APP_DIR/.env" || fail "generated key was not persisted"

  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=CHANGE_ME\n' > "$APP_DIR/.env"
  PREPARED_INTEGRATION_SECRET_KEY="$local_key"
  INTEGRATION_SECRET_KEY_SOURCE="generated"
  encrypted_integration_config_count() { printf '1\n'; }
  output="$(persist_prepared_integration_secret_key 2>&1)" && fail "existing ciphertext allowed a replacement key"
  grep -Fxq 'INTEGRATION_SECRET_ENCRYPTION_KEY=CHANGE_ME' "$APP_DIR/.env" || fail "unsafe key gate changed the environment file"
  case "$output" in
    *"$local_key"*) fail "secret key leaked into deployment output" ;;
  esac
)

test_prepared_key_survives_env_reload() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local_key="$(printf 'abcdefghijklmnopqrstuvwxyzABCDEF' | openssl base64 -A)"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  mkdir -p "$APP_DIR/.deploy"
  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=CHANGE_ME\n' > "$APP_DIR/.env"
  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$local_key" > "$APP_DIR/.deploy/env.before-deploy"
  cd "$APP_DIR"

  source_env
  prepare_integration_secret_key
  [ "$PREPARED_INTEGRATION_SECRET_KEY" = "$local_key" ] || fail "pre-deployment key was not prepared"
  source_env
  [ "$INTEGRATION_SECRET_ENCRYPTION_KEY" = "CHANGE_ME" ] || fail "test did not reproduce env reload"
  persist_prepared_integration_secret_key
  [ "$INTEGRATION_SECRET_ENCRYPTION_KEY" = "$local_key" ] || fail "prepared key was not restored after env reload"
  grep -Fxq "INTEGRATION_SECRET_ENCRYPTION_KEY=$local_key" "$APP_DIR/.env" || fail "prepared key was not persisted after reload"
)

test_failure_rollback_order() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    quiesce_app() { record_call "quiesce $*"; }
    capture_failure_diagnostics() { record_call "capture-diagnostics"; }
    restore_deployment_env() { record_call "restore-env"; }
    rollback_source_to_last_successful() { record_call "rollback-source"; }
    switch_app() { record_call "switch $*"; }
    resume_existing_app() { record_call "resume $*"; }
    err() { record_call "error $*"; return 1; }
    handle_deploy_failure "database migration failed"
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "deployment failure handler returned success"
  assert_calls "$(cat <<'EXPECTED'
quiesce available
capture-diagnostics
restore-env
rollback-source
resume compatible
error database migration failed
EXPECTED
)"
}

test_switch_order
test_legacy_rollback_switch
test_forward_switch_requires_complete_workers
test_quiesce_and_resume_order
test_release_label_gate
test_integration_secret_key_gate
test_prepared_key_survives_env_reload
test_failure_rollback_order
printf 'deploy-git contract tests passed\n'
