export function findEmptyUploadFileNames(
  files: readonly Pick<File, 'name' | 'size'>[],
): string[] {
  return files.filter((file) => file.size === 0).map((file) => file.name)
}
