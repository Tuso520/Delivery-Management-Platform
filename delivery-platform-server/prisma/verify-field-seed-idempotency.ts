import { PrismaClient } from '@prisma/client';

import { seedTargetDictionaries } from './seed-data/target-platform';

const prisma = new PrismaClient();

const expectedCounts: Record<string, number> = {
  COUNTRY: 8,
  CUSTOMER_TYPE: 7,
  CONTRACT_TYPE: 3,
  PRODUCT_TYPE: 2,
  PROJECT_KEYWORD: 16,
  CURRENCY: 8,
  PROJECT_STAGE: 9,
  PROJECT_STATUS: 5,
  STANDARD_TYPE: 8,
  STANDARD_DELIVERY_STAGE: 10,
  STANDARD_MANAGEMENT_DOMAIN: 19,
  STANDARD_BUSINESS_TYPE: 1,
  STANDARD_STATUS: 5,
  STANDARD_ENABLED_STATUS: 2,
  STANDARD_CURRENT_VERSION: 0,
  STANDARD_EFFECTIVE_DATE: 0,
  KNOWLEDGE_CATEGORY: 6,
  JOB_POSITION: 6,
  PROJECT_TYPE: 7,
  FILE_TYPE: 14,
};

async function snapshot() {
  return prisma.dictionaryCategory.findMany({
    where: { categoryCode: { in: Object.keys(expectedCounts) } },
    select: {
      categoryCode: true,
      categoryName: true,
      isSystem: true,
      items: {
        where: { isSystemDefault: true, deletedAt: null },
        select: {
          itemValue: true,
          itemLabel: true,
          itemCode: true,
          isSystemDefault: true,
          status: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { itemValue: 'asc' }],
      },
    },
    orderBy: { categoryCode: 'asc' },
  });
}

async function main(): Promise<void> {
  await seedTargetDictionaries(prisma);
  const first = await snapshot();
  await seedTargetDictionaries(prisma);
  const second = await snapshot();
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('字段初始化重复执行后数据发生变化');
  }
  if (second.length !== Object.keys(expectedCounts).length) {
    throw new Error(`字段分类数量错误：期望 ${Object.keys(expectedCounts).length}，实际 ${second.length}`);
  }
  for (const category of second) {
    const expected = expectedCounts[category.categoryCode];
    if (!category.isSystem || category.items.length !== expected) {
      throw new Error(`${category.categoryCode} 初始化错误：期望 ${expected}，实际 ${category.items.length}`);
    }
    if (category.items.some((item) => !item.isSystemDefault || item.itemCode !== item.itemValue)) {
      throw new Error(`${category.categoryCode} 缺少系统默认或稳定编码标记`);
    }
    if (
      category.categoryCode === 'STANDARD_MANAGEMENT_DOMAIN' &&
      category.items.filter((item) => item.status === 'Active').length !== 12
    ) {
      throw new Error('STANDARD_MANAGEMENT_DOMAIN 启用项必须严格为 12 项');
    }
  }
  console.log(`FIELD_SEED_IDEMPOTENT=YES categories=${second.length} values=${second.reduce((sum, category) => sum + category.items.length, 0)}`);
}

main().finally(() => prisma.$disconnect());
