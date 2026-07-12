import { Readable } from 'stream';

import { FileController, ProjectArchiveFileController } from '../file.controller';
import type { UnifiedFileService } from '../unified-file.service';

describe('file upload controllers', () => {
  it('forwards Idempotency-Key to the controlled draft upload service', async () => {
    const unifiedFiles = {
      uploadDraftFile: jest.fn().mockResolvedValue({ fileVersionId: 'version-1' }),
    } as unknown as UnifiedFileService;
    const controller = new FileController(unifiedFiles);
    const file = pdfFile();

    await controller.uploadDraft(file, { ownerType: 'STANDARD' }, 'user-1', 'draft-key-0001');

    expect(unifiedFiles.uploadDraftFile).toHaveBeenCalledWith(
      file,
      { ownerType: 'STANDARD' },
      'user-1',
      'draft-key-0001',
    );
  });

  it('forwards Idempotency-Key to the project archive upload service', async () => {
    const unifiedFiles = {
      uploadProjectArchiveFile: jest.fn().mockResolvedValue({ id: 'logical-file-1' }),
    } as unknown as UnifiedFileService;
    const controller = new ProjectArchiveFileController(unifiedFiles);
    const file = pdfFile();

    await controller.upload(
      'project-1',
      'item-1',
      file,
      { uploadMode: 'NEW_VERSION', revisionLevel: 'MINOR' },
      'user-1',
      'archive-key-0001',
    );

    expect(unifiedFiles.uploadProjectArchiveFile).toHaveBeenCalledWith(
      'project-1',
      'item-1',
      file,
      { uploadMode: 'NEW_VERSION', revisionLevel: 'MINOR' },
      'user-1',
      'archive-key-0001',
    );
  });

  it('forwards the complete actor context when archiving a file', async () => {
    const unifiedFiles = {
      archive: jest.fn().mockResolvedValue({ id: 'logical-file-1' }),
    } as unknown as UnifiedFileService;
    const controller = new FileController(unifiedFiles);
    const actor = {
      sub: 'manager-1',
      username: 'manager',
      realName: '管理员',
      email: null,
      roles: [],
      permissions: ['file:archive', 'standard:publish'],
      permissionVersion: 1,
    };

    await controller.archive('logical-file-1', actor);

    expect(unifiedFiles.archive).toHaveBeenCalledWith('logical-file-1', actor);
  });

  function pdfFile(): Express.Multer.File {
    const buffer = Buffer.from('%PDF-1.7\nmock');
    return {
      fieldname: 'file',
      originalname: 'drawing.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: buffer.length,
      destination: '',
      filename: '',
      path: '',
      buffer,
      stream: Readable.from(buffer),
    };
  }
});
