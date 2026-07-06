import type { Readable } from 'stream';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { FileStorageService } from '../file/file-storage.service';
import { OperationLogService } from '../operation-log/operation-log.service';
import { ProjectAccessService } from '../project/project-access.service';

import {
  buildAttachmentPreview,
  canPreviewWithoutServer,
  needsServerPreview,
  type AttachmentPreviewResult,
} from './attachment-preview.util';
import {
  AttachmentOwnerType,
  QueryAttachmentDto,
  UploadAttachmentDto,
} from './dto/attachment.dto';

interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

const MAX_SERVER_PREVIEW_BYTES = 25 * 1024 * 1024;

@Injectable()
export class AttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly operationLog: OperationLogService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async uploadMany(
    files: Express.Multer.File[],
    dto: UploadAttachmentDto,
    userId: string,
  ) {
    if (!files.length) {
      throw new BadRequestException('请至少选择一个文件');
    }
    const ownerProjectId = await this.resolveOwnerProjectId(
      dto.ownerType,
      dto.ownerId,
    );
    if (ownerProjectId && dto.projectId && ownerProjectId !== dto.projectId) {
      throw new BadRequestException('附件关联项目与所属业务记录不一致');
    }
    const projectId = ownerProjectId ?? dto.projectId;
    if (projectId) {
      await this.projectAccess.assertProjectAccess(projectId, userId);
    } else {
      await this.assertDomainPermission(dto.ownerType, userId, 'manage');
    }
    if (dto.ownerType === 'ChecklistItem') {
      await this.validateChecklistEvidence(files, dto.ownerId, dto.captureSource);
    }

    const created = [];
    for (const file of files) {
      const storagePath = await this.storage.upload(
        file,
        `attachments/${dto.ownerType}/${dto.ownerId}`,
      );
      const fileExt = file.originalname.includes('.')
        ? file.originalname.split('.').pop()!.toLowerCase()
        : '';
      created.push(
        await this.prisma.attachment.create({
          data: {
            ownerType: dto.ownerType,
            ownerId: dto.ownerId,
            projectId,
            category: dto.category,
            fileName: file.originalname,
            originalName: file.originalname,
            fileExt,
            fileSize: BigInt(file.size),
            mimeType: file.mimetype,
            storageBucket: this.storage.getBucketName(),
            storagePath,
            uploadedBy: userId,
            capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
            captureSource: dto.captureSource,
            latitude: dto.latitude,
            longitude: dto.longitude,
            remark: dto.remark,
          },
          include: {
            uploader: { select: { id: true, realName: true, username: true } },
          },
        }),
      );
    }

    return created;
  }

  async findAll(query: QueryAttachmentDto, userId: string) {
    const { page = 1, pageSize = 20, ownerType, ownerId, projectId, category } =
      query;
    let scopedProjectId = projectId;
    if (ownerType && ownerId) {
      const ownerProjectId = await this.resolveOwnerProjectId(ownerType, ownerId);
      if (ownerProjectId && projectId && ownerProjectId !== projectId) {
        throw new BadRequestException('附件查询项目与所属业务记录不一致');
      }
      scopedProjectId = ownerProjectId ?? projectId;
    }
    if (scopedProjectId) {
      await this.projectAccess.assertProjectAccess(scopedProjectId, userId);
    } else if (ownerType && ownerId) {
      await this.assertDomainPermission(ownerType, userId, 'view');
    }

    const where: Prisma.AttachmentWhereInput = {
      deletedAt: null,
      ownerType,
      ownerId,
      projectId: scopedProjectId,
      category,
    };
    if (
      !scopedProjectId &&
      !(ownerType && ownerId) &&
      !(await this.projectAccess.isElevated(userId))
    ) {
      where.project = { members: { some: { userId } }, deletedAt: null };
    }
    const [total, list] = await Promise.all([
      this.prisma.attachment.count({ where }),
      this.prisma.attachment.findMany({
        where,
        include: {
          uploader: { select: { id: true, realName: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getContent(
    id: string,
    userId: string,
    audit: AuditContext,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'view');
    const stream = await this.storage.getObject(attachment.storagePath);
    await this.operationLog.log({
      userId,
      module: 'attachment',
      action: 'download',
      targetType: attachment.ownerType,
      targetId: id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    return {
      stream,
      fileName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  async getPreview(
    id: string,
    userId: string,
    audit: AuditContext,
  ): Promise<AttachmentPreviewResult> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'view');

    const fileExt = attachment.fileExt.toLowerCase();
    const base = {
      fileName: attachment.originalName,
      fileExt,
      mimeType: attachment.mimeType,
    };

    let preview: AttachmentPreviewResult;
    if (canPreviewWithoutServer(fileExt, attachment.mimeType)) {
      preview = await buildAttachmentPreview(base);
    } else if (!needsServerPreview(fileExt)) {
      preview = await buildAttachmentPreview(base);
    } else if (attachment.fileSize > BigInt(MAX_SERVER_PREVIEW_BYTES)) {
      preview = {
        ...base,
        title: attachment.originalName,
        previewKind: 'unsupported',
        viewer: 'download',
        reason: '文件超过 25MB，在线预览已限制，请下载查看。',
      };
    } else {
      const stream = await this.storage.getObject(attachment.storagePath);
      const buffer = await this.streamToBuffer(stream);
      preview = await buildAttachmentPreview({ ...base, buffer });
    }

    await this.operationLog.log({
      userId,
      module: 'attachment',
      action: 'preview',
      targetType: attachment.ownerType,
      targetId: id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return preview;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const attachment = await this.findById(id);
    await this.assertAttachmentAccess(attachment, userId, 'manage');
    await this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async findById(id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) {
      throw new NotFoundException('附件不存在');
    }
    return attachment;
  }

  private async assertAttachmentAccess(
    attachment: {
      ownerType: string;
      ownerId: string;
      projectId: string | null;
    },
    userId: string,
    action: 'view' | 'manage',
  ): Promise<void> {
    const ownerType = attachment.ownerType as AttachmentOwnerType;
    const projectId =
      attachment.projectId ??
      (await this.resolveOwnerProjectId(ownerType, attachment.ownerId));
    if (projectId) {
      await this.projectAccess.assertProjectAccess(projectId, userId);
      return;
    }
    await this.assertDomainPermission(ownerType, userId, action);
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async resolveOwnerProjectId(
    ownerType: AttachmentOwnerType,
    ownerId: string,
  ): Promise<string | undefined> {
    switch (ownerType) {
      case 'ChecklistItem': {
        const owner = await this.prisma.projectChecklistItem.findUnique({
          where: { id: ownerId },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'Retrospective': {
        const owner = await this.prisma.projectRetrospective.findUnique({
          where: { id: ownerId },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'Report': {
        const owner = await this.prisma.dailyReport.findFirst({
          where: { id: ownerId, deletedAt: null },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'KnowledgeArticle': {
        const owner = await this.prisma.knowledgeArticle.findFirst({
          where: { id: ownerId, deletedAt: null },
          select: { id: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return undefined;
      }
      case 'KnowledgeFileRevision': {
        const owner = await this.prisma.attachment.findFirst({
          where: {
            id: ownerId,
            ownerType: 'KnowledgeArticle',
            deletedAt: null,
          },
          select: { id: true, projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId ?? undefined;
      }
      case 'TrainingPlan': {
        const owner = await this.prisma.trainingPlan.findUnique({
          where: { id: ownerId },
          select: { id: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return undefined;
      }
      case 'ProjectProcessRecord': {
        const owner = await this.prisma.projectProcessRecord.findFirst({
          where: { id: ownerId, deletedAt: null },
          select: { projectId: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return owner.projectId;
      }
      case 'DocumentTemplate': {
        const owner = await this.prisma.documentTemplate.findUnique({
          where: { id: ownerId },
          select: { id: true },
        });
        if (!owner) throw new NotFoundException('附件所属业务记录不存在');
        return undefined;
      }
    }
  }

  private async validateChecklistEvidence(
    files: Express.Multer.File[],
    ownerId: string,
    captureSource?: string,
  ): Promise<void> {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id: ownerId },
      select: {
        templateItem: {
          select: {
            evidenceTypes: true,
            allowAlbum: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('附件所属业务记录不存在');
    }

    const allowedTypes = new Set(
      item.templateItem.evidenceTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (captureSource === 'album' && !item.templateItem.allowAlbum) {
      throw new BadRequestException('该检查项不允许从相册选择照片');
    }
    for (const file of files) {
      const evidenceType = file.mimetype.startsWith('image/')
        ? 'photo'
        : 'file';
      if (!allowedTypes.has(evidenceType)) {
        throw new BadRequestException(
          evidenceType === 'photo'
            ? '该检查项不接受照片证据'
            : '该检查项不接受文档证据',
        );
      }
    }
  }

  private async assertDomainPermission(
    ownerType: AttachmentOwnerType,
    userId: string,
    action: 'view' | 'manage',
  ): Promise<void> {
    const permissionMap: Partial<
      Record<AttachmentOwnerType, { view: string; manage: string }>
    > = {
      KnowledgeArticle: {
        view: 'knowledge:view',
        manage: 'knowledge:update',
      },
      KnowledgeFileRevision: {
        view: 'knowledge:view',
        manage: 'knowledge:update',
      },
      TrainingPlan: {
        view: 'training:view',
        manage: 'training:manage',
      },
      DocumentTemplate: {
        view: 'template:view',
        manage: 'template:update',
      },
    };
    const requiredPermission = permissionMap[ownerType]?.[action];
    if (!requiredPermission) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: {
          select: {
            role: {
              select: {
                roleCode: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: { permissionCode: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const roles = user?.userRoles.map(({ role }) => role.roleCode) ?? [];
    if (roles.includes('SUPER_ADMIN')) {
      return;
    }
    const permissions = new Set(
      user?.userRoles.flatMap(({ role }) =>
        role.rolePermissions.map(({ permission }) => permission.permissionCode),
      ) ?? [],
    );
    if (!permissions.has(requiredPermission)) {
      throw new ForbiddenException('没有访问该业务附件的权限');
    }
  }
}
