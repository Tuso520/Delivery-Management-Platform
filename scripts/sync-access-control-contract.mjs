import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const permissionSourcePath = resolve(
  projectRoot,
  'delivery-platform-server/prisma/seed-data/permissions.ts',
)
const roleSourcePath = resolve(projectRoot, 'delivery-platform-server/prisma/seed-data/roles.ts')
const targets = [
  resolve(
    projectRoot,
    'delivery-platform-server/src/modules/permission/access-control.generated.ts',
  ),
  resolve(
    projectRoot,
    'delivery-platform-web/src/platform/permission/access-control.generated.ts',
  ),
]

function uniqueMatches(source, pattern) {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))]
}

const permissionCodes = uniqueMatches(
  readFileSync(permissionSourcePath, 'utf8'),
  /permissionCode:\s*'([^']+)'/g,
)
const roleCodes = uniqueMatches(readFileSync(roleSourcePath, 'utf8'), /roleCode:\s*'([^']+)'/g)

if (permissionCodes.length === 0 || roleCodes.length === 0) {
  throw new Error('权限目录或角色矩阵为空，拒绝生成访问控制契约。')
}

const generated = `// 此文件由 scripts/sync-access-control-contract.mjs 根据后端 seed 事实源生成。
// 禁止手工编辑；修改权限目录或角色矩阵后执行 node scripts/sync-access-control-contract.mjs --write。

export const PERMISSION_CODES = ${JSON.stringify(permissionCodes, null, 2)} as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export const ROLE_CODES = ${JSON.stringify(roleCodes, null, 2)} as const

export type RoleCode = (typeof ROLE_CODES)[number]

const permissionCodeSet: ReadonlySet<string> = new Set(PERMISSION_CODES)
const roleCodeSet: ReadonlySet<string> = new Set(ROLE_CODES)

export function isPermissionCode(value: string): value is PermissionCode {
  return permissionCodeSet.has(value)
}

export function isRoleCode(value: string): value is RoleCode {
  return roleCodeSet.has(value)
}
`

const write = process.argv.includes('--write')
const drift = []

for (const target of targets) {
  if (write) {
    writeFileSync(target, generated, 'utf8')
    continue
  }

  let actual = ''
  try {
    actual = readFileSync(target, 'utf8')
  } catch {
    drift.push(relative(projectRoot, target))
    continue
  }
  if (actual !== generated) drift.push(relative(projectRoot, target))
}

if (write) {
  console.log(`访问控制契约已生成：${targets.map((target) => relative(projectRoot, target)).join('、')}`)
} else if (drift.length > 0) {
  console.error(`访问控制契约与后端事实源不一致：${drift.join('、')}`)
  console.error('请执行 node scripts/sync-access-control-contract.mjs --write 并提交生成结果。')
  process.exitCode = 1
} else {
  console.log(`访问控制契约检查通过：${permissionCodes.length} 个权限，${roleCodes.length} 个角色。`)
}
