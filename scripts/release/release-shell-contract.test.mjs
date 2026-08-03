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
const deployExistingWorkflow = await readFile(
  new URL('../../.github/workflows/deploy-existing-release.yml', import.meta.url),
  'utf8',
)
const runtimeBootstrap = await readFile(
  new URL('./bootstrap-runtime-config.sh', import.meta.url),
  'utf8',
)
const runtimeBootstrapWorkflow = await readFile(
  new URL('../../.github/workflows/bootstrap-runtime-config.yml', import.meta.url),
  'utf8',
)
const nginxAppSnippet = await readFile(
  new URL('../../deploy/nginx/delivery-platform-app.inc.template', import.meta.url),
  'utf8',
)
const nginxIpBootstrap = await readFile(
  new URL('../../deploy/nginx/delivery-platform-ip-acme-bootstrap.conf.template', import.meta.url),
  'utf8',
)
const nginxIpHttps = await readFile(
  new URL('../../deploy/nginx/delivery-platform-ip.conf.template', import.meta.url),
  'utf8',
)
const certbotTimer = await readFile(
  new URL('../../deploy/systemd/delivery-platform-certbot-renew.timer', import.meta.url),
  'utf8',
)
const certbotService = await readFile(
  new URL('../../deploy/systemd/delivery-platform-certbot-renew.service.template', import.meta.url),
  'utf8',
)
const nginxControl = await readFile(
  new URL('../../deploy/nginx/dmp-nginx-control.template', import.meta.url),
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

test('deployment uses one root-owned Nginx adapter across systemd and panel installations', () => {
  for (const script of [deploy, restore, serverPreflight]) {
    assert.match(script, /NGINX_CONTROL='\/usr\/local\/sbin\/dmp-nginx-control'/u)
    assert.doesNotMatch(script, /sudo -n systemctl reload nginx/u)
  }
  assert.match(deploy, /sudo -n "\$NGINX_CONTROL" check/u)
  assert.match(deploy, /sudo -n "\$NGINX_CONTROL" reload/u)
  assert.match(restore, /sudo -n "\$NGINX_CONTROL" reload/u)
  assert.match(serverPreflight, /require_mode_owner "\$NGINX_CONTROL" 755 'root:root'/u)
  assert.match(nginxControl, /"\$NGINX_BINARY" -t -c "\$NGINX_CONFIG"/u)
  assert.match(nginxControl, /"\$NGINX_BINARY" -s reload -c "\$NGINX_CONFIG"/u)
  assert.doesNotMatch(nginxControl, /systemctl/u)
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
    'sudo -n "$NGINX_CONTROL" check',
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

test('runtime bootstrap preserves live credentials without reading or printing legacy dotenv files', () => {
  for (const contract of [
    'this one-time bootstrap must run as $DEPLOY_OWNER',
    'docker inspect',
    'MYSQL_ROOT_PASSWORD',
    '--requirepass',
    'INTEGRATION_SECRET_ENCRYPTION_KEY',
    'runtime.env already exists; refusing to overwrite it',
    'No secret values were printed; legacy containers were not modified.',
  ]) {
    assert.match(
      runtimeBootstrap,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
  assert.doesNotMatch(runtimeBootstrap, /(?:source|cat|cp)[^\n]*\.env/u)
  assert.doesNotMatch(runtimeBootstrap, /docker\s+(?:stop|restart|rm|compose\s+(?:up|down))/u)
})

test('runtime bootstrap workflow is manual, environment-bound and removes its remote script', () => {
  for (const contract of [
    'workflow_dispatch:',
    'environment: ${{ inputs.environment_name }}',
    'SERVER_USER must be dmpdeploy',
    '从旧容器安全生成运行配置',
    'if: ${{ always() }}',
    'rm -f -- "$stage/bootstrap-runtime-config.sh"',
  ]) {
    assert.match(
      runtimeBootstrapWorkflow,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
})

test('an already-built release can be deployed and attested without rebuilding it', () => {
  for (const contract of [
    'workflow_dispatch:',
    "if: ${{ vars.RELEASE_V2_ENABLED == 'true' }}",
    'release-manifest.mjs verify',
    'uses: ./.github/workflows/reusable-deploy-release.yml',
    'environment_name: test',
    'tested-release:sha-$RELEASE_SHA',
  ]) {
    assert.match(
      deployExistingWorkflow,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
  assert.doesNotMatch(deployExistingWorkflow, /docker\/(?:build-push-action|setup-buildx-action)/u)
  assert.doesNotMatch(deployExistingWorkflow, /docker\s+build/u)
})

test('no-domain Nginx entry keeps ACME on HTTP and serves the application over IP HTTPS', () => {
  for (const contract of [
    'listen 80;',
    'location ^~ /.well-known/acme-challenge/',
    'return 308 https://__PUBLIC_IP__$request_uri;',
    'listen 443 ssl;',
    '/etc/letsencrypt/live/__PUBLIC_IP__/fullchain.pem',
    'include /etc/nginx/snippets/delivery-platform-app.inc;',
    'listen 127.0.0.1:8081;',
  ]) {
    assert.match(
      nginxIpHttps,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
  assert.match(nginxIpBootstrap, /return 404;/u)
  assert.doesNotMatch(nginxIpBootstrap, /proxy_pass/u)
  assert.match(nginxAppSnippet, /client_max_body_size 501m;/u)
  assert.match(nginxAppSnippet, /proxy_request_buffering off;/u)
  assert.match(nginxAppSnippet, /proxy_pass http:\/\/127\.0\.0\.1:__BACKEND_PORT__;/u)
})

test('short-lived IP certificate renewal is checked at least twice daily', () => {
  assert.match(certbotTimer, /OnUnitActiveSec=12h/u)
  assert.match(certbotTimer, /Persistent=true/u)
  assert.match(certbotService, /renew --quiet --deploy-hook/u)
  assert.match(certbotService, /dmp-nginx-control reload/u)
  assert.doesNotMatch(certbotService, /ExecStartPost/u)
})
