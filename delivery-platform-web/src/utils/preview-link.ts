import { Message } from '@arco-design/web-vue'

interface PreviewLink {
  url: string
  expiresAt?: string
}

interface OpenSignedPreviewOptions {
  title?: string
  onOpened?: () => void
}

type PreviewSource = 'attachment' | 'file'

export function getPreviewRedirectUrl(
  source: PreviewSource,
  id: string,
  options: OpenSignedPreviewOptions = {},
): string {
  const params = new URLSearchParams({
    source,
    id,
  })
  if (options.title) {
    params.set('title', options.title)
  }

  return `${window.location.origin}${window.location.pathname}${window.location.search}#/preview?${params.toString()}`
}

export function openPreviewRedirect(
  source: PreviewSource,
  id: string,
  options: OpenSignedPreviewOptions = {},
): void {
  const targetUrl = getPreviewRedirectUrl(source, id, options)
  const opened = window.open(targetUrl, '_blank')
  if (!opened) {
    Message.warning('浏览器拦截了新窗口，已在当前窗口打开预览')
    window.location.assign(targetUrl)
  }
  options.onOpened?.()
}

export async function openSignedPreview(
  createLink: () => Promise<PreviewLink>,
  options: OpenSignedPreviewOptions = {},
): Promise<void> {
  const previewWindow = window.open('about:blank', '_blank')

  if (previewWindow) {
    previewWindow.document.title = options.title || '在线预览'
    previewWindow.document.body.innerHTML = `
      <main style="display:grid;place-items:center;min-height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#4e5969;background:#f2f4f8;">
        <section style="padding:18px 22px;border:1px solid #e5e6eb;background:#fff;">
          正在生成安全预览链接...
        </section>
      </main>
    `
  }

  try {
    const { url } = await createLink()
    if (previewWindow) {
      previewWindow.location.replace(url)
    } else {
      const opened = window.open(url, '_blank')
      if (!opened) {
        Message.warning('浏览器拦截了新窗口，已在当前窗口打开预览')
        window.location.assign(url)
      }
    }
    options.onOpened?.()
  } catch {
    previewWindow?.close()
    Message.error('预览链接生成失败，请稍后重试')
  }
}
