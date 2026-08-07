#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${1:-}"
DEPLOY_TARGET_ID="${2:-}"
EXPECTED_RELEASE_ID="${3:-}"
INTERNAL_ORIGIN="${4:-}"
PUBLIC_ORIGIN="${5:-}"
FEISHU_BACKUP_PATH="${6:-}"
RESTORE_FEISHU_CONFIG="${7:-false}"
SYNC_FEISHU="${8:-false}"

if [ "$FEISHU_BACKUP_PATH" = '-' ]; then
  FEISHU_BACKUP_PATH=''
fi

log() { printf '[test-acceptance] %s\n' "$*"; }
die() { printf '[test-acceptance][error] %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

case "$RESTORE_FEISHU_CONFIG" in true|false) ;; *) die 'restore_feishu_config must be true or false' ;; esac
case "$SYNC_FEISHU" in true|false) ;; *) die 'sync_feishu must be true or false' ;; esac
IFS= read -r ADMIN_PASSWORD || die 'administrator password was not provided on standard input'
[ "${#ADMIN_PASSWORD}" -ge 20 ] && [ "${#ADMIN_PASSWORD}" -le 72 ] || \
  die 'administrator password length must be between 20 and 72 characters'
[[ "$ADMIN_PASSWORD" =~ ^[A-Za-z0-9._~!@%+=:-]+$ ]] || \
  die 'administrator password contains unsupported characters'
[[ "$EXPECTED_RELEASE_ID" =~ ^[0-9a-f]{40}$ ]] || die 'expected release must be a full lowercase commit SHA'
[[ "$DEPLOY_TARGET_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$ ]] || die 'invalid deploy target identity'
[[ "$INTERNAL_ORIGIN" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] || die 'internal origin must use loopback HTTP'
[[ "$PUBLIC_ORIGIN" =~ ^https:// ]] || die 'public origin must use HTTPS'
[ -d "$APP_ROOT" ] && [ ! -L "$APP_ROOT" ] || die 'unsafe application root'
APP_ROOT="$(realpath -e -- "$APP_ROOT")"

RUNTIME_ENV="$APP_ROOT/config/runtime.env"
APP_COMPOSE="$APP_ROOT/control/app.yml"
DATA_COMPOSE="$APP_ROOT/control/data.yml"
CURRENT_RELEASE_ENV="$APP_ROOT/state/current-release.env"
CURRENT_MANIFEST="$APP_ROOT/state/current-release-manifest.json"
TARGET_ID_FILE="$APP_ROOT/state/target-id"

for file in "$RUNTIME_ENV" "$APP_COMPOSE" "$DATA_COMPOSE" "$CURRENT_RELEASE_ENV" "$CURRENT_MANIFEST" "$TARGET_ID_FILE"; do
  [ -f "$file" ] && [ ! -L "$file" ] || die "required control file is missing or unsafe: $file"
done
[ "$(stat -c '%a' "$RUNTIME_ENV")" = '600' ] || die 'runtime env permissions must be 0600'
[ "$(tr -d '\r\n' < "$TARGET_ID_FILE")" = "$DEPLOY_TARGET_ID" ] || die 'deploy target identity mismatch'
[ "$(jq -er '.releaseId' "$CURRENT_MANIFEST")" = "$EXPECTED_RELEASE_ID" ] || die 'deployed manifest release mismatch'

require_command curl
require_command docker
require_command gzip
require_command jq
require_command realpath

data_compose() {
  docker compose --env-file "$RUNTIME_ENV" -f "$DATA_COMPOSE" "$@"
}

app_compose() {
  docker compose --env-file "$RUNTIME_ENV" --env-file "$CURRENT_RELEASE_ENV" -f "$APP_COMPOSE" "$@"
}

verify_origin() {
  local origin="$1" release ready
  release="$(curl -fsS --connect-timeout 5 --max-time 20 -H 'Cache-Control: no-cache' \
    "${origin%/}/build-info.json" | jq -er '.releaseId')"
  [ "$release" = "${EXPECTED_RELEASE_ID:0:12}" ] || die "release mismatch at $origin"
  ready="$(curl -fsS --connect-timeout 5 --max-time 20 \
    "${origin%/}/api/v1/ready")"
  [ "$(jq -er '.data.status' <<< "$ready")" = 'ready' ] || die "readiness failed at $origin"
  for check in database redis storage; do
    [ "$(jq -er --arg check "$check" '.data.checks[$check]' <<< "$ready")" = 'ok' ] || \
      die "$check readiness failed at $origin"
  done
  jq -er '.traceId | strings | select(length > 0)' <<< "$ready" >/dev/null
}

verify_origin "$INTERNAL_ORIGIN"
verify_origin "$PUBLIC_ORIGIN"
log 'internal and public release/readiness checks passed'

for service in mysql redis minio; do
  container_id="$(data_compose ps -q "$service")"
  [ -n "$container_id" ] || die "data service is missing: $service"
  [ "$(docker inspect "$container_id" --format '{{.State.Status}}')" = 'running' ] || die "$service is not running"
  [ "$(docker inspect "$container_id" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')" = 'healthy' ] || \
    die "$service is not healthy"
done
for service in backend file-worker outbox-worker; do
  container_id="$(app_compose ps -q "$service")"
  [ -n "$container_id" ] || die "application service is missing: $service"
  [ "$(docker inspect "$container_id" --format '{{.State.Status}}')" = 'running' ] || die "$service is not running"
done
log 'application and data containers are running'

probe_database=''
drop_probe_database() {
  if [ -n "$probe_database" ]; then
    data_compose exec -T mysql sh -ec '
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      mysql -uroot -e "DROP DATABASE IF EXISTS \`$1\`"
    ' sh "$probe_database" >/dev/null 2>&1 || true
  fi
}
trap drop_probe_database EXIT

if [ "$RESTORE_FEISHU_CONFIG" = 'true' ]; then
  [ -n "$FEISHU_BACKUP_PATH" ] || die 'a backup path is required to restore Feishu configuration'
  [ -d "$FEISHU_BACKUP_PATH" ] && [ ! -L "$FEISHU_BACKUP_PATH" ] || die 'Feishu backup directory is unsafe'
  FEISHU_BACKUP_PATH="$(realpath -e -- "$FEISHU_BACKUP_PATH")"
  case "$FEISHU_BACKUP_PATH" in
    "$APP_ROOT"/backups/20[0-9][0-9][0-1][0-9][0-3][0-9]T[0-2][0-9][0-5][0-9][0-5][0-9]Z-[0-9a-f][0-9a-f]*) ;;
    *) die 'Feishu backup path is outside the project backup namespace' ;;
  esac
  [[ "$(basename -- "$FEISHU_BACKUP_PATH")" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{40}$ ]] || \
    die 'Feishu backup directory name is invalid'
  backup_sql="$FEISHU_BACKUP_PATH/mysql.sql.gz"
  [ -f "$backup_sql" ] && [ ! -L "$backup_sql" ] || die 'backup MySQL archive is missing or unsafe'
  gzip -t "$backup_sql"

  probe_database="dmp_acceptance_$$"
  [[ "$probe_database" =~ ^[A-Za-z0-9_]+$ ]] || die 'unsafe probe database name'
  data_compose exec -T mysql sh -ec '
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    mysql -uroot -e "CREATE DATABASE \`$1\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  ' sh "$probe_database"
  gzip -dc "$backup_sql" | data_compose exec -T mysql sh -ec '
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    exec mysql -uroot "$1"
  ' sh "$probe_database"

  backup_metadata="$(data_compose exec -T mysql sh -ec '
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    mysql -N -uroot "$1" -e "
      SELECT CONCAT(
        IF(is_enabled = 1, '\''1'\'', '\''0'\''), '\''|'\'',
        IF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(config_value, '\''$.appId'\'')), '\'''\'') IS NOT NULL, '\''1'\'', '\''0'\''), '\''|'\'',
        IF(encrypted_config IS NOT NULL AND encrypted_config <> '\'''\'', '\''1'\'', '\''0'\''), '\''|'\'',
        IF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(config_value, '\''$.oauthRedirectUri'\'')), '\'''\'') IS NOT NULL, '\''1'\'', '\''0'\'')
      )
      FROM integration_configs
      WHERE UPPER(provider) = '\''FEISHU'\'';
    "
  ' sh "$probe_database")"
  [ "$backup_metadata" = '1|1|1|1' ] || die 'backup does not contain one enabled and complete encrypted Feishu configuration'
  log 'backup contains one enabled and complete encrypted Feishu configuration'

  restored="$(data_compose exec -T mysql sh -ec '
    set -eu
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    case "$MYSQL_DATABASE" in *[!A-Za-z0-9_]*) exit 1 ;; esac
    case "$1" in *[!A-Za-z0-9_]*) exit 1 ;; esac
    mysql -N -uroot -e "
      UPDATE \`$MYSQL_DATABASE\`.integration_configs AS current_config
      JOIN \`$1\`.integration_configs AS backup_config
        ON UPPER(backup_config.provider) = '\''FEISHU'\''
      SET current_config.config_name = backup_config.config_name,
          current_config.config_value = backup_config.config_value,
          current_config.encrypted_config = backup_config.encrypted_config,
          current_config.is_enabled = backup_config.is_enabled,
          current_config.description = backup_config.description,
          current_config.contact_sync_lease_owner = NULL,
          current_config.contact_sync_lease_expires_at = NULL,
          current_config.last_contact_sync_at = NULL,
          current_config.updated_at = CURRENT_TIMESTAMP(3)
      WHERE UPPER(current_config.provider) = '\''FEISHU'\'';
      SELECT ROW_COUNT();
    "
  ' sh "$probe_database")"
  [ "$restored" = '1' ] || die 'expected exactly one current Feishu configuration to be restored'
  drop_probe_database
  probe_database=''
  log 'restored only the encrypted Feishu platform configuration from backup'
fi

app_compose run --rm --no-deps -T \
  -e SYNC_FEISHU="$SYNC_FEISHU" \
  -e DMP_TEST_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  --entrypoint node backend-migrate - <<'NODE'
const baseUrl = 'http://backend:3000/api/v1';
const password = process.env.DMP_TEST_ADMIN_PASSWORD;
const syncFeishu = process.env.SYNC_FEISHU === 'true';

function fail(message) {
  throw new Error(message);
}

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

function requireEnvelope(result, status, label) {
  if (result.response.status !== status) fail(`${label}: HTTP ${result.response.status}`);
  if (!result.body || result.body.code !== 0 || typeof result.body.traceId !== 'string') {
    fail(`${label}: invalid API envelope`);
  }
  return result.body.data;
}

function refreshCookie(response, label) {
  const raw = response.headers.get('set-cookie') || '';
  if (!raw.includes('delivery_refresh_token=')) fail(`${label}: refresh cookie missing`);
  for (const contract of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/v1/auth']) {
    if (!raw.includes(contract)) fail(`${label}: cookie contract missing ${contract}`);
  }
  return raw.split(';', 1)[0];
}

if (!password) fail('administrator password is unavailable inside the migration verifier container');

const login = await jsonRequest('/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-device-id': 'deployment-acceptance' },
  body: JSON.stringify({ username: 'admin', password }),
});
const session = requireEnvelope(login, 200, 'admin login');
if (session.user?.username !== 'admin') fail('admin login returned the wrong user');
if (!Array.isArray(session.user?.roles) || !session.user.roles.includes('SUPER_ADMIN')) {
  fail('admin is missing SUPER_ADMIN');
}
if (!Array.isArray(session.user?.permissions) || !session.user.permissions.includes('integration:manage')) {
  fail('admin is missing integration:manage');
}
if (typeof session.accessToken !== 'string' || session.accessToken.length < 20) fail('access token missing');
const firstCookie = refreshCookie(login.response, 'admin login');

const profile = await jsonRequest('/auth/profile', {
  headers: { authorization: `Bearer ${session.accessToken}` },
});
requireEnvelope(profile, 200, 'authenticated profile');

const integration = await jsonRequest('/integrations/FEISHU', {
  headers: { authorization: `Bearer ${session.accessToken}` },
});
const integrationData = requireEnvelope(integration, 200, 'integration permission');

const refreshed = await jsonRequest('/auth/refresh', {
  method: 'POST',
  headers: { cookie: firstCookie, 'x-device-id': 'deployment-acceptance' },
});
const refreshedSession = requireEnvelope(refreshed, 200, 'refresh rotation');
const secondCookie = refreshCookie(refreshed.response, 'refresh rotation');
if (secondCookie === firstCookie) fail('refresh cookie was not rotated');
if (refreshedSession.accessToken === session.accessToken) fail('access token was not rotated');

const replay = await jsonRequest('/auth/refresh', { method: 'POST', headers: { cookie: firstCookie } });
if (replay.response.status !== 401) fail(`old refresh cookie replay returned ${replay.response.status}`);

let feishuSummary = null;
if (syncFeishu) {
  if (!integrationData?.isEnabled) fail('Feishu integration is not enabled');
  const connection = await jsonRequest('/integrations/FEISHU/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshedSession.accessToken}` },
  });
  requireEnvelope(connection, 201, 'Feishu connection');
  const sync = await jsonRequest('/integrations/FEISHU/sync-contacts', {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshedSession.accessToken}` },
  });
  feishuSummary = requireEnvelope(sync, 201, 'Feishu contact sync');
  for (const field of ['total', 'added', 'updated', 'disabled', 'skipped', 'failed', 'departments']) {
    if (!Number.isInteger(feishuSummary?.[field]) || feishuSummary[field] < 0) {
      fail(`Feishu sync returned invalid ${field}`);
    }
  }
  if (feishuSummary.failed !== 0) fail('Feishu contact sync reported failures');
  if (feishuSummary.total < 1 || feishuSummary.departments < 1) fail('Feishu directory is empty');

  const oauth = await jsonRequest('/auth/feishu/start?redirect=%2Fdashboard');
  const oauthData = requireEnvelope(oauth, 200, 'Feishu OAuth start');
  const authorizationUrl = new URL(oauthData.authorizationUrl);
  if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'open.feishu.cn') {
    fail('Feishu authorization URL is not an official HTTPS endpoint');
  }
  if (!authorizationUrl.searchParams.get('state')) fail('Feishu authorization state is missing');
}

const logout = await jsonRequest('/auth/logout', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${refreshedSession.accessToken}`,
    cookie: secondCookie,
  },
});
requireEnvelope(logout, 200, 'logout');
const afterLogout = await jsonRequest('/auth/refresh', { method: 'POST', headers: { cookie: secondCookie } });
if (afterLogout.response.status !== 401) fail(`logged-out refresh cookie returned ${afterLogout.response.status}`);

console.log(JSON.stringify({
  status: 'TEST_RUNTIME_ACCEPTANCE_PASS',
  admin: 'admin',
  adminRole: 'SUPER_ADMIN',
  permission: 'integration:manage',
  refreshRotation: 'PASS',
  refreshReplayRejected: 'PASS',
  logoutRevocation: 'PASS',
  feishuEnabled: Boolean(integrationData?.isEnabled),
  feishuSync: feishuSummary,
}));
NODE

unset ADMIN_PASSWORD

if [ "$SYNC_FEISHU" = 'true' ]; then
  data_compose exec -T mysql sh -ec '
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    mysql -N -uroot "$MYSQL_DATABASE" -e "
      SELECT CONCAT(
        '\''FEISHU_RUNTIME_COUNTS users='\'', (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL),
        '\'' identities='\'', (SELECT COUNT(*) FROM external_identities WHERE source = '\''FEISHU'\'' AND deactivated_at IS NULL),
        '\'' memberships='\'', (SELECT COUNT(*) FROM user_department_memberships WHERE source = '\''FEISHU'\'' AND revoked_at IS NULL),
        '\'' admin_super_roles='\'', (
          SELECT COUNT(*) FROM user_roles ur
          JOIN users u ON u.id = ur.user_id
          JOIN roles r ON r.id = ur.role_id
          WHERE u.username = '\''admin'\'' AND r.role_code = '\''SUPER_ADMIN'\''
        )
      );
    "
  '
fi

log 'TEST_RUNTIME_ACCEPTANCE_PASS'
