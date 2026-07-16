import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sourceFiles(directory, extensions) {
  return walk(join(root, directory)).filter((path) => extensions.includes(extname(path)));
}

function countMatches(files, pattern) {
  return files.reduce((count, path) => count + (readFileSync(path, 'utf8').match(pattern) ?? []).length, 0);
}

function expectText(file, expected, description) {
  const content = readFileSync(join(root, file), 'utf8');
  if (!content.includes(expected)) failures.push(`${file}: ${description}; expected "${expected}"`);
}

function repositoryFiles() {
  try {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return walk(root)
      .map((path) => relative(root, path).replaceAll('\\', '/'))
      .filter((path) => !/(^|\/)(node_modules|dist|coverage|\.git)(\/|$)/.test(path));
  }
}

const repoFiles = repositoryFiles();
const webFiles = sourceFiles('delivery-platform-web/src', ['.ts', '.vue']);
const serverFiles = sourceFiles('delivery-platform-server/src', ['.ts']);
const controllerFiles = serverFiles.filter((path) => path.endsWith('.controller.ts'));
const normalized = (path) => relative(root, path).replaceAll('\\', '/');
const facts = {
  repository: repoFiles.length,
  web: webFiles.length,
  views: webFiles.filter((path) => normalized(path).includes('/src/views/') && path.endsWith('.vue')).length,
  webApi: webFiles.filter(
    (path) =>
      normalized(path).includes('/src/api/') &&
      path.endsWith('.ts') &&
      !normalized(path).includes('/__tests__/') &&
      !/\.(spec|test)\.ts$/.test(path),
  ).length,
  webTests: webFiles.filter((path) => /\.(spec|test)\.ts$/.test(path)).length,
  server: serverFiles.length,
  controllers: controllerFiles.length,
  services: serverFiles.filter((path) => path.endsWith('.service.ts')).length,
  modules: serverFiles.filter((path) => path.endsWith('.module.ts')).length,
  routes: countMatches(controllerFiles, /@(Get|Post|Put|Patch|Delete)\s*\(/g),
  migrations: readdirSync(join(root, 'delivery-platform-server/prisma/migrations'), { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  ).length,
  permissions: new Set(
    [...readFileSync(join(root, 'delivery-platform-server/prisma/seed-data/permissions.ts'), 'utf8').matchAll(/permissionCode:\s*'([^']+)'/g)].map(
      (match) => match[1],
    ),
  ).size,
};

expectText('docs/testing.md', `当前仓库扫描范围为 ${facts.repository} 个受版本控制或待纳入版本控制的文件`, '仓库文件数与实际不一致');
expectText(
  'docs/testing.md',
  `前端 ${facts.web} 个 TypeScript/Vue 文件、${facts.views} 个 \`views/\` Vue 文件、${facts.webApi} 个运行时 API 文件和 ${facts.webTests} 个测试文件`,
  '前端事实与实际不一致',
);
expectText(
  'docs/testing.md',
  `后端 ${facts.server} 个 TypeScript 文件、${facts.controllers} 个 Controller、${facts.services} 个 Service、${facts.modules} 个 Module、${facts.routes} 个 HTTP 路由和 ${facts.migrations} 个 Prisma migration`,
  '后端事实与实际不一致',
);
expectText('docs/product.md', `${facts.routes} 个 HTTP 路由和 ${facts.permissions} 个权限码`, '权限规划基线与实际不一致');
expectText('docker-compose.yml', `EXPECTED_MIGRATION_COUNT=\${EXPECTED_MIGRATION_COUNT:-${facts.migrations}}`, '生产迁移数量门禁与源码不一致');
expectText('docker-compose.test.yml', `EXPECTED_MIGRATION_COUNT: \${EXPECTED_MIGRATION_COUNT:-${facts.migrations}}`, '测试迁移数量门禁与源码不一致');
expectText('.github/workflows/deploy.yml', `EXPECTED_MIGRATION_COUNT: "${facts.migrations}"`, 'CI 迁移数量门禁与源码不一致');
expectText(
  'docs/architecture.md',
  '{ code, message, data, timestamp, traceId }',
  'API response envelope must include traceId',
);

const markdownFiles = repoFiles.filter((path) => path.endsWith('.md'));
for (const file of markdownFiles) {
  const content = readFileSync(join(root, file), 'utf8');
  for (const match of content.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (!raw || /^(https?:|mailto:|#|data:)/i.test(raw)) continue;
    const target = decodeURIComponent(raw.split('#')[0]);
    if (target && !existsSync(resolve(dirname(join(root, file)), target))) {
      failures.push(`${file}: broken relative link ${raw}`);
    }
  }
}

const dependencyDoc = readFileSync(join(root, 'docs/open-source-dependencies.md'), 'utf8');
for (const workspace of ['delivery-platform-web', 'delivery-platform-server']) {
  const packageJson = JSON.parse(readFileSync(join(root, workspace, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
    if (!dependencyDoc.includes(`\`${dependency}\``)) failures.push(`docs/open-source-dependencies.md: missing ${dependency}`);
  }
}

const stalePatterns = [
  ['pnpm --filter ./delivery-platform-server', 'use pnpm --dir delivery-platform-server'],
  ['src/views/project/create.vue', 'removed project creation page'],
  ['{ code, message, data, timestamp }', 'response envelope must include traceId'],
];
for (const file of markdownFiles) {
  const content = readFileSync(join(root, file), 'utf8');
  for (const [pattern, reason] of stalePatterns) {
    if (content.includes(pattern)) failures.push(`${file}: stale text "${pattern}" (${reason})`);
  }
}

if (failures.length) {
  console.error(`Document fact verification failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Document facts verified: ${JSON.stringify(facts)}`);
