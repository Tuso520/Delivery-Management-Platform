import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export async function seedProjects(prisma: PrismaClient) {
  console.log('Seeding projects...');

  // ── Project data ──────────────────────────────────────────────────
  const projectData = [
    {
      projectCode: 'VN-LG-2026-001',
      projectName: '越南LG冷站节能',
      countryCode: 'VN',
      city: '海防',
      customerName: 'LG Electronics Vietnam',
      projectType: '冷站节能',
      contractCurrency: 'USD',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(850000),
      exchangeRate: new Decimal(7.12),
      convertedAmount: new Decimal(6052000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'zh-CN',
      salesOwnerId: null,
      status: 'ACTIVE',
      riskLevel: 'Medium' as const,
      currentStage: 'CONSTRUCTION',
      startDate: new Date('2026-01-15'),
      plannedEndDate: new Date('2026-09-30'),
    },
    {
      projectCode: 'TH-PTT-2026-001',
      projectName: '泰国PTT空压节能',
      countryCode: 'TH',
      city: '罗勇',
      customerName: 'PTT Public Company Limited',
      projectType: '空压节能',
      contractCurrency: 'THB',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(12000000),
      exchangeRate: new Decimal(0.2),
      convertedAmount: new Decimal(2400000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'zh-CN',
      salesOwnerId: null,
      status: 'ACTIVE',
      riskLevel: 'Low' as const,
      currentStage: 'DEEPENING',
      startDate: new Date('2026-03-01'),
      plannedEndDate: new Date('2026-11-30'),
    },
    {
      projectCode: 'SG-ESA-2026-001',
      projectName: '新加坡ESL',
      countryCode: 'SG',
      city: 'Singapore',
      customerName: 'Engie Services Asia',
      projectType: 'ESL',
      contractCurrency: 'SGD',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(450000),
      exchangeRate: new Decimal(5.3),
      convertedAmount: new Decimal(2385000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'en-US',
      salesOwnerId: null,
      status: 'DRAFT',
      riskLevel: 'Low' as const,
      currentStage: 'STARTUP',
      startDate: null,
      plannedEndDate: null,
    },
    {
      projectCode: 'ID-FMCS-2026-001',
      projectName: '印尼FMCS',
      countryCode: 'ID',
      city: '雅加达',
      customerName: 'PT FMCS Indonesia',
      projectType: 'FMCS',
      contractCurrency: 'USD',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(620000),
      exchangeRate: new Decimal(7.12),
      convertedAmount: new Decimal(4414400),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'en-US',
      salesOwnerId: null,
      status: 'ACTIVE',
      riskLevel: 'High' as const,
      currentStage: 'EXTERNAL_ACCEPTANCE',
      startDate: new Date('2025-06-01'),
      plannedEndDate: new Date('2026-06-30'),
    },
    {
      projectCode: 'MY-CL-2026-001',
      projectName: '马来西亚冷站节能',
      countryCode: 'MY',
      city: '吉隆坡',
      customerName: 'Cooling Logistics Sdn Bhd',
      projectType: '冷站节能',
      contractCurrency: 'MYR',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(950000),
      exchangeRate: new Decimal(1.6),
      convertedAmount: new Decimal(1520000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'en-US',
      salesOwnerId: null,
      status: 'PAUSED',
      riskLevel: 'High' as const,
      currentStage: 'CONSTRUCTION',
      startDate: new Date('2025-10-01'),
      plannedEndDate: new Date('2026-08-31'),
    },
    {
      projectCode: 'OM-JA-2026-001',
      projectName: '阿曼空压节能',
      countryCode: 'OM',
      city: '马斯喀特',
      customerName: 'JA Engineering LLC',
      projectType: '空压节能',
      contractCurrency: 'OMR',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(180000),
      exchangeRate: new Decimal(18.5),
      convertedAmount: new Decimal(3330000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'en-US',
      salesOwnerId: null,
      status: 'ACTIVE',
      riskLevel: 'Medium' as const,
      currentStage: 'PROCUREMENT',
      startDate: new Date('2026-02-15'),
      plannedEndDate: new Date('2026-12-31'),
    },
    {
      projectCode: 'AE-AB-2026-001',
      projectName: '阿联酋FMCS',
      countryCode: 'AE',
      city: '阿布扎比',
      customerName: 'Abu Dhabi FMCS LLC',
      projectType: 'FMCS',
      contractCurrency: 'USD',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(380000),
      exchangeRate: new Decimal(7.12),
      convertedAmount: new Decimal(2705600),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'en-US',
      salesOwnerId: null,
      status: 'COMPLETED',
      riskLevel: 'Low' as const,
      currentStage: 'WARRANTY',
      startDate: new Date('2025-01-10'),
      plannedEndDate: new Date('2026-04-30'),
      actualEndDate: new Date('2026-05-15'),
    },
    {
      projectCode: 'TH-SC-2026-002',
      projectName: '泰国SCG ESL扩建',
      countryCode: 'TH',
      city: '曼谷',
      customerName: 'SCG Cement Co Ltd',
      projectType: 'ESL',
      contractCurrency: 'THB',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(8000000),
      exchangeRate: new Decimal(0.2),
      convertedAmount: new Decimal(1600000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'th-TH',
      salesOwnerId: null,
      status: 'DRAFT',
      riskLevel: 'Medium' as const,
      currentStage: 'STARTUP',
      startDate: null,
      plannedEndDate: null,
    },
    {
      projectCode: 'VN-HN-2026-002',
      projectName: '越南河内冷站节能改造',
      countryCode: 'VN',
      city: '河内',
      customerName: 'Hanoi Cooling Solutions JSC',
      projectType: '冷站节能',
      contractCurrency: 'USD',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(1200000),
      exchangeRate: new Decimal(7.12),
      convertedAmount: new Decimal(8544000),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'vi-VN',
      salesOwnerId: null,
      status: 'ACTIVE',
      riskLevel: 'Critical' as const,
      currentStage: 'CONSTRUCTION',
      startDate: new Date('2025-08-01'),
      plannedEndDate: new Date('2026-05-31'),
    },
    {
      projectCode: 'ID-JK-2026-002',
      projectName: '印尼雅加达冷站节能',
      countryCode: 'ID',
      city: '雅加达',
      customerName: 'Jakarta Chiller Services',
      projectType: '冷站节能',
      contractCurrency: 'USD',
      baseCurrency: 'CNY',
      contractAmount: new Decimal(520000),
      exchangeRate: new Decimal(7.12),
      convertedAmount: new Decimal(3702400),
      exchangeRateDate: new Date('2026-06-22'),
      exchangeRateSource: 'seed',
      projectLanguage: 'en-US',
      salesOwnerId: null,
      status: 'COMPLETED',
      riskLevel: 'Low' as const,
      currentStage: 'WARRANTY',
      startDate: new Date('2024-06-01'),
      plannedEndDate: new Date('2025-12-31'),
      actualEndDate: new Date('2025-11-30'),
    },
  ] satisfies Prisma.ProjectCreateInput[];

  // ── Upsert each project ───────────────────────────────────────────
  const createdProjects: Array<{ id: string; projectCode: string }> = [];

  for (const data of projectData) {
    const project = await prisma.project.upsert({
      where: { projectCode: data.projectCode },
      create: data,
      update: {},
      select: { id: true, projectCode: true },
    });
    createdProjects.push(project);
    console.log(`  Project "${data.projectCode}" ready (id=${project.id})`);
  }

  // ── Lookup users by username ──────────────────────────────────────
  const userMap = new Map<string, string>();
  const availableUsers = await prisma.user.findMany({
    where: { deletedAt: null, status: 'Active' },
    select: { id: true, username: true },
  });
  for (const user of availableUsers) {
    userMap.set(user.username, user.id);
  }

  const salesOwnerAssignments: Record<string, string> = {
    'VN-LG-2026-001': 'country_chen',
    'TH-PTT-2026-001': 'country_deng',
    'SG-ESA-2026-001': 'delivery_mgr',
    'ID-FMCS-2026-001': 'country_chen',
    'MY-CL-2026-001': 'country_deng',
    'OM-JA-2026-001': 'delivery_mgr',
    'AE-AB-2026-001': 'country_chen',
    'TH-SC-2026-002': 'country_deng',
    'VN-HN-2026-002': 'country_chen',
    'ID-JK-2026-002': 'delivery_mgr',
  };

  for (const project of createdProjects) {
    const salesUsername = salesOwnerAssignments[project.projectCode];
    const salesOwnerId = salesUsername ? userMap.get(salesUsername) : undefined;
    if (!salesOwnerId) continue;
    await prisma.project.updateMany({
      where: { id: project.id, salesOwnerId: null },
      data: { salesOwnerId },
    });
  }

  // ── Member assignments per project ────────────────────────────────
  const memberAssignments: Array<{
    projectCode: string;
    username: string;
    projectRole: string;
  }> = [];

  for (const [projectCode, username] of Object.entries(salesOwnerAssignments)) {
    memberAssignments.push({
      projectCode,
      username,
      projectRole: 'SALES_OWNER',
    });
  }

  // admin is PM of ALL projects
  for (const p of createdProjects) {
    memberAssignments.push({
      projectCode: p.projectCode,
      username: 'admin',
      projectRole: 'PROJECT_MANAGER',
    });
  }

  // VN-LG-2026-001: pm_wang PM, elec_zhang ELEC, sw_chen SW
  memberAssignments.push(
    { projectCode: 'VN-LG-2026-001', username: 'pm_wang', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'VN-LG-2026-001', username: 'elec_zhang', projectRole: 'ELEC_LEADER' },
    { projectCode: 'VN-LG-2026-001', username: 'sw_chen', projectRole: 'SOFTWARE_LEADER' },
  );

  // TH-PTT-2026-001: pm_li PM
  memberAssignments.push({
    projectCode: 'TH-PTT-2026-001',
    username: 'pm_li',
    projectRole: 'PROJECT_MANAGER',
  });

  // ID-FMCS-2026-001: pm_wang PM, purchase_liu, finance_zhao
  memberAssignments.push(
    { projectCode: 'ID-FMCS-2026-001', username: 'pm_wang', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'ID-FMCS-2026-001', username: 'purchase_liu', projectRole: 'PURCHASE' },
    { projectCode: 'ID-FMCS-2026-001', username: 'finance_zhao', projectRole: 'FINANCE' },
  );

  // MY-CL-2026-001: pm_li PM, elec_zhang ELEC
  memberAssignments.push(
    { projectCode: 'MY-CL-2026-001', username: 'pm_li', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'MY-CL-2026-001', username: 'elec_zhang', projectRole: 'ELEC_LEADER' },
  );

  // OM-JA-2026-001: pm_wang PM, purchase_liu PURCHASE
  memberAssignments.push(
    { projectCode: 'OM-JA-2026-001', username: 'pm_wang', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'OM-JA-2026-001', username: 'purchase_liu', projectRole: 'PURCHASE' },
  );

  // AE-AB-2026-001: pm_li PM, sw_chen SW
  memberAssignments.push(
    { projectCode: 'AE-AB-2026-001', username: 'pm_li', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'AE-AB-2026-001', username: 'sw_chen', projectRole: 'SOFTWARE_LEADER' },
  );

  // TH-SC-2026-002: pm_wang PM
  memberAssignments.push({
    projectCode: 'TH-SC-2026-002',
    username: 'pm_wang',
    projectRole: 'PROJECT_MANAGER',
  });

  // VN-HN-2026-002: pm_li PM, elec_zhang ELEC, sw_chen SW, purchase_liu PURCHASE
  memberAssignments.push(
    { projectCode: 'VN-HN-2026-002', username: 'pm_li', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'VN-HN-2026-002', username: 'elec_zhang', projectRole: 'ELEC_LEADER' },
    { projectCode: 'VN-HN-2026-002', username: 'sw_chen', projectRole: 'SOFTWARE_LEADER' },
    { projectCode: 'VN-HN-2026-002', username: 'purchase_liu', projectRole: 'PURCHASE' },
  );

  // ID-JK-2026-002: pm_wang PM, finance_zhao FINANCE
  memberAssignments.push(
    { projectCode: 'ID-JK-2026-002', username: 'pm_wang', projectRole: 'PROJECT_MANAGER' },
    { projectCode: 'ID-JK-2026-002', username: 'finance_zhao', projectRole: 'FINANCE' },
  );

  // Distribute all internal employees across projects so project detail pages
  // contain realistic cross-functional teams.
  const staffUsers = await prisma.user.findMany({
    where: {
      username: { not: 'partner_a' },
      deletedAt: null,
      status: 'Active',
    },
    select: {
      username: true,
      userRoles: {
        select: { role: { select: { roleCode: true } } },
        take: 1,
      },
    },
    orderBy: { username: 'asc' },
  });
  const projectRoleBySystemRole: Record<string, string> = {
    SUPER_ADMIN: 'PROJECT_MANAGER',
    DELIVERY_MANAGER: 'DELIVERY_MANAGER',
    COUNTRY_MANAGER: 'COUNTRY_MANAGER',
    PROJECT_MANAGER: 'PROJECT_MANAGER',
    ELEC_LEADER: 'ELEC_LEADER',
    ELEC_ENGINEER: 'ELEC_ENGINEER',
    SOFTWARE_LEADER: 'SOFTWARE_LEADER',
    SOFTWARE_ENGINEER: 'SOFTWARE_ENGINEER',
    PURCHASE: 'PURCHASE',
    FINANCE: 'FINANCE',
    HSE: 'HSE',
    STANDARD_ADMIN: 'QUALITY_MANAGER',
  };
  for (const [projectIndex, project] of createdProjects.entries()) {
    for (const [staffIndex, staff] of staffUsers.entries()) {
      if ((staffIndex + projectIndex) % 3 !== 0) continue;
      const systemRole = staff.userRoles[0]?.role.roleCode;
      memberAssignments.push({
        projectCode: project.projectCode,
        username: staff.username,
        projectRole: (systemRole && projectRoleBySystemRole[systemRole]) || 'MEMBER',
      });
    }
  }

  // ── Create members (skip if user missing, skip duplicates) ────────
  let memberCount = 0;

  for (const assignment of memberAssignments) {
    const userId = userMap.get(assignment.username);
    if (!userId) {
      console.warn(`  Skipping member for "${assignment.username}" — user not found`);
      continue;
    }

    const project = createdProjects.find((p) => p.projectCode === assignment.projectCode);
    if (!project) {
      console.warn(`  Skipping member — project "${assignment.projectCode}" not found`);
      continue;
    }

    await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId,
        },
      },
      create: {
        projectId: project.id,
        userId,
        projectRole: assignment.projectRole,
      },
      update: { projectRole: assignment.projectRole, deletedAt: null },
    });
    memberCount++;
  }

  console.log(`  Ensured ${memberCount} project member assignments`);

  console.log('  Generating target two-level archive snapshots for seeded projects...');
  const template = await prisma.archiveTemplate.findUnique({
    where: { templateCode: 'DC-ARCH-DEFAULT' },
    select: { id: true, currentPublishedVersionId: true },
  });
  if (!template?.currentPublishedVersionId) {
    throw new Error('默认档案模板缺少已发布版本，无法生成项目档案快照');
  }
  const templateVersion = await prisma.archiveTemplateVersion.findUnique({
    where: { id: template.currentPublishedVersionId },
    include: {
      folders: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  if (!templateVersion) {
    throw new Error('默认档案模板的已发布版本不存在');
  }
  const roleIds = Array.from(
    new Set(
      templateVersion.folders.flatMap((folder) =>
        folder.items.map((item) => item.ownerRoleId).filter(Boolean),
      ),
    ),
  ) as string[];
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true, roleCode: true },
  });
  const roleCodeById = new Map(roles.map((role) => [role.id, role.roleCode]));

  for (const project of createdProjects) {
    await prisma.$transaction(
      async (tx) => {
        await tx.project.updateMany({
          where: { id: project.id, archiveTemplateId: null },
          data: { archiveTemplateId: template.id },
        });
        await tx.project.updateMany({
          where: { id: project.id, archiveTemplateVersionId: null },
          data: { archiveTemplateVersionId: templateVersion.id },
        });
        const projectSnapshot = await tx.project.findUnique({
          where: { id: project.id },
          select: { archiveTemplateId: true, archiveTemplateVersionId: true },
        });
        if (
          projectSnapshot?.archiveTemplateId !== template.id ||
          projectSnapshot.archiveTemplateVersionId !== templateVersion.id
        ) {
          return;
        }

        const members = await tx.projectMember.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: { userId: true, projectRole: true },
        });
        const memberByRoleCode = new Map(
          members.map((member) => [member.projectRole, member.userId]),
        );

        for (const templateFolder of templateVersion.folders) {
          const folder = await tx.projectArchiveFolder.upsert({
            where: {
              projectId_sourceStableKey: {
                projectId: project.id,
                sourceStableKey: templateFolder.stableKey,
              },
            },
            create: {
              projectId: project.id,
              name: templateFolder.name,
              description: templateFolder.description,
              sortOrder: templateFolder.sortOrder,
              sourceTemplateFolderId: templateFolder.id,
              sourceStableKey: templateFolder.stableKey,
            },
            update: {},
            select: { id: true },
          });

          for (const templateItem of templateFolder.items) {
            const ownerRoleCode = templateItem.ownerRoleId
              ? roleCodeById.get(templateItem.ownerRoleId)
              : undefined;
            await tx.projectArchiveEntry.upsert({
              where: {
                projectId_templateVersionId_sourceStableKey: {
                  projectId: project.id,
                  templateVersionId: templateVersion.id,
                  sourceStableKey: templateItem.stableKey,
                },
              },
              create: {
                projectId: project.id,
                folderId: folder.id,
                templateVersionId: templateVersion.id,
                sourceTemplateItemId: templateItem.id,
                sourceStableKey: templateItem.stableKey,
                name: templateItem.name,
                description: templateItem.description,
                required: templateItem.required,
                reviewRequired: templateItem.reviewRequired,
                approvalTemplateId: templateItem.approvalTemplateId,
                ownerUserId: ownerRoleCode ? (memberByRoleCode.get(ownerRoleCode) ?? null) : null,
                ownerRoleId: templateItem.ownerRoleId,
                allowMultipleFiles: templateItem.allowMultipleFiles,
                allowedExtensions:
                  templateItem.allowedExtensions === null
                    ? Prisma.JsonNull
                    : (templateItem.allowedExtensions as Prisma.InputJsonValue),
                maxFileSize: templateItem.maxFileSize,
                namingRule: templateItem.namingRule,
                sortOrder: templateItem.sortOrder,
              },
              update: {},
            });
          }
        }
      },
      {
        maxWait: 30_000,
        timeout: 600_000,
      },
    );
  }

  console.log('Projects seeding complete.\n');

  return createdProjects;
}
