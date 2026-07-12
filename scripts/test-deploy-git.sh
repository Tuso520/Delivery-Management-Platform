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

test_switch_order() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  unset BACKEND_PORT FRONTEND_PORT
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT

  compose() {
    record_call "compose $*"
    case "$*" in
      "ps --status running --quiet file-worker") printf '%s\n' file-worker-id ;;
      "ps --status running --quiet outbox-worker") printf '%s\n' outbox-worker-id ;;
    esac
  }
  check_url() { record_call "check-url $1 $2"; }
  verify_release_version() { record_call "verify-frontend-release"; }
  verify_service_release() { record_call "verify-service-releases"; }

  switch_app
  assert_calls "$(cat <<'EXPECTED'
compose up -d --no-deps --force-recreate backend
check-url backend readiness http://127.0.0.1:3000/api/v1/ready
compose up -d --no-deps --force-recreate file-worker outbox-worker
compose ps --status running --quiet file-worker
compose ps --status running --quiet outbox-worker
compose up -d --no-deps --force-recreate frontend
check-url frontend http://127.0.0.1:8080
verify-frontend-release
verify-service-releases
EXPECTED
)"
)

test_quiesce_and_resume_order() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  compose() { record_call "compose $*"; }

  quiesce_app
  assert_calls "$(cat <<'EXPECTED'
compose stop file-worker outbox-worker
compose stop backend frontend
EXPECTED
)"

  : > "$calls_file"
  resume_existing_app
  assert_calls "$(cat <<'EXPECTED'
compose start backend frontend
compose start file-worker outbox-worker
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

  verify_service_release
  mock_release="stale-release"
  if verify_service_release; then
    fail "release label mismatch was accepted"
  fi
)

test_switch_order
test_quiesce_and_resume_order
test_release_label_gate
printf 'deploy-git contract tests passed\n'
