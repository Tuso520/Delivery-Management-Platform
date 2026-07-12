import { PrismaClient } from '@prisma/client';

import { seedArchiveTemplates } from './seed-data/archive-templates';
import { seedCountries } from './seed-data/countries';
import { seedCurrencies } from './seed-data/currencies';
import { seedLanguages } from './seed-data/languages';
import { seedPermissions } from './seed-data/permissions';
import { seedProjects } from './seed-data/projects';
import { seedRoles } from './seed-data/roles';
import { seedTargetKnowledge } from './seed-data/target-knowledge';
import { seedTargetPlatform } from './seed-data/target-platform';
import { seedTargetStandards } from './seed-data/target-standards';
import { seedUsers } from './seed-data/users';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('开始初始化目标架构种子数据...');

  console.log('[1/11] 权限');
  await seedPermissions(prisma);

  console.log('[2/11] 角色');
  await seedRoles(prisma);

  console.log('[3/11] 用户');
  await seedUsers(prisma);

  console.log('[4/11] 国家');
  await seedCountries(prisma);

  console.log('[5/11] 币种与基准汇率');
  await seedCurrencies(prisma);

  console.log('[6/11] 语言');
  await seedLanguages(prisma);

  console.log('[7/11] 目标平台配置、审核配置与工具');
  await seedTargetPlatform(prisma);

  console.log('[8/11] 两级档案模板发布版');
  await seedArchiveTemplates(prisma);

  console.log('[9/11] 统一标准库');
  await seedTargetStandards(prisma);

  console.log('[10/11] 统一知识库');
  await seedTargetKnowledge(prisma);

  console.log('[11/11] 示例项目与两级档案快照');
  await seedProjects(prisma);

  console.log('目标架构种子数据初始化完成。');
}

main()
  .catch((error: unknown) => {
    console.error('目标架构种子数据初始化失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
