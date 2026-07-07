export function openPreviewUrl(url: string): boolean {
  const previewWindow = window.open(url, '_blank', 'noopener,noreferrer')
  return Boolean(previewWindow)
}
