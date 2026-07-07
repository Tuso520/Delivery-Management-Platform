export function openPreviewUrl(url: string): void {
  const previewWindow = window.open(url, '_blank', 'noopener,noreferrer')
  if (!previewWindow) {
    window.location.href = url
  }
}
