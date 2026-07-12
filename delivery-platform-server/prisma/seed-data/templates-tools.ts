import { PrismaClient } from '@prisma/client';

interface SeedToolCategory {
  name: string;
  description: string;
  sortOrder: number;
  tools: SeedTool[];
}

interface SeedTool {
  name: string;
  toolType: 'internal' | 'external';
  description: string;
  url?: string;
  icon?: string;
  sortOrder: number;
}

export async function seedTemplatesAndTools(prisma: PrismaClient): Promise<void> {
  const toolCategories: SeedToolCategory[] = [
    {
      name: '项目启动与计划',
      description: '交付启动、计划排程、项目编号和启动材料检查。',
      sortOrder: 10,
      tools: [
        {
          name: '项目编号生成规则',
          toolType: 'internal',
          description: '按国家、客户、年份生成项目编号并提示重复风险。',
          icon: 'FileText',
          sortOrder: 10,
        },
        {
          name: '启动会材料清单',
          toolType: 'internal',
          description: '汇总合同、中标通知、成员表、启动会纪要等必备材料。',
          icon: 'Checklist',
          sortOrder: 20,
        },
        {
          name: '项目实施计划排程器',
          toolType: 'internal',
          description: '生成阶段计划、关键里程碑和责任人清单。',
          icon: 'Calendar',
          sortOrder: 30,
        },
      ],
    },
    {
      name: '档案与质量检查',
      description: '交付资料完整率、命名规范和阶段门资料核对。',
      sortOrder: 20,
      tools: [
        {
          name: '资料完整率检查',
          toolType: 'internal',
          description: '按档案模板统计缺失、待审、驳回和已归档资料。',
          icon: 'CheckCircle',
          sortOrder: 10,
        },
        {
          name: '文件命名规范检查',
          toolType: 'internal',
          description: '校验项目编号、阶段、版本号、日期和文件后缀。',
          icon: 'FileSearch',
          sortOrder: 20,
        },
        {
          name: '阶段门资料核对',
          toolType: 'internal',
          description: '按启动、设计、采购、施工、调试、验收、收尾检查交付物。',
          icon: 'Archive',
          sortOrder: 30,
        },
        {
          name: 'Office 在线入口',
          toolType: 'external',
          description: '打开 Office 在线应用，便于查看或协作编辑交付资料。',
          url: 'https://www.office.com/',
          icon: 'Link',
          sortOrder: 40,
        },
      ],
    },
    {
      name: '商务回款与币种',
      description: '回款节点、币种换算和汇率人工复核。',
      sortOrder: 30,
      tools: [
        {
          name: '多币种金额换算',
          toolType: 'internal',
          description: '结合项目币种和基准币生成合同额、回款额折算结果。',
          icon: 'Swap',
          sortOrder: 10,
        },
        {
          name: '回款节点提醒清单',
          toolType: 'internal',
          description: '按合同里程碑展示计划回款、已回款、逾期和责任人。',
          icon: 'Notification',
          sortOrder: 20,
        },
        {
          name: '中国银行外汇牌价',
          toolType: 'external',
          description: '查询人民币汇率参考，用于人工复核币种折算。',
          url: 'https://www.boc.cn/sourcedb/whpj/',
          icon: 'Link',
          sortOrder: 30,
        },
      ],
    },
    {
      name: '现场施工与HSE',
      description: '现场安全、影像资料、时差沟通和问题整改。',
      sortOrder: 40,
      tools: [
        {
          name: '安全晨会记录生成器',
          toolType: 'internal',
          description: '生成每日安全晨会签到、风险交底和照片要求。',
          icon: 'SafetyCertificate',
          sortOrder: 10,
        },
        {
          name: '项目影像拍摄清单',
          toolType: 'internal',
          description: '按阶段提示现场照片、视频、铭牌和整改前后对比要求。',
          icon: 'Camera',
          sortOrder: 20,
        },
        {
          name: '世界时钟',
          toolType: 'external',
          description: '跨国项目会议排期和现场沟通时差确认。',
          url: 'https://www.timeanddate.com/worldclock/',
          icon: 'Link',
          sortOrder: 30,
        },
      ],
    },
    {
      name: '调试与软件配置',
      description: '点表、软件配置、联调验证和设备选型资料。',
      sortOrder: 50,
      tools: [
        {
          name: '点表模板校验',
          toolType: 'internal',
          description: '检查点表字段、命名、单位、量程和缺失项。',
          icon: 'Table',
          sortOrder: 10,
        },
        {
          name: '软件配置清单',
          toolType: 'internal',
          description: '汇总服务器、客户端、策略、版本和远程连接信息。',
          icon: 'Code',
          sortOrder: 20,
        },
        {
          name: '图纸流程图工具',
          toolType: 'external',
          description: '打开 diagrams.net 绘制流程图、网络拓扑和设备连接图。',
          url: 'https://app.diagrams.net/',
          icon: 'Link',
          sortOrder: 30,
        },
        {
          name: 'DeepL 翻译',
          toolType: 'external',
          description: '海外项目技术资料和客户沟通内容的辅助翻译入口。',
          url: 'https://www.deepl.com/translator',
          icon: 'Link',
          sortOrder: 40,
        },
      ],
    },
    {
      name: '物流与复盘',
      description: '进出口资料、物流节点、项目复盘和知识沉淀。',
      sortOrder: 60,
      tools: [
        {
          name: '进出口资料清单',
          toolType: 'internal',
          description: '汇总箱单、发票、报关、物流追踪和到货验收资料。',
          icon: 'Truck',
          sortOrder: 10,
        },
        {
          name: '项目复盘报告生成器',
          toolType: 'internal',
          description: '从项目风险、延期、回款、资料完整率生成复盘提纲。',
          icon: 'FileText',
          sortOrder: 20,
        },
        {
          name: '常见问题指导手册',
          toolType: 'internal',
          description: '聚合项目管理 FAQ、禁忌、商务沟通和质量安全要求。',
          icon: 'Book',
          sortOrder: 30,
        },
        {
          name: '网络测速',
          toolType: 'external',
          description: '远程联调和现场网络质量排查辅助入口。',
          url: 'https://www.speedtest.net/',
          icon: 'Link',
          sortOrder: 40,
        },
      ],
    },
  ];

  for (const toolCategory of toolCategories) {
    const existingCategory = await prisma.toolCategory.findFirst({
      where: { name: toolCategory.name },
      select: { id: true },
    });

    const category =
      existingCategory ??
      (await prisma.toolCategory.create({
        data: {
          name: toolCategory.name,
          description: toolCategory.description,
          sortOrder: toolCategory.sortOrder,
          status: 'Active',
        },
        select: { id: true },
      }));

    for (const tool of toolCategory.tools) {
      const existingTool = await prisma.toolItem.findFirst({
        where: { categoryId: category.id, name: tool.name },
        select: { id: true },
      });

      const data = {
        categoryId: category.id,
        name: tool.name,
        description: tool.description,
        toolType: tool.toolType,
        url: tool.url,
        icon: tool.icon,
        sortOrder: tool.sortOrder,
        status: 'Active',
      };

      if (!existingTool) {
        await prisma.toolItem.create({ data });
      }
    }
  }
}
