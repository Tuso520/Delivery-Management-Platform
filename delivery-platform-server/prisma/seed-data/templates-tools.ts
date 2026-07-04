import { PrismaClient } from '@prisma/client';

export async function seedTemplatesAndTools(
  prisma: PrismaClient,
): Promise<void> {
  const templates = [
    ['DC-TPL-REVIEW', '项目管理复盘报告模板', 'Report', 'docx'],
    ['DC-TPL-CABLE', '电缆清册模板', 'Form', 'xlsx'],
    ['DC-TPL-WEEKLY', '海外交付人员周报模板', 'Report', 'xlsx'],
  ] as const;
  for (const [templateNo, name, category, fileFormat] of templates) {
    await prisma.documentTemplate.upsert({
      where: { templateNo },
      create: {
        templateNo,
        name,
        category,
        fileFormat,
        status: 'Published',
        publishedAt: new Date('2026-06-24T00:00:00Z'),
      },
      update: {
        status: 'Published',
        publishedAt: new Date('2026-06-24T00:00:00Z'),
      },
    });
  }

  const categoryName = '交付常用工具';
  const existingCategory = await prisma.toolCategory.findFirst({
    where: { name: categoryName },
    select: { id: true },
  });
  const category = existingCategory
    ?? await prisma.toolCategory.create({
      data: {
        name: categoryName,
        description: '项目交付过程中的常用内部工具',
      },
      select: { id: true },
    });
  const tools = [
    ['资料完整率检查', 'internal'],
    ['项目编号生成规则', 'internal'],
    ['多币种金额换算', 'internal'],
  ] as const;
  for (const [name, toolType] of tools) {
    const existing = await prisma.toolItem.findFirst({
      where: { categoryId: category.id, name },
    });
    if (!existing) {
      await prisma.toolItem.create({
        data: {
          categoryId: category.id,
          name,
          toolType,
          description: `${name}功能入口`,
        },
      });
    }
  }
}
