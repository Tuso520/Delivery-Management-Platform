export type FilePreviewMode = 'view' | 'edit';

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
  | 'unavailable';

export type FilePreviewCategory =
  | 'office'
  | 'pdf'
  | 'image'
  | 'markdown'
  | 'xmind'
  | 'cad'
  | 'visio'
  | 'video'
  | 'audio'
  | 'unsupported';

export interface FilePreviewRoute {
  viewer: FilePreviewViewer;
  category: FilePreviewCategory;
  mode: FilePreviewMode;
  editable: boolean;
  readonly: boolean;
  supportsDownload: boolean;
  reason?: string;
}

export interface ResolveFilePreviewRouteInput {
  fileExt: string;
  mimeType: string;
  fileSize: bigint | number;
  requestedMode?: FilePreviewMode;
  canEditOffice?: boolean;
  onlyOfficeAvailable?: boolean;
}

export const LARGE_IMAGE_THRESHOLD_BYTES = 15 * 1024 * 1024;

const officeExtensions = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const editableOfficeExtensions = new Set(['docx', 'xlsx', 'pptx']);
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const markdownExtensions = new Set(['md', 'markdown']);
const cadExtensions = new Set(['dwg', 'dxf']);
const visioExtensions = new Set(['vsd', 'vsdx']);
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);

export function resolveFilePreviewRoute(
  input: ResolveFilePreviewRouteInput,
): FilePreviewRoute {
  const ext = normalizeExt(input.fileExt);
  const mimeType = input.mimeType.toLowerCase();
  const fileSize =
    typeof input.fileSize === 'bigint'
      ? input.fileSize
      : BigInt(Math.max(0, Math.floor(input.fileSize)));
  const requestedMode = input.requestedMode ?? 'view';

  if (officeExtensions.has(ext)) {
    const editable =
      requestedMode === 'edit' &&
      Boolean(input.canEditOffice) &&
      editableOfficeExtensions.has(ext) &&
      Boolean(input.onlyOfficeAvailable);

    return {
      viewer: 'onlyoffice',
      category: 'office',
      mode: editable ? 'edit' : 'view',
      editable,
      readonly: !editable,
      supportsDownload: true,
      reason: input.onlyOfficeAvailable
        ? ext && !editableOfficeExtensions.has(ext)
          ? 'Legacy Office formats are opened read-only; upload an OOXML version to edit.'
          : undefined
        : 'ONLYOFFICE Docs is not configured for this environment.',
    };
  }

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return readonlyRoute('pdf', 'pdf');
  }

  if (imageExtensions.has(ext) || mimeType.startsWith('image/')) {
    return readonlyRoute(
      fileSize > BigInt(LARGE_IMAGE_THRESHOLD_BYTES) ? 'deep-zoom-image' : 'image',
      'image',
    );
  }

  if (markdownExtensions.has(ext) || mimeType === 'text/markdown') {
    return readonlyRoute('markdown', 'markdown');
  }

  if (ext === 'xmind') {
    return readonlyRoute('xmind', 'xmind');
  }

  if (cadExtensions.has(ext)) {
    return readonlyRoute(
      'cad',
      'cad',
      'CAD conversion service is not configured; download the source file or convert it to PDF for preview.',
    );
  }

  if (visioExtensions.has(ext)) {
    return readonlyRoute(
      'visio',
      'visio',
      'Visio conversion service is not configured; download the source file or export it to PDF for preview.',
    );
  }

  if (videoExtensions.has(ext) || mimeType.startsWith('video/')) {
    return readonlyRoute('video', 'video');
  }

  if (audioExtensions.has(ext) || mimeType.startsWith('audio/')) {
    return readonlyRoute('audio', 'audio');
  }

  return readonlyRoute(
    'unavailable',
    'unsupported',
    'This file format is not supported for online preview.',
  );
}

export function isImagePreviewFile(fileExt: string, mimeType: string): boolean {
  const ext = normalizeExt(fileExt);
  return imageExtensions.has(ext) || mimeType.toLowerCase().startsWith('image/');
}

export function getOnlyOfficeDocumentType(
  fileExt: string,
): 'word' | 'cell' | 'slide' | undefined {
  const ext = normalizeExt(fileExt);
  if (ext === 'doc' || ext === 'docx') return 'word';
  if (ext === 'xls' || ext === 'xlsx') return 'cell';
  if (ext === 'ppt' || ext === 'pptx') return 'slide';
  return undefined;
}

function readonlyRoute(
  viewer: FilePreviewViewer,
  category: FilePreviewCategory,
  reason?: string,
): FilePreviewRoute {
  return {
    viewer,
    category,
    mode: 'view',
    editable: false,
    readonly: true,
    supportsDownload: true,
    reason,
  };
}

function normalizeExt(value: string): string {
  return value.replace(/^\./u, '').toLowerCase();
}
