import { PrismaClient } from '@prisma/client';

export async function seedWorkflows(prisma: PrismaClient) {
  console.log('Seeding workflow documents...');

  const categories = [
    { name: '流程总览', description: '项目交付总体流程与阶段划分', sortOrder: 1 },
    { name: '项目启动', description: '项目启动阶段流程', sortOrder: 2 },
    { name: '深化设计', description: '深化设计阶段流程', sortOrder: 3 },
    { name: '采购与生产', description: '采购与生产阶段流程文档', sortOrder: 4 },
    { name: '施工与安装', description: '施工与安装阶段流程文档', sortOrder: 5 },
    { name: '调试阶段', description: '调试阶段流程文档', sortOrder: 6 },
    { name: '验收阶段', description: '验收阶段流程文档', sortOrder: 7 },
    { name: '收尾阶段', description: '项目收尾与复盘流程', sortOrder: 8 },
    { name: '过程管理', description: '项目执行过程管理文档', sortOrder: 9 },
    { name: '阶段评审', description: '各阶段评审标准与记录', sortOrder: 10 },
    { name: '成果物管理', description: '项目交付成果物管理', sortOrder: 11 },
    { name: '日常管理', description: '海外交付日常管理流程', sortOrder: 12 },
  ];

  // Create categories (find first to avoid duplicates)
  const categoryIds: Record<string, string> = {};
  for (const cat of categories) {
    const existing = await prisma.workflowCategory.findFirst({ where: { name: cat.name } });
    if (existing) {
      categoryIds[cat.name] = existing.id;
    } else {
      const created = await prisma.workflowCategory.create({ data: cat });
      categoryIds[cat.name] = created.id;
    }
  }

  const docs = [
    {
      categoryName: '流程总览',
      name: '项目交付流程总览',
      applicableScope: '所有海外项目',
      steps: '1.项目启动\n2.深化设计\n3.采购与生产\n4.施工与安装\n5.调试阶段\n6.验收阶段\n7.收尾阶段\n8.项目复盘',
      relatedArchive: '项目合同、项目实施计划表',
    },
    {
      categoryName: '流程总览',
      name: '项目标准文件夹结构',
      applicableScope: '所有项目',
      steps: '按照标准档案模板建立项目文件夹',
      relatedTemplates: 'DC-ARCH-DEFAULT',
    },
    {
      categoryName: '流程总览',
      name: '项目交付流程与管理动作清单',
      applicableScope: '所有项目',
      steps: '按阶段拆解交付动作，明确负责人与输出物',
      relatedChecklist: 'DC-CHK-DEFAULT',
    },
    {
      categoryName: '项目启动',
      name: '外部启动会组织指南',
      applicableScope: '所有项目',
      triggerCondition: '合同签订后',
      inputMaterials: '中标通知书、项目合同',
      outputMaterials: '启动会会议纪要、项目成员确认表',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      categoryName: '项目启动',
      name: '项目启动流程',
      applicableScope: '所有项目',
      triggerCondition: '合同生效',
      steps: '1.召开外部启动会\n2.确认项目团队\n3.建立项目档案\n4.制定项目实施计划',
      outputMaterials: '项目实施计划表、项目档案目录',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      categoryName: '深化设计',
      name: '深化设计流程',
      applicableScope: '所有项目',
      triggerCondition: '项目启动完成',
      steps: '1.现场调研\n2.施工方案编制\n3.系统设计\n4.硬件设计\n5.软件设计\n6.成本预算深化\n7.深化方案评审',
      outputMaterials: '深化方案评审记录表、施工方案、系统设计图',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      categoryName: '采购与生产',
      name: '采购申请流程',
      applicableScope: '所有项目',
      triggerCondition: '深化方案评审通过',
      steps: '1.编制采购清单\n2.提交采购申请\n3.供应商选择\n4.签订采购合同',
      outputMaterials: '采购申请单、采购合同',
      responsibleRole: 'PURCHASE',
    },
    {
      categoryName: '施工与安装',
      name: '安全晨会流程',
      applicableScope: '所有项目',
      triggerCondition: '施工作业开始前',
      steps: '1.签到\n2.今日工作计划\n3.安全风险点提示\n4.签字确认',
      responsibleRole: 'HSE',
    },
    {
      categoryName: '施工与安装',
      name: '材料进场验收流程',
      applicableScope: '所有项目',
      triggerCondition: '材料到场',
      steps: '1.核对清单\n2.外观检查\n3.合格证核验\n4.填写报验记录',
      outputMaterials: '材料报验记录表',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      categoryName: '调试阶段',
      name: '硬件调试流程',
      applicableScope: '含电气项目',
      triggerCondition: '安装完成',
      steps: '1.设备资料整理\n2.PLC/触摸屏程序烧录\n3.IP/参数配置\n4.点位点检\n5.功能点检',
      outputMaterials: '硬件调试记录表',
      responsibleRole: 'ELEC_LEADER',
    },
    {
      categoryName: '调试阶段',
      name: '软件调试流程',
      applicableScope: '含软件项目',
      triggerCondition: '硬件调试通过',
      steps: '1.服务器/客户端配置\n2.点位核对\n3.功能点检\n4.策略点检\n5.节能测试',
      outputMaterials: '软件调试记录表、节能调试记录表',
      responsibleRole: 'SOFTWARE_LEADER',
    },
    {
      categoryName: '验收阶段',
      name: '项目验收流程',
      applicableScope: '所有项目',
      triggerCondition: '调试完成',
      steps: '1.操作培训\n2.竣工图整理\n3.竣工验收资料准备\n4.甲方验收\n5.签署竣工单',
      outputMaterials: '项目竣工验收报告、培训记录签字表、与甲方结算清单',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      categoryName: '收尾阶段',
      name: '项目收尾流程',
      applicableScope: '所有项目',
      triggerCondition: '验收通过',
      steps: '1.与分包结算\n2.项目成本核算\n3.项目信息留存\n4.系统备份\n5.项目复盘',
      outputMaterials: '项目最终成本核算表、项目系统备份、项目总结复盘报告',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      categoryName: '日常管理',
      name: '海外交付差旅管理',
      applicableScope: '所有海外项目',
      steps: '按海外事业部业务费用管理制度执行',
      relatedTemplates: '差旅报销单',
    },
    {
      categoryName: '日常管理',
      name: '文档控制管理',
      applicableScope: '所有项目',
      steps: '1.文件命名统一\n2.版本管理\n3.审核流程\n4.归档要求',
      relatedChecklist: 'DC-CHK-DEFAULT',
    },
    {
      categoryName: '日常管理',
      name: '团建费管理',
      applicableScope: '所有海外项目',
      steps: '按照团建费记账表执行',
    },
    {
      categoryName: '日常管理',
      name: '安全管理流程',
      applicableScope: '所有海外项目',
      steps: '按安全生产事故处理办法执行',
    },
    {
      categoryName: '过程管理',
      name: '项目过程记录管理规范',
      applicableScope: '所有交付项目',
      triggerCondition: '项目启动后持续执行',
      inputMaterials: '会议纪要、进度说明、现场照片、问题记录',
      outputMaterials: '项目过程记录、问题闭环记录',
      responsibleRole: 'PROJECT_MANAGER',
      steps: '1.选择项目和记录类型\n2.填写简要说明\n3.上传相关文件或影像\n4.确认记录日期与阶段\n5.形成可追溯的过程档案',
      relatedArchive: '实施记录、验收记录、会议纪要',
    },
    {
      categoryName: '阶段评审',
      name: '项目阶段门评审流程',
      applicableScope: '所有交付项目',
      triggerCondition: '项目进入下一交付阶段前',
      inputMaterials: '阶段成果物、风险清单、未决事项',
      outputMaterials: '阶段评审结论、整改事项',
      responsibleRole: 'DELIVERY_MANAGER',
      steps: '1.检查阶段成果物\n2.确认风险和回款条件\n3.记录未决事项\n4.给出通过、条件通过或退回结论',
      riskNotes: '未完成关键成果物或关键回款条件时不得直接进入下一阶段。',
    },
    {
      categoryName: '成果物管理',
      name: '项目成果物发布与归档规范',
      applicableScope: '所有交付项目',
      triggerCondition: '成果物提交客户或内部发布前',
      inputMaterials: '待发布文档、审核意见、版本说明',
      outputMaterials: '受控版本文件、发布记录、归档索引',
      responsibleRole: 'STANDARD_ADMIN',
      steps: '1.核对命名和版本\n2.完成技术与质量审核\n3.发布受控版本\n4.上传项目档案\n5.废弃旧版本',
      relatedTemplates: '文档模板库',
      relatedArchive: '项目档案目录',
    },
  ];

  for (const doc of docs) {
    const categoryId = categoryIds[doc.categoryName];
    if (!categoryId) {
      console.warn(`  Skipping doc "${doc.name}": category "${doc.categoryName}" not found`);
      continue;
    }

    const existing = await prisma.workflowDocument.findFirst({ where: { name: doc.name, categoryId } });
    if (!existing) {
      await prisma.workflowDocument.create({
        data: {
          categoryId,
          name: doc.name,
          applicableScope: doc.applicableScope,
          triggerCondition: doc.triggerCondition,
          inputMaterials: doc.inputMaterials,
          outputMaterials: doc.outputMaterials,
          responsibleRole: doc.responsibleRole,
          steps: doc.steps,
          relatedChecklist: doc.relatedChecklist,
          relatedTemplates: doc.relatedTemplates,
          relatedArchive: doc.relatedArchive,
        },
      });
    }
  }

  console.log(`Seeded ${docs.length} workflow documents in ${categories.length} categories.`);
}
