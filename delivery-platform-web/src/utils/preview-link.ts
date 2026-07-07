import { Message } from '@arco-design/web-vue'

interface PreviewLink {
  url: string
  expiresAt?: string
}

interface OpenSignedPreviewOptions {
  title?: string
  onOpened?: () => void
}

export async function openSignedPreview(
  createLink: () => Promise<PreviewLink>,
  options: OpenSignedPreviewOptions = {},
): Promise<void> {
  const previewWindow = window.open('about:blank', '_blank')

  if (previewWindow) {
    previewWindow.opener = null
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
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        Message.warning('浏览器阻止了新窗口，请允许弹窗后重试')
      }
    }
    options.onOpened?.()
  } catch {
    previewWindow?.close()
    Message.error('预览链接生成失败，请稍后重试')
  }
}
