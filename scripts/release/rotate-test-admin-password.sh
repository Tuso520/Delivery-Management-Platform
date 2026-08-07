#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${1:-}"
DEPLOY_TARGET_ID="${2:-}"
EXPECTED_RELEASE_ID="${3:-}"
PUBLIC_ORIGIN="${4:-}"

log() { printf '[admin-access] %s\n' "$*"; }
die() { printf '[admin-access][error] %s\n' "$*" >&2; exit 1; }

[[ "$EXPECTED_RELEASE_ID" =~ ^[0-9a-f]{40}$ ]] || die 'expected release must be a full lowercase commit SHA'
[[ "$DEPLOY_TARGET_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$ ]] || die 'invalid deploy target identity'
[[ "$PUBLIC_ORIGIN" =~ ^https:// ]] || die 'public origin must use HTTPS'
[ -d "$APP_ROOT" ] && [ ! -L "$APP_ROOT" ] || die 'unsafe application root'
APP_ROOT="$(realpath -e -- "$APP_ROOT")"

RUNTIME_ENV="$APP_ROOT/config/runtime.env"
APP_COMPOSE="$APP_ROOT/control/app.yml"
CURRENT_RELEASE_ENV="$APP_ROOT/state/current-release.env"
CURRENT_MANIFEST="$APP_ROOT/state/current-release-manifest.json"
TARGET_ID_FILE="$APP_ROOT/state/target-id"

for file in "$RUNTIME_ENV" "$APP_COMPOSE" "$CURRENT_RELEASE_ENV" "$CURRENT_MANIFEST" "$TARGET_ID_FILE"; do
  [ -f "$file" ] && [ ! -L "$file" ] || die "required control file is missing or unsafe: $file"
done
[ "$(stat -c '%a' "$RUNTIME_ENV")" = '600' ] || die 'runtime env permissions must be 0600'
[ "$(tr -d '\r\n' < "$TARGET_ID_FILE")" = "$DEPLOY_TARGET_ID" ] || die 'deploy target identity mismatch'
[ "$(jq -er '.releaseId' "$CURRENT_MANIFEST")" = "$EXPECTED_RELEASE_ID" ] || die 'deployed manifest release mismatch'

IFS= read -r ADMIN_PASSWORD || die 'administrator password was not provided on standard input'
[ "${#ADMIN_PASSWORD}" -ge 20 ] && [ "${#ADMIN_PASSWORD}" -le 72 ] || \
  die 'administrator password length must be between 20 and 72 characters'
[[ "$ADMIN_PASSWORD" =~ ^[A-Za-z0-9._~!@%+=:-]+$ ]] || \
  die 'administrator password contains unsupported characters'

app_compose() {
  docker compose --env-file "$RUNTIME_ENV" --env-file "$CURRENT_RELEASE_ENV" -f "$APP_COMPOSE" "$@"
}

app_compose run --rm --no-deps -T \
  -e DMP_NEW_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  --entrypoint node backend-migrate - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const password = process.env.DMP_NEW_ADMIN_PASSWORD;
if (!password) throw new Error('administrator password is unavailable inside the maintenance container');

try {
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      userRoles: { select: { role: { select: { roleCode: true } } } },
    },
  });
  if (!admin || admin.deletedAt || admin.status !== 'Active') {
    throw new Error('the unique administrator account is not active');
  }
  if (!admin.userRoles.some(({ role }) => role.roleCode === 'SUPER_ADMIN')) {
    throw new Error('the administrator account is missing SUPER_ADMIN');
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: admin.id },
      data: { password: passwordHash, permissionVersion: { increment: 1 } },
    });
    return tx.refreshSession.updateMany({
      where: { userId: admin.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'PASSWORD_ROTATED' },
    });
  });
  console.log(JSON.stringify({ status: 'ADMIN_PASSWORD_UPDATED', revokedSessions: result.count }));
} finally {
  await prisma.$disconnect();
}
NODE

app_compose run --rm --no-deps -T \
  -e DMP_NEW_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e DMP_PUBLIC_ORIGIN="$PUBLIC_ORIGIN" \
  --entrypoint node backend-migrate - <<'NODE'
const origin = process.env.DMP_PUBLIC_ORIGIN;
const password = process.env.DMP_NEW_ADMIN_PASSWORD;

const login = await fetch(`${origin}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-device-id': 'admin-password-rotation' },
  body: JSON.stringify({ username: 'admin', password }),
});
const body = await login.json().catch(() => null);
if (login.status !== 200 || body?.code !== 0) throw new Error(`administrator login returned HTTP ${login.status}`);
if (body.data?.user?.username !== 'admin') throw new Error('administrator login returned the wrong account');
if (!body.data?.user?.roles?.includes('SUPER_ADMIN')) throw new Error('administrator login is missing SUPER_ADMIN');
if (!body.data?.user?.permissions?.includes('integration:manage')) {
  throw new Error('administrator login is missing integration:manage');
}
if (!body.data?.accessToken) throw new Error('administrator login did not return an access token');

const logout = await fetch(`${origin}/api/v1/auth/logout-all`, {
  method: 'POST',
  headers: { authorization: `Bearer ${body.data.accessToken}` },
});
if (logout.status !== 200) throw new Error(`administrator logout-all returned HTTP ${logout.status}`);
console.log(JSON.stringify({
  status: 'TEST_ADMIN_LOGIN_PASS',
  username: body.data.user.username,
  role: 'SUPER_ADMIN',
  permission: 'integration:manage',
}));
NODE

unset ADMIN_PASSWORD
log 'TEST_ADMIN_PASSWORD_ROTATION_PASS'
