export interface ArchiveFolderProgress {
  totalCount: number
  completedCount: number
}

export interface ArchiveProgressSummary {
  directoryScale: number
  completedFolders: number
  completionRate: number
}

export function summarizeArchiveProgress(
  folders: readonly ArchiveFolderProgress[],
): ArchiveProgressSummary {
  const directoryScale = folders.length
  const completedFolders = folders.filter(
    (folder) => folder.totalCount > 0 && folder.completedCount === folder.totalCount,
  ).length

  return {
    directoryScale,
    completedFolders,
    completionRate:
      directoryScale > 0 ? Math.round((completedFolders / directoryScale) * 100) : 0,
  }
}
