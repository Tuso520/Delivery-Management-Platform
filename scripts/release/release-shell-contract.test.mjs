import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const deploy = await readFile(new URL('./deploy-release.sh', import.meta.url), 'utf8')
const restore = await readFile(new URL('./restore-release.sh', import.meta.url), 'utf8')
const dataCompose = await readFile(new URL('../../deploy/compose/data.yml', import.meta.url), 'utf8')
const appCompose = await readFile(new URL('../../deploy/compose/app.yml', import.meta.url), 'utf8')
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
const releaseWorkflow = await readFile(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8',
)
const legacyDeployWorkflow = await readFile(
  new URL('../../.github/workflows/deploy.yml', import.meta.url),
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
const runtimeConfigTemplate = await readFile(
  new URL('../../deploy/runtime-config.template', import.meta.url),
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
const backendDockerfile = await readFile(
  new URL('../../delivery-platform-server/Dockerfile', import.meta.url),
  'utf8',
)
const cleanTestBaseline = await readFile(
  new URL('../../delivery-platform-server/prisma/verify-clean-test-baseline.ts', import.meta.url),
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

test('deployment records pulled runtime and migrator image sizes before downtime', () => {
  const body = deploy.slice(deploy.indexOf('deploy_release()'))
  occursInOrder(body, [
    'pull_application_images',
    'log_image_size backend "$BACKEND_IMAGE"',
    'log_image_size migrator "$MIGRATION_IMAGE"',
    'stop_application',
  ])
  assert.match(deploy, /timeout --foreground 20m/u)
  assert.match(deploy, /immutable image pull failed after 3 attempts/u)
  assert.match(deploy, /PULL_PID="\$!"/u)
  assert.match(deploy, /kill -TERM "\$PULL_PID"/u)
  assert.match(deploy, /trap 'on_signal HUP 129' HUP/u)
  assert.match(deploy, /trap 'on_signal TERM 143' TERM/u)
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

test('disposable test reset is explicit, environment-bound and limited to three resolved volumes', () => {
  for (const contract of [
    'RESET_TEST_DATA="$7"',
    'test "$DEPLOY_ENV" = test',
    'test "${#reset_volumes[@]}" -eq 3',
    '[cleanup-before] exact MySQL table counts',
    '[cleanup-before] redis_keys=',
    '[cleanup-before] minio_files=',
    'down --volumes --remove-orphans',
    'disposable test data volumes removed',
  ]) {
    assert.match(
      deployWorkflow,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
  assert.match(deploy, /prisma\/verify-clean-test-baseline\.ts/u)
  assert.match(deploy, /CONFIRM_CLEAN_TEST_BASELINE=YES/u)
  assert.doesNotMatch(deployWorkflow, /docker\s+volume\s+(?:prune|rm)/u)
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

test('missing immutable images use a checksummed and resumable SSH preload before data reset', () => {
  occursInOrder(deployWorkflow, [
    '检查目标服务器不可变镜像缓存',
    '准备缺失镜像的 SSH 传输包',
    '检查目标服务器可复用镜像内容',
    '创建短期镜像中继制品',
    '上传发布控制文件',
    '通过短期 HTTPS 中继下载缺失镜像',
    '通过 SSH 分片回退上传缺失镜像',
    'case "$PRELOAD_IMAGE_BUNDLE"',
    'checksummed SSH image preload completed',
    'case "$RESET_TEST_DATA"',
  ])
  for (const contract of [
    'docker image tag "$backend_image" "$backend_transfer_tag"',
    'docker image tag "$migration_image" "$migration_transfer_tag"',
    'rootfsSha256: $backendRootfsSha256',
    'rootfsSha256: $migratorRootfsSha256',
    'release/image-bundle.map.json',
    'docker save "$backend_transfer_tag" "$migration_transfer_tag"',
    'gzip -9 > release/application-images.tar.gz',
    'sha256sum release/application-images.tar.gz',
    'split -b 32M -d -a 4',
    "printf 'image bundle: %s bytes, %s parts\\n'",
    'uses: actions/upload-artifact@v4',
    'retention-days: 1',
    'steps.image_relay_artifact.outputs.artifact-id',
    'actions/artifacts/$ARTIFACT_ID/zip',
    "[[ \"$signed_url\" =~ ^https://[A-Za-z0-9.-]+\\.blob\\.core\\.windows\\.net/ ]]",
    "allowed = re.compile(r'image-bundle\\.(?:sha256|bytes|map\\.json|part-[0-9]{4})')",
    "printf 'HTTPS image relay download complete\\n'",
    "steps.image_relay_download.outcome != 'success'",
    "steps.content_image_cache.outputs.reuse != 'true'",
    'find_matching_relay backend "$1"',
    'find_matching_relay migrator "$2"',
    'docker image inspect "$tag" --format \'{{json .RootFS.Layers}}\'',
    "printf 'uploading %s image parts with concurrency 4\\n'",
    '"${image_parts[@]:offset:4}"',
    "printf 'upload complete: %s\\n'",
    'test "$(stat -c \'%s\' "$image_bundle_part")" = "$expected_bytes"',
    'gzip -dc "$image_bundle" | docker load',
    'test "$loaded_backend_rootfs_sha256" = "$backend_rootfs_sha256"',
    'test "$loaded_migration_rootfs_sha256" = "$migration_rootfs_sha256"',
    'timeout --foreground 2m docker pull "$image"',
    'docker image inspect "$image" >/dev/null',
    '-f "$APP_ROOT/control/app.yml" down --remove-orphans </dev/null',
    'down --volumes --remove-orphans </dev/null',
    `'bash -c '\\''script="$(cat)"; exec bash -c "$script" "$@"'\\'' buffer' --`,
    "for attempt in {1..12}; do",
    "test \"$verified\" = true",
    '[[ "$stage" == "/tmp/delivery-release-${release_id}-"* ]]',
    '清理目标服务器临时发布目录',
    '清理 Runner 临时 GHCR 凭据',
  ]) {
    assert.match(
      deployWorkflow,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
  assert.doesNotMatch(deployWorkflow, /docker save "\$backend_id" "\$migration_id"/u)
  assert.doesNotMatch(deployWorkflow, /= "\$expected_id"/u)
  assert.doesNotMatch(deployWorkflow, /imageId/u)
  assert.doesNotMatch(deployWorkflow, /--max-time 3600/u)
  assert.ok((deployWorkflow.match(/--max-time 120/gu) ?? []).length >= 2)
})

test('clean test baseline permits only the two mandatory migration audit records', () => {
  assert.doesNotMatch(cleanTestBaseline, /EMPTY_RUNTIME_TABLES[\s\S]*'operation_logs'/u)
  for (const contract of [
    "['integration_secret_migration', 'IntegrationConfig']",
    "['target_foundation_apply', 'Migration']",
    "migrationAudits.length !== expectedMigrationAudits.size",
    "audit.module !== 'migration'",
    "audit.userId !== users[0].id",
    "audit.result !== 'success'",
    "throw new Error('clean test baseline contains unexpected operation logs')",
  ]) {
    assert.match(
      cleanTestBaseline,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
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

test('migration count belongs to the immutable release instead of long-lived server configuration', () => {
  assert.match(deploy, /\.migrations\.expectedCount/u)
  assert.match(deploy, /printf 'EXPECTED_MIGRATION_COUNT=%s\\n' "\$EXPECTED_MIGRATION_COUNT"/u)
  assert.match(deploy, /printf 'DEPLOY_ENV=%s\\n' "\$DEPLOY_ENV"/u)
  for (const longLivedConfig of [runtimeConfigTemplate, runtimeBootstrap, serverPreflight]) {
    assert.doesNotMatch(longLivedConfig, /EXPECTED_MIGRATION_COUNT/u)
  }
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

test('a manually dispatched release can stop after real integration acceptance', () => {
  for (const contract of [
    'integration_only:',
    '仅构建并执行真实集成验收，不部署测试服务器',
    "github.event_name != 'workflow_dispatch' || inputs.integration_only != true",
  ]) {
    assert.match(
      releaseWorkflow,
      new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    )
  }
})

test('runtime and migrator images share production layers without shipping builder toolchains', () => {
  occursInOrder(backendDockerfile, [
    'FROM ${NODE_IMAGE} AS runtime-base',
    'COPY --chown=node:node --from=runtime-deps /app/node_modules ./node_modules',
    'FROM runtime-base AS runtime',
    'FROM runtime-base AS migrator',
  ])
  assert.doesNotMatch(backendDockerfile, /FROM builder AS migrator/u)
  assert.doesNotMatch(backendDockerfile, /FROM runtime AS migrator/u)
  assert.doesNotMatch(backendDockerfile, /default-mysql-client/u)
  assert.match(
    backendDockerfile,
    /prisma@5\.22\.0 ts-node@10\.9\.2 typescript@5\.5\.4/u,
  )
  assert.match(backendDockerfile, /\/app\/tsconfig\.json \.\/tsconfig\.json/u)
  assert.match(backendDockerfile, /\/app\/src \.\/src/u)
  assert.match(backendDockerfile, /npm cache clean --force/u)
  const builderStage = backendDockerfile.slice(
    backendDockerfile.indexOf('FROM ${NODE_IMAGE} AS builder'),
    backendDockerfile.indexOf('FROM builder AS runtime-deps'),
  )
  assert.doesNotMatch(builderStage, /ARG RELEASE_ID/u)
  assert.doesNotMatch(backendDockerfile, /ARG RELEASE_ID|ENV RELEASE_ID/u)
  assert.doesNotMatch(releaseWorkflow, /build-args:\s*RELEASE_ID/u)
  assert.equal(releaseWorkflow.match(/SOURCE_DATE_EPOCH: "0"/gu)?.length, 2)
  assert.match(releaseWorkflow, /group: release-main/u)
  assert.match(releaseWorkflow, /git ls-tree -r --full-tree/u)
  assert.match(releaseWorkflow, /:content-\$content_sha/u)
  assert.match(releaseWorkflow, /steps\.content\.outputs\.backend_exists != 'true'/u)
  assert.match(releaseWorkflow, /steps\.content\.outputs\.migrator_exists != 'true'/u)
  assert.match(releaseWorkflow, /docker buildx imagetools create/u)
  assert.match(releaseWorkflow, /cache-to: type=gha,mode=max,scope=migrator/u)
  assert.match(releaseWorkflow, /steps\.images\.outputs\.backend_digest/u)
  assert.match(releaseWorkflow, /steps\.images\.outputs\.migrator_digest/u)
  for (const workflow of [releaseWorkflow, legacyDeployWorkflow]) {
    assert.doesNotMatch(workflow, /node_modules\/\.bin\/(?:prisma|ts-node)/u)
  }
  assert.doesNotMatch(appCompose, /pull_policy:\s*always/u)
  assert.equal(appCompose.match(/pull_policy:\s*missing/gu)?.length, 4)
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
