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

export interface FileReview {
  id: string
  fileId: string
  archiveItemId: string
  reviewUserId: string
  reviewStatus: string
  reviewComment: string | null
  reviewTime: string
  createdAt: string
  reviewer: {
    id: string
    realName: string
  }
  file: {
    id: string
    fileName: string
    versionNo: string
  }
  archiveItem: {
    id: string
    name: string
  }
}

export interface PendingReview extends FileReview {
  // Same structure as FileReview, used for pending items in the review list
}
