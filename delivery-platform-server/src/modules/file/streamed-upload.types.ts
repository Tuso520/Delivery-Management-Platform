export interface StreamedUploadMetadata {
  streamedToObjectStorage: true;
  streamedUploadClaimed?: boolean;
  storageBucket: string;
  storageKey: string;
  checksum: string;
  headBuffer: Buffer;
}

export type StreamedMulterFile = Express.Multer.File & StreamedUploadMetadata;

export function isStreamedMulterFile(
  file: Express.Multer.File,
): file is StreamedMulterFile {
  return (
    (file as Partial<StreamedUploadMetadata>).streamedToObjectStorage === true
  );
}
