import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(process.cwd(), '..')

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

describe('release identity configuration', () => {
  it('generates build-info.json from the release id', () => {
    const viteConfig = readProjectFile('delivery-platform-web/vite.config.ts')
    const dockerfile = readProjectFile('delivery-platform-web/Dockerfile')

    expect(viteConfig).toContain('build-info.json')
    expect(viteConfig).toContain('VITE_RELEASE_ID')
    expect(dockerfile).toContain('ARG RELEASE_ID')
    expect(dockerfile).toContain('VITE_RELEASE_ID')
  })

  it('passes the release id into application image builds', () => {
    const compose = readProjectFile('docker-compose.yml')

    expect(compose).toMatch(/backend:[\s\S]*args:[\s\S]*RELEASE_ID/)
    expect(compose).toMatch(/frontend:[\s\S]*args:[\s\S]*RELEASE_ID/)
  })

  it('does not cache the SPA entry point or build metadata', () => {
    const nginx = readProjectFile('delivery-platform-web/nginx.conf')

    expect(nginx).toContain('location = /index.html')
    expect(nginx).toContain('location = /build-info.json')
    expect(nginx).toContain('no-store')
  })

  it('preflights and verifies the deployed release id', () => {
    const deployScript = readProjectFile('deploy.sh')

    expect(deployScript).toContain('preflight)')
    expect(deployScript).toContain('cleanup-source)')
    expect(deployScript).toContain('cleanup_source_tree')
    expect(deployScript).toContain('verify_release_version')
    expect(deployScript).toContain('/build-info.json')
  })
})
