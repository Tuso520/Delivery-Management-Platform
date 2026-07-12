import request from './request'

export type FilePreviewViewer =
  | 'onlyoffice'
  | 'pdf'
  | 'image'
  | 'deep-zoom-image'
  | 'markdown'
  | 'xmind'
  | 'cad'
  | 'visio'
  | 'video'
  | 'audio'
  | 'unavailable'

export interface FilePreviewRoute {
  viewer: FilePreviewViewer
  category:
    | 'office'
    | 'pdf'
    | 'image'
    | 'markdown'
    | 'xmind'
    | 'cad'
    | 'visio'
    | 'video'
    | 'audio'
    | 'unsupported'
  mode: 'view'
  editable: false
  readonly: boolean
  supportsDownload: boolean
  reason?: string
}

export interface XmindOutlineNode {
  title: string
  children: XmindOutlineNode[]
}

export interface XmindOutlineSheet {
  title: string
  root: XmindOutlineNode
}

export interface FilePreviewSession {
  file: {
    id: string
    projectId: string
    archiveItemId: string | null
    fileName: string
    originalName: string
    fileExt: string
    fileSize: string
    mimeType: string
    versionNo: string
    isCurrent: boolean
    fileStatus: string
    updatedAt: string
  }
  route: FilePreviewRoute
  urls: {
    content: string
    thumbnail?: string
    download: string
  }
  signed: {
    expiresAt: string
  }
  onlyOffice?: {
    available: boolean
    docsUrl?: string
    reason?: string
    config?: Record<string, unknown>
  }
  xmind?: {
    sheets: XmindOutlineSheet[]
  }
}

interface UnifiedFilePreviewSession {
  fileId: string
  fileName: string
  mimeType: string
  extension: string
  viewerType:
    | 'ONLYOFFICE_VIEW'
    | 'PDF'
    | 'IMAGE'
    | 'LARGE_IMAGE'
    | 'MARKDOWN'
    | 'CAD_CONVERTED'
    | 'VISIO_CONVERTED'
    | 'XMIND'
    | 'VIDEO'
    | 'AUDIO'
    | 'UNSUPPORTED'
  previewUrl: string
  availability: {
    state: 'READY' | 'PROCESSING' | 'UNAVAILABLE'
    reason?: string
    errorCode?: string | null
  }
  downloadAllowed: boolean
  metadata: {
    version: string
    size: string | number
    checksum?: string | null
    readOnly: true
  }
  processingStatus: Array<{
    id: string
    type: string
    status: string
    progress: number
    attempts: number
    availableAt: string
    errorCode?: string | null
    errorMessage?: string | null
  }>
  onlyOffice?: {
    available: boolean
    docsUrl?: string
    reason?: string
    config?: Record<string, unknown>
  }
  xmind?: {
    sheets: XmindOutlineSheet[]
  }
}

function normalizeUnifiedPreviewSession(session: UnifiedFilePreviewSession): FilePreviewSession {
  const viewerMap: Record<
    UnifiedFilePreviewSession['viewerType'],
    { viewer: FilePreviewViewer; category: FilePreviewRoute['category']; reason?: string }
  > = {
    ONLYOFFICE_VIEW: {
      viewer: session.onlyOffice?.available ? 'onlyoffice' : 'unavailable',
      category: 'office',
      reason: session.onlyOffice?.reason || 'Office 在线预览未配置，请下载原文件查看。',
    },
    PDF: { viewer: 'pdf', category: 'pdf' },
    IMAGE: { viewer: 'image', category: 'image' },
    LARGE_IMAGE: { viewer: 'deep-zoom-image', category: 'image' },
    MARKDOWN: { viewer: 'markdown', category: 'markdown' },
    CAD_CONVERTED: {
      viewer: 'pdf',
      category: 'cad',
    },
    VISIO_CONVERTED: {
      viewer: 'pdf',
      category: 'visio',
    },
    XMIND: { viewer: 'xmind', category: 'xmind' },
    VIDEO: { viewer: 'video', category: 'video' },
    AUDIO: { viewer: 'audio', category: 'audio' },
    UNSUPPORTED: {
      viewer: 'unavailable',
      category: 'unsupported',
      reason: '该文件类型暂不支持在线预览。',
    },
  }
  const matched = viewerMap[session.viewerType]
  const available = session.availability.state === 'READY'
  return {
    file: {
      id: session.fileId,
      projectId: '',
      archiveItemId: null,
      fileName: session.fileName,
      originalName: session.fileName,
      fileExt: session.extension,
      fileSize: String(session.metadata.size),
      mimeType: session.mimeType,
      versionNo: session.metadata.version,
      isCurrent: true,
      fileStatus: 'APPROVED',
      updatedAt: new Date().toISOString(),
    },
    route: {
      viewer: available ? matched.viewer : 'unavailable',
      category: matched.category,
      mode: 'view',
      editable: false,
      readonly: true,
      supportsDownload: session.downloadAllowed,
      reason: available ? matched.reason : session.availability.reason,
    },
    urls: {
      content: session.previewUrl,
      download: `/api/v1/files/${session.fileId}/download`,
    },
    signed: {
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    onlyOffice: session.onlyOffice,
    xmind: session.xmind,
  }
}

export const fileApi = {
  /**
   * 下载私有文件
   */
  download(id: string) {
    return request.get<Blob>(`/files/${id}/download`, {
      responseType: 'blob',
      timeout: 120000,
    })
  },

  async createPreviewSession(id: string) {
    const session = await request.get<UnifiedFilePreviewSession>(`/files/${id}/preview-session`, {
      timeout: 120000,
    })
    return normalizeUnifiedPreviewSession(session)
  },
}
