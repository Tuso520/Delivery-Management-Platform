#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    fail "command unexpectedly succeeded: $*"
  fi
}

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
app_dir="$temp_dir/app"
mock_bin="$temp_dir/bin"
calls="$temp_dir/calls"
mkdir -p "$app_dir/.deploy" "$app_dir/backups/git-deploy" "$mock_bin"

cat > "$temp_dir/mock-deploy.sh" <<'MOCK'
on_exit() { :; }
normalize_app_dir() { :; }
init_or_adopt_repo() { cd "$APP_DIR"; }
acquire_lock() { :; }
source_env() { :; }
detect_compose() { :; }
load_app_topology() { :; }
compose() { printf '%s\n' "$*" >> "$TEST_RELEASE_CALLS"; }
MOCK

cat > "$mock_bin/docker" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = "volume" ] && [ "$2" = "ls" ]; then
  exit 0
fi
exit 1
MOCK
chmod +x "$mock_bin/docker"

common_env=(
  "PATH=$mock_bin:$PATH"
  "APP_DIR=$app_dir"
  "DEPLOY_SCRIPT=$temp_dir/mock-deploy.sh"
  "DEPLOY_ENV=test"
  "COMPOSE_PROJECT_NAME=delivery-platform-test"
  "REF=0123456789abcdef0123456789abcdef01234567"
  "TEST_RELEASE_CALLS=$calls"
)

expect_failure env "${common_env[@]}" \
  CONFIRM_TEST_SERVER_RESET=NO \
  bash "$ROOT_DIR/scripts/test-server-release.sh" reset
expect_failure env "${common_env[@]}" \
  DEPLOY_ENV=production \
  CONFIRM_TEST_SERVER_RESET=YES \
  bash "$ROOT_DIR/scripts/test-server-release.sh" reset
expect_failure env "${common_env[@]}" \
  COMPOSE_PROJECT_NAME=delivery-platform \
  CONFIRM_TEST_SERVER_RESET=YES \
  bash "$ROOT_DIR/scripts/test-server-release.sh" reset

printf 'history\n' > "$app_dir/backups/git-deploy/old-backup"
printf 'revision\n' > "$app_dir/.deploy/last_successful_rev"
env "${common_env[@]}" \
  CONFIRM_TEST_SERVER_RESET=YES \
  bash "$ROOT_DIR/scripts/test-server-release.sh" reset
grep -Fxq 'down --volumes --remove-orphans' "$calls" || fail "reset did not remove Compose volumes"
[ ! -e "$app_dir/backups/git-deploy" ] || fail "managed deployment backups survived reset"
[ ! -e "$app_dir/.deploy/last_successful_rev" ] || fail "release pointer survived reset"

: > "$calls"
expect_failure env "${common_env[@]}" \
  CONFIRM_TEST_DATA_SEED=YES \
  TEST_DATA_MIN_COUNT=19 \
  bash "$ROOT_DIR/scripts/test-server-release.sh" seed
env "${common_env[@]}" \
  CONFIRM_TEST_DATA_SEED=YES \
  TEST_DATA_MIN_COUNT=20 \
  bash "$ROOT_DIR/scripts/test-server-release.sh" seed
grep -Fq 'prisma/seed-test-data.ts' "$calls" || fail "test-data seed command was not executed"
grep -Fq 'prisma/verify-test-data.ts' "$calls" || fail "test-data verifier was not executed"

workflow="$ROOT_DIR/.github/workflows/deploy.yml"
grep -Fq 'DEPLOY_TARGET_ID' "$workflow" || fail "workflow has no server identity binding"
grep -Fq 'DEPLOY_TARGET_BOOTSTRAP' "$workflow" || fail "workflow has no explicit target identity bootstrap gate"
grep -Fq 'TARGET_BOOTSTRAP="$7"' "$workflow" || fail "workflow does not bind the bootstrap gate remotely"
grep -Fq 'CONFIRM_TEST_SERVER_RESET=YES' "$workflow" || fail "workflow does not confirm reset"
grep -Fq 'CONFIRM_TEST_DATA_SEED=YES' "$workflow" || fail "workflow does not confirm test-data seed"
grep -Fq 'TEST_DATA_MIN_COUNT' "$workflow" || fail "workflow does not configure minimum data count"

printf 'test-server release contract tests passed\n'
