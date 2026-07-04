import type { PrismaService } from '../../../database/prisma.service';
import type { ApprovalService } from '../../platform/approval.service';
import { KnowledgeService } from '../knowledge.service';

describe('KnowledgeService approval workflow', () => {
  it('submits a draft article for publishing approval', async () => {
    const prisma = {
      knowledgeArticle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'article-1',
          title: '海外现场安全手册',
          status: 'Draft',
          countryCode: 'VN',
        }),
      },
    } as unknown as PrismaService;
    const approval = {
      startBusinessApproval: jest.fn().mockResolvedValue({ id: 'task-1' }),
    } as unknown as ApprovalService;
    const service = new KnowledgeService(prisma, approval);

    await service.publishArticle('article-1', 'user-1');

    expect(approval.startBusinessApproval).toHaveBeenCalledWith({
      businessType: 'knowledge',
      businessId: 'article-1',
      businessTitle: '海外现场安全手册',
      applicantId: 'user-1',
      countryCode: 'VN',
    });
  });

  it('rejects duplicate category names under the same parent', async () => {
    const prisma = {
      knowledgeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }),
      },
    } as unknown as PrismaService;
    const approval = {} as ApprovalService;
    const service = new KnowledgeService(prisma, approval);

    await expect(
      service.createCategory({ name: '项目管理', sortOrder: 10 }),
    ).rejects.toThrow('同一层级下已存在同名知识分类');
  });
});
