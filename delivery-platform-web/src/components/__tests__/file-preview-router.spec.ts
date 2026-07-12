import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('unified file preview regression', () => {
  it('uses a query-backed preview session and preserves controlled download metadata', () => {
    const source = readSource('src/components/FilePreviewRouter/index.vue')

    expect(source).toContain('const previewQuery = useQuery({')
    expect(source).toContain('queryKeys.files.previewSession(')
    expect(source).toContain('const session = computed(() => previewQuery.data.value)')
    expect(source).toContain("console.warn('File preview renderer failed'")
    expect(source).not.toContain('AttachmentPreviewPane')
    expect(source).toContain('@click="loadPreview"')
    expect(source).toContain('v-if="canDownload" :loading="downloading" @click="downloadOriginal"')
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
