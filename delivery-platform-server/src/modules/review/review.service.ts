import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { CreateReviewDto } from './dto/create-review.dto';

interface ReviewListItem {
  id: string;
  fileId: string;
  archiveItemId: string;
  reviewUserId: string;
  reviewStatus: string;
  reviewComment: string | null;
  reviewTime: Date;
  createdAt: Date;
  reviewer: {
    id: string;
    realName: string;
  };
  file: {
    id: string;
    fileName: string;
    versionNo: string;
  };
  archiveItem: {
    id: string;
    name: string;
  };
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new review record for a file.
   * Updates File status to Reviewing and ArchiveItem status to Reviewing.
   */
  async createReview(
    fileId: string,
    dto: CreateReviewDto,
    reviewerId: string,
  ): Promise<ReviewListItem> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    if (!file.archiveItemId) {
      throw new BadRequestException('文件未关联档案目录项，无法发起审核');
    }
    const archiveItemId = file.archiveItemId;

    // Data scope authorization
    await this.checkProjectAccess(file.projectId, reviewerId);

    // Use transaction to ensure all writes are atomic
    const review = await this.prisma.$transaction(async (tx) => {
      // Create review record
      const created = await tx.fileReview.create({
        data: {
          fileId,
          archiveItemId,
          reviewUserId: reviewerId,
          reviewStatus: 'Pending',
          reviewComment: dto.comment || null,
        },
        select: {
          id: true,
          fileId: true,
          archiveItemId: true,
          reviewUserId: true,
          reviewStatus: true,
          reviewComment: true,
          reviewTime: true,
          createdAt: true,
          reviewer: {
            select: { id: true, realName: true },
          },
        },
      });

      // Update file status
      await tx.file.update({
        where: { id: fileId },
        data: { fileStatus: 'Reviewing' },
      });

      // Update archive item status
      await tx.projectArchiveItem.update({
        where: { id: archiveItemId },
        data: { status: 'Reviewing' },
      });

      return created;
    });

    // Attach file and archive info
    const result: ReviewListItem = {
      ...review,
      reviewer: review.reviewer,
      file: {
        id: file.id,
        fileName: file.fileName,
        versionNo: file.versionNo,
      },
      archiveItem: {
        id: archiveItemId,
        name: '', // Filled below
      },
    };

    // Get archive item name
    const archiveItem = await this.prisma.projectArchiveItem.findUnique({
      where: { id: archiveItemId },
      select: { name: true },
    });
    if (archiveItem) {
      result.archiveItem.name = archiveItem.name;
    }

    this.logger.log(`Review created for file ${fileId}`);
    return result;
  }

  /**
   * Get review history for a file.
   */
  async findByFile(fileId: string, userId?: string): Promise<ReviewListItem[]> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, projectId: true },
    });

    if (!file) {
      return [];
    }

    // Data scope authorization
    if (userId) {
      await this.checkProjectAccess(file.projectId, userId);
    }

    const reviews = await this.prisma.fileReview.findMany({
      where: { fileId },
      select: {
        id: true,
        fileId: true,
        archiveItemId: true,
        reviewUserId: true,
        reviewStatus: true,
        reviewComment: true,
        reviewTime: true,
        createdAt: true,
        reviewer: {
          select: { id: true, realName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (reviews.length === 0) {
      return [];
    }

    // Batch collect all unique file and archive item IDs
    const fileIds = [...new Set(reviews.map((r) => r.fileId))];
    const archiveItemIds = [...new Set(reviews.map((r) => r.archiveItemId))];

    const [files, archiveItems] = await Promise.all([
      this.prisma.file.findMany({
        where: { id: { in: fileIds } },
        select: { id: true, fileName: true, versionNo: true },
      }),
      this.prisma.projectArchiveItem.findMany({
        where: { id: { in: archiveItemIds } },
        select: { id: true, name: true },
      }),
    ]);

    const fileMap = new Map(files.map((f) => [f.id, f]));
    const archiveItemMap = new Map(archiveItems.map((a) => [a.id, a]));

    return reviews.map((review) => ({
      ...review,
      file: fileMap.get(review.fileId) || { id: review.fileId, fileName: 'Unknown', versionNo: '' },
      archiveItem: archiveItemMap.get(review.archiveItemId) || { id: review.archiveItemId, name: 'Unknown' },
    }));
  }

  /**
   * Get pending reviews for a specific reviewer.
   */
  async findPending(userId: string): Promise<ReviewListItem[]> {
    // Find reviews that are pending for this reviewer
    const reviews = await this.prisma.fileReview.findMany({
      where: {
        reviewUserId: userId,
        reviewStatus: 'Pending',
      },
      select: {
        id: true,
        fileId: true,
        archiveItemId: true,
        reviewUserId: true,
        reviewStatus: true,
        reviewComment: true,
        reviewTime: true,
        createdAt: true,
        reviewer: {
          select: { id: true, realName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (reviews.length === 0) {
      return [];
    }

    // Batch collect all unique file and archive item IDs
    const fileIds = [...new Set(reviews.map((r) => r.fileId))];
    const archiveItemIds = [...new Set(reviews.map((r) => r.archiveItemId))];

    const [files, archiveItems] = await Promise.all([
      this.prisma.file.findMany({
        where: { id: { in: fileIds }, deletedAt: null },
        select: { id: true, fileName: true, versionNo: true },
      }),
      this.prisma.projectArchiveItem.findMany({
        where: { id: { in: archiveItemIds } },
        select: { id: true, name: true },
      }),
    ]);

    const fileMap = new Map(files.map((f) => [f.id, f]));
    const archiveItemMap = new Map(archiveItems.map((a) => [a.id, a]));

    return reviews.map((review) => ({
      ...review,
      file: fileMap.get(review.fileId) || { id: review.fileId, fileName: '已删除文件', versionNo: '' },
      archiveItem: archiveItemMap.get(review.archiveItemId) || { id: review.archiveItemId, name: 'Unknown' },
    }));
  }

  /**
   * Approve a file review.
   */
  async approve(
    fileId: string,
    comment: string | undefined,
    reviewerId: string,
  ): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    // Data scope authorization
    await this.checkProjectAccess(file.projectId, reviewerId);

    // Update the latest pending review
    const pendingReview = await this.prisma.fileReview.findFirst({
      where: { fileId, reviewUserId: reviewerId, reviewStatus: 'Pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingReview) {
      throw new BadRequestException('没有待审核的记录');
    }

    // Use transaction to update review record, file status, and archive item status atomically
    await this.prisma.$transaction(async (tx) => {
      // Update review record
      await tx.fileReview.update({
        where: { id: pendingReview.id },
        data: {
          reviewStatus: 'Approved',
          reviewComment: comment || null,
          reviewTime: new Date(),
        },
      });

      // Update file status
      await tx.file.update({
        where: { id: fileId },
        data: { fileStatus: 'Approved' },
      });

      // Update archive item status
      if (file.archiveItemId) {
        await tx.projectArchiveItem.update({
          where: { id: file.archiveItemId },
          data: { status: 'Approved' },
        });
      }
    });

    this.logger.log(`File ${fileId} approved by ${reviewerId}`);
  }

  /**
   * Reject a file review.
   */
  async reject(
    fileId: string,
    comment: string | undefined,
    reviewerId: string,
  ): Promise<void> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    // Data scope authorization
    await this.checkProjectAccess(file.projectId, reviewerId);

    const pendingReview = await this.prisma.fileReview.findFirst({
      where: { fileId, reviewUserId: reviewerId, reviewStatus: 'Pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingReview) {
      throw new BadRequestException('没有待审核的记录');
    }

    // Use transaction to update review record, file status, and archive item status atomically
    await this.prisma.$transaction(async (tx) => {
      // Update review record
      await tx.fileReview.update({
        where: { id: pendingReview.id },
        data: {
          reviewStatus: 'Rejected',
          reviewComment: comment || null,
          reviewTime: new Date(),
        },
      });

      // Update file status
      await tx.file.update({
        where: { id: fileId },
        data: { fileStatus: 'Rejected' },
      });

      // Update archive item status
      if (file.archiveItemId) {
        await tx.projectArchiveItem.update({
          where: { id: file.archiveItemId },
          data: { status: 'Rejected' },
        });
      }
    });

    this.logger.log(`File ${fileId} rejected by ${reviewerId}`);
  }

  /**
   * Check if a user has access to a project through its project.
   * Elevated roles (SUPER_ADMIN, SYSTEM_ADMIN, DELIVERY_MANAGER) bypass the check.
   * Other users must be a member of the project.
   */
  private async checkProjectAccess(projectId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    const roles = user?.userRoles.map((ur) => ur.role.roleCode) ?? [];
    const isElevated = roles.some((r) =>
      ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER'].includes(r),
    );

    if (isElevated) {
      return;
    }

    const isMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!isMember) {
      throw new ForbiddenException('没有访问该项目的权限');
    }
  }
}
