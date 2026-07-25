import type { StreamedMulterFile } from './streamed-upload.types';
import {
  normalizeUploadFileName,
  withNormalizedUploadFileName,
} from './upload-file-name.util';

describe('normalizeUploadFileName', () => {
  it('restores UTF-8 Chinese names decoded as latin1', () => {
    const mojibake = String.fromCharCode(
      ...[
        0x44, 0x65, 0x65, 0x70, 0x4c, 0x6f, 0x67, 0x69, 0x63, 0xe4, 0xba,
        0xa4, 0xe4, 0xbb, 0x98, 0xe4, 0xbd, 0xbf, 0xe7, 0x94, 0xa8, 0xe6,
        0x89, 0x8b, 0xe5, 0x86, 0x8c, 0xef, 0xbc, 0x88, 0xe4, 0xb8, 0x80,
        0xe7, 0xab, 0xa0, 0x20, 0x7e, 0x20, 0xe5, 0x85, 0xab, 0xe7, 0xab,
        0xa0, 0xef, 0xbc, 0x89, 0x2e, 0x64, 0x6f, 0x63, 0x78,
      ],
    );

    expect(normalizeUploadFileName(mojibake)).toBe(
      'DeepLogic交付使用手册（一章 ~ 八章）.docx',
    );
  });

  it('normalizes in place so streamed-upload ownership remains on the Multer object', () => {
    const file = {
      originalname: String.fromCharCode(
        0xe9,
        0xa1,
        0xb9,
        0xe7,
        0x9b,
        0xae,
        0x2e,
        0x70,
        0x64,
        0x66,
      ),
      streamedToObjectStorage: true,
      streamedUploadClaimed: true,
    } as unknown as StreamedMulterFile;

    expect(withNormalizedUploadFileName(file)).toBe(file);
    expect(file.originalname).toBe('项目.pdf');
    expect(file.streamedUploadClaimed).toBe(true);
  });

  it('keeps normal file names unchanged', () => {
    expect(normalizeUploadFileName('project-plan.pdf')).toBe('project-plan.pdf');
    expect(normalizeUploadFileName('项目实施记录.docx')).toBe('项目实施记录.docx');
  });
});
