import { ArchiveItemStatus, PrismaClient, Prisma } from '@prisma/client';
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
      projectStatus: 'Active' as const,
      riskLevel: 'Medium' as const,
      currentStage: '04_construction',
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
      projectStatus: 'Active' as const,
      riskLevel: 'Low' as const,
      currentStage: '02_design',
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
      projectStatus: 'Draft' as const,
      riskLevel: 'Low' as const,
      currentStage: '01_presale',
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
      projectStatus: 'Active' as const,
      riskLevel: 'High' as const,
      currentStage: '05_acceptance',
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
      projectStatus: 'Suspended' as const,
      riskLevel: 'High' as const,
      currentStage: '04_construction',
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
      projectStatus: 'Active' as const,
      riskLevel: 'Medium' as const,
      currentStage: '03_procurement',
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
      projectStatus: 'Accepted' as const,
      riskLevel: 'Low' as const,
      currentStage: '06_review',
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
      projectStatus: 'Draft' as const,
      riskLevel: 'Medium' as const,
      currentStage: '01_presale',
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
      projectStatus: 'Delayed' as const,
      riskLevel: 'Critical' as const,
      currentStage: '04_construction',
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
      projectStatus: 'Archived' as const,
      riskLevel: 'Low' as const,
      currentStage: '06_review',
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

  const legacyProjectNames: Record<string, string> = {
    'VN-LG-2026-001': '越南LG冷站节能项目',
    'TH-PTT-2026-001': '泰国PTT空压节能项目',
    'SG-ESA-2026-001': '新加坡ESL项目',
    'ID-FMCS-2026-001': '印尼FMCS项目',
    'MY-CL-2026-001': '马来西亚冷站节能项目',
    'OM-JA-2026-001': '阿曼空压节能项目',
    'AE-AB-2026-001': '阿联酋FMCS项目',
    'TH-SC-2026-002': '泰国SCG ESL扩建项目',
    'VN-HN-2026-002': '越南河内冷站节能项目',
    'ID-JK-2026-002': '印尼雅加达冷站项目',
  };
  if (typeof prisma.project.updateMany === 'function') {
    for (const data of projectData) {
      await prisma.project.updateMany({
        where: {
          projectCode: data.projectCode,
          projectName: legacyProjectNames[data.projectCode],
        },
        data: { projectName: data.projectName },
      });
    }
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
    await prisma.project.update({
      where: { id: project.id },
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

    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId,
        },
      },
    });

    if (!existing) {
      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId,
          projectRole: assignment.projectRole,
        },
      });
      memberCount++;
    } else if (existing.projectRole === 'MEMBER' || assignment.projectRole === 'PROJECT_MANAGER') {
      await prisma.projectMember.update({
        where: { id: existing.id },
        data: { projectRole: assignment.projectRole },
      });
    }
  }

  console.log(`  Created ${memberCount} project members`);

  // ── Auto-generate archive items (Fix 3) ───────────────────────────
  // Create ProjectArchiveItem records from the default template's level-1 items
  console.log('  Generating archive directory items for projects...');

  const template = await prisma.archiveTemplate.findFirst({
    where: { templateCode: 'DC-ARCH-DEFAULT' },
    include: {
      items: {
        orderBy: [{ level: 'asc' }, { stageCode: 'asc' }, { sortOrder: 'asc' }],
      },
    },
  });

  if (!template) {
    console.warn('  WARNING: Default archive template not found — skipping archive generation');
  } else {
    // Role-based user assignments for archive items
    // Map of role -> userId for member lookup
    let totalArchiveItems = 0;
    const projectsForArchive = await prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, projectCode: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const project of projectsForArchive) {
      // Get project members for role mapping
      const members = await prisma.projectMember.findMany({
        where: { projectId: project.id },
        select: { userId: true, projectRole: true },
      });

      const memberRoleMap = new Map<string, string>();
      for (const m of members) {
        memberRoleMap.set(m.projectRole, m.userId);
      }

      const existingItems = await prisma.projectArchiveItem.findMany({
        where: { projectId: project.id },
        select: { id: true, templateItemId: true },
      });
      const templateIdToArchiveId = new Map(
        existingItems.map((item) => [item.templateItemId, item.id]),
      );

      for (const templateItem of template.items) {
        // Map template responsibleRole/reviewRole to actual user IDs from this project
        let responsibleUserId: string | null = null;
        let reviewUserId: string | null = null;

        if (templateItem.responsibleRole) {
          responsibleUserId = memberRoleMap.get(templateItem.responsibleRole) ?? null;
        }
        if (templateItem.reviewRole) {
          reviewUserId = memberRoleMap.get(templateItem.reviewRole) ?? null;
        }

        const archiveItemData = {
          projectId: project.id,
          templateItemId: templateItem.id,
          parentId: templateItem.parentId
            ? (templateIdToArchiveId.get(templateItem.parentId) ?? null)
            : null,
          stageCode: templateItem.stageCode,
          itemNo: templateItem.itemNo,
          level: templateItem.level,
          name: templateItem.name,
          secondName: templateItem.secondName,
          usageDescription: templateItem.usageDescription,
          isRequired: templateItem.isRequired,
          isStar: templateItem.isStar,
          isSensitive: templateItem.isSensitive,
          needReview: templateItem.needReview,
          responsibleUserId,
          reviewUserId,
          sortOrder: templateItem.sortOrder,
        } satisfies Prisma.ProjectArchiveItemUncheckedUpdateInput;

        const existing = await prisma.projectArchiveItem.findFirst({
          where: {
            projectId: project.id,
            templateItemId: templateItem.id,
          },
          select: { id: true },
        });

        if (!existing) {
          const created = await prisma.projectArchiveItem.create({
            data: {
              ...archiveItemData,
              status: ArchiveItemStatus.NotStarted,
            },
            select: { id: true },
          });
          templateIdToArchiveId.set(templateItem.id, created.id);
          totalArchiveItems++;
        } else {
          await prisma.projectArchiveItem.update({
            where: { id: existing.id },
            data: archiveItemData,
          });
          templateIdToArchiveId.set(templateItem.id, existing.id);
        }
      }
    }

    console.log(
      `  Created ${totalArchiveItems} missing archive items across ${projectsForArchive.length} projects`,
    );
  }

  console.log('Projects seeding complete.\n');

  return createdProjects;
}
