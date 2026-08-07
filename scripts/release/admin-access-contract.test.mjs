import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync('.github/workflows/rotate-test-admin-password.yml', 'utf8')
const rotation = readFileSync('scripts/release/rotate-test-admin-password.sh', 'utf8')

test('administrator recovery is hard-wired to test and a fixed main release', () => {
  assert.match(workflow, /environment: test/u)
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/u)
  assert.match(workflow, /StrictHostKeyChecking=yes/u)
  assert.doesNotMatch(workflow, /environment_name/u)
  assert.doesNotMatch(workflow, /ssh-keyscan/u)
})

test('administrator password crosses SSH only through standard input and is never logged', () => {
  assert.match(workflow, /printf '%s\\n' "\$TEST_ADMIN_PASSWORD" \| ssh/u)
  assert.match(rotation, /IFS= read -r ADMIN_PASSWORD/u)
  assert.doesNotMatch(workflow, /echo .*\$TEST_ADMIN_PASSWORD/u)
  assert.doesNotMatch(rotation, /echo .*ADMIN_PASSWORD/u)
  assert.doesNotMatch(rotation, /printf .*ADMIN_PASSWORD/u)
})

test('rotation revokes existing sessions and verifies the real API permission boundary', () => {
  for (const contract of [
    "permissionVersion: { increment: 1 }",
    "revokeReason: 'PASSWORD_ROTATED'",
    "roles?.includes('SUPER_ADMIN')",
    "permissions?.includes('integration:manage')",
    "status: 'TEST_ADMIN_LOGIN_PASS'",
    'TEST_ADMIN_PASSWORD_ROTATION_PASS',
  ]) {
    assert.ok(rotation.includes(contract), `missing rotation contract: ${contract}`)
  }
})
