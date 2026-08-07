import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync('.github/workflows/test-runtime-acceptance.yml', 'utf8')
const verifier = readFileSync('scripts/release/verify-test-runtime.sh', 'utf8')

test('runtime acceptance is hard-wired to the test Environment and strict SSH identity', () => {
  assert.match(workflow, /environment: test/u)
  assert.match(workflow, /StrictHostKeyChecking=yes/u)
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/u)
  assert.doesNotMatch(workflow, /environment_name/u)
  assert.doesNotMatch(workflow, /ssh-keyscan/u)
})

test('optional backup path keeps remote positional arguments aligned', () => {
  assert.match(workflow, /feishu_backup_path_arg="\$\{FEISHU_BACKUP_PATH:--\}"/u)
  assert.match(workflow, /printf -v remote_command 'test -f %q && test ! -L %q && exec bash %q/u)
  assert.match(workflow, /"\$feishu_backup_path_arg" \\\n\s+"\$RESTORE_FEISHU_CONFIG" "\$SYNC_FEISHU"/u)
  assert.match(verifier, /if \[ "\$FEISHU_BACKUP_PATH" = '-' \]; then\s+FEISHU_BACKUP_PATH=''\s+fi/u)
})

test('runtime acceptance consumes the rotated administrator secret through standard input', () => {
  assert.match(verifier, /stat -c '%a' "\$RUNTIME_ENV"/u)
  assert.match(verifier, /--env-file "\$RUNTIME_ENV"/u)
  assert.match(workflow, /TEST_ADMIN_PASSWORD: \$\{\{ secrets\.TEST_ADMIN_PASSWORD \}\}/u)
  assert.match(workflow, /printf '%s\\n' "\$TEST_ADMIN_PASSWORD" \| ssh/u)
  assert.match(verifier, /IFS= read -r ADMIN_PASSWORD/u)
  assert.match(verifier, /DMP_TEST_ADMIN_PASSWORD/u)
  assert.doesNotMatch(verifier, /cat .*runtime\.env/u)
  assert.doesNotMatch(verifier, /source .*runtime\.env/u)
  assert.doesNotMatch(verifier, /SEED_ADMIN_PASSWORD/u)
  assert.doesNotMatch(workflow, /echo[^\n]*"\$TEST_ADMIN_PASSWORD"/u)
  assert.doesNotMatch(verifier, /echo .*ADMIN_PASSWORD/u)
  assert.doesNotMatch(verifier, /printf .*ADMIN_PASSWORD/u)
})

test('backup restore is scoped to one encrypted Feishu configuration', () => {
  for (const contract of [
    'backup does not contain one enabled and complete encrypted Feishu configuration',
    'current_config.encrypted_config = backup_config.encrypted_config',
    "WHERE UPPER(current_config.provider) = '\\''FEISHU'\\''",
    "[ \"$restored\" = '1' ]",
    "DROP DATABASE IF EXISTS",
  ]) {
    assert.ok(verifier.includes(contract), `missing backup contract: ${contract}`)
  }
  assert.doesNotMatch(verifier, /INSERT INTO .*users/iu)
  assert.doesNotMatch(verifier, /UPDATE .*users/iu)
})

test('deployed authentication, refresh, permission and Feishu gates are explicit', () => {
  for (const contract of [
    "status: 'TEST_RUNTIME_ACCEPTANCE_PASS'",
    "session.user.roles.includes('SUPER_ADMIN')",
    "session.user.permissions.includes('integration:manage')",
    "if (secondCookie === firstCookie)",
    "if (replay.response.status !== 401)",
    "if (afterLogout.response.status !== 401)",
    "if (feishuSummary.failed !== 0)",
    "diagnostic=${diagnostic}",
    "'/integrations/FEISHU/sync-logs?page=1&pageSize=1&action=CONTACT_SYNC&status=FAILED'",
    "/^[A-Z][A-Z0-9_]{2,199}$/",
    "authorizationUrl.searchParams.get('state')",
    'FEISHU_RUNTIME_COUNTS users=',
  ]) {
    assert.ok(verifier.includes(contract), `missing runtime contract: ${contract}`)
  }
})
