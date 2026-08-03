#!/usr/bin/env bash
set -Eeuo pipefail

# One-time test/production takeover helper. It reads the effective settings from
# the running legacy containers and never reads or prints a legacy dotenv file.

APP_ROOT="${APP_ROOT:-/srv/delivery-platform}"
DEPLOY_ENV="${DEPLOY_ENV:-test}"
LEGACY_PROJECT="${LEGACY_PROJECT:-delivery-platform-test}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://1.117.73.165}"
DEPLOY_OWNER="${DEPLOY_OWNER:-dmpdeploy}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-$APP_ROOT/config/runtime.env}"

log() { printf '[bootstrap-runtime-config] %s\n' "$*"; }
die() { printf '[bootstrap-runtime-config][error] %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

container_for_service() {
  local service="$1"
  local containers count
  containers="$(docker ps --filter "label=com.docker.compose.project=$LEGACY_PROJECT" \
    --filter "label=com.docker.compose.service=$service" --format '{{.ID}}')"
  count="$(printf '%s\n' "$containers" | awk 'NF { count += 1 } END { print count + 0 }')"
  [ "$count" = '1' ] || die "expected exactly one running legacy container for service: $service"
  printf '%s' "$containers"
}

container_env_required() {
  local container="$1"
  local key="$2"
  local value
  value="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" | \
    awk -v prefix="$key=" '
      index($0, prefix) == 1 { count += 1; value = substr($0, length(prefix) + 1) }
      END { if (count == 1 && length(value) > 0) print value; else exit 1 }
    ')" || die "legacy container is missing exactly one non-empty setting: $key"
  printf '%s' "$value"
}

container_env_optional() {
  local container="$1"
  local key="$2"
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" | \
    awk -v prefix="$key=" '
      index($0, prefix) == 1 { count += 1; value = substr($0, length(prefix) + 1) }
      END { if (count == 0) exit 0; if (count == 1) print value; else exit 1 }
    ' || die "legacy container contains duplicate setting: $key"
}

volume_for_destination() {
  local container="$1"
  local destination="$2"
  local volume
  volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "'"$destination"'"}}{{println .Name}}{{end}}{{end}}' "$container")"
  [ -n "$volume" ] || die "legacy container has no named volume mounted at $destination"
  [ "$(printf '%s\n' "$volume" | awk 'NF { count += 1 } END { print count + 0 }')" = '1' ] || \
    die "legacy container has multiple named volumes mounted at $destination"
  printf '%s' "$volume"
}

validate_env_value() {
  local key="$1"
  local value="$2"
  local safe_value_pattern='^[A-Za-z0-9_./:@%+,=#?!~^&*-]+$'
  [ -n "$value" ] || die "required setting is empty: $key"
  [[ "$value" =~ $safe_value_pattern ]] || \
    die "$key contains characters that cannot be migrated safely without an explicit review"
}

append_env() {
  local key="$1"
  local value="$2"
  validate_env_value "$key" "$value"
  printf '%s=%s\n' "$key" "$value" >> "$RUNTIME_ENV_PART"
}

append_optional_env() {
  local key="$1"
  local value="$2"
  if [ -n "$value" ]; then
    validate_env_value "$key" "$value"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$RUNTIME_ENV_PART"
}

main() {
  # Never expose values through xtrace, including when the caller enabled it.
  set +x
  [ "$(id -un)" = "$DEPLOY_OWNER" ] || die "this one-time bootstrap must run as $DEPLOY_OWNER"
  case "$DEPLOY_ENV" in test|production) ;; *) die 'DEPLOY_ENV must be test or production' ;; esac
  [[ "$PUBLIC_ORIGIN" =~ ^https://[^/]+/?$ ]] || die 'PUBLIC_ORIGIN must be an HTTPS origin'
  PUBLIC_ORIGIN="${PUBLIC_ORIGIN%/}"

  for command in awk base64 curl docker getent grep id install mktemp mv openssl rm stat tr wc; do
    require_command "$command"
  done
  getent passwd "$DEPLOY_OWNER" >/dev/null || die "deployment account does not exist: $DEPLOY_OWNER"
  [ -d "$APP_ROOT/config" ] && [ ! -L "$APP_ROOT/config" ] || die 'configuration directory is missing or unsafe'
  [ ! -e "$RUNTIME_ENV_FILE" ] || die 'runtime.env already exists; refusing to overwrite it'

  local mysql_container redis_container minio_container backend_container file_worker_container
  mysql_container="$(container_for_service mysql)"
  redis_container="$(container_for_service redis)"
  minio_container="$(container_for_service minio)"
  backend_container="$(container_for_service backend)"
  file_worker_container="$(container_for_service file-worker)"

  local mysql_root_password mysql_database mysql_user mysql_user_password
  local redis_password minio_root_user minio_root_password minio_bucket
  local jwt_secret jwt_expires_in integration_secret_encryption_key
  local mysql_volume redis_volume minio_volume
  mysql_root_password="$(container_env_required "$mysql_container" MYSQL_ROOT_PASSWORD)"
  mysql_database="$(container_env_required "$mysql_container" MYSQL_DATABASE)"
  mysql_user="$(container_env_required "$mysql_container" MYSQL_USER)"
  mysql_user_password="$(container_env_required "$mysql_container" MYSQL_PASSWORD)"
  redis_password="$(container_env_required "$redis_container" REDIS_PASSWORD)"
  minio_root_user="$(container_env_required "$minio_container" MINIO_ROOT_USER)"
  minio_root_password="$(container_env_required "$minio_container" MINIO_ROOT_PASSWORD)"
  minio_bucket="$(container_env_required "$backend_container" MINIO_BUCKET)"
  jwt_secret="$(container_env_required "$backend_container" JWT_SECRET)"
  jwt_expires_in="$(container_env_optional "$backend_container" JWT_EXPIRES_IN)"
  jwt_expires_in="${jwt_expires_in:-8h}"
  integration_secret_encryption_key="$(container_env_required "$backend_container" INTEGRATION_SECRET_ENCRYPTION_KEY)"
  mysql_volume="$(volume_for_destination "$mysql_container" /var/lib/mysql)"
  redis_volume="$(volume_for_destination "$redis_container" /data)"
  minio_volume="$(volume_for_destination "$minio_container" /data)"

  local encryption_key_bytes
  encryption_key_bytes="$(printf '%s' "$integration_secret_encryption_key" | base64 --decode 2>/dev/null | wc -c | tr -d '[:space:]')" || \
    die 'legacy integration encryption key is not valid Base64'
  [ "$encryption_key_bytes" = '32' ] || die 'legacy integration encryption key must decode to exactly 32 bytes'

  # Verify that the preserved credentials still authenticate before writing.
  docker exec -e MYSQL_PWD="$mysql_root_password" "$mysql_container" \
    mysqladmin ping --protocol=tcp -h 127.0.0.1 -uroot --silent >/dev/null || die 'legacy MySQL credential check failed'
  docker exec -e REDISCLI_AUTH="$redis_password" "$redis_container" redis-cli ping | grep -qx PONG || \
    die 'legacy Redis credential check failed'
  docker exec "$minio_container" curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null || \
    die 'legacy MinIO health check failed'
  curl -fsS --connect-timeout 5 --max-time 20 http://127.0.0.1:3000/api/v1/ready >/dev/null || \
    die 'legacy backend readiness check failed'

  local onlyoffice_docs_url onlyoffice_jwt_secret file_converter_url file_converter_token
  local file_converter_timeout file_converter_max_output file_processing_max_attempts
  local file_processing_lease file_processing_retry_base file_processing_retry_max
  onlyoffice_docs_url="$(container_env_optional "$backend_container" ONLYOFFICE_DOCS_URL)"
  onlyoffice_jwt_secret="$(container_env_optional "$backend_container" ONLYOFFICE_JWT_SECRET)"
  file_converter_url="$(container_env_optional "$file_worker_container" FILE_CONVERTER_URL)"
  file_converter_token="$(container_env_optional "$file_worker_container" FILE_CONVERTER_TOKEN)"
  file_converter_timeout="$(container_env_optional "$file_worker_container" FILE_CONVERTER_TIMEOUT_MS)"
  file_converter_max_output="$(container_env_optional "$file_worker_container" FILE_CONVERTER_MAX_OUTPUT_BYTES)"
  file_processing_max_attempts="$(container_env_optional "$file_worker_container" FILE_PROCESSING_MAX_ATTEMPTS)"
  file_processing_lease="$(container_env_optional "$file_worker_container" FILE_PROCESSING_LEASE_MS)"
  file_processing_retry_base="$(container_env_optional "$file_worker_container" FILE_PROCESSING_RETRY_BASE_MS)"
  file_processing_retry_max="$(container_env_optional "$file_worker_container" FILE_PROCESSING_RETRY_MAX_MS)"

  umask 077
  RUNTIME_ENV_PART="$(mktemp "$APP_ROOT/config/.runtime.env.XXXXXX")"
  trap 'rm -f -- "${RUNTIME_ENV_PART:-}"' EXIT
  append_env DATA_PROJECT_NAME "delivery-platform-${DEPLOY_ENV}-data"
  append_env APP_PROJECT_NAME "delivery-platform-${DEPLOY_ENV}-app"
  append_env DATA_NETWORK_NAME "delivery-platform-${DEPLOY_ENV}-data"
  append_env MYSQL_VOLUME_NAME "$mysql_volume"
  append_env REDIS_VOLUME_NAME "$redis_volume"
  append_env MINIO_VOLUME_NAME "$minio_volume"
  append_env MYSQL_IMAGE 'mysql:8.0'
  append_env MYSQL_DATABASE "$mysql_database"
  append_env MYSQL_USER "$mysql_user"
  append_env MYSQL_ROOT_PASSWORD "$mysql_root_password"
  append_env MYSQL_USER_PASSWORD "$mysql_user_password"
  append_env MYSQL_HOST_PORT '3306'
  append_env REDIS_IMAGE 'redis:7-alpine'
  append_env REDIS_PASSWORD "$redis_password"
  append_env REDIS_HOST_PORT '6379'
  append_env MINIO_IMAGE 'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z'
  append_env MINIO_MC_IMAGE 'quay.io/minio/mc:RELEASE.2025-07-21T05-28-08Z'
  append_env MINIO_ROOT_USER "$minio_root_user"
  append_env MINIO_ROOT_PASSWORD "$minio_root_password"
  append_env MINIO_BUCKET "$minio_bucket"
  append_env MINIO_API_HOST_PORT '9000'
  append_env MINIO_CONSOLE_HOST_PORT '9001'
  append_env BACKEND_HOST_PORT '3000'
  append_env CORS_ORIGIN "$PUBLIC_ORIGIN"
  append_env JWT_SECRET "$jwt_secret"
  append_env JWT_EXPIRES_IN "$jwt_expires_in"
  append_env INTEGRATION_SECRET_ENCRYPTION_KEY "$integration_secret_encryption_key"
  append_env EXPECTED_MIGRATION_COUNT '45'
  append_env INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME 'admin'
  append_env SEED_RESET_EXISTING_USER_PASSWORDS 'false'
  append_env SEED_ADMIN_PASSWORD "$(openssl rand -hex 32)"
  append_env SEED_DEFAULT_PASSWORD "$(openssl rand -hex 32)"
  append_optional_env ONLYOFFICE_DOCS_URL "$onlyoffice_docs_url"
  append_optional_env ONLYOFFICE_JWT_SECRET "$onlyoffice_jwt_secret"
  append_optional_env FILE_CONVERTER_URL "$file_converter_url"
  append_optional_env FILE_CONVERTER_TOKEN "$file_converter_token"
  append_env FILE_CONVERTER_TIMEOUT_MS "${file_converter_timeout:-120000}"
  append_env FILE_CONVERTER_MAX_OUTPUT_BYTES "${file_converter_max_output:-524288000}"
  append_env FILE_PROCESSING_MAX_ATTEMPTS "${file_processing_max_attempts:-3}"
  append_env FILE_PROCESSING_LEASE_MS "${file_processing_lease:-300000}"
  append_env FILE_PROCESSING_RETRY_BASE_MS "${file_processing_retry_base:-5000}"
  append_env FILE_PROCESSING_RETRY_MAX_MS "${file_processing_retry_max:-900000}"

  install -m 0600 "$RUNTIME_ENV_PART" "$RUNTIME_ENV_FILE.part"
  mv -f -- "$RUNTIME_ENV_FILE.part" "$RUNTIME_ENV_FILE"
  rm -f -- "$RUNTIME_ENV_PART"
  trap - EXIT
  [ "$(stat -c '%a %U:%G' "$RUNTIME_ENV_FILE")" = "600 $DEPLOY_OWNER:$(id -gn)" ] || \
    die 'runtime configuration ownership verification failed'
  log "PASS runtime configuration created at $RUNTIME_ENV_FILE"
  log 'No secret values were printed; legacy containers were not modified.'
}

main "$@"
