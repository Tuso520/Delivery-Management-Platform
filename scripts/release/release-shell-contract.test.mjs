import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const deploy = await readFile(new URL('./deploy-release.sh', import.meta.url), 'utf8')
const restore = await readFile(new URL('./restore-release.sh', import.meta.url), 'utf8')
const dataCompose = await readFile(new URL('../../deploy/compose/data.yml', import.meta.url), 'utf8')
const deployWorkflow = await readFile(
  new URL('../../.github/workflows/reusable-deploy-release.yml', import.meta.url),
  'utf8',
)
const serverPreflight = await readFile(new URL('./server-preflight.sh', import.meta.url), 'utf8')
const preflightWorkflow = await readFile(
  new URL('../../.github/workflows/server-preflight.yml', import.meta.url),
  'utf8',
)

function occursInOrder(source, values) {
  let cursor = -1
  for (const value of values) {
    const next = source.indexOf(value, cursor + 1)
    assert.notEqual(next, -1, `missing deployment contract: ${value}`)
    assert.ok(next > cursor, `deployment contract is out of order: ${value}`)
    cursor = next
  }
}

test('deployment quiesces, backs up, migrates, starts and switches in that order', () => {
  const body = deploy.slice(deploy.indexOf('deploy_release()'))
  occursInOrder(body, [
    'stop_application',
    'create_backup',
    'run_migrations',
    'start_application',
    'switch_frontend',
    'check_origin internal',
    'check_origin public',
    'publish_state',
  ])
})

test('deployment binds release identity and checksummed paired backups', () => {
  for (const contract of [
    'DEPLOY_TARGET_ID',
    "runtime env file permissions must be 0600",
    '@sha256:',
    'frontend bundle checksum mismatch',
    'mysql.sql.gz',
    'minio.tar.gz',
    'source-release-manifest.json',
    'source-release.env',
    'checksums.sha256',
  ]) {
    assert.match(deploy, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  }
})

test('frontend releases are readable by host Nginx without exposing private state', () => {
  for (const contract of [
    'install -d -m 711 "$RELEASES_DIR"',
    'find "$stage/frontend" -type d -exec chmod 0555 {} +',
    'find "$stage/frontend" -type f -exec chmod 0444 {} +',
    'chmod 0511 "$stage"',
  ]) {
    assert.match(deploy, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  }
})

test('paired restore is explicit, path-bound, checksummed and fail-closed', () => {
  for (const contract of [
    "CONFIRM_DATA_RESTORE=RESTORE",
    'direct child of the server backups directory',
    'sha256sum --check --strict',
    'data-restore-incomplete',
    'DROP DATABASE IF EXISTS',
    'minio.tar.gz',
    'FLUSHALL',
    'check_origin internal',
    'check_origin public',
  ]) {
    assert.match(restore, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  }
})

test('restore brings back the matching application only after data and worker checks', () => {
  const body = restore.slice(restore.indexOf('main()'))
  occursInOrder(body, [
    'restore_storage',
    'up -d --no-deps --force-recreate backend',
    'wait_backend_ready',
    'up -d --no-deps --force-recreate file-worker outbox-worker',
    'check_workers_stable',
    'switch_frontend',
    'check_origin internal',
    'check_origin public',
    'publish_state',
  ])
  assert.match(restore, /redis-cli -a "\$REDIS_PASSWORD" FLUSHALL/u)
  assert.match(dataCompose, /environment:\s+REDIS_PASSWORD: \$\{REDIS_PASSWORD:\?REDIS_PASSWORD is required\}/u)
})

test('v2 scripts never delete Docker volumes or globally prune Docker', () => {
  const combined = `${deploy}\n${restore}`
  assert.doesNotMatch(combined, /docker\s+(?:system|volume)\s+prune/u)
  assert.doesNotMatch(combined, /\bdown\s+-v\b/u)
})

test('remote image pulls use a job-scoped GHCR credential and always log out', () => {
  occursInOrder(deployWorkflow, [
    '临时授权目标服务器读取 GHCR',
    'docker login ghcr.io',
    '执行服务器原地切换',
    '清理目标服务器临时 GHCR 凭据',
    'docker logout ghcr.io',
  ])
  assert.match(deployWorkflow, /GHCR_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u)
  assert.match(deployWorkflow, /if: \$\{\{ always\(\) \}\}/u)
})

test('server takeover preflight verifies safety gates without changing runtime state', () => {
  for (const contract of [
    'preflight must run as dmpdeploy',
    'runtime configuration still contains placeholders',
    'server target identity does not match DEPLOY_TARGET_ID',
    'declared existing Docker volume was not found',
    'INTEGRATION_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes',
    'sudo -n nginx -t',
    'check_origin internal',
    'check_origin public',
  ]) {
    assert.match(
      serverPreflight,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
  assert.doesNotMatch(
    serverPreflight,
    /docker compose[^\n]*(?:\bup\b|\bdown\b|\bstart\b|\bstop\b|\brestart\b|\brun\b|\bexec\b)/u,
  )
  assert.doesNotMatch(serverPreflight, /docker\s+volume\s+(?:rm|prune)/u)
})

test('server preflight workflow is manual, environment-bound and cleans temporary credentials', () => {
  for (const contract of [
    'workflow_dispatch:',
    'environment: ${{ inputs.environment_name }}',
    'DEPLOY_TARGET_ID: ${{ vars.DEPLOY_TARGET_ID }}',
    'docker manifest inspect',
    '执行服务器接管预检',
    'if: ${{ always() }}',
    'docker logout ghcr.io',
  ]) {
    assert.match(
      preflightWorkflow,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
})
