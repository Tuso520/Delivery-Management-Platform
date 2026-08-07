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

test('runtime acceptance never prints or reads runtime secrets directly', () => {
  assert.match(verifier, /stat -c '%a' "\$RUNTIME_ENV"/u)
  assert.match(verifier, /--env-file "\$RUNTIME_ENV"/u)
  assert.doesNotMatch(verifier, /cat .*runtime\.env/u)
  assert.doesNotMatch(verifier, /source .*runtime\.env/u)
  assert.doesNotMatch(verifier, /printf .*SEED_ADMIN_PASSWORD/u)
  assert.doesNotMatch(verifier, /echo .*SEED_ADMIN_PASSWORD/u)
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
    "authorizationUrl.searchParams.get('state')",
    'FEISHU_RUNTIME_COUNTS users=',
  ]) {
    assert.ok(verifier.includes(contract), `missing runtime contract: ${contract}`)
  }
})
