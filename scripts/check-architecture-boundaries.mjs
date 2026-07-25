import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webSrc = resolve(projectRoot, 'delivery-platform-web/src')
const serverSrc = resolve(projectRoot, 'delivery-platform-server/src')
const failures = []

const normalize = (path) => relative(projectRoot, path).replaceAll('\\', '/')

function sourceFiles(root, extensions) {
  const result = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolute = resolve(directory, entry)
      const metadata = statSync(absolute)
      if (metadata.isDirectory()) {
        visit(absolute)
      } else if (
        extensions.has(extname(entry)) &&
        !entry.endsWith('.spec.ts') &&
        !entry.endsWith('.test.ts')
      ) {
        result.push(absolute)
      }
    }
  }
  visit(root)
  return result
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length
}

function checkCountBaseline(label, root, pattern, baseline) {
  const actual = new Map()
  for (const file of sourceFiles(root, new Set(['.ts', '.vue']))) {
    if (
      label === '绕过统一审计服务直接写 OperationLog' &&
      normalize(file) ===
        'delivery-platform-server/src/modules/operation-log/operation-log.service.ts'
    ) {
      continue
    }
    const count = countMatches(readFileSync(file, 'utf8'), pattern)
    if (count > 0) actual.set(normalize(file), count)
  }

  for (const [file, count] of actual) {
    const expected = baseline[file] ?? 0
    if (count > expected) {
      failures.push(`${label}: ${file} 出现 ${count} 次，允许基线为 ${expected} 次`)
    }
  }
  for (const [file, expected] of Object.entries(baseline)) {
    const count = actual.get(file) ?? 0
    if (count < expected) {
      failures.push(
        `${label}: ${file} 已降至 ${count} 次，请同步收紧门禁基线（当前 ${expected} 次）`,
      )
    }
  }
}

function resolveWebImport(importer, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base =
    specifier.startsWith('@/')
      ? resolve(webSrc, specifier.slice(2))
      : resolve(dirname(importer), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.vue`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.vue'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function findWebCycles() {
  const files = sourceFiles(webSrc, new Set(['.ts', '.vue']))
  const graph = new Map(files.map((file) => [file, new Set()]))
  const importPattern =
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const target = resolveWebImport(file, match[1] ?? match[2])
      if (target && graph.has(target)) graph.get(file).add(target)
    }
  }

  const index = new Map()
  const lowLink = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  let sequence = 0

  const connect = (node) => {
    index.set(node, sequence)
    lowLink.set(node, sequence)
    sequence += 1
    stack.push(node)
    onStack.add(node)

    for (const target of graph.get(node)) {
      if (!index.has(target)) {
        connect(target)
        lowLink.set(node, Math.min(lowLink.get(node), lowLink.get(target)))
      } else if (onStack.has(target)) {
        lowLink.set(node, Math.min(lowLink.get(node), index.get(target)))
      }
    }

    if (lowLink.get(node) === index.get(node)) {
      const component = []
      let current
      do {
        current = stack.pop()
        onStack.delete(current)
        component.push(normalize(current))
      } while (current !== node)
      if (component.length > 1) components.push(component.sort())
    }
  }

  for (const file of files) {
    if (!index.has(file)) connect(file)
  }
  return components.sort((left, right) => left.join('|').localeCompare(right.join('|')))
}

const allowedWebCycles = []

const webCycles = findWebCycles()
if (JSON.stringify(webCycles) !== JSON.stringify(allowedWebCycles)) {
  failures.push(
    `前端静态循环依赖集合发生变化。\n实际: ${JSON.stringify(webCycles)}\n允许基线: ${JSON.stringify(allowedWebCycles)}`,
  )
}

if (existsSync(resolve(webSrc, 'components/business'))) {
  failures.push('前端组件边界: src/components/business 不得重新混放设计系统与平台能力')
}
for (const requiredBoundary of [
  'design-system',
  'platform/permission',
  'platform/file-preview',
  'platform/file',
  'platform/notification',
  'platform/approval',
  'platform/workflow',
]) {
  if (!existsSync(resolve(webSrc, requiredBoundary))) {
    failures.push(`前端组件边界缺失: src/${requiredBoundary}`)
  }
}
for (const domain of ['knowledge', 'archive', 'project']) {
  for (const requiredPart of ['pages', 'api', 'types', 'queries']) {
    if (!existsSync(resolve(webSrc, 'domains', domain, requiredPart))) {
      failures.push(`前端领域边界缺失: src/domains/${domain}/${requiredPart}`)
    }
  }
}
for (const retiredEntry of [
  'api/knowledge.ts',
  'api/archive.ts',
  'api/archive-template.ts',
  'api/project.ts',
  'api/project-payment.ts',
  'types/knowledge.ts',
  'types/archive.ts',
  'types/project.ts',
  'types/project-payment.ts',
  'views/knowledge/index.vue',
  'views/archive/index.vue',
  'views/archive/template.vue',
  'views/project/index.vue',
  'views/project/ProjectDetailDialog.vue',
  'api/notification.ts',
  'api/approval.ts',
  'api/review.ts',
  'api/file.ts',
  'api/upload-idempotency.ts',
  'types/review.ts',
  'composables/useFilePreview.ts',
]) {
  if (existsSync(resolve(webSrc, retiredEntry))) {
    failures.push(`前端领域旧入口不得恢复: src/${retiredEntry}`)
  }
}

checkCountBaseline('后端 forwardRef', serverSrc, /\bforwardRef\s*\(/g, {})

checkCountBaseline('上传内存存储', serverSrc, /\bmemoryStorage\s*\(/g, {})

checkCountBaseline(
  '绕过统一审计服务直接写 OperationLog',
  serverSrc,
  /\boperationLog\.create\s*\(/g,
  {},
)

const arcoInstaller = resolve(webSrc, 'platform/ui/install-arco-components.ts')
const arcoInstallerSource = readFileSync(arcoInstaller, 'utf8')
const registeredArcoComponents = new Set(
  [...arcoInstallerSource.matchAll(/^\s+(A[A-Za-z]+):/gm)].map((match) => match[1]),
)
for (const file of sourceFiles(webSrc, new Set(['.vue']))) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/<a-([a-z0-9-]+)/g)) {
    const componentName = `A${match[1]
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')}`
    if (!registeredArcoComponents.has(componentName)) {
      failures.push(`Arco component is not registered: ${componentName} in ${normalize(file)}`)
    }
  }
}

const duplicateApiBaseline = new Map()
const endpointOccurrences = new Map()
const requestPattern =
  /\b(?:request|axiosInstance)\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*([`'"])(.*?)\2/gs

for (const file of sourceFiles(resolve(webSrc, 'api'), new Set(['.ts']))) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(requestPattern)) {
    const method = match[1].toUpperCase()
    const path = match[3]
      .replace(/\$\{[^}]+\}/g, ':id')
      .replace(/\/+/g, '/')
    const key = `${method} ${path}`
    const files = endpointOccurrences.get(key) ?? new Set()
    files.add(normalize(file))
    endpointOccurrences.set(key, files)
  }
  if (source.includes("'/auth/refresh'") || source.includes('"/auth/refresh"')) {
    const files = endpointOccurrences.get('POST /auth/refresh') ?? new Set()
    files.add(normalize(file))
    endpointOccurrences.set('POST /auth/refresh', files)
  }
}

const actualDuplicates = new Map(
  [...endpointOccurrences]
    .filter(([, files]) => files.size > 1)
    .map(([key, files]) => [key, files.size]),
)
for (const [key, count] of actualDuplicates) {
  const allowed = duplicateApiBaseline.get(key) ?? 0
  if (count > allowed) {
    failures.push(`前端 API 重复实现: ${key} 分布于 ${count} 个文件，允许基线为 ${allowed}`)
  }
}
for (const [key, allowed] of duplicateApiBaseline) {
  const count = actualDuplicates.get(key) ?? 0
  if (count < allowed) {
    failures.push(`前端 API 重复实现 ${key} 已降至 ${count}，请收紧门禁基线（当前 ${allowed}）`)
  }
}

if (failures.length > 0) {
  console.error('架构边界检查失败：')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `架构边界检查通过：前端循环 ${webCycles.length} 组，后端 forwardRef 与审计直写未超过基线，重复 API 未扩散。`,
  )
}
