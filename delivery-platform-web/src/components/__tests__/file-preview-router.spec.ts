import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('unified file preview regression', () => {
  it('makes the compatible preview reachable after an advanced viewer failure', () => {
    const source = readSource('src/components/FilePreviewRouter/index.vue')
    const failureHandler = source.slice(
      source.indexOf("console.warn('File preview session failed; using compatible preview'"),
      source.indexOf(
        '} finally {',
        source.indexOf("console.warn('File preview session failed; using compatible preview'"),
      ),
    )

    expect(failureHandler).toContain('clearViewers()')
    expect(failureHandler).toContain('session.value = undefined')
    expect(failureHandler).toContain('fallbackToCompatiblePreview.value = true')
    expect(source).toContain("throw new Error('ONLYOFFICE is unavailable')")
    expect(source).toContain("throw new Error('ONLYOFFICE API did not initialize')")
  })

  it('keeps compact preview content flush with the modal body', () => {
    const routerSource = readSource('src/components/FilePreviewRouter/index.vue')
    const modalSource = readSource('src/components/AttachmentPreviewModal/index.vue')

    expect(routerSource).toMatch(/&\.compact\s*\{[\s\S]*?\.viewer-toolbar\s*\{\s*display:\s*none;/u)
    expect(modalSource).toContain(':body-style="{ padding: 0 }"')
    expect(modalSource).toContain(':align-center="false"')
    expect(modalSource).toContain('height="calc(100vh - 76px)"')
  })
})
