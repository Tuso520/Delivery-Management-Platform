import { PrismaClient } from '@prisma/client';

export async function seedSystemOperations(prisma: PrismaClient): Promise<void> {
  const configs = [
    ['platform.name', '交付管理平台', '平台名称', 'string'],
    ['platform.short_name', '交付平台', '平台简称', 'string'],
    ['platform.login_slogan', '让交付工作保持高效、清晰、有序。', '登录页主文案', 'string'],
    ['platform.default_language', 'zh-CN', '平台默认语言', 'string'],
    ['platform.default_currency', 'CNY', '平台默认折算币种', 'string'],
    ['platform.timezone', 'Asia/Muscat', '平台默认时区', 'string'],
    ['project.default_page_size', '20', '项目列表默认每页数量', 'number'],
    ['project.default_risk_level', 'Low', '新项目默认风险等级', 'string'],
    ['project.archive_auto_generate', 'true', '项目创建后自动生成档案目录', 'boolean'],
    ['attachment.max_size_mb', '100', '通用附件最大上传大小', 'number'],
    [
      'file.allowed_extensions',
      'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,md,mp4',
      '平台允许上传的文件扩展名',
      'string',
    ],
    ['report.default_type', 'daily', '工作报告默认类型', 'string'],
    ['report.reminder_hour', '17', '日报提醒小时', 'number'],
    ['approval.timeout_days', '3', '审批默认超时天数', 'number'],
    ['knowledge.default_page_size', '20', '知识库默认每页数量', 'number'],
    ['security.session_hours', '12', '登录会话有效小时', 'number'],
    ['security.login_max_attempts', '5', '连续登录失败上限', 'number'],
    ['notification.default_channel', 'in_app', '默认通知渠道', 'string'],
    ['currency.sync_base', 'CNY', '在线汇率同步基准币种', 'string'],
    ['currency.sync_enabled', 'true', '启用在线汇率同步', 'boolean'],
    ['ui.date_format', 'YYYY-MM-DD', '平台日期显示格式', 'string'],
    ['ui.table_density', 'default', '表格默认密度', 'string'],
  ] as const;
  for (const [configKey, configValue, description, configType] of configs) {
    await prisma.systemConfig.upsert({
      where: { configKey },
      create: { configKey, configValue, description, configType },
      update: { description, configType },
    });
  }

  const rules = [
    ['审批任务提醒', 'approval_pending', 'in_app', 'DELIVERY_MANAGER'],
    ['检查整改提醒', 'checklist_rejected', 'in_app', 'PROJECT_MANAGER'],
  ] as const;
  for (const [name, eventType, channel, recipientRole] of rules) {
    const existing = await prisma.notificationRule.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });
    const data = {
      eventType,
      channel,
      recipientRole,
      template: '{{title}}：{{content}}',
      isEnabled: true,
    };
    if (!existing) {
      await prisma.notificationRule.create({ data: { name, ...data } });
    }
  }

  const integrations = [
    ['enterprise_wechat', '企业微信通知', { corpId: '', agentId: '', secret: '' }],
    [
      'feishu',
      '飞书通知与审批',
      {
        appId: '',
        appSecret: '',
        webhookUrl: '',
        encryptKey: '',
        verificationToken: '',
      },
    ],
    [
      'email',
      '交付通知邮箱',
      {
        host: '',
        port: 465,
        secure: true,
        username: '',
        password: '',
      },
    ],
    ['webhook', '项目事件 Webhook', { url: '', method: 'POST', authType: 'none', token: '' }],
  ] as const;
  for (const [provider, configName, configValue] of integrations) {
    const existing = await prisma.integrationConfig.findFirst({
      where: { provider, configName },
      select: { id: true },
    });
    if (!existing) {
      await prisma.integrationConfig.create({
        data: {
          provider,
          configName,
          configValue,
          isEnabled: false,
          description: '请填写真实连接参数后启用。',
        },
      });
    }
  }

  const existingLogCount = await prisma.operationLog.count();
  if (existingLogCount === 0) {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' },
      select: { id: true },
    });
    if (admin) {
      await prisma.operationLog.createMany({
        data: [
          {
            userId: admin.id,
            module: 'system',
            action: 'initialize',
            targetType: 'platform',
            targetId: admin.id,
            afterData: { platformName: '交付管理平台' },
          },
          {
            userId: admin.id,
            module: 'permission',
            action: 'seed',
            targetType: 'role',
            targetId: admin.id,
            afterData: { result: '角色权限初始化完成' },
          },
          {
            userId: admin.id,
            module: 'project',
            action: 'seed',
            targetType: 'project',
            targetId: admin.id,
            afterData: { result: '示例项目与成员初始化完成' },
          },
        ],
      });
    }
  }
}
