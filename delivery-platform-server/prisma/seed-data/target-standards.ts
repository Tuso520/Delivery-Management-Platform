import { Prisma, PrismaClient } from '@prisma/client';
import { Client as MinioClient } from 'minio';
import { v5 as uuidv5 } from 'uuid';

import {
  buildStandardGeneratedObjectPlan,
  verifyStoredObject,
} from '../target-content-migration-support';
import { targetContentId } from '../target-foundation-migration-support';

interface WorkflowStandardSeed {
  code: string;
  name: string;
  category: string;
  applicableScope: string;
  triggerCondition: string;
  responsibleRole: string;
  steps: string[];
  outputs: string[];
}

interface DocumentTemplateSeed {
  code: string;
  name: string;
  category: string;
  format: string;
  sections: string[];
}

interface TargetStandardSeed {
  code: string;
  name: string;
  type: 'PROCESS' | 'CHECKLIST' | 'DOCUMENT_TEMPLATE';
  category: string;
  content: Prisma.InputJsonValue;
}

const publishedAt = new Date('2026-07-11T00:00:00.000Z');
const TARGET_STANDARD_SEED_NAMESPACE = '343480ff-1922-493a-a221-d6d47f50577f';
const TARGET_STANDARD_VERSION = 'V1.0';

const workflowStandards: WorkflowStandardSeed[] = [
  {
    code: 'FLOW-PROJECT-DELIVERY',
    name: '项目交付流程总览',
    category: '流程总览',
    applicableScope: '所有交付项目',
    triggerCondition: '项目完成创建并确认交付团队后',
    responsibleRole: 'PROJECT_MANAGER',
    steps: [
      '项目启动',
      '深化设计',
      '采购与生产',
      '施工安装',
      '系统调试',
      '测试验证',
      '内部验收',
      '客户验收',
      '质保收尾',
    ],
    outputs: ['阶段成果物', '项目档案', '审核记录'],
  },
  {
    code: 'FLOW-PROJECT-STARTUP',
    name: '项目启动流程',
    category: '项目启动',
    applicableScope: '所有交付项目',
    triggerCondition: '合同生效并确认项目负责人',
    responsibleRole: 'PROJECT_MANAGER',
    steps: ['召开启动会', '确认项目团队', '生成项目档案快照', '制定项目实施计划'],
    outputs: ['启动会纪要', '项目成员表', '项目实施计划'],
  },
  {
    code: 'FLOW-DEEPENING-DESIGN',
    name: '深化设计流程',
    category: '深化设计',
    applicableScope: '包含方案深化的交付项目',
    triggerCondition: '项目启动完成',
    responsibleRole: 'PROJECT_MANAGER',
    steps: ['现场调研', '施工方案编制', '系统设计', '软硬件设计', '成本深化', '方案评审'],
    outputs: ['深化方案', '系统设计图', '深化方案评审记录'],
  },
  {
    code: 'FLOW-SITE-HSE-MEETING',
    name: '安全晨会流程',
    category: '施工安装',
    applicableScope: '存在现场施工作业的项目',
    triggerCondition: '每日施工作业开始前',
    responsibleRole: 'HSE',
    steps: ['人员签到', '确认当日工作计划', '提示安全风险点', '确认防护措施', '签字留档'],
    outputs: ['安全晨会记录', '现场影像'],
  },
  {
    code: 'FLOW-COMMISSIONING',
    name: '软硬件调试流程',
    category: '系统调试',
    applicableScope: '包含控制系统或软件平台的项目',
    triggerCondition: '安装完成并具备上电或联调条件',
    responsibleRole: 'SOFTWARE_LEADER',
    steps: ['资料与版本确认', '参数配置', '点位核对', '功能验证', '策略验证', '问题关闭'],
    outputs: ['硬件调试记录', '软件调试记录', '问题关闭清单'],
  },
  {
    code: 'FLOW-PROJECT-ACCEPTANCE',
    name: '项目验收与收尾流程',
    category: '验收收尾',
    applicableScope: '所有交付项目',
    triggerCondition: '调试和测试完成',
    responsibleRole: 'PROJECT_MANAGER',
    steps: ['内部验收', '客户培训', '竣工资料整理', '客户验收', '结算资料确认', '质保移交'],
    outputs: ['验收报告', '培训记录', '竣工资料', '移交清单'],
  },
];

const checklistItems = [
  {
    name: '售前方案完整性检查',
    standard: '方案应包含项目概况、技术方案、实施计划和节能测算。',
    riskLevel: 'Medium',
    ownerRole: 'PROJECT_MANAGER',
  },
  {
    name: '合同技术评审',
    standard: '合同技术条款应明确、可执行，正式版本已归档。',
    riskLevel: 'Critical',
    ownerRole: 'PROJECT_MANAGER',
  },
  {
    name: '系统设计审核',
    standard: '系统原理图、网络拓扑和点表应完整一致。',
    riskLevel: 'High',
    ownerRole: 'ELEC_LEADER',
  },
  {
    name: '分包与采购资料检查',
    standard: '采购申请、供应商选择依据、合同和到货资料应可追溯。',
    riskLevel: 'High',
    ownerRole: 'PURCHASE',
  },
  {
    name: '安全技术交底',
    standard: '所有进场人员已完成安全培训并签字。',
    riskLevel: 'Critical',
    ownerRole: 'HSE',
  },
  {
    name: '软硬件调试点检',
    standard: '点位、功能和策略已逐项验证并保留证据。',
    riskLevel: 'High',
    ownerRole: 'SOFTWARE_LEADER',
  },
  {
    name: '项目竣工资料检查',
    standard: '竣工图、调试记录、培训记录和验收资料齐全。',
    riskLevel: 'High',
    ownerRole: 'PROJECT_MANAGER',
  },
  {
    name: '项目成本与结算检查',
    standard: '最终成本和客户结算资料已核对并完成授权审核。',
    riskLevel: 'High',
    ownerRole: 'FINANCE',
  },
];

const documentTemplates: DocumentTemplateSeed[] = [
  {
    code: 'DC-TPL-KICKOFF',
    name: '项目启动会纪要模板',
    category: '会议纪要',
    format: 'STRUCTURED',
    sections: ['会议基本信息', '项目目标与范围', '角色分工', '里程碑', '风险与待办'],
  },
  {
    code: 'DC-TPL-PLAN',
    name: '项目实施计划模板',
    category: '项目计划',
    format: 'STRUCTURED',
    sections: ['项目概况', '工作分解', '里程碑', '资源计划', '风险计划'],
  },
  {
    code: 'DC-TPL-IO-LIST',
    name: '上位机点表模板',
    category: '设计表单',
    format: 'STRUCTURED',
    sections: ['设备信息', '点位编码', '数据类型', '量程单位', '报警与趋势要求'],
  },
  {
    code: 'DC-TPL-HSE-MEETING',
    name: '安全晨会记录模板',
    category: '安全记录',
    format: 'MARKDOWN',
    sections: ['日期与地点', '人员签到', '作业内容', '风险提示', '防护措施', '确认签字'],
  },
  {
    code: 'DC-TPL-COMMISSIONING',
    name: '现场调试记录模板',
    category: '调试记录',
    format: 'STRUCTURED',
    sections: ['版本与环境', '检查项目', '预期结果', '实际结果', '证据', '问题与结论'],
  },
  {
    code: 'DC-TPL-ACCEPTANCE',
    name: '项目验收资料移交清单模板',
    category: '验收移交',
    format: 'STRUCTURED',
    sections: ['资料名称', '版本', '数量', '提交方', '接收方', '移交状态', '备注'],
  },
];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildTargetStandards(): TargetStandardSeed[] {
  const processSeeds: TargetStandardSeed[] = workflowStandards.map((definition) => ({
    code: definition.code,
    name: definition.name,
    type: 'PROCESS',
    category: definition.category,
    content: json({
      schema: 'delivery.process-standard.v1',
      applicableScope: definition.applicableScope,
      triggerCondition: definition.triggerCondition,
      responsibleRole: definition.responsibleRole,
      steps: definition.steps.map((name, index) => ({ order: index + 1, name })),
      outputs: definition.outputs,
      source: { retiredDomain: 'workflow', migratedAs: 'standard' },
    }),
  }));

  const checklistSeed: TargetStandardSeed = {
    code: 'DC-CHK-DEFAULT',
    name: '交付项目质量检查标准',
    type: 'CHECKLIST',
    category: '项目质量检查',
    content: json({
      schema: 'delivery.checklist-standard.v1',
      evidencePolicy: { minimumEvidenceCount: 1, acceptedEvidence: ['FILE', 'IMAGE'] },
      items: checklistItems.map((item, index) => ({
        order: index + 1,
        required: true,
        ...item,
      })),
      source: { retiredDomain: 'checklist_template', migratedAs: 'standard' },
    }),
  };

  const templateSeeds: TargetStandardSeed[] = documentTemplates.map((definition) => ({
    code: definition.code,
    name: definition.name,
    type: 'DOCUMENT_TEMPLATE',
    category: definition.category,
    content: json({
      schema: 'delivery.document-template.v1',
      representation: definition.format,
      sections: definition.sections.map((name, index) => ({ order: index + 1, name })),
      binaryFile: null,
      source: { retiredDomain: 'document_template', migratedAs: 'standard' },
    }),
  }));

  return [...processSeeds, checklistSeed, ...templateSeeds];
}

interface TargetStandardStorage {
  client: MinioClient;
  bucket: string;
}

function targetStandardStorage(): TargetStandardStorage {
  const rawEndpoint = process.env.MINIO_ENDPOINT?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET?.trim();
  if (!rawEndpoint || !accessKey?.trim() || !secretKey?.trim() || !bucket) {
    throw new Error(
      'MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY and MINIO_BUCKET are required to seed file-only standards',
    );
  }

  const endpointHasProtocol = /^https?:\/\//iu.test(rawEndpoint);
  const endpointUrl = new URL(endpointHasProtocol ? rawEndpoint : `http://${rawEndpoint}`);
  const port = Number(endpointUrl.port || process.env.MINIO_PORT || 9000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MINIO_PORT must be a valid TCP port');
  }
  return {
    client: new MinioClient({
      endPoint: endpointUrl.hostname,
      port,
      useSSL: endpointHasProtocol
        ? endpointUrl.protocol === 'https:'
        : process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    }),
    bucket,
  };
}

function stableSeedId(value: string): string {
  return uuidv5(value, TARGET_STANDARD_SEED_NAMESPACE);
}

async function ensureSeedObject(
  storage: TargetStandardStorage,
  plan: ReturnType<typeof buildStandardGeneratedObjectPlan>,
): Promise<boolean> {
  const bucketExists = await storage.client.bucketExists(storage.bucket).catch(() => false);
  if (!bucketExists) {
    throw new Error(`MinIO bucket is unavailable for target standard seed: ${storage.bucket}`);
  }
  let verification = await verifyStoredObject(storage.client, {
    bucket: storage.bucket,
    key: plan.storageKey,
    expectedSize: plan.body.length,
    expectedChecksum: plan.checksum,
  });
  let uploaded = false;
  if (!verification.ok && verification.code === 'OBJECT_NOT_FOUND') {
    await storage.client.putObject(storage.bucket, plan.storageKey, plan.body, plan.body.length, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-amz-meta-content-sha256': plan.checksum,
      'x-amz-meta-seed-source': 'target-standard',
    });
    verification = await verifyStoredObject(storage.client, {
      bucket: storage.bucket,
      key: plan.storageKey,
      expectedSize: plan.body.length,
      expectedChecksum: plan.checksum,
    });
    uploaded = true;
  }
  if (!verification.ok) {
    throw new Error(
      `Target standard seed object verification failed for ${plan.storageKey}: ${verification.code ?? 'UNKNOWN'}`,
    );
  }
  return uploaded;
}

async function removeUnboundSeedObject(
  prisma: PrismaClient,
  storage: TargetStandardStorage,
  storageKey: string,
): Promise<void> {
  const referenced = await prisma.fileAsset.findUnique({
    where: {
      storageBucket_storageKey: {
        storageBucket: storage.bucket,
        storageKey,
      },
    },
    select: { id: true },
  });
  if (!referenced) {
    await storage.client.removeObject(storage.bucket, storageKey);
  }
}

export async function seedTargetStandards(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('目标标准种子依赖 admin 用户，请先执行用户种子');
  }

  let storage: TargetStandardStorage | undefined;
  for (const definition of buildTargetStandards()) {
    const existingStandard = await prisma.standard.findUnique({
      where: { code: definition.code },
      select: { id: true },
    });
    if (existingStandard) {
      await prisma.standard.upsert({
        where: { code: definition.code },
        create: {
          code: definition.code,
          name: definition.name,
          type: definition.type,
          category: definition.category,
          status: 'PUBLISHED',
          effectiveAt: publishedAt,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
        update: {},
        select: { id: true },
      });
      continue;
    }

    const standardId = stableSeedId(`target-standard:${definition.code}`);
    const standardVersionId = stableSeedId(
      `target-standard-version:${definition.code}:${TARGET_STANDARD_VERSION}`,
    );
    const logicalFileId = targetContentId(`standard-content:${standardVersionId}:logical-file`);
    const assetId = targetContentId(`standard-content:${standardVersionId}:asset`);
    const fileVersionId = targetContentId(`standard-content:${standardVersionId}:file-version`);
    const plan = buildStandardGeneratedObjectPlan({
      standardId,
      standardVersionId,
      code: definition.code,
      name: definition.name,
      type: definition.type,
      category: definition.category,
      version: TARGET_STANDARD_VERSION,
      structuredContent: definition.content,
      applicability: { scope: 'ALL_PROJECTS' },
    });
    const definitionStorage = (storage ??= targetStandardStorage());
    const uploaded = await ensureSeedObject(definitionStorage, plan);

    try {
      const committed = await prisma.$transaction(
        async (tx) => {
          const standard = await tx.standard.upsert({
            where: { code: definition.code },
            create: {
              id: standardId,
              code: definition.code,
              name: definition.name,
              type: definition.type,
              category: definition.category,
              status: 'PUBLISHED',
              effectiveAt: publishedAt,
              createdBy: admin.id,
              updatedBy: admin.id,
            },
            update: {},
            select: { id: true },
          });
          if (standard.id !== standardId) return false;

          await tx.logicalFile.create({
            data: {
              id: logicalFileId,
              ownerType: 'STANDARD',
              ownerId: standard.id,
              displayName: plan.originalName,
              status: 'APPROVED',
              createdBy: admin.id,
              createdAt: publishedAt,
            },
          });
          await tx.fileAsset.create({
            data: {
              id: assetId,
              ownerType: 'STANDARD',
              ownerId: standard.id,
              originalName: plan.originalName,
              extension: 'md',
              mimeType: 'text/markdown',
              size: BigInt(plan.body.length),
              storageProvider: 'minio',
              storageBucket: definitionStorage.bucket,
              storageKey: plan.storageKey,
              checksum: plan.checksum,
              status: 'AVAILABLE',
              createdBy: admin.id,
              createdAt: publishedAt,
            },
          });
          await tx.fileVersion.create({
            data: {
              id: fileVersionId,
              logicalFileId,
              version: TARGET_STANDARD_VERSION,
              versionSequence: 1,
              revisionLevel: 'MINOR',
              assetId,
              status: 'APPROVED',
              changeDescription: '目标架构初始化标准文件',
              uploadedBy: admin.id,
              uploadedAt: publishedAt,
              approvedAt: publishedAt,
            },
          });
          await tx.logicalFile.update({
            where: { id: logicalFileId },
            data: { currentVersionId: fileVersionId },
          });
          await tx.standardVersion.create({
            data: {
              id: standardVersionId,
              standardId: standard.id,
              version: TARGET_STANDARD_VERSION,
              fileVersionId,
              status: 'PUBLISHED',
              effectiveAt: publishedAt,
              changeDescription: '目标架构初始化版本',
              submittedBy: admin.id,
              submittedAt: publishedAt,
              publishedAt,
            },
          });
          await tx.standard.update({
            where: { id: standard.id },
            data: {
              currentPublishedVersionId: standardVersionId,
              status: 'PUBLISHED',
              effectiveAt: publishedAt,
            },
          });
          return true;
        },
        {
          maxWait: 30_000,
          timeout: 600_000,
        },
      );
      if (!committed && uploaded) {
        await removeUnboundSeedObject(prisma, definitionStorage, plan.storageKey);
      }
    } catch (error: unknown) {
      if (uploaded) {
        try {
          await removeUnboundSeedObject(prisma, definitionStorage, plan.storageKey);
        } catch (cleanupError: unknown) {
          throw new AggregateError(
            [error, cleanupError],
            `Target standard seed transaction and object cleanup both failed: ${plan.storageKey}`,
          );
        }
      }
      throw error;
    }
  }
}
