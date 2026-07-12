import { PrismaClient } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

const TARGET_SEED_NAMESPACE = 'a34a65f4-287f-4d0c-8bda-2960aa8e31de';

const systemConfigs = [
  ['platform.name', '交付管理平台', '平台名称', 'string'],
  ['platform.short_name', '交付平台', '平台简称', 'string'],
  ['platform.login_slogan', '让交付工作保持高效、清晰、有序。', '登录页主文案', 'string'],
  ['platform.default_language', 'zh-CN', '平台默认语言', 'string'],
  ['project.default_page_size', '20', '项目列表默认每页数量', 'number'],
  ['project.default_risk_level', 'Low', '新项目默认风险等级', 'string'],
  ['attachment.max_size_mb', '100', '文件最大上传大小', 'number'],
  [
    'file.allowed_extensions',
    'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,dwg,md,mp4',
    '平台允许上传的文件扩展名',
    'string',
  ],
  ['approval.timeout_days', '3', '审核默认超时天数', 'number'],
  ['knowledge.default_page_size', '20', '知识库默认每页数量', 'number'],
  ['security.session_hours', '12', '登录会话有效小时', 'number'],
  ['security.login_max_attempts', '5', '连续登录失败上限', 'number'],
] as const;

const notificationRules = [
  {
    key: 'review-task-created',
    name: '审核任务提醒',
    eventType: 'ReviewTaskCreated',
    recipientPolicy: { type: 'ROLE', values: ['DELIVERY_MANAGER'] },
  },
  {
    key: 'review-task-approved',
    name: '审核通过提醒',
    eventType: 'ReviewTaskApproved',
    recipientPolicy: { type: 'BUSINESS_OWNER', values: [] },
  },
  {
    key: 'review-task-rejected',
    name: '审核驳回提醒',
    eventType: 'ReviewTaskRejected',
    recipientPolicy: { type: 'BUSINESS_OWNER', values: [] },
  },
  {
    key: 'project-stage-changed',
    name: '项目阶段变更提醒',
    eventType: 'ProjectStageChanged',
    recipientPolicy: { type: 'PROJECT_MEMBERS', values: [] },
  },
] as const;

const integrations = [
  {
    provider: 'WECOM',
    aliases: ['WECOM', 'wecom', 'WECHAT_WORK', 'wechat_work', 'enterprise_wechat'],
    configName: '企业微信集成',
    configValue: {
      corpId: '',
      agentId: '',
      contactDepartmentId: '1',
      testRecipient: '',
    },
  },
  {
    provider: 'FEISHU',
    aliases: ['FEISHU', 'feishu'],
    configName: '飞书集成',
    configValue: {
      appId: '',
      contactDepartmentId: '0',
      testRecipient: '',
    },
  },
] as const;

export async function seedSystemOperations(prisma: PrismaClient): Promise<void> {
  for (const [configKey, configValue, description, configType] of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { configKey },
      create: { configKey, configValue, description, configType },
      update: {},
    });
  }

  for (const rule of notificationRules) {
    const existing = await prisma.notificationRule.findFirst({
      where: { name: rule.name, deletedAt: null },
      select: { id: true },
    });
    const id = existing?.id ?? uuidv5(`notification-rule:${rule.key}`, TARGET_SEED_NAMESPACE);
    await prisma.notificationRule.upsert({
      where: { id },
      create: {
        id,
        name: rule.name,
        eventType: rule.eventType,
        channels: ['IN_APP'],
        recipientPolicy: rule.recipientPolicy,
        isEnabled: true,
      },
      update: {},
    });
  }

  for (const integration of integrations) {
    const existing = await prisma.integrationConfig.findFirst({
      where: { provider: { in: [...integration.aliases] } },
      select: { id: true },
    });
    const id = existing?.id ?? uuidv5(`integration:${integration.provider}`, TARGET_SEED_NAMESPACE);
    await prisma.integrationConfig.upsert({
      where: { id },
      create: {
        id,
        provider: integration.provider,
        configName: integration.configName,
        configValue: integration.configValue,
        isEnabled: false,
        description: '请填写真实连接参数后启用。',
      },
      update: {},
    });
  }
}
