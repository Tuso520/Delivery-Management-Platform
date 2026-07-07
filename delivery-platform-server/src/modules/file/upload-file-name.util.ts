const CJK_PATTERN = /[\u3400-\u9fff]/;
const MOJIBAKE_PATTERN = /[\u0080-\u009f]|[ÃÂâäåæçèéïð]/;

export function normalizeUploadFileName(originalName: string): string {
  if (!originalName || CJK_PATTERN.test(originalName) || !MOJIBAKE_PATTERN.test(originalName)) {
    return originalName;
  }

  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  if (!decoded || decoded.includes('\uFFFD')) {
    return originalName;
  }

  return CJK_PATTERN.test(decoded) ? decoded : originalName;
}

export function withNormalizedUploadFileName(
  file: Express.Multer.File,
): Express.Multer.File {
  const normalizedName = normalizeUploadFileName(file.originalname);
  return normalizedName === file.originalname
    ? file
    : { ...file, originalname: normalizedName };
}
