import { PrismaClient } from '@prisma/client';

import { seedTargetDictionaries } from './seed-data/target-platform';

const prisma = new PrismaClient();

const expectedCounts: Record<string, number> = {
  COUNTRY: 7,
  CUSTOMER_TYPE: 7,
  CONTRACT_TYPE: 3,
  PRODUCT_TYPE: 2,
  PROJECT_KEYWORD: 16,
  CURRENCY: 7,
  PROJECT_STAGE: 9,
  PROJECT_STATUS: 2,
  STANDARD_CATEGORY: 7,
  KNOWLEDGE_CATEGORY: 6,
  JOB_POSITION: 4,
  PROJECT_TYPE: 7,
};

async function snapshot() {
  return prisma.dictionaryCategory.findMany({
    where: { categoryCode: { in: Object.keys(expectedCounts) } },
    select: {
      categoryCode: true,
      categoryName: true,
      isSystem: true,
      items: {
        select: { itemValue: true, itemLabel: true, itemCode: true, isSystemDefault: true },
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
    throw new Error(`字段分类数量错误：期望 12，实际 ${second.length}`);
  }
  for (const category of second) {
    const expected = expectedCounts[category.categoryCode];
    if (!category.isSystem || category.items.length !== expected) {
      throw new Error(`${category.categoryCode} 初始化错误：期望 ${expected}，实际 ${category.items.length}`);
    }
    if (category.items.some((item) => !item.isSystemDefault || item.itemCode !== item.itemValue)) {
      throw new Error(`${category.categoryCode} 缺少系统默认或稳定编码标记`);
    }
  }
  console.log(`FIELD_SEED_IDEMPOTENT=YES categories=${second.length} values=${second.reduce((sum, category) => sum + category.items.length, 0)}`);
}

main().finally(() => prisma.$disconnect());
