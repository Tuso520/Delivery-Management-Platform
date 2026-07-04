import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(process.cwd(), '..')

describe('release packaging contract', () => {
  it('provides a strict whitelist packaging script', () => {
    const scriptPath = resolve(projectRoot, 'scripts/package-release.sh')

    expect(existsSync(scriptPath)).toBe(true)

    const script = readFileSync(scriptPath, 'utf8')
    expect(script).toContain('delivery-platform-deploy-')
    expect(script).toContain('RELEASE_ID')
    expect(script).toContain('RELEASE_MANIFEST.txt')
    expect(script).toContain('forbidden')
    expect(script).toContain('COPYFILE_DISABLE=1')
    expect(script).toContain('._*')
    expect(script).not.toContain('cp -R . ')
  })

  it('ships a complete deployment guide at the package root', () => {
    const guidePath = resolve(projectRoot, 'DEPLOYMENT.md')

    expect(existsSync(guidePath)).toBe(true)

    const guide = readFileSync(guidePath, 'utf8')
    expect(guide).toContain('/build-info.json')
    expect(guide).toContain('失败回滚')
    expect(guide).not.toContain('<RELEASE_ID>')
    expect(guide).not.toContain('source-<时间>')
    expect(guide).toContain('bash deploy-latest-release.sh')
  })

  it('provides a server helper that discovers the uploaded release safely', () => {
    const helperPath = resolve(projectRoot, 'scripts/deploy-latest-release.sh')

    expect(existsSync(helperPath)).toBe(true)

    const helper = readFileSync(helperPath, 'utf8')
    expect(helper).toContain("find \"$ROOT_DIR\"")
    expect(helper).toContain("delivery-platform-deploy-*.tar.gz")
    expect(helper).toContain('sha256sum -c')
    expect(helper).toContain('RELEASE_ID="${PKG_BASENAME#delivery-platform-deploy-}"')
    expect(helper).toContain('bash deploy.sh preflight')
    expect(helper).toContain('bash deploy.sh release')
    expect(helper).not.toContain('<RELEASE_ID>')
  })
})
