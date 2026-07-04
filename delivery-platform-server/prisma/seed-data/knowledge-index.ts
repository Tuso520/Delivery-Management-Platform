export interface KnowledgeIndexEntry {
  category: string;
  title: string;
  summary: string;
  needsRevision?: boolean;
}

export const knowledgeIndexEntries: KnowledgeIndexEntry[] = [
  {
    category: '项目管理',
    title: '项目经理岗位职责',
    summary: '明确项目经理在范围、计划、成本、风险、沟通和交付验收中的责任边界。',
  },
  {
    category: '项目管理',
    title: '项目启动会组织指南',
    summary: '覆盖启动会准备、参会角色、会议议程、纪要输出和待办跟踪。',
  },
  {
    category: '项目管理',
    title: '项目变更签证管理办法',
    summary: '规范需求变更、现场签证、商务确认和资料归档的闭环要求。',
  },
  {
    category: '电气工程',
    title: '控制柜电源设计说明',
    summary: '沉淀控制柜、控制箱供电设计、容量校核和现场接线检查要点。',
  },
  {
    category: '电气工程',
    title: '电缆清单模板使用说明',
    summary: '说明电缆编号、起止点、规格、长度、施工状态和验收记录字段。',
  },
  {
    category: '电气工程',
    title: '标准点库维护规范',
    summary: '规范点位命名、采集频率、报警等级和调试验证记录。',
  },
  {
    category: '软件工程',
    title: '平台软件配置手册',
    summary: '覆盖项目软件版本、部署参数、第三方接口和上线前检查项。',
  },
  {
    category: '软件工程',
    title: '节能策略配置标准',
    summary: '沉淀空压、空调等节能项目的策略配置、灰度验证和回滚原则。',
  },
  {
    category: '软件工程',
    title: '项目软件版本管理',
    summary: '规范版本号、发布记录、配置备份、回归验证和客户交付包。',
  },
  {
    category: '运维管理',
    title: '海外项目远程巡检清单',
    summary: '定义远程连接、服务状态、备份状态、日志检查和异常升级流程。',
  },
  {
    category: '运维管理',
    title: '项目过程影像管理办法',
    summary: '规范现场照片、视频、录屏等影像资料的采集、命名和归档。',
  },
  {
    category: '运维管理',
    title: '标准项目服务器配置',
    summary: '沉淀交付项目服务器资源、系统账号、网络端口和安全基线。',
  },
  {
    category: '安全管理',
    title: '安全文明施工管理规定',
    summary: '覆盖现场安全交底、每日晨会、隐患整改和事故上报要求。',
  },
  {
    category: '安全管理',
    title: '安全生产事故处理办法',
    summary: '明确事故分级、响应时限、证据留存、客户沟通和复盘动作。',
  },
  {
    category: '通用标准',
    title: '人员能力模型',
    summary: '按岗位维护交付人员技能等级、认证资料、培训记录和晋级依据。',
  },
  {
    category: '通用标准',
    title: '文件字体统一规范',
    summary: '统一交付文档字体、字号、页眉页脚、命名和版本信息。',
  },
  {
    category: '通用标准',
    title: '现场安装规范',
    summary: '沉淀设备安装、布线、标识、拍照和验收的基础质量标准。',
    needsRevision: true,
  },
  {
    category: '流程标准',
    title: '项目交付流程总览',
    summary: '从立项、启动、设计、实施、调试、验收到复盘的完整交付流程。',
  },
  {
    category: '流程标准',
    title: '项目标准文件夹',
    summary: '定义项目资料的标准目录结构、责任人、必传文件和验收规则。',
  },
  {
    category: '流程标准',
    title: '项目复盘清单',
    summary: '沉淀项目结束后的复盘问题、经验、改进动作和知识库回写。',
  },
  {
    category: '绩效与激励',
    title: '项目工时统计',
    summary: '按人员、项目、阶段和任务统计工时，为绩效和成本分析提供依据。',
  },
  {
    category: '绩效与激励',
    title: '月度员工 OKR',
    summary: '维护月度目标、关键结果、项目占比、评分人和复盘记录。',
  },
  {
    category: '团队文化',
    title: '交付中心团队文化',
    summary: '统一团队价值观、协同方式、问题升级机制和经验分享要求。',
  },
  {
    category: '日常制度',
    title: '项目文档控制管理办法',
    summary: '规范文档命名、版本、审核、发布、借阅、归档和废止管理。',
  },
  {
    category: '客户与跨文化',
    title: '跨文化沟通指南',
    summary: '沉淀海外客户沟通、会议礼仪、时区协同和问题表达方式。',
  },
  {
    category: '物流与供应商',
    title: '进出口全流程',
    summary: '覆盖海外设备发运、报关、清关、到货验收和异常处理。',
  },
];
