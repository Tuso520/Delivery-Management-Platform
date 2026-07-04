import { PrismaClient } from '@prisma/client';
import { seedRoles } from './seed-data/roles';
import { seedPermissions } from './seed-data/permissions';
import { seedUsers } from './seed-data/users';
import { seedCountries } from './seed-data/countries';
import { seedCurrencies } from './seed-data/currencies';
import { seedLanguages } from './seed-data/languages';
import { seedArchiveTemplates } from './seed-data/archive-templates';
import { seedChecklistTemplates } from './seed-data/checklist-templates';
import { seedWorkflows } from './seed-data/workflow';
import { seedKnowledge } from './seed-data/knowledge';
import { seedProjects } from './seed-data/projects';
import { seedPlatformData } from './seed-data/platform';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始填充种子数据...\n');

  // 1. 权限（基础数据，先建）
  console.log('[1/12] 创建权限...');
  await seedPermissions(prisma);

  // 2. 角色 + 角色-权限关联
  console.log('[2/12] 创建角色...');
  await seedRoles(prisma);

  // 3. 用户 + 用户-角色关联
  console.log('[3/12] 创建用户...');
  await seedUsers(prisma);

  // 4. 国家
  console.log('[4/12] 创建国家配置...');
  await seedCountries(prisma);

  // 5. 币种
  console.log('[5/12] 创建币种配置...');
  await seedCurrencies(prisma);

  // 6. 语言
  console.log('[6/12] 创建语言配置...');
  await seedLanguages(prisma);

  // 7. 档案模板（需要在项目之前，因为项目种子会生成档案目录项）
  console.log('[7/12] 创建档案模板...');
  await seedArchiveTemplates(prisma);

  // 8. 检查项模板
  console.log('[8/12] 创建检查项模板...');
  await seedChecklistTemplates(prisma);

  // 9. 流程标准数据
  console.log('[9/12] 创建流程标准数据...');
  await seedWorkflows(prisma);

  // 10. 知识库分类
  console.log('[10/12] 创建知识库分类...');
  await seedKnowledge(prisma);

  // 11. 项目 + 项目成员 + 档案目录自动生成
  console.log('[11/12] 创建示例项目...');
  await seedProjects(prisma);

  console.log('[12/12] 创建扩展平台数据...');
  await seedPlatformData(prisma);

  console.log('\n✅ 种子数据填充完成');
}

main()
  .catch((e) => {
    console.error('❌ 种子数据填充失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
