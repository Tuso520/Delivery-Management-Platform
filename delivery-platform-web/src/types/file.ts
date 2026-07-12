export interface UploadedFile {
  id: string
  projectId: string
  archiveItemId: string | null
  fileName: string
  originalName: string
  fileExt: string
  fileSize: number
  mimeType: string
  storagePath: string
  versionNo: string
  isCurrent: boolean
  fileStatus: string
  uploadUserId: string
  uploadTime: string
  remark: string | null
  createdAt: string
  updatedAt: string
  uploadUser: {
    id: string
    realName: string
  }
}
