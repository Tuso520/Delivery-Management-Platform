import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FileStatus, PrismaClient } from '@prisma/client';
import { Client } from 'minio';

interface StorageContext {
  client: Client;
  bucket: string;
}

interface SampleCatalog {
  sampleDir: string;
  byExt: Map<string, string>;
  names: string[];
}

export async function seedDemoCoverage(prisma: PrismaClient): Promise<void> {
  console.log('Seeding demo coverage data for all visible lists...');

  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  if (!admin) {
    console.warn('  Admin user not found, skipping demo coverage data');
    return;
  }

  await seedReferenceCoverage(prisma);
  await seedToolCoverage(prisma);
  await seedChecklistTemplateCoverage(prisma);
  await seedArchiveTemplateCoverage(prisma, admin.id);

  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, status: 'Active' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, projectCode: true, contractCurrency: true, baseCurrency: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ]);

  if (!users.length || !projects.length) {
    console.warn('  Users or projects missing, skipping project-scoped demo coverage');
    return;
  }

  const samples = await loadSampleCatalog();
  const storage = createMinioClient();
  if (storage) {
    await ensureBucket(storage.client, storage.bucket);
  }

  await seedProjectProcessAndPayments(prisma, admin.id, projects);
  await seedProjectFilesAndReviews(prisma, storage, samples, admin.id, users, projects);
  await normalizeArchiveFileRemarks(prisma);
  await seedApprovalAndNotificationCoverage(prisma, admin.id, users, projects);
  await seedNotificationInboxCoverage(prisma, users, projects);
  await seedBusinessListCoverage(prisma, admin.id, users, projects);
  await seedTemplateAttachmentsAndHeat(prisma, storage, samples, admin.id);
  await seedKnowledgeRemarksAndHeat(prisma, admin.id);
  await seedKnowledgeFileUpdateApprovalCoverage(prisma, storage, samples, admin.id);

  console.log('Demo coverage data seeding complete.');
}

async function seedToolCoverage(prisma: PrismaClient): Promise<void> {
  const categories = [
    {
      name: '风险与问题闭环',
      description: '用于交付风险识别、问题跟踪、整改复核和经验沉淀。',
      sortOrder: 70,
      tools: [
        ['风险登记台账', 'internal', '记录风险来源、等级、责任人、应对动作和关闭时间。', 'AlertCircle', undefined],
        ['问题闭环看板', 'internal', '按项目、责任人和状态追踪问题整改进度。', 'CheckCircle', undefined],
      ],
    },
    {
      name: '客户沟通与会议',
      description: '用于客户会议、纪要、往来函件和跨文化沟通场景。',
      sortOrder: 80,
      tools: [
        ['会议纪要生成器', 'internal', '按议题、决议、责任人和完成日期生成会议纪要。', 'FileText', undefined],
        ['Zoom 会议入口', 'external', '打开远程会议平台，便于海外项目沟通。', 'Link', 'https://zoom.us/'],
      ],
    },
    {
      name: '远程交付支持',
      description: '用于远程连接、网络诊断、截图取证和文件协作。',
      sortOrder: 90,
      tools: [
        ['远程连接检查清单', 'internal', '检查 VPN、堡垒机、账号权限、远程桌面和审计记录。', 'Monitor', undefined],
        ['AnyDesk 远程入口', 'external', '打开远程协助工具官网，用于现场联调支持。', 'Link', 'https://anydesk.com/'],
      ],
    },
  ] as const;

  for (const category of categories) {
    const existingCategory = await prisma.toolCategory.findFirst({
      where: { name: category.name },
      select: { id: true },
    });
    const savedCategory = existingCategory
      ? await prisma.toolCategory.update({
          where: { id: existingCategory.id },
          data: {
            description: category.description,
            sortOrder: category.sortOrder,
            status: 'Active',
          },
          select: { id: true },
        })
      : await prisma.toolCategory.create({
          data: {
            name: category.name,
            description: category.description,
            sortOrder: category.sortOrder,
            status: 'Active',
          },
          select: { id: true },
        });

    for (const [name, toolType, description, icon, url] of category.tools) {
      const existingTool = await prisma.toolItem.findFirst({
        where: { categoryId: savedCategory.id, name },
        select: { id: true },
      });
      const data = {
        categoryId: savedCategory.id,
        name,
        description,
        toolType,
        url,
        icon,
        sortOrder: 10,
        status: 'Active',
      };
      if (existingTool) {
        await prisma.toolItem.update({ where: { id: existingTool.id }, data });
      } else {
        await prisma.toolItem.create({ data });
      }
    }
  }
}

async function seedReferenceCoverage(prisma: PrismaClient): Promise<void> {
  const extraCountries = [
    ['PH', '菲律宾', 'Philippines', 'en-US', 'PHP', 'Asia/Manila'],
    ['IN', '印度', 'India', 'en-US', 'INR', 'Asia/Kolkata'],
    ['JP', '日本', 'Japan', 'ja-JP', 'JPY', 'Asia/Tokyo'],
    ['KR', '韩国', 'Korea', 'ko-KR', 'KRW', 'Asia/Seoul'],
  ] as const;

  for (const [countryCode, nameZh, nameEn, defaultLanguage, defaultCurrency, timezone] of extraCountries) {
    await prisma.country.upsert({
      where: { countryCode },
      create: {
        countryCode,
        nameZh,
        nameEn,
        defaultLanguage,
        defaultCurrency,
        timezone,
        weekendRule: 'Saturday-Sunday',
        entryRequirements: '按项目所在地签证与入场要求执行。',
        safetyNotes: '出行前完成安全风险确认。',
        taxNotes: null,
        paymentNotes: '回款资料按合同币种与当地银行规则复核。',
        supplierNotes: null,
        status: 'Active',
      },
      update: {
        nameZh,
        nameEn,
        defaultLanguage,
        defaultCurrency,
        timezone,
        status: 'Active',
      },
    });
  }

  const extraLanguages = [
    ['ja-JP', '日本語'],
    ['ko-KR', '한국어'],
    ['hi-IN', 'Hindi'],
    ['pt-BR', 'Português'],
  ] as const;

  for (const [languageCode, languageName] of extraLanguages) {
    await prisma.language.upsert({
      where: { languageCode },
      create: { languageCode, languageName, status: 'Active' },
      update: { languageName, status: 'Active' },
    });
  }
}

async function seedChecklistTemplateCoverage(prisma: PrismaClient): Promise<void> {
  const stages = ['01_sale', '02_design', '03_procurement', '04_construction', '05_acceptance', '06_review'];
  for (let index = 1; index <= 10; index += 1) {
    const template = await prisma.checklistTemplate.upsert({
      where: { templateCode: `DC-CHK-DEMO-${pad(index)}` },
      create: {
        templateCode: `DC-CHK-DEMO-${pad(index)}`,
        templateName: `交付检查模板-${pad(index)}`,
        countryCode: null,
        projectType: index % 2 === 0 ? '软件工程' : '电气工程',
        stageCode: stages[(index - 1) % stages.length],
        version: 'V1.0',
        status: 'Active',
      },
      update: {
        templateName: `交付检查模板-${pad(index)}`,
        projectType: index % 2 === 0 ? '软件工程' : '电气工程',
        stageCode: stages[(index - 1) % stages.length],
        status: 'Active',
      },
      select: { id: true },
    });

    for (let itemIndex = 1; itemIndex <= 3; itemIndex += 1) {
      const itemName = `检查项-${pad(index)}-${itemIndex}`;
      const existing = await prisma.checklistTemplateItem.findFirst({
        where: { templateId: template.id, itemName },
        select: { id: true },
      });
      const data = {
        templateId: template.id,
        itemName,
        itemDescription: '用于演示检查模板列表、检查项详情和项目检查生成流程。',
        checkStandard: '资料齐全、责任人明确、检查结果可追溯。',
        evidenceRequired: '现场照片、交付文档或签字记录。',
        isRequired: itemIndex !== 3,
        riskLevel: itemIndex === 1 ? 'High' : itemIndex === 2 ? 'Medium' : 'Low',
        responsibleRole: itemIndex === 1 ? 'PROJECT_MANAGER' : 'ENGINEER',
        reviewRole: 'DELIVERY_MANAGER',
        evidenceTypes: 'photo,file',
        minEvidenceCount: itemIndex === 1 ? 2 : 1,
        allowAlbum: true,
        requireLocation: itemIndex === 1,
        sortOrder: itemIndex * 10,
      };
      if (existing) {
        await prisma.checklistTemplateItem.update({ where: { id: existing.id }, data });
      } else {
        await prisma.checklistTemplateItem.create({ data });
      }
    }
  }
}

async function seedArchiveTemplateCoverage(prisma: PrismaClient, adminId: string): Promise<void> {
  const stages = ['01_sale', '02_design', '03_procurement', '04_construction', '05_acceptance', '06_review'];
  for (let index = 1; index <= 10; index += 1) {
    const template = await prisma.archiveTemplate.upsert({
      where: { templateCode: `DC-ARCH-DEMO-${pad(index)}` },
      create: {
        templateCode: `DC-ARCH-DEMO-${pad(index)}`,
        templateName: `交付档案模板-${pad(index)}`,
        projectType: index % 2 === 0 ? '软件工程' : '电气工程',
        countryCode: null,
        languageCode: 'zh-CN',
        version: 'V1.0',
        status: 'Active',
        description: '用于演示档案模板列表、目录项详情和项目档案生成。',
        createdBy: adminId,
      },
      update: {
        templateName: `交付档案模板-${pad(index)}`,
        projectType: index % 2 === 0 ? '软件工程' : '电气工程',
        status: 'Active',
        description: '用于演示档案模板列表、目录项详情和项目档案生成。',
      },
      select: { id: true },
    });

    for (let itemIndex = 1; itemIndex <= 4; itemIndex += 1) {
      const name = `档案目录-${pad(index)}-${itemIndex}`;
      const existing = await prisma.archiveTemplateItem.findFirst({
        where: { templateId: template.id, name },
        select: { id: true },
      });
      const data = {
        templateId: template.id,
        stageCode: stages[(index + itemIndex - 2) % stages.length],
        itemNo: index * 100 + itemIndex,
        level: 1,
        name,
        secondName: `二级说明-${itemIndex}`,
        usageDescription: '用于沉淀交付过程资料，支持上传、审核和归档。',
        isRequired: itemIndex !== 4,
        isStar: itemIndex === 1,
        isSensitive: itemIndex === 2,
        needReview: itemIndex <= 2,
        responsibleRole: 'PROJECT_MANAGER',
        reviewRole: 'DELIVERY_MANAGER',
        allowedFileTypes: 'pdf,doc,docx,xls,xlsx,png,jpg',
        sortOrder: itemIndex * 10,
      };
      if (existing) {
        await prisma.archiveTemplateItem.update({ where: { id: existing.id }, data });
      } else {
        await prisma.archiveTemplateItem.create({ data });
      }
    }
  }
}

async function seedProjectProcessAndPayments(
  prisma: PrismaClient,
  adminId: string,
  projects: Array<{ id: string; projectCode: string; contractCurrency: string | null; baseCurrency: string | null }>,
): Promise<void> {
  const recordTypes = ['Progress', 'Issue', 'Milestone', 'Risk'];
  for (let index = 0; index < 10; index += 1) {
    const project = projects[index % projects.length];
    const title = `交付过程记录-${pad(index + 1)}`;
    const existingRecord = await prisma.projectProcessRecord.findFirst({
      where: { projectId: project.id, title, deletedAt: null },
      select: { id: true },
    });
    const recordData = {
      projectId: project.id,
      title,
      recordType: recordTypes[index % recordTypes.length],
      stageCode: ['Initiation', 'Design', 'Construction', 'Acceptance'][index % 4],
      recordDate: new Date(Date.UTC(2026, 6, index + 1)),
      description: `项目 ${project.projectCode} 的过程跟踪演示记录，包含进度、风险和责任闭环。`,
      status: index % 3 === 0 ? 'Closed' : 'Recorded',
      createdBy: adminId,
    };
    if (existingRecord) {
      await prisma.projectProcessRecord.update({ where: { id: existingRecord.id }, data: recordData });
    } else {
      await prisma.projectProcessRecord.create({ data: recordData });
    }

    const paymentName = `回款节点-${pad(index + 1)}`;
    const existingPayment = await prisma.projectPayment.findFirst({
      where: { projectId: project.id, paymentName, deletedAt: null },
      select: { id: true },
    });
    const amount = 50000 + index * 7500;
    const received = index % 3 === 0 ? amount : Math.round(amount * 0.4);
    const paymentData = {
      projectId: project.id,
      paymentName,
      paymentType: index % 2 === 0 ? 'Milestone' : 'Progress',
      dueDate: new Date(Date.UTC(2026, 6, index + 10)),
      receivedDate: index % 3 === 0 ? new Date(Date.UTC(2026, 6, index + 12)) : null,
      status: index % 3 === 0 ? 'Received' : index % 3 === 1 ? 'Planned' : 'Overdue',
      originalAmount: String(amount),
      originalCurrency: project.contractCurrency || 'USD',
      exchangeRate: '7.20000000',
      convertedCurrency: project.baseCurrency || 'CNY',
      convertedAmount: String(amount * 7.2),
      receivedOriginalAmount: String(received),
      receivedConvertedAmount: String(received * 7.2),
      rateDate: new Date(Date.UTC(2026, 6, 1)),
      rateSource: 'Demo',
      remark: '用于数据看板与项目回款列表演示。',
      createdBy: adminId,
    };
    if (existingPayment) {
      await prisma.projectPayment.update({ where: { id: existingPayment.id }, data: paymentData });
    } else {
      await prisma.projectPayment.create({ data: paymentData });
    }
  }
}

async function seedProjectFilesAndReviews(
  prisma: PrismaClient,
  storage: StorageContext | undefined,
  samples: SampleCatalog,
  adminId: string,
  users: Array<{ id: string }>,
  projects: Array<{ id: string; projectCode: string }>,
): Promise<void> {
  const archiveItems = await prisma.projectArchiveItem.findMany({
    where: { projectId: { in: projects.map((project) => project.id) } },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      stageCode: true,
      itemNo: true,
      name: true,
      secondName: true,
      usageDescription: true,
    },
    orderBy: [{ projectId: 'asc' }, { stageCode: 'asc' }, { sortOrder: 'asc' }, { itemNo: 'asc' }],
  });
  if (!archiveItems.length) return;

  const parentIds = new Set(archiveItems.map((item) => item.parentId).filter(Boolean) as string[]);
  const leafItems = archiveItems.filter((item) => !parentIds.has(item.id));
  const itemsByProject = new Map<string, typeof leafItems>();
  for (const item of leafItems) {
    const current = itemsByProject.get(item.projectId) ?? [];
    current.push(item);
    itemsByProject.set(item.projectId, current);
  }

  const preferredExts = ['docx', 'xlsx', 'pptx', 'pdf', 'png', 'docx', 'xlsx', 'pdf', 'pptx', 'docx'];
  const targetFileCountPerProject = 10;
  let globalIndex = 0;

  for (const project of projects) {
    const projectItems = itemsByProject.get(project.id) ?? [];
    if (!projectItems.length) continue;

    const selectedItems: typeof projectItems = [];
    const usedItemIds = new Set<string>();
    for (const stageCode of PROJECT_STAGE_CODES) {
      const stageItem = projectItems.find((item) => item.stageCode === stageCode && !usedItemIds.has(item.id));
      if (stageItem) {
        selectedItems.push(stageItem);
        usedItemIds.add(stageItem.id);
      }
    }
    for (const item of projectItems) {
      if (selectedItems.length >= targetFileCountPerProject) break;
      if (!usedItemIds.has(item.id)) {
        selectedItems.push(item);
        usedItemIds.add(item.id);
      }
    }

    for (const [index, archiveItem] of selectedItems.entries()) {
      const sampleName = selectSample(samples, preferredExts[index % preferredExts.length]);
      const sampleExt = fileExt(sampleName);
      const buffer = await readFile(join(samples.sampleDir, sampleName));
      const stageName = projectStageName(archiveItem.stageCode);
      const itemName = archiveItem.secondName || archiveItem.name;
      const originalName = `${project.projectCode}-${stageName}-${itemName}-示例${pad(index + 1)}.${sampleExt}`;
      const storagePath = `files/${project.id}/archive-demo-${archiveItem.id}-${sanitizeObjectName(originalName)}`;

      if (storage) {
        await storage.client.putObject(storage.bucket, storagePath, buffer, buffer.length, {
          'Content-Type': mimeTypeFor(originalName),
        });
      }

      const existingFile = await prisma.file.findFirst({
        where: { projectId: project.id, archiveItemId: archiveItem.id, originalName, deletedAt: null },
        select: { id: true },
      });
      const fileStatus = (globalIndex % 4 === 0 ? FileStatus.Reviewing : FileStatus.Approved) as FileStatus;
      const fileData = {
        project: { connect: { id: project.id } },
        archiveItem: { connect: { id: archiveItem.id } },
        fileName: originalName,
        originalName,
        fileExt: sampleExt,
        fileSize: BigInt(buffer.length),
        mimeType: mimeTypeFor(originalName),
        storageProvider: 'minio',
        storageBucket: storage?.bucket ?? 'delivery-platform',
        storagePath,
        versionNo: 'V1.0',
        isCurrent: true,
        fileStatus,
        uploadUser: { connect: { id: adminId } },
        remark: `示例档案：${project.projectCode} / ${stageName} / ${itemName}。上传人员应补充正式版本、签字扫描件或现场记录，审批通过后用于项目档案查阅。`,
      };
      const file = existingFile
        ? await prisma.file.update({ where: { id: existingFile.id }, data: fileData, select: { id: true } })
        : await prisma.file.create({ data: fileData, select: { id: true } });

      await prisma.projectArchiveItem.update({
        where: { id: archiveItem.id },
        data: {
          status: fileStatus === FileStatus.Approved ? 'Approved' : 'Reviewing',
          completedAt: fileStatus === FileStatus.Approved ? new Date() : null,
        },
      });

      const reviewUserId = users[(globalIndex + 1) % users.length].id;
      const existingReview = await prisma.fileReview.findFirst({
        where: { fileId: file.id, reviewUserId },
        select: { id: true },
      });
      const reviewData = {
        fileId: file.id,
        archiveItemId: archiveItem.id,
        reviewUserId,
        reviewStatus: fileStatus === FileStatus.Approved ? 'Approved' : 'Pending',
        reviewComment: fileStatus === FileStatus.Approved
          ? '资料内容完整，已完成示例审批。'
          : '待复核文件完整性、签字页和版本号。',
      };
      if (existingReview) {
        await prisma.fileReview.update({ where: { id: existingReview.id }, data: reviewData });
      } else {
        await prisma.fileReview.create({ data: reviewData });
      }

      globalIndex += 1;
    }
  }
}

async function seedApprovalAndNotificationCoverage(
  prisma: PrismaClient,
  adminId: string,
  users: Array<{ id: string }>,
  projects: Array<{ id: string; projectCode: string }>,
): Promise<void> {
  for (let index = 1; index <= 10; index += 1) {
    const template = await prisma.approvalTemplate.upsert({
      where: { templateCode: `DEMO_APPROVAL_${pad(index)}` },
      create: {
        templateCode: `DEMO_APPROVAL_${pad(index)}`,
        templateName: `演示审批流程-${pad(index)}`,
        businessType: `demo-approval-${pad(index)}`,
        isEnabled: true,
      },
      update: {
        templateName: `演示审批流程-${pad(index)}`,
        businessType: `demo-approval-${pad(index)}`,
        isEnabled: true,
      },
      select: { id: true, businessType: true },
    });
    await prisma.approvalStep.upsert({
      where: { templateId_stepOrder: { templateId: template.id, stepOrder: 1 } },
      create: {
        templateId: template.id,
        stepOrder: 1,
        stepName: '负责人审批',
        approverType: 'user',
        approverValue: adminId,
      },
      update: {
        stepName: '负责人审批',
        approverType: 'user',
        approverValue: adminId,
      },
    });

    const project = projects[(index - 1) % projects.length];
    const businessTitle = `演示审批任务-${pad(index)}-${project.projectCode}`;
    const existingTask = await prisma.approvalTask.findFirst({
      where: { businessType: template.businessType, businessTitle },
      select: { id: true },
    });
    const status = index % 3 === 0 ? 'Approved' : index % 3 === 1 ? 'Pending' : 'Rejected';
    const taskData = {
      templateId: template.id,
      businessType: template.businessType,
      businessId: project.id,
      businessTitle,
      applicantId: users[(index - 1) % users.length].id,
      currentStep: 1,
      approverId: adminId,
      status,
      comment: status === 'Pending' ? null : '演示审批链路已处理。',
      decidedAt: status === 'Pending' ? null : new Date(Date.UTC(2026, 6, index)),
    };
    if (existingTask) {
      await prisma.approvalTask.update({ where: { id: existingTask.id }, data: taskData });
    } else {
      await prisma.approvalTask.create({ data: taskData });
    }

    const title = `平台提醒-${pad(index)}`;
    const existingNotification = await prisma.notification.findFirst({
      where: { userId: users[(index - 1) % users.length].id, title },
      select: { id: true },
    });
    const notificationData = {
      userId: users[(index - 1) % users.length].id,
      title,
      content: `项目 ${project.projectCode} 有一条待关注事项，请进入对应模块查看。`,
      notificationType: index % 2 === 0 ? 'approval_pending' : 'project_progress',
      relatedType: 'Project',
      relatedId: project.id,
      isRead: index % 4 === 0,
      readAt: index % 4 === 0 ? new Date(Date.UTC(2026, 6, index)) : null,
    };
    if (existingNotification) {
      await prisma.notification.update({ where: { id: existingNotification.id }, data: notificationData });
    } else {
      await prisma.notification.create({ data: notificationData });
    }

    const eventType = `demo_event_${pad(index)}`;
    const existingRule = await prisma.notificationRule.findFirst({
      where: { eventType, channel: 'in_app', deletedAt: null },
      select: { id: true },
    });
    const ruleData = {
      name: `演示通知规则-${pad(index)}`,
      eventType,
      channel: 'in_app',
      recipientRole: index % 2 === 0 ? 'PROJECT_MANAGER' : 'DELIVERY_MANAGER',
      template: '【{{title}}】{{content}}',
      isEnabled: true,
      deletedAt: null,
    };
    if (existingRule) {
      await prisma.notificationRule.update({ where: { id: existingRule.id }, data: ruleData });
    } else {
      await prisma.notificationRule.create({ data: ruleData });
    }
  }
}

async function seedNotificationInboxCoverage(
  prisma: PrismaClient,
  users: Array<{ id: string }>,
  projects: Array<{ id: string; projectCode: string }>,
): Promise<void> {
  const notificationTypes = [
    'approval_pending',
    'project_progress',
    'payment_reminder',
    'file_review',
    'risk_warning',
  ];

  for (const user of users) {
    for (let index = 1; index <= 10; index += 1) {
      const project = projects[(index - 1) % projects.length];
      const title = `演示收件箱提醒-${pad(index)}`;
      const existingNotification = await prisma.notification.findFirst({
        where: { userId: user.id, title },
        select: { id: true },
      });
      const notificationData = {
        userId: user.id,
        title,
        content: `项目 ${project.projectCode} 的交付事项已更新，请按岗位职责完成查看或处理。`,
        notificationType: notificationTypes[(index - 1) % notificationTypes.length],
        relatedType: 'Project',
        relatedId: project.id,
        isRead: index % 3 === 0,
        readAt: index % 3 === 0 ? new Date(Date.UTC(2026, 6, index)) : null,
      };
      if (existingNotification) {
        await prisma.notification.update({
          where: { id: existingNotification.id },
          data: notificationData,
        });
      } else {
        await prisma.notification.create({ data: notificationData });
      }
    }
  }
}

async function seedBusinessListCoverage(
  prisma: PrismaClient,
  adminId: string,
  users: Array<{ id: string }>,
  projects: Array<{ id: string; projectCode: string }>,
): Promise<void> {
  for (let index = 1; index <= 10; index += 1) {
    const provider = `demo-provider-${pad(index)}`;
    const configName = `演示集成配置-${pad(index)}`;
    const existingIntegration = await prisma.integrationConfig.findFirst({
      where: { provider, configName },
      select: { id: true },
    });
    const integrationData = {
      provider,
      configName,
      configValue: { endpoint: `https://example.com/delivery/${pad(index)}`, mode: 'demo' },
      isEnabled: index % 2 === 0,
      description: '用于系统集成配置列表演示。',
    };
    if (existingIntegration) {
      await prisma.integrationConfig.update({ where: { id: existingIntegration.id }, data: integrationData });
    } else {
      await prisma.integrationConfig.create({ data: integrationData });
    }

    const storagePath = `/backup/demo/delivery-platform-${pad(index)}.zip`;
    const existingBackup = await prisma.backupRecord.findFirst({
      where: { storagePath },
      select: { id: true },
    });
    const backupData = {
      backupType: index % 2 === 0 ? 'Full' : 'Database',
      status: index % 4 === 0 ? 'Failed' : 'Completed',
      storagePath,
      fileSize: BigInt(1024 * 1024 * (index + 2)),
      requestedBy: adminId,
      startedAt: new Date(Date.UTC(2026, 6, index, 1)),
      completedAt: index % 4 === 0 ? null : new Date(Date.UTC(2026, 6, index, 1, 8)),
      errorMessage: index % 4 === 0 ? '演示失败记录：远程存储不可用。' : null,
    };
    if (existingBackup) {
      await prisma.backupRecord.update({ where: { id: existingBackup.id }, data: backupData });
    } else {
      await prisma.backupRecord.create({ data: backupData });
    }

    const project = projects[(index - 1) % projects.length];
    const authorId = users[(index - 1) % users.length].id;
    const reportDate = new Date(Date.UTC(2026, 6, index));
    const existingReport = await prisma.dailyReport.findFirst({
      where: { projectId: project.id, authorId, reportType: 'daily', reportDate, deletedAt: null },
      select: { id: true },
    });
    const reportData = {
      projectId: project.id,
      authorId,
      reportType: 'daily',
      reportDate,
      content: `项目 ${project.projectCode} 当日完成计划跟踪、资料复核与风险闭环。`,
      workHours: '8.0',
      projectProgress: '按计划推进，关键节点已更新。',
      paymentProgress: '回款资料已同步财务复核。',
      riskNotes: index % 3 === 0 ? '现场签证资料需补充。' : '暂无重大风险。',
      nextPlan: '继续推进资料上传、客户沟通与问题关闭。',
      status: index % 3 === 0 ? 'Submitted' : 'Reviewed',
      reviewedBy: adminId,
      reviewedAt: new Date(Date.UTC(2026, 6, index, 9)),
    };
    if (existingReport) {
      await prisma.dailyReport.update({ where: { id: existingReport.id }, data: reportData });
    } else {
      await prisma.dailyReport.create({ data: reportData });
    }

    const ownerId = users[(index - 1) % users.length].id;
    const objectiveTitle = `季度交付目标-${pad(index)}`;
    const existingObjective = await prisma.okrObjective.findFirst({
      where: { ownerId, title: objectiveTitle, period: '2026-Q3' },
      select: { id: true },
    });
    const objectiveData = {
      title: objectiveTitle,
      description: '覆盖交付质量、资料完整率、回款节点和客户满意度。',
      period: '2026-Q3',
      periodType: 'quarterly',
      ownerId,
      weight: 100,
      progress: Math.min(95, 40 + index * 5),
      goalType: 'OKR',
      scoringFlow: 'Manager',
      scoringMethod: 'Weighted',
      scorerIds: [adminId],
      scoringContent: { quality: 40, schedule: 30, payment: 30 },
      calculationRule: '按关键结果加权计算。',
      status: 'Active',
    };
    const objective = existingObjective
      ? await prisma.okrObjective.update({ where: { id: existingObjective.id }, data: objectiveData, select: { id: true } })
      : await prisma.okrObjective.create({ data: objectiveData, select: { id: true } });

    const keyResultTitle = `关键结果-${pad(index)}`;
    const existingKr = await prisma.keyResult.findFirst({
      where: { objectiveId: objective.id, title: keyResultTitle },
      select: { id: true },
    });
    const krData = {
      objectiveId: objective.id,
      title: keyResultTitle,
      targetValue: '100%',
      currentValue: `${Math.min(95, 45 + index * 4)}%`,
      weight: 100,
      progress: Math.min(95, 45 + index * 4),
      status: 'Active',
    };
    if (existingKr) {
      await prisma.keyResult.update({ where: { id: existingKr.id }, data: krData });
    } else {
      await prisma.keyResult.create({ data: krData });
    }

    await prisma.performanceScore.upsert({
      where: { objectiveId_month_scorerId: { objectiveId: objective.id, month: '2026-07', scorerId: adminId } },
      create: {
        objectiveId: objective.id,
        scorerId: adminId,
        month: '2026-07',
        selfScore: 75 + index,
        managerScore: 78 + index,
        projectRatio: JSON.stringify({ [project.projectCode]: 100 }),
        comment: '演示绩效评分记录。',
        nextGoal: '继续提升交付闭环效率。',
        status: 'Confirmed',
      },
      update: {
        selfScore: 75 + index,
        managerScore: 78 + index,
        status: 'Confirmed',
      },
    });

    const trainingTitle = `交付能力培训-${pad(index)}`;
    const existingTraining = await prisma.trainingPlan.findFirst({
      where: { title: trainingTitle },
      select: { id: true },
    });
    const trainingData = {
      title: trainingTitle,
      category: index % 2 === 0 ? 'Technical' : 'Process',
      trainerName: '交付中心',
      trainerId: adminId,
      startAt: new Date(Date.UTC(2026, 6, index, 2)),
      endAt: new Date(Date.UTC(2026, 6, index, 4)),
      location: index % 2 === 0 ? '线上会议' : '培训室A',
      status: index % 3 === 0 ? 'Completed' : 'Planned',
      description: '覆盖项目流程、资料标准、现场安全和工具使用。',
    };
    const training = existingTraining
      ? await prisma.trainingPlan.update({ where: { id: existingTraining.id }, data: trainingData, select: { id: true } })
      : await prisma.trainingPlan.create({ data: trainingData, select: { id: true } });
    await prisma.trainingParticipant.upsert({
      where: { trainingId_userId: { trainingId: training.id, userId: ownerId } },
      create: {
        trainingId: training.id,
        userId: ownerId,
        attendance: index % 3 === 0 ? 'Completed' : 'Invited',
        score: index % 3 === 0 ? 80 + index : null,
      },
      update: {
        attendance: index % 3 === 0 ? 'Completed' : 'Invited',
        score: index % 3 === 0 ? 80 + index : null,
      },
    });

    const summary = `项目复盘演示-${pad(index)}：${project.projectCode}`;
    const existingRetro = await prisma.projectRetrospective.findFirst({
      where: { projectId: project.id, summary },
      select: { id: true },
    });
    const retroData = {
      projectId: project.id,
      summary,
      lessonsLearned: '资料上传要与现场进度同步，审批责任要提前明确。',
      problemCategory: ['Document', 'Schedule', 'Quality', 'Safety'][index % 4],
      status: index % 2 === 0 ? 'Closed' : 'Draft',
    };
    const retrospective = existingRetro
      ? await prisma.projectRetrospective.update({ where: { id: existingRetro.id }, data: retroData, select: { id: true } })
      : await prisma.projectRetrospective.create({ data: retroData, select: { id: true } });

    const actionTitle = `复盘改进行动-${pad(index)}`;
    const existingAction = await prisma.retrospectiveAction.findFirst({
      where: { retrospectiveId: retrospective.id, title: actionTitle },
      select: { id: true },
    });
    const actionData = {
      retrospectiveId: retrospective.id,
      title: actionTitle,
      ownerId,
      dueDate: new Date(Date.UTC(2026, 6, index + 15)),
      status: index % 2 === 0 ? 'Closed' : 'Open',
      verificationNote: index % 2 === 0 ? '已完成演示闭环。' : null,
      closedAt: index % 2 === 0 ? new Date(Date.UTC(2026, 6, index + 16)) : null,
    };
    if (existingAction) {
      await prisma.retrospectiveAction.update({ where: { id: existingAction.id }, data: actionData });
    } else {
      await prisma.retrospectiveAction.create({ data: actionData });
    }
  }
}

async function seedTemplateAttachmentsAndHeat(
  prisma: PrismaClient,
  storage: StorageContext | undefined,
  samples: SampleCatalog,
  adminId: string,
): Promise<void> {
  if (!storage) {
    console.warn('  MinIO environment is incomplete, skipping template attachment seed');
    return;
  }

  const templates = await prisma.documentTemplate.findMany({
    select: { id: true, templateNo: true, name: true, fileFormat: true, storagePath: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  for (const [index, template] of templates.entries()) {
    const sampleName = selectSample(samples, template.fileFormat || 'docx');
    const sampleExt = fileExt(sampleName);
    const buffer = await readFile(join(samples.sampleDir, sampleName));
    const originalName = `${template.name}.${sampleExt}`;
    const objectName = `attachments/DocumentTemplate/${template.id}/seed-${sanitizeObjectName(template.templateNo)}.${sampleExt}`;

    await storage.client.putObject(storage.bucket, objectName, buffer, buffer.length, {
      'Content-Type': mimeTypeFor(originalName),
      'X-Amz-Meta-Original-Name': encodeURIComponent(originalName),
    });

    const existing = await prisma.attachment.findFirst({
      where: { ownerType: 'DocumentTemplate', ownerId: template.id, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    const attachmentData = {
      ownerType: 'DocumentTemplate',
      ownerId: template.id,
      category: 'template-version',
      fileName: originalName,
      originalName,
      fileExt: sampleExt,
      fileSize: BigInt(buffer.length),
      mimeType: mimeTypeFor(originalName),
      storageBucket: storage.bucket,
      storagePath: objectName,
      uploadedBy: adminId,
      remark: '文档模板演示文件，可在线预览和下载。',
    };
    const attachment = existing
      ? await prisma.attachment.update({ where: { id: existing.id }, data: attachmentData, select: { id: true } })
      : await prisma.attachment.create({ data: attachmentData, select: { id: true } });

    await prisma.documentTemplate.update({
      where: { id: template.id },
      data: {
        fileFormat: sampleExt,
        storagePath: objectName,
        status: 'Published',
        publishedAt: new Date('2026-06-24T00:00:00Z'),
      },
    });

    const existingVersion = await prisma.documentTemplateVersion.findFirst({
      where: { templateId: template.id, versionNo: 'V1.0' },
      select: { id: true },
    });
    const versionData = {
      templateId: template.id,
      versionNo: 'V1.0',
      storagePath: objectName,
      changeNotes: '初始化模板演示文件。',
      publisherId: adminId,
      publishedAt: new Date('2026-06-24T00:00:00Z'),
    };
    if (existingVersion) {
      await prisma.documentTemplateVersion.update({ where: { id: existingVersion.id }, data: versionData });
    } else {
      await prisma.documentTemplateVersion.create({ data: versionData });
    }

    await topUpOperationLogs(prisma, adminId, 'attachment', attachment.id, 'preview', 3 + (index % 9), 'attachment');
    await topUpOperationLogs(prisma, adminId, 'attachment', attachment.id, 'download', 1 + (index % 6), 'attachment');
  }
}

async function seedKnowledgeRemarksAndHeat(prisma: PrismaClient, adminId: string): Promise<void> {
  const attachments = await prisma.attachment.findMany({
    where: { ownerType: 'KnowledgeArticle', deletedAt: null },
    select: { id: true, originalName: true, fileExt: true, remark: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  for (const [index, attachment] of attachments.entries()) {
    const remark = buildAttachmentRemark(attachment.originalName, attachment.fileExt);
    if (
      !attachment.remark ||
      attachment.remark.length < 12 ||
      attachment.remark.includes('样例文件') ||
      hasCorruptText(attachment.remark)
    ) {
      await prisma.attachment.update({
        where: { id: attachment.id },
        data: { remark },
      });
    }
    await topUpOperationLogs(prisma, adminId, 'attachment', attachment.id, 'preview', 2 + (index % 8), 'attachment');
    await topUpOperationLogs(prisma, adminId, 'attachment', attachment.id, 'download', 1 + (index % 5), 'attachment');
  }
}

async function normalizeArchiveFileRemarks(prisma: PrismaClient): Promise<void> {
  const files = await prisma.file.findMany({
    where: {
      deletedAt: null,
      archiveItemId: { not: null },
      OR: [
        { remark: { contains: '????' } },
        { remark: { contains: '�' } },
      ],
    },
    select: {
      id: true,
      originalName: true,
      remark: true,
      project: { select: { projectCode: true } },
      archiveItem: {
        select: {
          name: true,
          secondName: true,
          stageCode: true,
        },
      },
    },
    take: 2000,
  });

  let fixedCount = 0;
  for (const file of files) {
    if (!hasCorruptText(file.remark)) continue;
    const stageName = projectStageName(file.archiveItem?.stageCode ?? 'other');
    const itemName = file.archiveItem?.secondName || file.archiveItem?.name || '项目档案';
    await prisma.file.update({
      where: { id: file.id },
      data: {
        remark: `示例档案：${file.project.projectCode} / ${stageName} / ${itemName}。上传人员应补充正式版本、签字扫描件或现场记录，审批通过后用于项目档案查阅。`,
      },
    });
    fixedCount += 1;
  }
  if (fixedCount > 0) {
    console.log(`  Fixed ${fixedCount} archive file remarks with corrupted text.`);
  }
}

function hasCorruptText(value?: string | null): boolean {
  return Boolean(value && (value.includes('????') || value.includes('�')));
}

async function seedKnowledgeFileUpdateApprovalCoverage(
  prisma: PrismaClient,
  storage: StorageContext | undefined,
  samples: SampleCatalog,
  adminId: string,
): Promise<void> {
  if (!storage) {
    console.warn('  MinIO environment is incomplete, skipping knowledge update approval seed');
    return;
  }

  const original = await prisma.attachment.findFirst({
    where: {
      ownerType: 'KnowledgeArticle',
      deletedAt: null,
      fileExt: { in: ['docx', 'pdf', 'xlsx', 'pptx'] },
    },
    select: {
      id: true,
      ownerId: true,
      originalName: true,
      fileExt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!original) {
    console.warn('  Knowledge attachment missing, skipping knowledge update approval seed');
    return;
  }

  const template = await prisma.approvalTemplate.upsert({
    where: { templateCode: 'KNOWLEDGE_FILE_UPDATE' },
    create: {
      templateCode: 'KNOWLEDGE_FILE_UPDATE',
      templateName: '知识库文件更新审批',
      businessType: 'knowledge-file-update',
      isEnabled: true,
    },
    update: {
      templateName: '知识库文件更新审批',
      businessType: 'knowledge-file-update',
      isEnabled: true,
    },
    select: { id: true },
  });
  await prisma.approvalStep.upsert({
    where: { templateId_stepOrder: { templateId: template.id, stepOrder: 1 } },
    create: {
      templateId: template.id,
      stepOrder: 1,
      stepName: '负责人审核',
      approverType: 'user',
      approverValue: adminId,
    },
    update: {
      stepName: '负责人审核',
      approverType: 'user',
      approverValue: adminId,
    },
  });

  const sampleName = selectSample(samples, original.fileExt);
  const sampleExt = fileExt(sampleName);
  const buffer = await readFile(join(samples.sampleDir, sampleName));
  const incomingName = `更新版-${original.originalName.replace(/\.[^.]+$/, '')}.${sampleExt}`;
  const objectName = `attachments/KnowledgeFileRevision/${original.id}/seed-update-${sanitizeObjectName(incomingName)}`;

  await storage.client.putObject(storage.bucket, objectName, buffer, buffer.length, {
    'Content-Type': mimeTypeFor(incomingName),
    'X-Amz-Meta-Original-Name': encodeURIComponent(incomingName),
  });

  const payload = {
    revisionType: 'knowledge-file-update',
    articleId: original.ownerId,
    originalAttachmentId: original.id,
    originalName: original.originalName,
    submittedAt: '2026-07-07T06:00:00.000Z',
  };
  const existingRevision = await prisma.attachment.findFirst({
    where: {
      ownerType: 'KnowledgeFileRevision',
      ownerId: original.id,
      category: 'revision',
      originalName: incomingName,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  const revisionData = {
    ownerType: 'KnowledgeFileRevision',
    ownerId: original.id,
    category: 'revision',
    fileName: incomingName,
    originalName: incomingName,
    fileExt: sampleExt,
    fileSize: BigInt(buffer.length),
    mimeType: mimeTypeFor(incomingName),
    storageBucket: storage.bucket,
    storagePath: objectName,
    uploadedBy: adminId,
    remark: JSON.stringify(payload),
    createdAt: new Date('2026-07-07T06:00:00.000Z'),
  };
  const revision = existingRevision
    ? await prisma.attachment.update({ where: { id: existingRevision.id }, data: revisionData, select: { id: true } })
    : await prisma.attachment.create({ data: revisionData, select: { id: true } });

  const existingTask = await prisma.approvalTask.findFirst({
    where: { businessType: 'knowledge-file-update', businessId: revision.id },
    select: { id: true },
  });
  const taskData = {
    templateId: template.id,
    businessType: 'knowledge-file-update',
    businessId: revision.id,
    businessTitle: `知识库文件更新：${original.originalName}`,
    applicantId: adminId,
    currentStep: 1,
    approverId: adminId,
    status: 'Pending',
    comment: null,
    decidedAt: null,
    createdAt: new Date('2026-07-07T06:00:00.000Z'),
  };
  const task = existingTask
    ? await prisma.approvalTask.update({ where: { id: existingTask.id }, data: taskData, select: { id: true } })
    : await prisma.approvalTask.create({ data: taskData, select: { id: true } });

  const existingAction = await prisma.approvalAction.findFirst({
    where: { taskId: task.id, action: 'submit' },
    select: { id: true },
  });
  const actionData = {
    taskId: task.id,
    stepOrder: 1,
    action: 'submit',
    actorId: adminId,
    comment: '知识库文件更新演示任务，供差异对比和审批链路测试。',
    createdAt: new Date('2026-07-07T06:00:00.000Z'),
  };
  if (existingAction) {
    await prisma.approvalAction.update({ where: { id: existingAction.id }, data: actionData });
  } else {
    await prisma.approvalAction.create({ data: actionData });
  }
}

async function topUpOperationLogs(
  prisma: PrismaClient,
  userId: string,
  targetType: string,
  targetId: string,
  action: string,
  desiredCount: number,
  module = 'attachment',
): Promise<void> {
  const current = await prisma.operationLog.count({
    where: { module, action, targetType, targetId, result: 'success' },
  });
  for (let index = current; index < desiredCount; index += 1) {
    await prisma.operationLog.create({
      data: {
        userId,
        module,
        action,
        targetType,
        targetId,
        result: 'success',
        ipAddress: '127.0.0.1',
        userAgent: 'seed-demo-coverage',
      },
    });
  }
}

function buildAttachmentRemark(fileName: string, ext: string): string {
  const typeLabel = ext.includes('xls')
    ? '表格模板'
    : ext.includes('ppt')
      ? '演示材料'
      : ext === 'pdf'
        ? '制度文件'
        : ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
          ? '图片资料'
          : '文档资料';
  return `简介：${fileName} 为交付知识库${typeLabel}，用于岗位职责、流程标准或模板查阅。`;
}

async function loadSampleCatalog(): Promise<SampleCatalog> {
  const sampleDir = join(__dirname, '../seed-files/knowledge-catalog');
  const names = (await readdir(sampleDir)).filter((name) => !name.startsWith('.'));
  const byExt = new Map<string, string>();
  for (const name of names) {
    const ext = fileExt(name);
    if (!byExt.has(ext)) {
      byExt.set(ext, name);
    }
  }
  return { sampleDir, byExt, names };
}

function selectSample(samples: SampleCatalog, preferredExt: string): string {
  const ext = preferredExt.toLowerCase();
  const direct = samples.byExt.get(ext);
  if (direct) return direct;
  if (ext === 'xls') return samples.byExt.get('xlsx') ?? samples.names[0];
  if (ext === 'ppt') return samples.byExt.get('pptx') ?? samples.names[0];
  if (ext === 'doc') return samples.byExt.get('docx') ?? samples.names[0];
  return samples.byExt.get('docx') ?? samples.names[0];
}

function createMinioClient(): StorageContext | undefined {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET;

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return undefined;
  }

  return {
    bucket,
    client: new Client({
      endPoint: endpoint,
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    }),
  };
}

async function ensureBucket(client: Client, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}

function fileExt(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? 'bin';
}

function mimeTypeFor(fileName: string): string {
  const ext = fileExt(fileName);
  const mimeTypes: Record<string, string> = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
  };
  return mimeTypes[ext] ?? 'application/octet-stream';
}

function sanitizeObjectName(value: string): string {
  return value
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

const PROJECT_STAGE_CODES = [
  '01_sale',
  '02_design',
  '03_procurement',
  '04_construction',
  '05_acceptance',
  '06_review',
  '07_misc',
] as const;

const PROJECT_STAGE_NAMES: Record<string, string> = {
  '01_sale': '售前立项',
  '02_design': '深化设计',
  '03_procurement': '采购生产',
  '04_construction': '施工调试',
  '05_acceptance': '项目验收',
  '06_review': '复盘归档',
  '07_misc': '综合资料',
};

function projectStageName(stageCode: string): string {
  return PROJECT_STAGE_NAMES[stageCode] ?? stageCode;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
