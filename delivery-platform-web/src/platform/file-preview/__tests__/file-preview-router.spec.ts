import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('unified file preview regression', () => {
  it('uses a query-backed preview session and preserves controlled download metadata', () => {
    const source = readSource('src/platform/file-preview/FilePreviewRouter.vue')

    expect(source).toContain('const previewQuery = useQuery({')
    expect(source).toContain('queryKeys.files.previewSession(')
    expect(source).toContain('const session = computed(() => previewQuery.data.value)')
    expect(source).toContain("console.warn('File preview renderer failed'")
    expect(source).not.toContain('AttachmentPreviewPane')
    expect(source).toContain('@click="loadPreview"')
    expect(source).toContain('v-if="canDownload" :loading="downloading" @click="downloadOriginal"')
    expect(source).toMatch(
      /<section v-else class="fallback-viewer">[\s\S]*?<a-button v-if="canDownload"[\s\S]*?@click="downloadOriginal">/u,
    )
    expect(source).toContain("throw new Error('ONLYOFFICE is unavailable')")
    expect(source).toContain("throw new Error('ONLYOFFICE API did not initialize')")
    expect(source).toContain('fileApi.loadPreviewContent(nextSession.file.id)')
    expect(source).toContain('URL.createObjectURL(blob)')
    expect(source).not.toContain('const response = await fetch(url)')
    expect(source).toContain("route?.viewer === 'presentation-outline'")
    expect(source).toContain('presentationSlides')
  })

  it('keeps compact preview content flush with the modal body', () => {
    const routerSource = readSource('src/platform/file-preview/FilePreviewRouter.vue')
    const modalSource = readSource('src/platform/file-preview/AttachmentPreviewModal.vue')

    expect(routerSource).toMatch(/&\.compact\s*\{[\s\S]*?\.viewer-toolbar\s*\{\s*display:\s*none;/u)
    expect(modalSource).toContain(':body-style="{ padding: 0 }"')
    expect(modalSource).toContain(':align-center="false"')
    expect(modalSource).toContain('height="calc(100vh - 76px)"')
    expect(modalSource).toContain("props.contentType !== 'MARKDOWN'")
    expect(modalSource).toContain('renderSafeMarkdown(props.markdownContent')
  })
})
