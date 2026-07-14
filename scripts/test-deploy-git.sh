#!/usr/bin/env bash
# The contract harness intentionally mocks functions sourced at runtime and exercises
# them in isolated subshells, which makes these data-flow warnings false positives.
# shellcheck disable=SC1091,SC2016,SC2030,SC2031,SC2034,SC2119,SC2120,SC2317,SC2329
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

# Deployment contract tests mock Docker as a shell function. Preserve the
# production timeout call shape while executing the mock in-process.
timeout() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --kill-after=*) shift ;;
      *s) shift; break ;;
      *) break ;;
    esac
  done
  "$@"
}

create_complete_format_three_backup_fixture() {
  local backup_dir="$1"
  local file payload
  mkdir -p "$backup_dir"
  while IFS= read -r file; do
    case "$file" in
      mysql.sql.gz|minio.tar.gz) ;;
      *) : > "$backup_dir/$file" ;;
    esac
  done < <(backup_required_checksum_artifacts)
  printf '3\n' > "$backup_dir/backup-format-version"
  printf 'database fixture\n' | gzip -c > "$backup_dir/mysql.sql.gz"
  payload="$(mktemp -d)"
  printf 'object fixture\n' > "$payload/object"
  tar -czf "$backup_dir/minio.tar.gz" -C "$payload" .
  rm -rf "$payload"
  write_backup_checksums "$backup_dir"
}

create_legacy_backup_fixture() {
  local backup_dir="$1" revision="$2" payload
  mkdir -p "$backup_dir"
  printf 'legacy environment snapshot\n' > "$backup_dir/env.snapshot"
  printf '%s\n' "$revision" > "$backup_dir/git-revision.txt"
  printf 'services: {}\n' > "$backup_dir/docker-compose.resolved.yml"
  printf 'Project\t1\n' > "$backup_dir/table-counts.before.tsv"
  printf 'legacy database fixture\n' | gzip -c > "$backup_dir/mysql.sql.gz"
  payload="$(mktemp -d)"
  printf 'legacy object fixture\n' > "$payload/object"
  tar -czf "$backup_dir/minio.tar.gz" -C "$payload" .
  rm -rf "$payload"
}

backup_tree_digest() {
  local backup_dir="$1"
  tar -cf - -C "$backup_dir" . | sha256sum | awk '{print $1}'
}

current_services() {
  printf '%s\n' mysql redis minio minio-init backend backend-migrate file-worker outbox-worker frontend
}

legacy_services() {
  printf '%s\n' mysql redis minio minio-init backend backend-migrate frontend
}

test_dockerfiles_do_not_require_external_syntax_frontend() {
  local dockerfile
  for dockerfile in \
    "$ROOT_DIR/delivery-platform-server/Dockerfile" \
    "$ROOT_DIR/delivery-platform-web/Dockerfile"; do
    if grep -Eq '^[[:space:]]*#[[:space:]]*syntax=docker/dockerfile:' "$dockerfile"; then
      fail "Dockerfile depends on an external docker/dockerfile syntax frontend: $dockerfile"
    fi
  done
}

test_workflow_remote_argument_contract() {
  local workflow="$ROOT_DIR/.github/workflows/deploy.yml"
  local index position expected
  local remote_env_pattern env_sha_pattern first_six_pattern deploy_script_pattern bundle_pattern
  local -a names=(
    APP_DIR BRANCH COMPOSE_FILES DEPLOY_REF REMOTE_ENV EXPECTED_ENV_SHA DEPLOY_SCRIPT REMOTE_BUNDLE
  )
  remote_env_pattern="$(cat <<'EXPECTED'
remote_env_arg="${remote_env:-__NOT_SET__}"
EXPECTED
)"
  env_sha_pattern="$(cat <<'EXPECTED'
env_sha_arg="${env_sha:-__NOT_SET__}"
EXPECTED
)"
  first_six_pattern="$(cat <<'EXPECTED'
"$APP_DIR" "$BRANCH" "$COMPOSE_FILES" "$DEPLOY_REF" "$remote_env_arg" "$env_sha_arg" \
EXPECTED
)"
  deploy_script_pattern="$(cat <<'EXPECTED'
"/tmp/delivery-platform-deploy-${DEPLOY_REF}.sh" \
EXPECTED
)"
  bundle_pattern="$(cat <<'EXPECTED'
"/tmp/delivery-platform-release-${DEPLOY_REF}.bundle" <<'REMOTE'
EXPECTED
)"
  grep -Fq "$remote_env_pattern" "$workflow" || \
    fail "workflow does not preserve the optional remote environment argument"
  grep -Fq "$env_sha_pattern" "$workflow" || \
    fail "workflow does not preserve the optional environment checksum argument"
  grep -Fq "$first_six_pattern" "$workflow" || \
    fail "workflow remote invocation does not pass the first six positional arguments"
  grep -Fq "$deploy_script_pattern" "$workflow" || \
    fail "workflow remote invocation does not pass the deployment script as argument seven"
  grep -Fq "$bundle_pattern" "$workflow" || \
    fail "workflow remote invocation does not pass the release bundle as argument eight"
  [ "$(grep -Fc -- '-o ServerAliveInterval=30 -o ServerAliveCountMax=20' "$workflow")" = "4" ] || \
    fail "workflow SSH/SCP calls do not all preserve long-running deployment connections"
  [ "$(grep -Fc -- '-o ConnectTimeout=30' "$workflow")" = "4" ] || \
    fail "workflow SSH/SCP calls do not all bound connection establishment"
  for index in "${!names[@]}"; do
    position=$((index + 1))
    expected="${names[$index]}=\"\$$position\""
    grep -Fq "$expected" "$workflow" || \
      fail "workflow remote receiver is missing positional assignment: $expected"
  done
}

test_release_images_build_serially() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local calls expected
  calls="$(mktemp)"
  expected="$(mktemp)"
  trap 'rm -f "$calls" "$expected"' EXIT
  compose() {
    printf '%s\n' "$*" >> "$calls"
  }

  build_images
  cat > "$expected" <<'EXPECTED'
build backend
build backend-migrate
build frontend
EXPECTED
  diff -u "$expected" "$calls" || fail "release images are not built serially"
)

test_debian_build_mirror_contract() {
  local compose_file="$ROOT_DIR/docker-compose.yml"
  local workflow="$ROOT_DIR/.github/workflows/deploy.yml"
  local example_env="$ROOT_DIR/.env.example"
  local mirror_arg security_arg
  mirror_arg='DEBIAN_MIRROR: ${DEBIAN_MIRROR:-http://deb.debian.org/debian}'
  security_arg='DEBIAN_SECURITY_MIRROR: ${DEBIAN_SECURITY_MIRROR:-http://deb.debian.org/debian-security}'

  [ "$(grep -Fc "$mirror_arg" "$compose_file")" = "2" ] ||
    fail "backend and backend-migrate do not both receive the Debian mirror build arg"
  [ "$(grep -Fc "$security_arg" "$compose_file")" = "2" ] ||
    fail "backend and backend-migrate do not both receive the Debian security mirror build arg"
  grep -Fq 'export DEBIAN_MIRROR="http://mirrors.cloud.tencent.com/debian"' "$workflow" ||
    fail "remote deployment does not select the regional Debian mirror"
  grep -Fq 'export DEBIAN_SECURITY_MIRROR="http://mirrors.cloud.tencent.com/debian-security"' "$workflow" ||
    fail "remote deployment does not select the regional Debian security mirror"
  grep -Fxq 'DEBIAN_MIRROR=http://deb.debian.org/debian' "$example_env" ||
    fail ".env.example does not retain the official Debian mirror default"
  grep -Fxq 'DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security' "$example_env" ||
    fail ".env.example does not retain the official Debian security mirror default"
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

  previous_key="$(printf 'abcdefghijklmnopqrstuvwxyzABCDEF' | openssl base64 -A)"
  DEPLOY_RUN_ID="key-mismatch-test"
  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$local_key" > "$APP_DIR/.env"
  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$previous_key" > "$APP_DIR/.deploy/env.before-deploy"
  printf '%s\n' "$DEPLOY_RUN_ID" > "$APP_DIR/.deploy/env.backup-owner"
  PREPARED_INTEGRATION_SECRET_KEY="$local_key"
  INTEGRATION_SECRET_KEY_SOURCE="existing"
  encrypted_integration_config_count() { printf '1\n'; }
  output="$(persist_prepared_integration_secret_key 2>&1)" && fail "different valid key was accepted while ciphertext exists"
  case "$output" in
    *"$local_key"*|*"$previous_key"*) fail "key mismatch output leaked an encryption key" ;;
  esac
)

test_prepared_key_survives_env_reload() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local_key="$(printf 'abcdefghijklmnopqrstuvwxyzABCDEF' | openssl base64 -A)"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="prepared-key-test"
  mkdir -p "$APP_DIR/.deploy"
  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=CHANGE_ME\n' > "$APP_DIR/.env"
  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$local_key" > "$APP_DIR/.deploy/env.before-deploy"
  printf '%s\n' "$DEPLOY_RUN_ID" > "$APP_DIR/.deploy/env.backup-owner"
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

test_inherited_key_cannot_mask_missing_env_assignment() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  inherited_key="$(printf 'abcdefghijklmnopqrstuvwxyzABCDEF' | openssl base64 -A)"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  mkdir -p "$APP_DIR/.deploy"
  printf 'OTHER_SETTING=present\n' > "$APP_DIR/.env"
  export INTEGRATION_SECRET_ENCRYPTION_KEY="$inherited_key"
  cd "$APP_DIR"

  source_env
  [ -z "${INTEGRATION_SECRET_ENCRYPTION_KEY:-}" ] || fail "inherited shell key masked a missing environment assignment"
  prepare_integration_secret_key
  [ "$INTEGRATION_SECRET_KEY_SOURCE" = "generated" ] || fail "missing environment key was not treated as missing"
  encrypted_integration_config_count() { printf '0\n'; }
  persist_prepared_integration_secret_key
  grep -Fxq "INTEGRATION_SECRET_ENCRYPTION_KEY=$PREPARED_INTEGRATION_SECRET_KEY" "$APP_DIR/.env" || \
    fail "generated environment key was not persisted"
  [ "$PREPARED_INTEGRATION_SECRET_KEY" != "$inherited_key" ] || fail "inherited key was silently adopted"
)

test_dotenv_loader_treats_shell_syntax_as_data() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  command_marker="$temp_dir/command-ran"
  redirect_marker="$temp_dir/redirection-ran"
  literal_value='literal $(touch command-ran) > redirection-ran # data; $HOME'
  chmod() { :; }
  mkdir -p "$APP_DIR/.deploy"
  {
    printf 'IGNORED_COMMAND=$(touch "%s")\n' "$command_marker"
    printf 'IGNORED_REDIRECT=>"%s"\n' "$redirect_marker"
    printf "JWT_SECRET='%s'\n" "$literal_value"
    printf '%s\n' 'MYSQL_DATABASE="delivery # primary"'
    printf '%s\n' 'MYSQL_USER_PASSWORD="quote: \"ok\"; slash: \\; dollar: \$HOME"'
    printf '%s\n' "export FRONTEND_PORT = '8181'"
    printf '%s\n' 'BACKEND_PORT=3100 # deployment endpoint'
    printf '%s\n' 'APP_ENV=must-not-load'
  } > "$APP_DIR/.env"
  export APP_ENV="inherited-and-unchanged"
  cd "$APP_DIR"

  source_env
  [ "$JWT_SECRET" = "$literal_value" ] || fail "single-quoted dotenv special characters were changed"
  [ "$MYSQL_DATABASE" = "delivery # primary" ] || fail "double-quoted dotenv hash was treated as a comment"
  [ "$MYSQL_USER_PASSWORD" = 'quote: "ok"; slash: \; dollar: $HOME' ] || \
    fail "double-quoted dotenv escapes were decoded incorrectly"
  [ "$FRONTEND_PORT" = "8181" ] || fail "export-style dotenv assignment was not parsed"
  [ "$BACKEND_PORT" = "3100" ] || fail "unquoted dotenv comment was not removed"
  [ "$APP_ENV" = "inherited-and-unchanged" ] || fail "an unneeded dotenv key was loaded into the deployment shell"
  [ ! -e "$command_marker" ] || fail "dotenv command substitution was executed"
  [ ! -e "$redirect_marker" ] || fail "dotenv redirection was executed"

  write_env_assignment .env FRONTEND_PORT "8282"
  [ "$(grep -Ec '^[[:space:]]*(export[[:space:]]+)?FRONTEND_PORT[[:space:]]*=' .env)" = "1" ] || \
    fail "export-style dotenv assignment was duplicated while persisting a value"
  grep -Fxq 'FRONTEND_PORT=8282' .env || fail "persisted dotenv assignment was not normalized"
  source_env
  [ "$FRONTEND_PORT" = "8282" ] || fail "normalized dotenv assignment could not be reloaded"
)

test_dotenv_loader_rejects_invalid_and_duplicate_keys_transactionally() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  marker="$temp_dir/command-ran"
  output_file="$temp_dir/output"
  mkdir -p "$APP_DIR/.deploy"
  cd "$APP_DIR"

  export JWT_SECRET="original-value"
  {
    printf '%s\n' 'JWT_SECRET=first-sensitive-value'
    printf 'JWT_SECRET=$(touch "%s")\n' "$marker"
  } > .env
  if source_env > "$output_file" 2>&1; then
    fail "duplicate critical dotenv assignments were accepted"
  fi
  [ "$JWT_SECRET" = "original-value" ] || fail "a rejected dotenv file partially changed the shell"
  [ ! -e "$marker" ] || fail "a duplicate dotenv value executed command substitution"
  if grep -Eq 'first-sensitive-value|touch' "$output_file"; then
    fail "dotenv rejection output leaked assignment values"
  fi

  printf '%s\n' 'BAD-NAME=value' > .env
  if source_env >/dev/null 2>&1; then
    fail "an illegal dotenv key was accepted"
  fi

  printf 'touch "%s" > "%s"\n' "$marker" "$temp_dir/redirection-ran" > .env
  if source_env >/dev/null 2>&1; then
    fail "a shell command was accepted as dotenv syntax"
  fi
  [ ! -e "$marker" ] || fail "an invalid dotenv command was executed"
  [ ! -e "$temp_dir/redirection-ran" ] || fail "an invalid dotenv redirection was executed"
)

test_previous_env_reader_never_executes_backup_content() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="previous-env-reader"
  marker="$temp_dir/backup-command-ran"
  local_key="YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUY="
  mkdir -p "$APP_DIR/.deploy"
  {
    printf 'IGNORED_COMMAND=$(touch "%s")\n' "$marker"
    printf "INTEGRATION_SECRET_ENCRYPTION_KEY='%s'\n" "$local_key"
  } > "$APP_DIR/.deploy/env.before-deploy"
  printf '%s\n' "$DEPLOY_RUN_ID" > "$APP_DIR/.deploy/env.backup-owner"

  read_previous_integration_secret_key || fail "safe previous environment key was not read"
  [ "$DOTENV_VALUE" = "$local_key" ] || fail "previous environment key changed while parsing"
  [ ! -e "$marker" ] || fail "previous environment content executed command substitution"

  printf 'INTEGRATION_SECRET_ENCRYPTION_KEY=%s\nINTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' \
    "$local_key" "$local_key" > "$APP_DIR/.deploy/env.before-deploy"
  if read_previous_integration_secret_key >/dev/null 2>&1; then
    fail "duplicate encryption keys in the previous environment were accepted"
  fi
)

test_environment_cannot_override_deployment_state() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_ACTIVE="YES"
  mkdir -p "$APP_DIR/.deploy"
  printf 'DATABASE_MUTATION_STARTED=NO\n' > "$APP_DIR/.env"
  cd "$APP_DIR"

  if source_env >/dev/null 2>&1; then
    fail "environment file overrode a reserved deployment state variable"
  fi
  [ "$DEPLOY_ACTIVE" = "YES" ] || fail "reserved deployment state changed after environment rejection"
)

test_env_backup_run_ownership() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="current-run"
  mkdir -p "$APP_DIR/.deploy"
  printf 'VALUE=current\n' > "$APP_DIR/.env"
  printf 'VALUE=stale\n' > "$APP_DIR/.deploy/env.before-deploy"
  printf 'old-run\n' > "$APP_DIR/.deploy/env.backup-owner"
  cd "$APP_DIR"
  restore_deployment_env
  grep -Fxq 'VALUE=current' "$APP_DIR/.env" || fail "stale environment backup replaced the current environment"
  [ -f "$APP_DIR/.deploy/env.before-deploy" ] || fail "stale environment backup was unexpectedly deleted"

  printf '%s\n' "$DEPLOY_RUN_ID" > "$APP_DIR/.deploy/env.backup-owner"
  restore_deployment_env
  grep -Fxq 'VALUE=stale' "$APP_DIR/.env" || fail "owned environment backup was not restored"
  [ ! -e "$APP_DIR/.deploy/env.backup-owner" ] || fail "owned environment marker was not removed"
)

test_environment_upload_is_installed_inside_owned_transaction() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="upload-run"
  mkdir -p "$APP_DIR/.deploy"
  printf 'SOURCE_ENV=yes\n' > "$APP_DIR/.env"
  DEPLOY_ENV_UPLOAD_PATH="$APP_DIR/.deploy/env-release.upload"
  printf 'TARGET_ENV=yes\n' > "$DEPLOY_ENV_UPLOAD_PATH"
  DEPLOY_ENV_UPLOAD_SHA256="$(sha256sum "$DEPLOY_ENV_UPLOAD_PATH" | awk '{print $1}')"
  log() { :; }
  install_deployment_env_upload
  grep -Fxq 'TARGET_ENV=yes' "$APP_DIR/.env" || fail "uploaded environment was not installed"
  grep -Fxq 'SOURCE_ENV=yes' "$APP_DIR/.deploy/env.before-deploy" || fail "source environment was not preserved"
  [ "$(cat "$APP_DIR/.deploy/env.backup-owner")" = "$DEPLOY_RUN_ID" ] || fail "environment backup ownership was not recorded"

  printf 'SECOND_TARGET=yes\n' > "$APP_DIR/.deploy/env-second.upload"
  DEPLOY_ENV_UPLOAD_PATH="$APP_DIR/.deploy/env-second.upload"
  DEPLOY_ENV_UPLOAD_SHA256="$(sha256sum "$DEPLOY_ENV_UPLOAD_PATH" | awk '{print $1}')"
  if install_deployment_env_upload >/dev/null 2>&1; then
    fail "an active environment transaction was overwritten"
  fi
  grep -Fxq 'TARGET_ENV=yes' "$APP_DIR/.env" || fail "failed concurrent upload changed the active environment"
)

test_git_bundle_is_imported_after_target_binding() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  DEPLOY_GIT_BUNDLE_PATH="/tmp/delivery-platform-release-contract-$$.bundle"
  trap 'rm -f "$calls_file" "$DEPLOY_GIT_BUNDLE_PATH"' EXIT
  : > "$DEPLOY_GIT_BUNDLE_PATH"
  REF="1111111111111111111111111111111111111111"
  git() {
    record_call "git $*"
    case "$*" in
      "bundle verify $DEPLOY_GIT_BUNDLE_PATH") return 0 ;;
      "fetch $DEPLOY_GIT_BUNDLE_PATH HEAD") return 0 ;;
      "rev-parse FETCH_HEAD") printf '%s\n' "$REF" ;;
      "cat-file -e ${REF}^{commit}") return 0 ;;
      *) return 1 ;;
    esac
  }
  import_deployment_bundle
  assert_calls "$(cat <<EXPECTED
git bundle verify $DEPLOY_GIT_BUNDLE_PATH
git fetch $DEPLOY_GIT_BUNDLE_PATH HEAD
git rev-parse FETCH_HEAD
git cat-file -e ${REF}^{commit}
EXPECTED
)"
)

test_exact_table_count_gate() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  before="$temp_dir/before.tsv"
  after="$temp_dir/after.tsv"
  report="$temp_dir/report.tsv"
  printf 'projects\t3\nusers\t2\n' > "$before"
  printf 'projects\t3\nusers\t4\nversions\t1\n' > "$after"
  verify_table_counts_preserved "$before" "$after" "$report" || fail "valid non-decreasing table counts were rejected"
  grep -Fxq $'users\t2\t4\t2' "$report" || fail "table count delta was not recorded"
  grep -Fxq $'versions\tNEW\t1\tNEW' "$report" || fail "new table count was not recorded"

  printf 'projects\t2\nusers\t4\n' > "$after"
  if verify_table_counts_preserved "$before" "$after" "$report"; then
    fail "decreased table count was accepted"
  fi
  printf 'users\t4\n' > "$after"
  if verify_table_counts_preserved "$before" "$after" "$report"; then
    fail "removed audited table was accepted"
  fi

  printf 'translations\t86\nusers\t4\n' > "$before"
  printf 'retired_ui_translations_20260713\t86\nusers\t4\n' > "$after"
  verify_table_counts_preserved "$before" "$after" "$report" || \
    fail "verified UI translation table retirement was rejected"
  grep -Fxq $'translations->retired_ui_translations_20260713\t86\t86\t0' "$report" || \
    fail "translation retirement count mapping was not recorded"
  if grep -Fq $'retired_ui_translations_20260713\tNEW' "$report"; then
    fail "retired translation table was double-counted as a new table"
  fi

  printf 'retired_ui_translations_20260713\t85\nusers\t4\n' > "$after"
  if verify_table_counts_preserved "$before" "$after" "$report"; then
    fail "translation retirement with a reduced row count was accepted"
  fi
)

test_foreign_key_orphan_gate() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  output="$temp_dir/foreign-keys.tsv"
  mock_orphan_count=0
  mysql_query() {
    case "$1" in
      SELECT\ CONSTRAINT_NAME,*)
        printf 'project_members_project_id_fkey\tproject_members\tprojects\t1\tproject_id\tid\n'
        ;;
      SELECT\ COUNT\(\*\)*) printf '%s\n' "$mock_orphan_count" ;;
      *) return 1 ;;
    esac
  }
  write_foreign_key_audit "$output" || fail "zero-orphan foreign key audit failed"
  grep -Fxq $'project_members.project_members_project_id_fkey\t0' "$output" || fail "foreign key audit report is incomplete"
  mock_orphan_count=1
  if write_foreign_key_audit "$output"; then
    fail "foreign key orphan was accepted"
  fi
)

test_backup_source_revision_and_key_binding() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  expected_source_revision="1111111111111111111111111111111111111111"
  expected_target_revision="2222222222222222222222222222222222222222"
  local_key="$(printf '01234567890123456789012345678901' | openssl base64 -A)"
  mkdir -p "$APP_DIR/.deploy"
  printf '%s\n' "$expected_source_revision" > "$APP_DIR/.deploy/last_successful_rev"
  printf 'RELEASE_ID=old\nINTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$local_key" > "$APP_DIR/.env"
  cd "$APP_DIR"
  source_env() { export INTEGRATION_SECRET_ENCRYPTION_KEY="$local_key"; }
  git() {
    case "$*" in
      "cat-file -e ${expected_source_revision}^{commit}") return 0 ;;
      "cat-file -e ${expected_target_revision}^{commit}") return 0 ;;
      "rev-parse --verify HEAD") printf '%s\n' "$expected_target_revision" ;;
      *) return 1 ;;
    esac
  }
  release_id() { printf '222222222222\n'; }
  compose() {
    [ "$*" = "config" ] || return 1
    printf 'services: {}\n'
  }
  write_table_audit() { : > "$1"; }
  write_foreign_key_audit() { : > "$1"; }
  select_backup_runtime_revision() {
    BACKUP_RUNTIME_REVISION="$expected_source_revision"
    BACKUP_RUNTIME_SELECTION="source"
    PAIRED_RESTORE_AVAILABLE="YES"
    printf 'source\n' > "$3/runtime-selection.txt"
    printf 'YES\n' > "$3/paired-restore.status"
    printf 'CLEAN\n' > "$3/database-migration-state.txt"
    : > "$3/database-migrations.before.tsv"
    : > "$3/source-migrations.tsv"
    : > "$3/target-migrations.tsv"
    : > "$3/recovery-migrations.tsv"
  }
  render_revision_compose() {
    printf 'services: {}\n' > "$4"
    printf 'backend\nfrontend\n' > "$5"
  }
  write_retained_runtime_images() {
    : > "$1/retained-images.tsv"
    printf 'services: {}\n' > "$1/restore-images.override.yml"
  }
  backup_database() { printf 'database-backup' | gzip -c > "$CURRENT_BACKUP_DIR/mysql.sql.gz"; }
  backup_minio() {
    mkdir -p "$temp_dir/minio-source"
    printf 'minio-backup' > "$temp_dir/minio-source/object"
    tar -czf "$CURRENT_BACKUP_DIR/minio.tar.gz" -C "$temp_dir/minio-source" .
  }
  validate_backup_for_publish() { backup_is_rotation_eligible "$1"; }
  create_backup
  [ "$(cat "$CURRENT_BACKUP_DIR/git-revision.txt")" = "$expected_source_revision" ] || fail "backup was labeled with target rather than source revision"
  [ "$(cat "$CURRENT_BACKUP_DIR/target-git-revision.txt")" = "$expected_target_revision" ] || fail "backup target revision was not recorded"
  grep -Fxq 'RELEASE_ID=111111111111' "$CURRENT_BACKUP_DIR/env.snapshot" || fail "backup environment was not paired to source release"
  expected_fingerprint="$(printf '%s' "$local_key" | openssl base64 -d -A | sha256sum | awk '{print $1}')"
  [ "$(cat "$CURRENT_BACKUP_DIR/integration-secret-key.sha256")" = "$expected_fingerprint" ] || fail "backup key fingerprint was not derived from decoded key bytes"
)

test_revision_compose_resolves_relative_backup_environment() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root fixture calls output services expected_env
  root="$(mktemp -d)"
  fixture="$root/fixture"
  calls="$root/compose-calls"
  output="$root/rendered.yml"
  services="$root/services"
  trap 'rm -rf "$root"' EXIT
  mkdir -p "$root/.deploy" "$root/backups/staging" "$fixture"
  printf 'VALUE=present\n' > "$root/backups/staging/env.snapshot"
  printf 'services: {}\n' > "$fixture/docker-compose.yml"
  : > "$calls"
  APP_DIR="$root"
  DEPLOY_RUN_ID="relative-env-contract"
  COMPOSE_PROJECT_NAME="relative-env-contract"
  COMPOSE=(mock_revision_compose)
  expected_env="$root/backups/staging/env.snapshot"
  git() {
    [ "$1" = "archive" ] || return 1
    tar -cf - -C "$fixture" .
  }
  mock_revision_compose() {
    [ "$1" = "--env-file" ] || return 1
    printf '%s\n' "$2" >> "$calls"
    [ "$2" = "$expected_env" ] || return 1
    case "${*: -1}" in
      config) printf 'services: {}\n' ;;
      --services) printf 'frontend\nbackend\nbackend\n' ;;
      *) return 1 ;;
    esac
  }

  render_revision_compose \
    "$(printf '1%.0s' {1..40})" "backups/staging/env.snapshot" "docker-compose.yml" \
    "$output" "$services" || fail "relative backup environment was resolved inside the runtime tree"
  [ "$(wc -l < "$calls" | tr -d '[:space:]')" = "2" ] || \
    fail "revision Compose did not use the absolute backup environment for both renders"
  [ -s "$output" ] || fail "revision Compose config was not rendered"
  [ "$(cat "$services")" = $'backend\nfrontend' ] || \
    fail "revision Compose service topology was not canonicalized"
  grep -Fxq backend "$services" || fail "revision Compose services were not rendered"
  grep -Fxq frontend "$services" || fail "revision Compose services were not rendered"
)

test_backup_publication_is_directory_atomic_and_failure_closed() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="staging-contract"
  EXPECTED_SOURCE_REVISION="1111111111111111111111111111111111111111"
  EXPECTED_TARGET_REVISION="2222222222222222222222222222222222222222"
  POPULATE_MODE="database-failure"
  mkdir -p "$APP_DIR/.deploy"
  cd "$APP_DIR"
  source_env() { :; }
  date() { printf '20260714_010203\n'; }
  release_id() { printf '222222222222\n'; }
  deployment_data_revision() { printf '%s\n' "$EXPECTED_SOURCE_REVISION"; }
  git() {
    [ "$*" = "rev-parse --verify HEAD" ] || return 1
    printf '%s\n' "$EXPECTED_TARGET_REVISION"
  }
  validate_backup_for_publish() {
    printf 'validate\n' >> "$CURRENT_BACKUP_DIR/calls"
    [ "$POPULATE_MODE" != "validation-failure" ]
  }
  populate_backup_staging() {
    printf 'database\n' > "$CURRENT_BACKUP_DIR/mysql.sql.gz.part"
    [ "$POPULATE_MODE" != "database-failure" ] || return 1
    printf 'minio\n' > "$CURRENT_BACKUP_DIR/minio.tar.gz.part"
    validate_backup_for_publish "$CURRENT_BACKUP_DIR" || return 1
    mv "$CURRENT_BACKUP_DIR/mysql.sql.gz.part" "$CURRENT_BACKUP_DIR/mysql.sql.gz"
    mv "$CURRENT_BACKUP_DIR/minio.tar.gz.part" "$CURRENT_BACKUP_DIR/minio.tar.gz"
    printf 'complete\n' > "$CURRENT_BACKUP_DIR/complete.marker"
  }

  if create_backup >/dev/null 2>&1; then
    fail "database backup failure published a directory"
  fi
  [ -z "$(find "$APP_DIR/backups/git-deploy" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
    fail "database failure left an entry in the published backup root"
  [ -z "$(find "$APP_DIR/backups/git-deploy-staging" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
    fail "database failure left the current staging directory"
  [ ! -e "$APP_DIR/.deploy/latest_backup" ] || fail "database failure changed the latest-backup pointer"

  POPULATE_MODE="validation-failure"
  if create_backup >/dev/null 2>&1; then
    fail "metadata validation failure published a directory"
  fi
  [ -z "$(find "$APP_DIR/backups/git-deploy" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
    fail "validation failure left an entry in the published backup root"
  [ -z "$(find "$APP_DIR/backups/git-deploy-staging" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
    fail "validation failure left the current staging directory"
  [ ! -e "$APP_DIR/.deploy/latest_backup" ] || fail "validation failure changed the latest-backup pointer"

  POPULATE_MODE="success"
  create_backup >/dev/null || fail "complete staged backup was not published"
  case "$CURRENT_BACKUP_DIR" in
    backups/git-deploy/*) ;;
    *) fail "successful backup did not switch CURRENT_BACKUP_DIR to the published root" ;;
  esac
  [ -f "$APP_DIR/$CURRENT_BACKUP_DIR/complete.marker" ] || fail "published backup is incomplete"
  [ "$(cat "$APP_DIR/.deploy/latest_backup")" = "$CURRENT_BACKUP_DIR" ] || \
    fail "latest-backup pointer does not reference the atomically published directory"
  [ -z "$(find "$APP_DIR/backups/git-deploy-staging" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
    fail "successful publication left a staging directory"
)

test_runtime_revision_follows_exact_database_migrations() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  backup_dir="$(mktemp -d)"
  trap 'rm -rf "$backup_dir"' EXIT
  source_revision="1111111111111111111111111111111111111111"
  target_revision="2222222222222222222222222222222222222222"
  checksum_a="$(printf 'a' | sha256sum | awk '{print $1}')"
  checksum_b="$(printf 'b' | sha256sum | awk '{print $1}')"
  write_database_migration_manifest() {
    printf '20260101_init\t%s\n' "$checksum_b" > "$1"
    printf 'CLEAN\n' > "$2"
  }
  write_revision_migration_manifest() {
    if [ "$1" = "$source_revision" ]; then
      printf '20260101_init\t%s\n' "$checksum_a" > "$2"
    else
      printf '20260101_init\t%s\n' "$checksum_b" > "$2"
    fi
  }
  warn() { :; }
  select_backup_runtime_revision "$source_revision" "$target_revision" "$backup_dir"
  [ "$BACKUP_RUNTIME_SELECTION" = "target" ] || fail "target runtime was not selected for an already-forward database"
  [ "$BACKUP_RUNTIME_REVISION" = "$target_revision" ] || fail "selected target runtime revision is incorrect"
  [ "$PAIRED_RESTORE_AVAILABLE" = "YES" ] || fail "exact target runtime was not marked restorable"

  write_revision_migration_manifest() { printf '20260101_init\t%s\n' "$checksum_b" > "$2"; }
  select_backup_runtime_revision "$source_revision" "$target_revision" "$backup_dir"
  [ "$BACKUP_RUNTIME_SELECTION" = "source" ] || fail "source runtime was not preferred for an unchanged database"
)

test_restore_candidate_uses_complete_backup_environment() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="restore-env"
  backup_dir="$temp_dir/backup"
  mkdir -p "$APP_DIR/.deploy" "$backup_dir"
  local_key="$(printf '01234567890123456789012345678901' | openssl base64 -A)"
  printf 'TARGET_ONLY=yes\nINTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$local_key" > "$APP_DIR/.env"
  printf 'SOURCE_ONLY=yes\nINTEGRATION_SECRET_ENCRYPTION_KEY=%s\n' "$local_key" > "$backup_dir/env.snapshot"
  integration_secret_key_fingerprint "$local_key" > "$backup_dir/integration-secret-key.sha256"
  prepare_restore_environment "$backup_dir"
  grep -Fxq 'SOURCE_ONLY=yes' "$RESTORE_ENV_CANDIDATE" || fail "restore candidate did not use the complete backup environment"
  if grep -q '^TARGET_ONLY=' "$RESTORE_ENV_CANDIDATE"; then
    fail "restore candidate retained target-only environment values"
  fi
)

test_restore_runtime_never_builds_source_images() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  unset BACKEND_PORT FRONTEND_PORT
  RESTORE_RUNTIME_ACTIVE="YES"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  compose() {
    record_call "compose $*"
    [ "$*" != "config --services" ] || legacy_services
  }
  check_url() { record_call "check-url $*"; }
  verify_release_version() { record_call "verify-frontend-release"; }
  verify_service_release() { record_call "verify-service-releases $*"; }
  switch_app compatible
  assert_calls "$(cat <<'EXPECTED'
compose config --services
compose up -d --no-build --no-deps --force-recreate --remove-orphans backend
check-url backend readiness http://127.0.0.1:3000/api/v1/ready
compose up -d --no-build --no-deps --force-recreate frontend
check-url frontend http://127.0.0.1:8080
verify-frontend-release
verify-service-releases backend frontend
EXPECTED
)"
)

test_restore_rejects_legacy_backup_format() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  backup_dir="$(mktemp -d)"
  trap 'rm -rf "$backup_dir"' EXIT
  printf '2\n' > "$backup_dir/backup-format-version"
  warn() { :; }
  if validate_backup_for_restore "$backup_dir"; then
    fail "legacy backup format bypassed the source-runtime preflight"
  fi
)

test_retained_image_manifest_binds_exact_image_ids() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  backup_dir="$(mktemp -d)"
  trap 'rm -rf "$backup_dir"' EXIT
  revision="1111111111111111111111111111111111111111"
  backend_id="sha256:$(printf 'a%.0s' {1..64})"
  frontend_id="sha256:$(printf 'b%.0s' {1..64})"
  printf '%s\n' "$revision" > "$backup_dir/git-revision.txt"
  printf 'backend\nfrontend\n' > "$backup_dir/runtime-topology.services"
  printf 'backend\tdelivery-platform-backend:111111111111\t%s\tdelivery-platform-backend\t111111111111\n' "$backend_id" > "$backup_dir/retained-images.tsv"
  printf 'frontend\tdelivery-platform-frontend:111111111111\t%s\tdelivery-platform-frontend\t111111111111\n' "$frontend_id" >> "$backup_dir/retained-images.tsv"
  image_identity() {
    case "$1" in
      delivery-platform-backend:*) printf '%s\tdelivery-platform-backend\t111111111111\n' "$backend_id" ;;
      delivery-platform-frontend:*) printf '%s\tdelivery-platform-frontend\t111111111111\n' "$frontend_id" ;;
      *) return 1 ;;
    esac
  }
  validate_retained_runtime_images "$backup_dir"
  image_identity() {
    case "$1" in
      delivery-platform-backend:*) printf '%s\tdelivery-platform-backend\t111111111111\n' "$backend_id" ;;
      delivery-platform-frontend:*) printf 'sha256:%s\tdelivery-platform-frontend\t111111111111\n' "$(printf 'c%.0s' {1..64})" ;;
      *) return 1 ;;
    esac
  }
  if validate_retained_runtime_images "$backup_dir"; then
    fail "stale retained frontend image id was accepted"
  fi
)

test_format_three_requires_minio() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  backup_dir="$(mktemp -d)"
  trap 'rm -rf "$backup_dir"' EXIT
  for file in \
    backup-format-version env.snapshot integration-secret-key.sha256 \
    git-revision.txt previous-successful-revision.txt target-git-revision.txt \
    compose-files.txt docker-compose.resolved.yml runtime-selection.txt \
    paired-restore.status database-migration-state.txt database-migrations.before.tsv \
    source-migrations.tsv target-migrations.tsv runtime-compose.resolved.yml \
    recovery-migrations.tsv \
    runtime-topology.services runtime-compose-with-images.resolved.yml \
    retained-images.tsv restore-images.override.yml \
    table-counts.before.tsv foreign-keys.before.tsv; do
    : > "$backup_dir/$file"
  done
  printf 'database-backup\n' | gzip -c > "$backup_dir/mysql.sql.gz"
  if write_backup_checksums "$backup_dir" >/dev/null 2>&1; then
    fail "format-three backup accepted a missing MinIO archive"
  fi
  mkdir -p "$backup_dir/minio-source"
  printf 'minio-backup\n' > "$backup_dir/minio-source/object"
  tar -czf "$backup_dir/minio.tar.gz" -C "$backup_dir/minio-source" .
  rm -rf "$backup_dir/minio-source"
  write_backup_checksums "$backup_dir" || fail "complete paired backup was rejected"
  grep -Fq 'minio.tar.gz' "$backup_dir/checksums.sha256" || fail "MinIO archive was omitted from backup checksums"
)

test_minio_backup_is_atomic_and_health_gated() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  calls_file="$(mktemp)"
  trap 'rm -rf "$temp_dir"; rm -f "$calls_file"' EXIT
  APP_DIR="$temp_dir"
  CURRENT_BACKUP_DIR="backups/git-deploy-staging/current"
  MINIO_INITIAL_HEALTH="healthy"
  MINIO_RESTART_HEALTH="healthy"
  MINIO_STATE="true"
  MINIO_RESTARTED="NO"
  MINIO_STOP_FAIL="NO"
  MINIO_START_FAIL="NO"
  MINIO_RUN_FAIL="NO"
  HELPER_AVAILABLE="YES"
  HELPER_ID="sha256:$(printf 'a%.0s' {1..64})"
  mkdir -p "$APP_DIR/$CURRENT_BACKUP_DIR" "$APP_DIR/backups/git-deploy" "$temp_dir/minio-source"
  printf 'object data\n' > "$temp_dir/minio-source/object"
  cd "$APP_DIR"
  release_id() { printf 'release-test\n'; }
  sleep() { :; }
  compose() {
    case "$*" in
      "ps --status running --quiet minio")
        [ "$MINIO_STATE" = "true" ] && printf 'minio-container\n'
        ;;
      "stop minio")
        record_call "stop"
        [ "$MINIO_STOP_FAIL" != "YES" ] || return 1
        MINIO_STATE="false"
        ;;
      "start minio")
        record_call "start"
        MINIO_STATE="true"
        MINIO_RESTARTED="YES"
        [ "$MINIO_START_FAIL" != "YES" ]
        ;;
      *) return 1 ;;
    esac
  }
  docker() {
    case "$1" in
      image)
        [ "$2" = "inspect" ] || return 1
        record_call "helper-inspect"
        [ "$HELPER_AVAILABLE" = "YES" ] || return 1
        printf '%s\tdelivery-platform-backend\trelease-test\n' "$HELPER_ID"
        ;;
      inspect)
        if [[ "$*" = *'.Mounts'* ]]; then
          printf 'volume\tminio-volume\n'
        elif [[ "$*" = *'.State.Health'* ]]; then
          if [ "$MINIO_RESTARTED" = "YES" ]; then
            record_call "health $MINIO_RESTART_HEALTH"
            printf '%s\t%s\n' "$MINIO_STATE" "$MINIO_RESTART_HEALTH"
          else
            printf '%s\t%s\n' "$MINIO_STATE" "$MINIO_INITIAL_HEALTH"
          fi
        elif [[ "$*" = *'.State.Running'* ]]; then
          printf '%s\n' "$MINIO_STATE"
        else
          return 1
        fi
        ;;
      volume)
        [ "$2" = "inspect" ] && [ "$3" = "minio-volume" ]
        ;;
      run)
        if [[ "$*" = *'command -v tar'* ]]; then
          [[ "$*" = *'--user 0:0'* ]] || return 1
          [[ "$*" = *'--read-only'* ]] || return 1
          record_call "helper-preflight running=$MINIO_STATE"
        else
          [[ "$*" = *'--user 0:0'* ]] || return 1
          [[ "$*" = *"$APP_DIR/$CURRENT_BACKUP_DIR:/backup"* ]] || return 1
          [[ "$*" != *"$APP_DIR/$CURRENT_BACKUP_DIR:/backup:ro"* ]] || return 1
          record_call "archive running=$MINIO_STATE image=$HELPER_ID"
          tar -czf "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" -C "$temp_dir/minio-source" .
          [ "$MINIO_RUN_FAIL" != "YES" ]
        fi
        ;;
      *) return 1 ;;
    esac
  }

  backup_minio || fail "healthy MinIO source was rejected"
  assert_calls "$(cat <<'EXPECTED'
helper-inspect
helper-preflight running=true
stop
archive running=false image=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
start
health healthy
EXPECTED
)"
  [ -f "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz" ] || fail "validated MinIO archive was not published"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" ] || fail "MinIO partial archive survived a successful publish"
  tar -tzf "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz" >/dev/null || fail "published MinIO archive is invalid"

  rm -f "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz"
  : > "$calls_file"
  MINIO_INITIAL_HEALTH="unhealthy"
  MINIO_RESTARTED="NO"
  if backup_minio >/dev/null 2>&1; then
    fail "unhealthy MinIO source was accepted"
  fi
  [ ! -s "$calls_file" ] || fail "initially unhealthy MinIO was stopped or restarted"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz" ] || fail "unhealthy MinIO source published an archive"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" ] || fail "unhealthy MinIO source left a partial archive"

  : > "$calls_file"
  MINIO_INITIAL_HEALTH="healthy"
  MINIO_STATE="true"
  MINIO_RESTARTED="NO"
  HELPER_AVAILABLE="NO"
  if backup_minio >/dev/null 2>&1; then
    fail "missing local helper image was accepted"
  fi
  assert_calls "helper-inspect"
  if grep -Fxq 'stop' "$calls_file"; then
    fail "MinIO was stopped before the helper image was available locally"
  fi
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" ] || fail "missing helper image left a partial archive"

  : > "$calls_file"
  HELPER_AVAILABLE="YES"
  MINIO_RUN_FAIL="YES"
  if backup_minio >/dev/null 2>&1; then
    fail "failed MinIO archive command was accepted"
  fi
  grep -Fq 'archive running=false image=' "$calls_file" || fail "MinIO archive ran before the source was stopped"
  grep -Fxq 'start' "$calls_file" || fail "MinIO was not restarted after archive failure"
  grep -Fxq 'health healthy' "$calls_file" || fail "MinIO health was not awaited after archive failure"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz" ] || fail "failed MinIO archive command published an archive"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" ] || fail "failed MinIO archive command left a partial archive"

  : > "$calls_file"
  MINIO_STATE="true"
  MINIO_RESTARTED="NO"
  MINIO_RUN_FAIL="NO"
  MINIO_STOP_FAIL="YES"
  if backup_minio >/dev/null 2>&1; then
    fail "failed MinIO stop was accepted"
  fi
  grep -Fxq 'start' "$calls_file" || fail "MinIO recovery was not attempted after stop failure"
  grep -Fxq 'health healthy' "$calls_file" || fail "MinIO health was not awaited after stop failure"
  if grep -q '^archive ' "$calls_file"; then
    fail "raw MinIO volume was read after stop failure"
  fi

  : > "$calls_file"
  MINIO_STATE="true"
  MINIO_RESTARTED="NO"
  MINIO_STOP_FAIL="NO"
  MINIO_START_FAIL="YES"
  if backup_minio >/dev/null 2>&1; then
    fail "failed MinIO restart was accepted"
  fi
  grep -Fxq 'health healthy' "$calls_file" || fail "health was not checked after a failed restart command"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz" ] || fail "restart failure published a MinIO archive"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" ] || fail "restart failure left a partial archive"

  : > "$calls_file"
  MINIO_STATE="true"
  MINIO_RESTARTED="NO"
  MINIO_START_FAIL="NO"
  MINIO_RESTART_HEALTH="unhealthy"
  if backup_minio >/dev/null 2>&1; then
    fail "unhealthy MinIO restart was accepted"
  fi
  grep -Fxq 'start' "$calls_file" || fail "MinIO was not restarted before the health failure"
  grep -Fxq 'health unhealthy' "$calls_file" || fail "unhealthy MinIO restart was not health gated"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz" ] || fail "health failure published a MinIO archive"
  [ ! -e "$APP_DIR/$CURRENT_BACKUP_DIR/minio.tar.gz.part" ] || fail "health failure left a partial archive"
  if grep -Eq '(^|[[:space:]])alpine([[:space:]]|$)' "$ROOT_DIR/deploy-git.sh"; then
    fail "backup or restore still depends on an unpinned Alpine helper image"
  fi
)

test_backup_rotation_deletes_only_verified_unprotected_backups() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  BACKUP_RETENTION_DAYS=14
  root="$APP_DIR/backups/git-deploy"
  mkdir -p "$root" "$APP_DIR/.deploy/data-restore-incomplete"
  cd "$APP_DIR"

  for name in expired-valid latest bound current fresh invalid unverified legacy; do
    create_complete_format_three_backup_fixture "$root/$name"
  done
  printf '%s\n' 'backups/git-deploy/latest' > "$APP_DIR/.deploy/latest_backup"
  printf '%s\n' "$root/bound" > "$APP_DIR/.deploy/data-restore-incomplete/backup-path.txt"
  CURRENT_BACKUP_DIR="backups/git-deploy/current"
  printf 'corruption\n' >> "$root/invalid/minio.tar.gz"
  rm -f "$root/unverified/checksums.sha256"
  printf '2\n' > "$root/legacy/backup-format-version"
  for name in expired-valid latest bound current invalid unverified legacy; do
    touch -d '30 days ago' "$root/$name"
  done

  rotate_backups || fail "safe backup rotation failed"
  [ ! -e "$root/expired-valid" ] || fail "expired verified unprotected backup was not removed"
  for name in latest bound current fresh invalid unverified legacy; do
    [ -d "$root/$name" ] || fail "backup rotation removed protected or unverified backup: $name"
  done
)

test_storage_diagnostics_include_capacity_and_minio_volume() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  mkdir -p "$APP_DIR/backups/git-deploy/current"
  CURRENT_BACKUP_DIR="backups/git-deploy/current"
  df() { printf 'filesystem-capacity\n'; }
  du() { printf 'backup-size %s\n' "$*"; }
  find() { :; }
  compose() {
    case "$*" in
      "ps -a minio") printf 'minio-compose-status\n' ;;
      "ps --all --quiet minio") printf 'minio-container\n' ;;
      *) return 1 ;;
    esac
  }
  docker() {
    case "$1 $2" in
      "system df") printf 'docker-capacity\n' ;;
      "inspect minio-container")
        if [[ "$*" = *'.Mounts'* ]]; then
          printf 'volume\tminio-volume\n'
        else
          printf 'container-state\n'
        fi
        ;;
      "volume inspect")
        if [[ "$*" = *'--format'* ]]; then
          printf 'volume=minio-volume driver=local mountpoint=/var/lib/docker/volumes/minio-volume/_data\n'
        fi
        ;;
      *) return 1 ;;
    esac
  }
  output="$(write_storage_diagnostics)"
  grep -Fq 'filesystem-capacity' <<< "$output" || fail "filesystem capacity was omitted from diagnostics"
  grep -Fq 'backup-size' <<< "$output" || fail "backup sizes were omitted from diagnostics"
  grep -Fq 'docker-capacity' <<< "$output" || fail "Docker disk usage was omitted from diagnostics"
  grep -Fq 'minio-compose-status' <<< "$output" || fail "MinIO compose status was omitted from diagnostics"
  grep -Fq 'volume=minio-volume' <<< "$output" || fail "MinIO volume identity was omitted from diagnostics"
)

test_ciphertext_restore_uses_strict_verify() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  encrypted_integration_config_count() { printf '1\n'; }
  compose() { record_call "compose $*"; }
  verify_integration_ciphertext_readable
  assert_calls "compose run --rm --no-deps backend-migrate sh -c ./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts --verify"
)

test_start_infra_returns_failure() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  compose() { return 1; }
  if start_infra; then
    fail "infrastructure startup failure was accepted"
  fi
)

test_start_infra_preserves_prepared_integration_key() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local_key="$(printf 'abcdefghijklmnopqrstuvwxyzABCDEF' | openssl base64 -A)"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  mkdir -p "$APP_DIR/.deploy"
  printf 'OTHER_SETTING=present\n' > "$APP_DIR/.env"
  PREPARED_INTEGRATION_SECRET_KEY="$local_key"
  export INTEGRATION_SECRET_ENCRYPTION_KEY="$local_key"
  cd "$APP_DIR"

  compose() {
    case "$*" in
      "up -d mysql redis minio"|"up -d minio-init") return 0 ;;
      "ps --all --quiet minio-init") printf '%s\n' minio-init-id ;;
      "exec -T mysql "*)
        [ "${INTEGRATION_SECRET_ENCRYPTION_KEY:-}" = "$local_key" ]
        ;;
      *) return 1 ;;
    esac
  }
  docker() {
    [ "$*" = "wait minio-init-id" ] || return 1
    printf '0\n'
  }
  sleep() { :; }

  start_infra || fail "prepared integration key was discarded before MySQL readiness"
  [ ! -v INTEGRATION_SECRET_ENCRYPTION_KEY ] && fail "prepared integration key disappeared during infrastructure startup"
  [ "$INTEGRATION_SECRET_ENCRYPTION_KEY" = "$local_key" ] || fail "prepared integration key changed during infrastructure startup"
)

test_deploy_quiesces_before_persisting_integration_key() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  init_or_adopt_repo() { :; }
  acquire_lock() { :; }
  assert_no_incomplete_data_restore() { :; }
  prepare_deployment_source() { :; }
  install_deployment_env_upload() { :; }
  checkout_target() { :; }
  preflight() { :; }
  build_images() { :; }
  start_infra() { record_call "start-infra"; }
  quiesce_app() { record_call "quiesce"; }
  persist_prepared_integration_secret_key() { record_call "persist-key"; }
  create_backup() { record_call "backup"; }
  run_migrations() { record_call "migrate"; }
  switch_app() { record_call "switch"; }
  mark_deployment_successful() { :; }
  discard_deployment_env_backup() { :; }
  rotate_backups() { :; }
  log() { :; }

  deploy
  assert_calls "$(cat <<'EXPECTED'
start-infra
quiesce
persist-key
backup
migrate
switch
EXPECTED
)"
)

test_persist_failure_after_quiesce_recovers_runtime() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    init_or_adopt_repo() { :; }
    acquire_lock() { :; }
    assert_no_incomplete_data_restore() { :; }
    prepare_deployment_source() { SOURCE_SWITCH_STARTED="YES"; }
    install_deployment_env_upload() { :; }
    checkout_target() { :; }
    preflight() { :; }
    build_images() { :; }
    start_infra() { record_call "start-infra"; }
    quiesce_app() { record_call "quiesce"; }
    persist_prepared_integration_secret_key() { record_call "persist-key"; return 1; }
    capture_failure_diagnostics() { record_call "capture"; }
    restore_deployment_env() { record_call "restore-env"; }
    rollback_source_to_last_successful() { record_call "rollback-source"; }
    detect_compose() { record_call "detect-compose"; }
    resume_existing_app() { record_call "resume $*"; }
    log() { record_call "log $*"; }
    err() { record_call "error $*"; exit 1; }
    deploy
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "integration-key persistence failure returned success"
  assert_calls "$(cat <<'EXPECTED'
start-infra
quiesce
persist-key
capture
restore-env
rollback-source
detect-compose
start-infra
resume compatible
log pre-deployment runtime recovered
error integration secret encryption key preflight failed
EXPECTED
)"
}

test_manual_backup_quiesces_before_persisting_integration_key() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  init_or_adopt_repo() { :; }
  acquire_lock() { :; }
  preflight() { :; }
  start_infra() { record_call "start-infra"; }
  quiesce_app() { record_call "quiesce $*"; }
  persist_prepared_integration_secret_key() { record_call "persist-key"; }
  create_backup() { record_call "backup"; }
  resume_existing_app() { record_call "resume $*"; }

  manual_backup
  assert_calls "$(cat <<'EXPECTED'
start-infra
quiesce compatible
persist-key
backup
resume compatible
EXPECTED
)"
)

test_manual_rollback_quiesces_before_persisting_integration_key() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  init_or_adopt_repo() { :; }
  acquire_lock() { :; }
  preflight() { :; }
  start_infra() { record_call "start-infra"; }
  validate_code_only_rollback_revision() { record_call "validate $*"; }
  quiesce_app() { record_call "quiesce $*"; }
  persist_prepared_integration_secret_key() { record_call "persist-key"; }
  rollback_source_to_previous_successful() { record_call "rollback-source"; }
  switch_app() { record_call "switch $*"; }
  mark_deployment_successful() { record_call "mark-success"; }
  log() { :; }

  manual_rollback_code
  assert_calls "$(cat <<'EXPECTED'
start-infra
validate .deploy/previous_successful_rev previous successful
quiesce compatible
persist-key
rollback-source
switch compatible
mark-success
EXPECTED
)"
)

test_pre_mutation_failure_recovers_infrastructure() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    SOURCE_SWITCH_STARTED="YES"
    capture_failure_diagnostics() { record_call "capture"; }
    restore_deployment_env() { record_call "restore-env"; }
    rollback_source_to_last_successful() { record_call "rollback-source"; }
    detect_compose() { record_call "detect-compose"; }
    start_infra() { record_call "start-infra"; }
    resume_existing_app() { record_call "resume $*"; }
    log() { record_call "log $*"; }
    err() { record_call "error $*"; exit 1; }
    handle_pre_quiesce_failure "infrastructure startup failed"
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "pre-mutation failure returned success"
  assert_calls "$(cat <<'EXPECTED'
capture
restore-env
rollback-source
detect-compose
start-infra
resume compatible
log pre-deployment runtime recovered
error infrastructure startup failed
EXPECTED
)"
}

test_exit_before_source_switch_preserves_worktree() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DEPLOY_ACTIVE="YES"
    DEPLOY_SUCCEEDED="NO"
    DATABASE_MUTATION_STARTED="NO"
    SOURCE_SWITCH_STARTED="NO"
    restore_deployment_env() { record_call "restore-env"; }
    rollback_source_to_last_successful() { record_call "rollback-source"; }
    recover_pre_mutation_runtime() { record_call "recover-runtime"; }
    set +e
    false
    on_exit
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "pre-source-switch exit returned success"
  assert_calls "restore-env"
}

test_database_mutation_state_and_restore_gate() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN

  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DATABASE_MUTATION_STARTED="YES"
    ROLLBACK_DATA_ON_FAILURE="NO"
    quiesce_app() { record_call "quiesce"; }
    capture_failure_diagnostics() { record_call "capture"; }
    preserve_deployment_env_backup_for_recovery() { DEPLOY_ENV_ROLLBACK_DISABLED="YES"; record_call "preserve-env"; }
    restore_deployment_env() { record_call "restore-env"; }
    rollback_source_to_last_successful() { record_call "rollback-source"; }
    resume_existing_app() { record_call "resume"; }
    err() { record_call "error $*"; exit 1; }
    handle_deploy_failure "migration failed"
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "mutating failure returned success without a paired restore"
  assert_calls "$(cat <<'EXPECTED'
quiesce
capture
preserve-env
error database mutation may have started and no verified paired data restore completed; target source and current environment are retained, and the application remains stopped
EXPECTED
)"

  : > "$calls_file"
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DATABASE_MUTATION_STARTED="YES"
    ROLLBACK_DATA_ON_FAILURE="YES"
    CURRENT_BACKUP_DIR="paired-backup"
    quiesce_app() { record_call "quiesce"; }
    capture_failure_diagnostics() { record_call "capture"; }
    restore_data_from_backup() { DATA_RESTORE_COMPLETED="YES"; RESTORED_BACKUP_DIR="paired-backup"; record_call "restore-data $CONFIRM_RESTORE $BACKUP_PATH"; }
    discard_deployment_env_backup() { record_call "discard-env"; }
    rollback_source_from_revision_file() { record_call "rollback-runtime $*"; }
    activate_restored_runtime() { record_call "activate-runtime $*"; }
    switch_app() { record_call "switch $*"; }
    mark_deployment_successful() { record_call "mark-success"; }
    err() { record_call "error $*"; exit 1; }
    handle_deploy_failure "migration failed"
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "paired rollback failure handler returned success"
  assert_calls "$(cat <<'EXPECTED'
quiesce
capture
restore-data YES paired-backup
discard-env
rollback-runtime paired-backup/git-revision.txt backup runtime
activate-runtime paired-backup
switch compatible
mark-success
error migration failed; verified paired data/runtime rollback completed
EXPECTED
)"

  : > "$calls_file"
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DATABASE_MUTATION_STARTED="YES"
    ROLLBACK_DATA_ON_FAILURE="YES"
    quiesce_app() { record_call "quiesce"; }
    capture_failure_diagnostics() { record_call "capture"; }
    restore_data_from_backup() { record_call "restore-data"; }
    preserve_deployment_env_backup_for_recovery() { DEPLOY_ENV_ROLLBACK_DISABLED="YES"; record_call "preserve-env"; }
    err() { record_call "error $*"; exit 1; }
    handle_deploy_failure "manual rollback failed" NO
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "manual rollback mutation boundary returned success"
  assert_calls "$(cat <<'EXPECTED'
quiesce
capture
preserve-env
error database mutation may have started and no verified paired data restore completed; target source and current environment are retained, and the application remains stopped
EXPECTED
)"
}

test_code_only_rollback_requires_exact_database_manifest() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="code-rollback-contract"
  revision="1111111111111111111111111111111111111111"
  mkdir -p "$APP_DIR/.deploy"
  printf '%s\n' "$revision" > "$APP_DIR/.deploy/previous_successful_rev"
  cd "$APP_DIR"
  git() { return 0; }
  warn() { :; }
  write_database_migration_manifest() {
    printf 'migration_a\tchecksum_a\n' > "$1"
    printf 'CLEAN\n' > "$2"
  }
  write_revision_migration_manifest() {
    if [ "${REVISION_MATCHES_DATABASE:-NO}" = "YES" ]; then
      printf 'migration_a\tchecksum_a\n' > "$2"
    else
      printf 'migration_b\tchecksum_b\n' > "$2"
    fi
  }

  printf '%s\n' "$revision" > "$APP_DIR/.deploy/database-mutation-target"
  if validate_code_only_rollback_revision .deploy/previous_successful_rev "previous successful"; then
    fail "code-only rollback ignored the database mutation recovery marker"
  fi
  rm -f "$APP_DIR/.deploy/database-mutation-target"

  if validate_code_only_rollback_revision .deploy/previous_successful_rev "previous successful"; then
    fail "code-only rollback accepted a mismatched Prisma migration manifest"
  fi
  REVISION_MATCHES_DATABASE="YES"
  validate_code_only_rollback_revision .deploy/previous_successful_rev "previous successful" || \
    fail "code-only rollback rejected an exact Prisma migration manifest"
)

test_incomplete_restore_marker_blocks_ordinary_deploy() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  DEPLOY_RUN_ID="incomplete-restore-contract"
  backup="$APP_DIR/backups/git-deploy/contract"
  mkdir -p "$backup" "$APP_DIR/.deploy"
  printf 'artifact checksum\n' > "$backup/checksums.sha256"
  printf '%s\n' '3333333333333333333333333333333333333333' > "$backup/git-revision.txt"

  write_incomplete_data_restore_marker "$backup"
  if assert_no_incomplete_data_restore; then
    fail "ordinary deployment accepted an incomplete data restore marker"
  fi
  ALLOW_INCOMPLETE_RESTORE_RETRY="YES"
  assert_no_incomplete_data_restore || fail "explicit restore retry was blocked"
  validate_incomplete_data_restore_binding "$backup" || fail "restore marker rejected its bound backup"
  printf 'changed manifest\n' > "$backup/checksums.sha256"
  if validate_incomplete_data_restore_binding "$backup"; then
    fail "restore marker accepted a changed backup manifest"
  fi
  printf 'artifact checksum\n' > "$backup/checksums.sha256"
  clear_incomplete_data_restore_marker "$backup"
  ALLOW_INCOMPLETE_RESTORE_RETRY="NO"
  assert_no_incomplete_data_restore || fail "completed restore marker was not cleared"
)

test_deploy_checks_incomplete_restore_before_source_import() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    init_or_adopt_repo() { record_call "init"; }
    acquire_lock() { record_call "lock"; }
    assert_no_incomplete_data_restore() { record_call "incomplete-restore-gate"; return 1; }
    prepare_deployment_source() { record_call "prepare-source"; }
    err() { record_call "error $*"; exit 1; }
    deploy
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "deploy continued past the incomplete restore gate"
  assert_calls "$(cat <<'EXPECTED'
init
lock
incomplete-restore-gate
error deployment is blocked until the recorded paired data restore is retried from its bound backup
EXPECTED
)"
}

test_restore_stops_minio_before_database_mutation() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  calls_file="$(mktemp)"
  trap 'rm -rf "$temp_dir"; rm -f "$calls_file"' EXIT
  APP_DIR="$temp_dir"
  BACKUP_PATH="$temp_dir/backups/git-deploy/contract"
  CONFIRM_RESTORE="YES"
  DEPLOY_RUN_ID="restore-contract"
  mkdir -p "$BACKUP_PATH" "$APP_DIR/.deploy"
  printf '%s\n' '2222222222222222222222222222222222222222' > "$BACKUP_PATH/git-revision.txt"
  cd "$APP_DIR"
  source_env() { :; }
  validate_backup_for_restore() { :; }
  retained_backend_helper_image_id() { printf 'sha256:%064d\n' 0; }
  verified_tar_helper_image_id() { printf 'sha256:%064d\n' 0; }
  start_infra() { record_call "start-infra"; }
  quiesce_app() { record_call "quiesce $*"; }
  minio_volume_name() { printf 'minio-volume\n'; }
  compose() {
    record_call "compose $*"
    [ "$*" != "stop minio" ]
  }
  write_revision_file() { record_call "mutation-marker $*"; }
  warn() { :; }

  if restore_data_from_backup; then
    fail "restore continued after MinIO could not be stopped"
  fi
  [ "$DATABASE_MUTATION_STARTED" = "NO" ] || fail "database mutation started before MinIO was stopped"
  [ "$DATA_RESTORE_STARTED" = "NO" ] || fail "database replacement started before MinIO was stopped"
  assert_calls "$(cat <<'EXPECTED'
start-infra
quiesce compatible
compose stop minio
EXPECTED
)"
)

test_restore_pointer_cannot_reference_backup_staging() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  APP_DIR="$temp_dir"
  BACKUP_PATH=""
  CONFIRM_RESTORE="YES"
  VALIDATE_CALLED="NO"
  mkdir -p "$APP_DIR/.deploy" "$APP_DIR/backups/git-deploy" "$APP_DIR/backups/git-deploy-staging/incomplete"
  printf '%s\n' 'backups/git-deploy-staging/incomplete' > "$APP_DIR/.deploy/latest_backup"
  cd "$APP_DIR"
  source_env() { :; }
  validate_backup_for_restore() { VALIDATE_CALLED="YES"; }
  warn() { :; }

  if restore_data_from_backup; then
    fail "restore accepted a latest-backup pointer into staging"
  fi
  [ "$VALIDATE_CALLED" = "NO" ] || fail "staging backup reached restore validation"
)

test_manual_restore_preflight_failure_restarts_infrastructure() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    init_or_adopt_repo() { :; }
    acquire_lock() { :; }
    preflight() { :; }
    restore_data_from_backup() { DATA_RESTORE_STARTED="NO"; record_call "restore-data"; return 1; }
    capture_failure_diagnostics() { record_call "capture"; }
    start_infra() { record_call "start-infra"; }
    resume_existing_app() { record_call "resume $*"; }
    err() { record_call "error $*"; exit 1; }
    manual_restore_data
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "manual restore preflight failure returned success"
  assert_calls "$(cat <<'EXPECTED'
restore-data
capture
start-infra
resume compatible
error data restore failed; application remains stopped if database replacement had started
EXPECTED
)"

  : > "$calls_file"
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    temp_dir="$(mktemp -d)"
    trap 'rm -rf "$temp_dir"' EXIT
    APP_DIR="$temp_dir"
    mkdir -p "$APP_DIR/.deploy/data-restore-incomplete"
    init_or_adopt_repo() { :; }
    acquire_lock() { :; }
    preflight() { :; }
    restore_data_from_backup() { DATA_RESTORE_STARTED="NO"; record_call "restore-data"; return 1; }
    capture_failure_diagnostics() { record_call "capture"; }
    start_infra() { record_call "start-infra"; }
    resume_existing_app() { record_call "resume $*"; }
    err() { record_call "error $*"; exit 1; }
    manual_restore_data
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "bound restore retry failure returned success"
  assert_calls "$(cat <<'EXPECTED'
restore-data
capture
error data restore failed; application remains stopped if database replacement had started
EXPECTED
)"
}

test_unexpected_exit_respects_database_mutation_boundary() {
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' RETURN

  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DEPLOY_ACTIVE="YES"
    DEPLOY_SUCCEEDED="NO"
    DATABASE_MUTATION_STARTED="YES"
    DEPLOY_ENV_ROLLBACK_DISABLED="NO"
    quiesce_app() { record_call "quiesce $*"; }
    preserve_deployment_env_backup_for_recovery() {
      DEPLOY_ENV_ROLLBACK_DISABLED="YES"
      record_call "preserve-env"
    }
    restore_deployment_env() { record_call "restore-env"; }
    rollback_source_to_last_successful() { record_call "rollback-source"; }
    set +e
    false
    on_exit
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "unexpected post-migration exit returned success"
  assert_calls "$(cat <<'EXPECTED'
quiesce available
preserve-env
EXPECTED
)"

  : > "$calls_file"
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DEPLOY_ACTIVE="YES"
    DEPLOY_SUCCEEDED="NO"
    DATABASE_MUTATION_STARTED="YES"
    DEPLOY_ENV_ROLLBACK_DISABLED="YES"
    quiesce_app() { record_call "quiesce $*"; }
    preserve_deployment_env_backup_for_recovery() { record_call "preserve-env"; }
    set +e
    false
    on_exit
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "incomplete paired rollback exit returned success"
  assert_calls "quiesce available"

  : > "$calls_file"
  set +e
  (
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    DEPLOY_ACTIVE="YES"
    DEPLOY_SUCCEEDED="NO"
    DATABASE_MUTATION_STARTED="YES"
    DEPLOY_ENV_ROLLBACK_DISABLED="YES"
    PAIRED_RUNTIME_HEALTHY="YES"
    quiesce_app() { record_call "quiesce $*"; }
    preserve_deployment_env_backup_for_recovery() { record_call "preserve-env"; }
    set +e
    false
    on_exit
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "completed paired rollback exit returned success"
  [ ! -s "$calls_file" ] || fail "completed paired rollback was stopped again by exit handling"
}

test_run_migrations_marks_mutation_before_compose() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  DATABASE_MUTATION_STARTED="NO"
  compose() { return 1; }
  if run_migrations >/dev/null 2>&1; then
    fail "migration command failure was accepted"
  fi
  [ "$DATABASE_MUTATION_STARTED" = "YES" ] || fail "database mutation boundary was not set before migration execution"
)

test_post_migration_audit_never_mutates_published_backup() {
  local mode
  for mode in table-write-failure checksum-write-failure success; do
    (
      # shellcheck source=../deploy-git.sh
      source "$ROOT_DIR/deploy-git.sh"
      temp_dir="$(mktemp -d)"
      trap 'rm -rf "$temp_dir"' EXIT
      APP_DIR="$temp_dir"
      DEPLOY_RUN_ID="migration-audit-$mode"
      CURRENT_BACKUP_DIR="backups/git-deploy/contract"
      target_revision="2222222222222222222222222222222222222222"
      mkdir -p "$APP_DIR/.deploy"
      cd "$APP_DIR"
      prepare_managed_backup_roots
      backup_dir="$APP_DIR/$CURRENT_BACKUP_DIR"
      create_complete_format_three_backup_fixture "$backup_dir"
      find "$backup_dir" -maxdepth 1 -type f -exec sha256sum {} \; | LC_ALL=C sort > "$temp_dir/backup.before"
      verify_backup_checksums "$backup_dir" || fail "test rollback backup is invalid before audit"

      write_table_audit() {
        printf 'projects\t3\n' > "$1"
        [ "$mode" != "table-write-failure" ]
      }
      write_foreign_key_audit() { printf 'project_members.fk\t0\n' > "$1"; }
      verify_table_counts_preserved() { printf 'projects\t3\t3\t0\n' > "$3"; }
      if [ "$mode" = "checksum-write-failure" ]; then
        write_migration_audit_checksums() {
          printf 'partial checksum\n' > "$1/checksums.sha256.tmp.injected"
          return 1
        }
      fi

      if [ "$mode" = "success" ]; then
        publish_post_migration_audit "$target_revision" || fail "valid independent migration audit was not published"
      elif publish_post_migration_audit "$target_revision" >/dev/null 2>&1; then
        fail "injected $mode was accepted"
      fi

      find "$backup_dir" -maxdepth 1 -type f -exec sha256sum {} \; | LC_ALL=C sort > "$temp_dir/backup.after"
      cmp -s "$temp_dir/backup.before" "$temp_dir/backup.after" || \
        fail "$mode changed the published rollback backup"
      verify_backup_checksums "$backup_dir" || fail "$mode invalidated the published rollback backup"
      for file in table-counts.after.tsv foreign-keys.after.tsv table-count-deltas.tsv; do
        [ ! -e "$backup_dir/$file" ] || fail "$mode wrote post-migration data into the rollback backup"
      done
      [ -z "$(find "$APP_DIR/backups/git-deploy-staging" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
        fail "$mode left the current audit staging directory"

      audit_dir="$APP_DIR/backups/git-deploy-audits/contract"
      if [ "$mode" = "success" ]; then
        [ -d "$audit_dir" ] || fail "independent migration audit directory is missing"
        verify_migration_audit "$audit_dir" "$CURRENT_BACKUP_DIR" "$backup_dir" "$target_revision" || \
          fail "published independent migration audit failed checksum validation"
        [ "$(cat "$APP_DIR/.deploy/latest_migration_audit")" = 'backups/git-deploy-audits/contract' ] || \
          fail "latest migration-audit pointer is incorrect"
      else
        [ ! -e "$audit_dir" ] || fail "$mode published an incomplete migration audit"
        [ ! -e "$APP_DIR/.deploy/latest_migration_audit" ] || fail "$mode changed the migration-audit pointer"
      fi
    )
  done
}

test_success_revision_commits_before_env_cleanup() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  calls_file="$(mktemp)"
  trap 'rm -f "$calls_file"' EXIT
  init_or_adopt_repo() { :; }
  acquire_lock() { record_call "acquire-lock"; }
  prepare_deployment_source() { record_call "prepare-source"; }
  install_deployment_env_upload() { record_call "install-env"; }
  checkout_target() { :; }
  preflight() { :; }
  build_images() { :; }
  start_infra() { :; }
  persist_prepared_integration_secret_key() { :; }
  quiesce_app() { :; }
  create_backup() { :; }
  run_migrations() { :; }
  switch_app() { :; }
  mark_deployment_successful() { record_call "mark-success"; }
  discard_deployment_env_backup() { record_call "discard-env"; return 1; }
  warn() { record_call "warn $*"; }
  rotate_backups() { record_call "rotate-backups"; }
  log() { :; }
  deploy
  [ "$DEPLOY_SUCCEEDED" = "YES" ] || fail "healthy deployment was not committed before cleanup"
  assert_calls "$(cat <<'EXPECTED'
acquire-lock
prepare-source
install-env
mark-success
discard-env
warn deployment is healthy, but its inactive environment backup could not be removed
rotate-backups
EXPECTED
)"
)

test_workflow_runs_protected_image_cleanup_after_deploy() {
  local workflow="$ROOT_DIR/.github/workflows/deploy.yml"
  local predeploy_prune_line deploy_line prune_line first_status_line final_status_line
  local -a status_lines=()
  predeploy_prune_line="$(grep -nF 'bash "$DEPLOY_SCRIPT" prune-unused-images-predeploy' "$workflow" | tail -1 | cut -d: -f1)"
  deploy_line="$(grep -nF 'bash "$DEPLOY_SCRIPT" deploy' "$workflow" | tail -1 | cut -d: -f1)"
  prune_line="$(grep -nF 'bash "$DEPLOY_SCRIPT" prune-unused-images' "$workflow" | tail -1 | cut -d: -f1)"
  mapfile -t status_lines < <(grep -nF 'bash "$DEPLOY_SCRIPT" status' "$workflow" | cut -d: -f1)
  [ -n "$predeploy_prune_line" ] && [ -n "$deploy_line" ] && [ -n "$prune_line" ] && \
    [ "${#status_lines[@]}" -eq 2 ] || \
    fail "workflow is missing pre-deploy cleanup, deploy, protected image cleanup or its two status verifications"
  first_status_line="${status_lines[0]}"
  final_status_line="${status_lines[1]}"
  [ "$predeploy_prune_line" -lt "$deploy_line" ] && [ "$deploy_line" -lt "$first_status_line" ] && \
    [ "$first_status_line" -lt "$prune_line" ] && \
    [ "$prune_line" -lt "$final_status_line" ] || \
    fail "workflow does not clean before build and verify status before and after runtime cleanup"
  grep -Fq 'bash "$DEPLOY_SCRIPT" prune-unused-images || prune_status="$?"' "$workflow" || \
    fail "workflow does not preserve the protected image cleanup exit status"
  grep -Fq 'bash "$DEPLOY_SCRIPT" status || final_status="$?"' "$workflow" || \
    fail "workflow does not run final status verification after cleanup failure"
  if grep -Eq 'docker[[:space:]]+(system|volume|container|network)[[:space:]]+prune|docker[[:space:]]+compose[[:space:]]+down[[:space:]].*-v|docker[[:space:]]+image[[:space:]]+rm[[:space:]].*(-f|--force)' "$ROOT_DIR/deploy-git.sh"; then
    fail "protected image cleanup contains a force, system, volume, container or network prune"
  fi
}

test_workflow_diagnoses_backend_migration_failure() {
  local workflow="$ROOT_DIR/.github/workflows/deploy.yml"
  local compose_test="$ROOT_DIR/docker-compose.test.yml"
  grep -Fq 'compose=(docker compose --env-file /dev/null -f docker-compose.test.yml -f docker-compose.ci.yml)' "$workflow" || \
    fail "CI integration still depends on a repository env file"
  grep -Fq '"${compose[@]}" ps -a || true' "$workflow" || \
    fail "CI migration diagnostics do not include stopped containers"
  grep -Fq '"${compose[@]}" logs --no-color backend-migrate || true' "$workflow" || \
    fail "CI migration diagnostics do not include full backend-migrate logs"
  grep -Fq '"${compose[@]}" logs --no-color --tail=200 mysql || true' "$workflow" || \
    fail "CI migration diagnostics do not include the last 200 MySQL log lines"
  grep -Fq '"${compose[@]}" config --format json' "$workflow" || \
    fail "CI migration diagnostics do not render sanitized Compose database configuration"
  grep -Fq 'condition: service_healthy' "$compose_test" || \
    fail "CI services do not wait for a healthy dependency"
  grep -Fq 'condition: service_completed_successfully' "$compose_test" || \
    fail "CI services do not wait for successful one-shot dependencies"
}

test_workflow_resolves_one_immutable_commit_for_all_jobs() {
  local workflow="$ROOT_DIR/.github/workflows/deploy.yml"
  [ "$(grep -Fc 'ref: ${{ needs.resolve.outputs.commit }}' "$workflow")" -eq 4 ] || \
    fail "quality, validate, integration and deploy do not checkout one resolved commit"
  [ "$(grep -Fc 'needs: resolve' "$workflow")" -eq 3 ] || \
    fail "parallel deployment gates do not all depend on the commit resolver"
  grep -Fq 'needs: [resolve, quality, validate, integration]' "$workflow" || \
    fail "deploy does not depend on the resolver and every deployment gate"
  grep -Fq 'DEPLOY_REF: ${{ needs.resolve.outputs.commit }}' "$workflow" || \
    fail "server deployment is not bound to the resolved commit"
  grep -Fq 'git rev-parse --verify --end-of-options "${requested}^{commit}"' "$workflow" || \
    fail "workflow does not safely resolve a requested ref to a commit"
  grep -Fq 'git merge-base --is-ancestor "$resolved" HEAD' "$workflow" || \
    fail "resolved commit is not restricted to the captured main history"
  if grep -Fq "github.event_name == 'workflow_dispatch' && github.event.inputs.ref || github.sha" "$workflow"; then
    fail "workflow still resolves the mutable manual ref independently in downstream jobs"
  fi
}

test_image_identity_uses_real_tab_template() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local expected_id output
  expected_id="sha256:$(printf 'a%.0s' {1..64})"
  docker() {
    [ "$1" = image ] && [ "$2" = inspect ] && [ "$3" = fixture ] && [ "$4" = --format ] || \
      fail "image identity issued an unexpected Docker command: $*"
    [ "$5" = '{{.Id}}{{"\t"}}{{with (index .Config "Labels")}}{{with (index . "org.opencontainers.image.title")}}{{.}}{{end}}{{end}}{{"\t"}}{{with (index .Config "Labels")}}{{with (index . "org.opencontainers.image.version")}}{{.}}{{end}}{{end}}' ] || \
      fail "image identity is not safe for unlabeled images or real tab delimiters"
    printf '%s\tdelivery-platform-backend\tfixture-release\n' "$expected_id"
  }
  output="$(image_identity fixture)"
  [ "$output" = "$expected_id"$'\t''delivery-platform-backend'$'\t''fixture-release' ] || \
    fail "image identity changed the tab-delimited output contract"
)

test_image_identity_allows_missing_labels() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local expected_id output
  expected_id="sha256:$(printf 'b%.0s' {1..64})"
  docker() {
    [ "$1" = image ] && [ "$2" = inspect ] && [ "$3" = unlabeled ] && [ "$4" = --format ] || \
      fail "unlabeled image identity issued an unexpected Docker command: $*"
    [[ "$5" == *'with (index .Config "Labels")'* ]] || \
      fail "image identity dereferences a missing Config.Labels map"
    printf '%s\t\t\n' "$expected_id"
  }
  output="$(image_identity unlabeled)"
  [ "$output" = "$expected_id"$'\t\t' ] || \
    fail "unlabeled image identity did not preserve empty label fields"
)

test_docker_disk_usage_timeout_contract() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local calls status
  calls="$(mktemp)"
  trap 'rm -f "$calls"' EXIT
  DOCKER_DISK_USAGE_TIMEOUT_SECONDS=7
  timeout() {
    printf '%s\n' "$*" > "$calls"
    return 124
  }
  set +e
  docker_system_df_with_timeout >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -eq 124 ] || fail "Docker disk usage timeout did not preserve the timeout exit status"
  [ "$(cat "$calls")" = "--kill-after=5s 7s docker system df" ] || \
    fail "Docker disk usage is not bounded by the configured timeout"
)

test_prune_missing_current_pointer_fails_before_image_delete() {
  local root calls status
  root="$(mktemp -d)"
  calls="$root/docker-calls"
  mkdir -p "$root/.deploy"
  : > "$calls"
  set +e
  (
    APP_DIR="$root"
    # shellcheck source=../deploy-git.sh
    source "$ROOT_DIR/deploy-git.sh"
    init_or_adopt_repo() { cd "$APP_DIR"; }
    validate_prune_managed_paths() { :; }
    acquire_lock() { :; }
    detect_compose() { :; }
    require_command() { :; }
    source_env() { :; }
    compose() { :; }
    load_app_topology() {
      WORKER_SERVICES=()
      APPLICATION_SERVICES=(backend frontend)
    }
    docker() {
      if [ "$1" = "system" ] && [ "$2" = "df" ]; then
        return 0
      fi
      if [ "$1" = "ps" ]; then
        return 0
      fi
      if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
        printf 'image-rm %s\n' "$3" >> "$calls"
        return 0
      fi
      fail "unexpected Docker call before current release pointer validation: $*"
    }
    manual_prune_unused_images
  ) >/dev/null 2>&1
  status="$?"
  set -e
  [ "$status" -ne 0 ] || fail "image cleanup accepted a missing current successful release pointer"
  [ ! -s "$calls" ] || fail "image cleanup deleted an image before validating the current release pointer"
  rm -rf "$root"
}

test_prune_release_pointer_and_symlink_contracts() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root revision backend_image frontend_image
  root="$(mktemp -d)"
  trap 'rm -rf "$root"' EXIT
  mkdir -p "$root/.deploy"
  APP_DIR="$root"
  cd "$APP_DIR"
  PRUNE_PROTECTED_IMAGES_FILE="$root/protected-images"
  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  revision="$(printf 'a%.0s' {1..40})"
  backend_image="sha256:$(printf '1%.0s' {1..64})"
  frontend_image="sha256:$(printf '2%.0s' {1..64})"
  image_identity() {
    case "$1" in
      delivery-platform-backend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' "$backend_image"
        ;;
      delivery-platform-frontend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' "$frontend_image"
        ;;
      *) return 1 ;;
    esac
  }

  printf '%s\n' "$revision" > .deploy/last_successful_rev
  protect_release_pointer_images_for_prune || fail "image cleanup rejected an absent optional previous release pointer"
  [ "$(sort -u "$PRUNE_PROTECTED_IMAGES_FILE" | wc -l | tr -d '[:space:]')" = "2" ] || \
    fail "current release images were not protected"

  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  image_identity() { return 1; }
  protect_release_pointer_images_for_prune predeploy || \
    fail "pre-deployment cleanup rejected a release image that is already absent"
  [ ! -s "$PRUNE_PROTECTED_IMAGES_FILE" ] || \
    fail "pre-deployment cleanup invented protection for an absent release image"
  if protect_release_pointer_images_for_prune runtime >/dev/null 2>&1; then
    fail "runtime cleanup accepted a missing current release image"
  fi

  if command -v ln >/dev/null 2>&1; then
    rm -f .deploy/last_successful_rev
    if ln -s missing-current-revision .deploy/last_successful_rev 2>/dev/null && \
      [ -L .deploy/last_successful_rev ]; then
      if protect_release_pointer_images_for_prune >/dev/null 2>&1; then
        fail "image cleanup accepted a dangling current release pointer"
      fi
    fi
  fi
)

test_prune_rejects_symlinked_managed_parent_directories() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root external
  command -v ln >/dev/null 2>&1 || return 0
  root="$(mktemp -d)"
  external="$(mktemp -d)"
  trap 'rm -rf "$root" "$external"' EXIT
  APP_DIR="$root"
  mkdir -p "$root/.git" "$external/deploy" "$external/backups"

  if ln -s "$external/deploy" "$root/.deploy" 2>/dev/null; then
    if [ -L "$root/.deploy" ]; then
      if validate_prune_managed_paths >/dev/null 2>&1; then
        fail "image cleanup accepted a symlinked .deploy parent directory"
      fi
    fi
    if [ -d "$root/.deploy" ] && [ ! -L "$root/.deploy" ]; then
      rmdir "$root/.deploy" 2>/dev/null || true
    else
      rm -f "$root/.deploy"
    fi
  fi
  mkdir -p "$root/.deploy"
  if ln -s "$external/backups" "$root/backups" 2>/dev/null && [ -L "$root/backups" ]; then
    if validate_prune_managed_paths >/dev/null 2>&1; then
      fail "image cleanup accepted a symlinked backups parent directory"
    fi
  fi
)

test_explicit_managed_backup_discard_contract() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root external
  root="$(mktemp -d)"
  external="$(mktemp -d)"
  trap 'rm -rf "$root" "$external"' EXIT
  APP_DIR="$root"
  mkdir -p "$root/.deploy" "$root/backups/git-deploy/old-a" \
    "$root/backups/git-deploy/old-b" "$external/must-survive"
  init_or_adopt_repo() { cd "$APP_DIR"; }
  acquire_lock() { :; }
  log() { :; }
  err() { fail "$*"; }

  if manual_discard_managed_backups >/dev/null 2>&1; then
    fail "managed backups were discarded without explicit confirmation"
  fi
  [ -d "$root/backups/git-deploy/old-a" ] || \
    fail "unconfirmed managed backup discard changed the backup root"

  if command -v ln >/dev/null 2>&1 && \
    ln -s "$external/must-survive" "$root/backups/git-deploy/unsafe-link" 2>/dev/null && \
    [ -L "$root/backups/git-deploy/unsafe-link" ]; then
    if CONFIRM_DISCARD_MANAGED_BACKUPS=YES manual_discard_managed_backups >/dev/null 2>&1; then
      fail "managed backup discard accepted a symbolic-link entry"
    fi
    [ -d "$external/must-survive" ] || \
      fail "managed backup discard followed a symbolic link outside the managed root"
    rm -f "$root/backups/git-deploy/unsafe-link"
  fi

  mkdir -p "$root/backups/git-deploy/old-a" "$root/backups/git-deploy/old-b"
  CONFIRM_DISCARD_MANAGED_BACKUPS=YES manual_discard_managed_backups
  [ -d "$root/backups/git-deploy" ] || fail "managed backup root itself was removed"
  [ -z "$(find "$root/backups/git-deploy" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
    fail "explicit managed backup discard left an old backup behind"
)

test_prune_backup_metadata_contracts() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root backup revision backend_image frontend_image case_dir artifact
  root="$(mktemp -d)"
  trap 'rm -rf "$root"' EXIT
  mkdir -p "$root/backups"
  APP_DIR="$root"
  PRUNE_PROTECTED_IMAGES_FILE="$root/protected-images"
  PRUNE_INVENTORY_SCRATCH_FILE="$root/inventory"
  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  : > "$PRUNE_INVENTORY_SCRATCH_FILE"
  revision="$(printf 'a%.0s' {1..40})"
  backend_image="sha256:$(printf '3%.0s' {1..64})"
  frontend_image="sha256:$(printf '4%.0s' {1..64})"
  image_identity() {
    case "$1" in
      delivery-platform-backend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' "$backend_image"
        ;;
      delivery-platform-frontend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' "$frontend_image"
        ;;
      *) return 1 ;;
    esac
  }
  docker() {
    if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
      fail "backup metadata validation attempted to delete an image"
    fi
    fail "unexpected Docker call while validating malformed backup metadata: $*"
  }

  if command -v ln >/dev/null 2>&1; then
    if ln -s missing-backup-root "$root/backups/git-deploy" 2>/dev/null; then
      if [ -L "$root/backups/git-deploy" ]; then
        if protect_backup_images_for_prune >/dev/null 2>&1; then
          fail "image cleanup accepted a dangling managed backup root"
        fi
      fi
      if [ -d "$root/backups/git-deploy" ] && [ ! -L "$root/backups/git-deploy" ]; then
        rmdir "$root/backups/git-deploy" 2>/dev/null || true
      else
        rm -f "$root/backups/git-deploy"
      fi
    fi
  fi

  backup="$root/backups/git-deploy/format-two"
  create_complete_format_three_backup_fixture "$backup"
  printf '2\n' > "$backup/backup-format-version"
  write_backup_checksums "$backup"
  if protect_backup_images_for_prune >/dev/null 2>&1; then
    fail "image cleanup accepted a checksummed legacy backup format"
  fi
  rm -rf "$root/backups/git-deploy"

  for artifact in backup-format-version git-revision.txt runtime-topology.services retained-images.tsv; do
    case_dir="$root/checksum-$artifact"
    create_complete_format_three_backup_fixture "$case_dir"
    printf '%s\n' "$revision" > "$case_dir/git-revision.txt"
    printf 'backend\nfrontend\n' > "$case_dir/runtime-topology.services"
    printf 'backend\tdelivery-platform-backend:aaaaaaaaaaaa\t%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' \
      "$backend_image" > "$case_dir/retained-images.tsv"
    printf 'frontend\tdelivery-platform-frontend:aaaaaaaaaaaa\t%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' \
      "$frontend_image" >> "$case_dir/retained-images.tsv"
    write_backup_checksums "$case_dir"
    printf 'tampered' >> "$case_dir/$artifact"
    if verify_backup_prune_metadata_checksums "$case_dir" >/dev/null 2>&1; then
      fail "image cleanup accepted tampered checksummed metadata: $artifact"
    fi
  done

  backup="$root/retained-contract"
  mkdir -p "$backup"
  printf '%s\n' "$revision" > "$backup/git-revision.txt"
  printf 'backend\nfrontend\n' > "$backup/runtime-topology.services"
  printf 'backend\tdelivery-platform-backend:aaaaaaaaaaaa\t%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' \
    "$backend_image" > "$backup/retained-images.tsv"
  printf 'backend\tdelivery-platform-backend:aaaaaaaaaaaa\t%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' \
    "$backend_image" >> "$backup/retained-images.tsv"
  printf 'frontend\tdelivery-platform-frontend:aaaaaaaaaaaa\t%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' \
    "$frontend_image" >> "$backup/retained-images.tsv"
  if validate_retained_runtime_images "$backup" >/dev/null 2>&1; then
    fail "image cleanup accepted a duplicate retained image row"
  fi

  printf 'backend\tdelivery-platform-backend:aaaaaaaaaaaa\t%s\tdelivery-platform-backend\taaaaaaaaaaaa\textra\n' \
    "$backend_image" > "$backup/retained-images.tsv"
  printf 'frontend\tdelivery-platform-frontend:aaaaaaaaaaaa\t%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' \
    "$frontend_image" >> "$backup/retained-images.tsv"
  if validate_retained_runtime_images "$backup" >/dev/null 2>&1; then
    fail "image cleanup accepted an over-wide retained image row"
  fi

  printf 'backend\tdelivery-platform-backend:aaaaaaaaaaaa\t%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' \
    "$backend_image" > "$backup/retained-images.tsv"
  printf 'frontend\tdelivery-platform-frontend:aaaaaaaaaaaa\t%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' \
    "$frontend_image" >> "$backup/retained-images.tsv"
  printf 'malformed-eof-row' >> "$backup/retained-images.tsv"
  if validate_retained_runtime_images "$backup" >/dev/null 2>&1; then
    fail "image cleanup ignored a malformed retained image row without a trailing newline"
  fi
)

test_prune_legacy_and_incomplete_backup_protection_contracts() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root backup incomplete revision before after exact_mode
  local exact_backend exact_frontend older_backend unrelated_image
  root="$(mktemp -d)"
  trap 'rm -rf "$root"' EXIT
  backup="$root/backups/git-deploy/legacy"
  incomplete="$root/backups/git-deploy/incomplete-v3"
  revision="$(printf 'a%.0s' {1..40})"
  exact_backend="sha256:$(printf '1%.0s' {1..64})"
  exact_frontend="sha256:$(printf '2%.0s' {1..64})"
  older_backend="sha256:$(printf '3%.0s' {1..64})"
  unrelated_image="sha256:$(printf '4%.0s' {1..64})"
  create_legacy_backup_fixture "$backup" "$revision"
  APP_DIR="$root"
  mkdir -p "$root/.deploy"
  PRUNE_PROTECTED_IMAGES_FILE="$root/protected-images"
  PRUNE_INVENTORY_SCRATCH_FILE="$root/inventory"
  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  : > "$PRUNE_INVENTORY_SCRATCH_FILE"
  exact_mode="YES"

  git() {
    if [ "$1" = "cat-file" ] && [ "$2" = "-e" ]; then
      return 0
    fi
    fail "unexpected Git call while protecting a legacy backup: $*"
  }
  docker() {
    if [ "$1" = "image" ] && [ "$2" = "ls" ]; then
      printf '%s\n' "$exact_backend" "$exact_frontend" "$older_backend" "$unrelated_image"
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
      case "$3" in
        "$exact_backend")
          if [ "$exact_mode" = "YES" ]; then
            printf '%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' "$exact_backend"
          else
            printf '%s\tdelivery-platform-backend\tbbbbbbbbbbbb\n' "$exact_backend"
          fi
          ;;
        "$exact_frontend")
          if [ "$exact_mode" = "YES" ]; then
            printf '%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' "$exact_frontend"
          else
            printf '%s\tdelivery-platform-frontend\tbbbbbbbbbbbb\n' "$exact_frontend"
          fi
          ;;
        "$older_backend")
          printf '%s\tdelivery-platform-backend\tcccccccccccc\n' "$older_backend"
          ;;
        "$unrelated_image")
          printf '%s\tthird-party-image\t1.0.0\n' "$unrelated_image"
          ;;
        *) return 1 ;;
      esac
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
      fail "legacy backup validation attempted to delete an image"
    fi
    fail "unexpected Docker call while protecting a legacy backup: $*"
  }

  before="$(backup_tree_digest "$backup")"
  protect_backup_images_for_prune || fail "known legacy backup was not accepted as a read-only archive"
  grep -Fxq "$exact_backend" "$PRUNE_PROTECTED_IMAGES_FILE" || fail "legacy backend image was not protected"
  grep -Fxq "$exact_frontend" "$PRUNE_PROTECTED_IMAGES_FILE" || fail "legacy frontend image was not protected"
  if grep -Fxq "$older_backend" "$PRUNE_PROTECTED_IMAGES_FILE"; then
    fail "exact legacy image binding unnecessarily protected every historical backend image"
  fi
  if grep -Fxq "$unrelated_image" "$PRUNE_PROTECTED_IMAGES_FILE"; then
    fail "legacy image binding protected an unrelated image"
  fi
  after="$(backup_tree_digest "$backup")"
  [ "$before" = "$after" ] || fail "legacy backup bytes changed during image protection"

  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  exact_mode="NO"
  protect_backup_images_for_prune || fail "legacy backup fallback protection failed"
  for image in "$exact_backend" "$exact_frontend" "$older_backend"; do
    grep -Fxq "$image" "$PRUNE_PROTECTED_IMAGES_FILE" || \
      fail "legacy fallback did not protect every Delivery Platform image"
  done
  if grep -Fxq "$unrelated_image" "$PRUNE_PROTECTED_IMAGES_FILE"; then
    fail "legacy fallback protected an unrelated image"
  fi

  mkdir -p "$incomplete"
  printf 'partial archive\n' > "$incomplete/minio.tar.gz.part"
  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  protect_backup_images_for_prune || fail "markerless incomplete backup blocked conservative image cleanup"
  for image in "$exact_backend" "$exact_frontend" "$older_backend"; do
    grep -Fxq "$image" "$PRUNE_PROTECTED_IMAGES_FILE" || \
      fail "incomplete backup did not conservatively protect every Delivery Platform image"
  done

  rm -rf "$incomplete"
  printf 'broken gzip\n' > "$backup/mysql.sql.gz"
  if protect_backup_images_for_prune >/dev/null 2>&1; then
    fail "image cleanup accepted a corrupt legacy database archive"
  fi

  create_legacy_backup_fixture "$backup" "$revision"
  printf 'broken tar\n' > "$backup/minio.tar.gz"
  if protect_backup_images_for_prune >/dev/null 2>&1; then
    fail "image cleanup accepted a corrupt legacy MinIO archive"
  fi

  create_legacy_backup_fixture "$backup" invalid-revision
  if protect_backup_images_for_prune >/dev/null 2>&1; then
    fail "image cleanup accepted an invalid legacy revision"
  fi

  if command -v ln >/dev/null 2>&1; then
    create_legacy_backup_fixture "$backup" "$revision"
    rm -f "$backup/env.snapshot"
    if ln -s outside "$backup/env.snapshot" 2>/dev/null && [ -L "$backup/env.snapshot" ]; then
      if protect_backup_images_for_prune >/dev/null 2>&1; then
        fail "image cleanup accepted a symbolic link in a legacy backup"
      fi
    fi
  fi
)

test_prune_removes_only_unreferenced_unprotected_images() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root calls deleted backup
  local container_image backup_image unused_image current_backend current_frontend previous_backend previous_frontend
  local current_revision previous_revision
  root="$(mktemp -d)"
  calls="$root/calls"
  deleted="$root/deleted"
  backup="$root/backups/git-deploy/verified"
  trap 'rm -rf "$root"' EXIT
  mkdir -p "$root/.deploy" "$root/backups/git-deploy"
  : > "$calls"
  : > "$deleted"

  container_image="sha256:$(printf '1%.0s' {1..64})"
  backup_image="sha256:$(printf '2%.0s' {1..64})"
  unused_image="sha256:$(printf '3%.0s' {1..64})"
  current_backend="sha256:$(printf '4%.0s' {1..64})"
  current_frontend="sha256:$(printf '5%.0s' {1..64})"
  previous_backend="sha256:$(printf '6%.0s' {1..64})"
  previous_frontend="sha256:$(printf '7%.0s' {1..64})"
  current_revision="$(printf 'a%.0s' {1..40})"
  previous_revision="$(printf 'b%.0s' {1..40})"
  printf '%s\n' "$current_revision" > "$root/.deploy/last_successful_rev"
  printf '%s\n' "$previous_revision" > "$root/.deploy/previous_successful_rev"

  APP_DIR="$root"
  mkdir -p "$backup"
  printf '3\n' > "$backup/backup-format-version"
  printf 'backend\tdelivery-platform-backend:aaaaaaaaaaaa\t%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' \
    "$backup_image" > "$backup/retained-images.tsv"

  init_or_adopt_repo() { cd "$APP_DIR"; }
  validate_prune_managed_paths() { :; }
  acquire_lock() { :; }
  detect_compose() { :; }
  require_command() { :; }
  chmod() { :; }
  source_env() { :; }
  compose() { :; }
  load_app_topology() {
    WORKER_SERVICES=(file-worker outbox-worker)
    APPLICATION_SERVICES=(backend file-worker outbox-worker frontend)
  }
  verify_backup_prune_metadata_checksums() { :; }
  validate_retained_runtime_images() { :; }
  check_url() { :; }
  check_service_stable() { :; }
  verify_release_version() { :; }
  verify_service_release() { :; }
  log() { :; }
  err() { fail "$*"; }
  image_identity() {
    case "$1" in
      delivery-platform-backend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' "$current_backend"
        ;;
      delivery-platform-frontend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' "$current_frontend"
        ;;
      delivery-platform-backend:bbbbbbbbbbbb)
        printf '%s\tdelivery-platform-backend\tbbbbbbbbbbbb\n' "$previous_backend"
        ;;
      delivery-platform-frontend:bbbbbbbbbbbb)
        printf '%s\tdelivery-platform-frontend\tbbbbbbbbbbbb\n' "$previous_frontend"
        ;;
      *) return 1 ;;
    esac
  }
  docker() {
    if [ "$1" = "system" ] && [ "$2" = "df" ]; then
      printf 'disk-usage\n'
      return 0
    fi
    if [ "$1" = "ps" ]; then
      printf 'container-a\n'
      return 0
    fi
    if [ "$1" = "inspect" ] && [ "$2" = "container-a" ]; then
      printf '%s\n' "$container_image"
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "ls" ]; then
      printf '%s\n' "$container_image" "$backup_image"
      [ -s "$deleted" ] || printf '%s\n' "$unused_image"
      printf '%s\n' "$current_backend" "$current_frontend" "$previous_backend" "$previous_frontend"
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
      if [ "$3" = "$unused_image" ] && [ -s "$deleted" ]; then
        return 1
      fi
      if [ "${4:-}" = "--format" ] && [ "$3" = "$unused_image" ]; then
        printf 'temporary-unused:test\n'
      fi
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
      printf 'image-rm %s\n' "$3" >> "$calls"
      [ "$3" = "$unused_image" ] || return 1
      printf 'deleted\n' > "$deleted"
      return 0
    fi
    fail "unexpected docker call: $*"
  }

  manual_prune_unused_images
  [ "$(cat "$calls")" = "image-rm $unused_image" ] || \
    fail "cleanup removed a protected image or did not remove the sole unused image"

  : > "$calls"
  : > "$deleted"
  detect_compose() { fail "pre-deployment cleanup required target Compose detection"; }
  source_env() { fail "pre-deployment cleanup loaded the target environment"; }
  compose() { fail "pre-deployment cleanup required target Compose configuration"; }
  load_app_topology() { fail "pre-deployment cleanup required the target worker topology"; }
  check_url() { fail "pre-deployment cleanup required a target health endpoint"; }
  check_service_stable() { fail "pre-deployment cleanup required target workers"; }
  verify_release_version() { fail "pre-deployment cleanup required target frontend metadata"; }
  verify_service_release() { fail "pre-deployment cleanup required target service metadata"; }
  manual_prune_unused_images predeploy
  [ "$(cat "$calls")" = "image-rm $unused_image" ] || \
    fail "pre-deployment cleanup removed a protected image or did not remove the sole unused image"
)

test_prune_protects_container_reference_and_build_images() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root container_image missing_container_image node_image buildkit_image unused_image
  root="$(mktemp -d)"
  trap 'rm -rf "$root"' EXIT
  PRUNE_PROTECTED_IMAGES_FILE="$root/protected"
  PRUNE_CANDIDATE_IMAGES_FILE="$root/candidates"
  PRUNE_INVENTORY_SCRATCH_FILE="$root/inventory"
  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  container_image="sha256:$(printf '8%.0s' {1..64})"
  missing_container_image="sha256:$(printf 'c%.0s' {1..64})"
  node_image="sha256:$(printf '9%.0s' {1..64})"
  buildkit_image="sha256:$(printf 'a%.0s' {1..64})"
  unused_image="sha256:$(printf 'b%.0s' {1..64})"
  printf '%s\n' "$container_image" "$node_image" "$buildkit_image" "$unused_image" > \
    "$PRUNE_CANDIDATE_IMAGES_FILE"
  docker() {
    if [ "$1" = "ps" ]; then
      printf 'mysql-container\nmissing-container\n'
      return 0
    fi
    if [ "$1" = "inspect" ] && [ "$2" = "mysql-container" ]; then
      if [[ "$*" == *'.Config.Image'* ]]; then
        printf 'mysql:8.0\n'
      else
        printf '%s\n' "$container_image"
      fi
      return 0
    fi
    if [ "$1" = "inspect" ] && [ "$2" = "missing-container" ]; then
      if [[ "$*" == *'.Config.Image'* ]]; then
        printf 'missing-runtime:test\n'
      else
        printf '%s\n' "$missing_container_image"
      fi
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ] && [ "$3" = "mysql:8.0" ]; then
      printf '%s\n' "$container_image"
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ] && \
       { [ "$3" = "$missing_container_image" ] || [ "$3" = "missing-runtime:test" ]; }; then
      return 1
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ] && [ "${4:-}" = "--format" ]; then
      case "$3" in
        "$node_image") printf 'node:20-bookworm-slim\n' ;;
        "$buildkit_image") printf 'docker/dockerfile:1.7\n' ;;
      esac
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ] && [ "$3" = "$container_image" ]; then
      return 0
    fi
    fail "unexpected Docker call while classifying protected images: $*"
  }

  log() { :; }
  protect_container_images_for_prune
  protect_builder_base_images_for_prune
  grep -Fxq "$container_image" "$PRUNE_PROTECTED_IMAGES_FILE" || \
    fail "container image reference was not protected"
  grep -Fxq "$node_image" "$PRUNE_PROTECTED_IMAGES_FILE" || \
    fail "Node build/base image was not protected"
  grep -Fxq "$buildkit_image" "$PRUNE_PROTECTED_IMAGES_FILE" || \
    fail "BuildKit frontend image was not protected"
  if grep -Fxq "$unused_image" "$PRUNE_PROTECTED_IMAGES_FILE"; then
    fail "unknown unused image was incorrectly protected"
  fi
  if grep -Fxq "$missing_container_image" "$PRUNE_PROTECTED_IMAGES_FILE"; then
    fail "a baseline-missing container image was added to the verifiable protected inventory"
  fi
)

test_prune_classifies_known_docker_removal_races() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root missing_image container_image orphan_image
  root="$(mktemp -d)"
  trap 'rm -rf "$root"' EXIT
  PRUNE_PROTECTED_IMAGES_FILE="$root/protected"
  : > "$PRUNE_PROTECTED_IMAGES_FILE"
  missing_image="sha256:$(printf 'c%.0s' {1..64})"
  container_image="sha256:$(printf 'd%.0s' {1..64})"
  orphan_image="sha256:$(printf 'e%.0s' {1..64})"
  warn() { :; }
  docker() {
    if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
      case "$3" in
        "$missing_image")
          printf 'Error response from daemon: No such image: %s\n' "$missing_image" >&2
          return 1
          ;;
        "$container_image")
          printf 'conflict: image is being used by running container abc\n' >&2
          return 1
          ;;
        "$orphan_image")
          printf 'unexpected storage driver failure\n' >&2
          return 1
          ;;
      esac
    fi
    fail "unexpected Docker call while classifying image removal: $*"
  }

  remove_unprotected_image_without_force "$missing_image" || \
    fail "No-such-image cleanup race was treated as fatal"
  remove_unprotected_image_without_force "$container_image" || \
    fail "container-reference cleanup conflict was treated as fatal"
  grep -Fxq "$container_image" "$PRUNE_PROTECTED_IMAGES_FILE" || \
    fail "container-conflicted image was not dynamically protected"
  if remove_unprotected_image_without_force "$orphan_image"; then
    fail "unknown orphan image removal failure was ignored"
  fi
)

test_prune_removes_arbitrarily_deep_unprotected_image_chain() (
  # shellcheck source=../deploy-git.sh
  source "$ROOT_DIR/deploy-git.sh"
  local root deleted calls revision parent_image middle_image child_image current_backend current_frontend
  root="$(mktemp -d)"
  deleted="$root/deleted"
  calls="$root/calls"
  trap 'rm -rf "$root"' EXIT
  mkdir -p "$root/.deploy"
  : > "$deleted"
  : > "$calls"
  APP_DIR="$root"
  revision="$(printf 'a%.0s' {1..40})"
  printf '%s\n' "$revision" > "$root/.deploy/last_successful_rev"
  parent_image="sha256:$(printf '1%.0s' {1..64})"
  middle_image="sha256:$(printf '2%.0s' {1..64})"
  child_image="sha256:$(printf '3%.0s' {1..64})"
  current_backend="sha256:$(printf '4%.0s' {1..64})"
  current_frontend="sha256:$(printf '5%.0s' {1..64})"

  init_or_adopt_repo() { cd "$APP_DIR"; }
  validate_prune_managed_paths() { :; }
  acquire_lock() { :; }
  detect_compose() { :; }
  require_command() { :; }
  source_env() { :; }
  compose() { :; }
  load_app_topology() {
    WORKER_SERVICES=(file-worker outbox-worker)
    APPLICATION_SERVICES=(backend file-worker outbox-worker frontend)
  }
  check_url() { :; }
  check_service_stable() { :; }
  verify_release_version() { :; }
  verify_service_release() { :; }
  log() { :; }
  err() { fail "$*"; }
  image_identity() {
    case "$1" in
      delivery-platform-backend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-backend\taaaaaaaaaaaa\n' "$current_backend"
        ;;
      delivery-platform-frontend:aaaaaaaaaaaa)
        printf '%s\tdelivery-platform-frontend\taaaaaaaaaaaa\n' "$current_frontend"
        ;;
      *) return 1 ;;
    esac
  }
  image_deleted() { grep -Fxq "$1" "$deleted"; }
  mark_image_deleted() { printf '%s\n' "$1" >> "$deleted"; }
  docker() {
    if [ "$1" = "system" ] && [ "$2" = "df" ]; then
      return 0
    fi
    if [ "$1" = "ps" ]; then
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "ls" ]; then
      for id in "$parent_image" "$middle_image" "$child_image" "$current_backend" "$current_frontend"; do
        image_deleted "$id" || printf '%s\n' "$id"
      done
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
      image_deleted "$3" && return 1
      if [ "${4:-}" = "--format" ]; then
        case "$3" in
          "$parent_image") printf 'chain-parent:test\n' ;;
          "$middle_image") printf 'chain-middle:test\n' ;;
          "$child_image") printf 'chain-child:test\n' ;;
          *) return 0 ;;
        esac
      fi
      return 0
    fi
    if [ "$1" = "image" ] && [ "$2" = "rm" ]; then
      printf 'image-rm %s\n' "$3" >> "$calls"
      case "$3" in
        "$parent_image")
          image_deleted "$middle_image" || return 1
          mark_image_deleted "$parent_image"
          ;;
        "$middle_image")
          image_deleted "$child_image" || return 1
          mark_image_deleted "$middle_image"
          ;;
        "$child_image")
          mark_image_deleted "$child_image"
          ;;
        *) return 1 ;;
      esac
      return 0
    fi
    fail "unexpected docker call: $*"
  }

  manual_prune_unused_images
  for id in "$parent_image" "$middle_image" "$child_image"; do
    image_deleted "$id" || fail "deep unused image chain was not fully removed"
  done
  if image_deleted "$current_backend"; then
    fail "cleanup removed the protected backend image"
  fi
  if image_deleted "$current_frontend"; then
    fail "cleanup removed the protected frontend image"
  fi
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

test_dockerfiles_do_not_require_external_syntax_frontend
test_workflow_remote_argument_contract
test_debian_build_mirror_contract
test_release_images_build_serially
test_switch_order
test_legacy_rollback_switch
test_forward_switch_requires_complete_workers
test_quiesce_and_resume_order
test_release_label_gate
test_integration_secret_key_gate
test_prepared_key_survives_env_reload
test_inherited_key_cannot_mask_missing_env_assignment
test_dotenv_loader_treats_shell_syntax_as_data
test_dotenv_loader_rejects_invalid_and_duplicate_keys_transactionally
test_previous_env_reader_never_executes_backup_content
test_environment_cannot_override_deployment_state
test_env_backup_run_ownership
test_environment_upload_is_installed_inside_owned_transaction
test_git_bundle_is_imported_after_target_binding
test_exact_table_count_gate
test_foreign_key_orphan_gate
test_backup_source_revision_and_key_binding
test_revision_compose_resolves_relative_backup_environment
test_backup_publication_is_directory_atomic_and_failure_closed
test_runtime_revision_follows_exact_database_migrations
test_restore_candidate_uses_complete_backup_environment
test_restore_runtime_never_builds_source_images
test_restore_rejects_legacy_backup_format
test_retained_image_manifest_binds_exact_image_ids
test_format_three_requires_minio
test_minio_backup_is_atomic_and_health_gated
test_backup_rotation_deletes_only_verified_unprotected_backups
test_storage_diagnostics_include_capacity_and_minio_volume
test_ciphertext_restore_uses_strict_verify
test_start_infra_returns_failure
test_start_infra_preserves_prepared_integration_key
test_deploy_quiesces_before_persisting_integration_key
test_persist_failure_after_quiesce_recovers_runtime
test_manual_backup_quiesces_before_persisting_integration_key
test_manual_rollback_quiesces_before_persisting_integration_key
test_pre_mutation_failure_recovers_infrastructure
test_exit_before_source_switch_preserves_worktree
test_database_mutation_state_and_restore_gate
test_code_only_rollback_requires_exact_database_manifest
test_incomplete_restore_marker_blocks_ordinary_deploy
test_deploy_checks_incomplete_restore_before_source_import
test_restore_stops_minio_before_database_mutation
test_restore_pointer_cannot_reference_backup_staging
test_manual_restore_preflight_failure_restarts_infrastructure
test_unexpected_exit_respects_database_mutation_boundary
test_run_migrations_marks_mutation_before_compose
test_post_migration_audit_never_mutates_published_backup
test_success_revision_commits_before_env_cleanup
test_workflow_runs_protected_image_cleanup_after_deploy
test_workflow_diagnoses_backend_migration_failure
test_workflow_resolves_one_immutable_commit_for_all_jobs
test_image_identity_uses_real_tab_template
test_image_identity_allows_missing_labels
test_docker_disk_usage_timeout_contract
test_prune_missing_current_pointer_fails_before_image_delete
test_prune_release_pointer_and_symlink_contracts
test_prune_rejects_symlinked_managed_parent_directories
test_explicit_managed_backup_discard_contract
test_prune_backup_metadata_contracts
test_prune_legacy_and_incomplete_backup_protection_contracts
test_prune_removes_only_unreferenced_unprotected_images
test_prune_protects_container_reference_and_build_images
test_prune_classifies_known_docker_removal_races
test_prune_removes_arbitrarily_deep_unprotected_image_chain
test_failure_rollback_order
printf 'deploy-git contract tests passed\n'
