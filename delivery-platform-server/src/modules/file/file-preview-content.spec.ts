import type { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

import type { PrismaService } from '../../database/prisma.service';
import type { ProjectAccessService } from '../project/project-access.service';
import { FileService } from './file.service';
import type { FileStorageService } from './file-storage.service';

describe('FileService preview content', () => {
  function createService(getObject: jest.Mock) {
    const operationLogCreate = jest.fn();
    const service = new FileService(
      { operationLog: { create: operationLogCreate } } as unknown as PrismaService,
      { getObject } as unknown as FileStorageService,
      { assertProjectAccess: jest.fn() } as unknown as ProjectAccessService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    jest.spyOn(service, 'findById').mockResolvedValue({
      id: 'file-1',
      projectId: 'project-1',
      archiveItemId: 'archive-1',
      fileName: 'plan.pdf',
      originalName: 'plan.pdf',
      fileExt: 'pdf',
      fileSize: BigInt(100),
      mimeType: 'application/pdf',
      storagePath: 'projects/project-1/plan.pdf',
      versionNo: 'V1.0',
      isCurrent: true,
      fileStatus: 'Approved',
      uploadUserId: 'user-1',
      uploadTime: new Date(),
      remark: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      uploadUser: { id: 'user-1', realName: '测试用户' },
    });
    return { service, operationLogCreate };
  }

  it('logs preview_content only after storage returns a stream', async () => {
    const stream = Readable.from([Buffer.from('pdf')]);
    const getObject = jest.fn().mockResolvedValue(stream);
    const { service, operationLogCreate } = createService(getObject);

    const result = await service.getPreviewContent('file-1', 'user-1');

    expect(result.stream).toBe(stream);
    expect(operationLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'preview_content', targetId: 'file-1' }),
    });
  });

  it('does not write a success audit when storage fails', async () => {
    const getObject = jest.fn().mockRejectedValue(new Error('storage unavailable'));
    const { service, operationLogCreate } = createService(getObject);

    await expect(service.getPreviewContent('file-1', 'user-1')).rejects.toThrow('storage unavailable');
    expect(operationLogCreate).not.toHaveBeenCalled();
  });
});
