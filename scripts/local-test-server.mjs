import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = normalize(join(__dirname, '..'));
const webDist = join(projectRoot, 'delivery-platform-web', 'dist');
const knowledgeCatalogPath = join(projectRoot, 'delivery-platform-server', 'prisma', 'seed-data', 'knowledge-catalog.json');
const knowledgeSampleDir = join(projectRoot, 'delivery-platform-server', 'prisma', 'seed-files', 'knowledge-catalog');
const localStorageRoot = join(projectRoot, 'storage', 'local-test');
const port = Number(process.env.LOCAL_TEST_PORT || 18080);
const host = process.env.LOCAL_TEST_HOST || '127.0.0.1';
const now = () => new Date().toISOString();

const adminUser = {
  id: 'user-admin',
  sub: 'user-admin',
  username: 'admin',
  realName: '系统管理员',
  email: 'admin@delivery-platform.local',
  avatar: '',
  roles: ['SUPER_ADMIN'],
  permissions: ['*'],
};

const projectManagerUser = {
  id: 'user-pm-wang',
  sub: 'user-pm-wang',
  username: 'pm_wang',
  realName: '王经理',
  email: 'wangjl@delivery-platform.local',
  avatar: '',
  roles: ['PROJECT_MANAGER'],
  permissions: [
    'dashboard:view',
    'todo:view',
    'project:view',
    'project:update',
    'project:manage_member',
    'project:archive',
    'archive:view',
    'archive:upload',
    'archive:review',
    'file:view',
    'file:upload',
    'file:download',
    'file:preview',
    'file:review',
    'checklist:view',
    'checklist:create',
    'checklist:update',
    'checklist:submit',
    'checklist:review',
    'report:view',
    'report:create',
    'report:update',
    'report:submit',
    'retrospective:view',
    'retrospective:create',
    'retrospective:update',
    'attachment:upload',
    'attachment:delete',
    'approval:view',
    'approval:process',
  ],
};

let activeUser = adminUser;

const categories = [
  {
    id: 'cat-project',
    name: '项目管理',
    description: '项目启动、计划、风险和复盘知识',
    parentId: null,
    sortOrder: 1,
    status: 'Active',
    createdAt: now(),
    updatedAt: now(),
    children: [],
  },
  {
    id: 'cat-electrical',
    name: '电气专业',
    description: '电气设计、调试和现场交付标准',
    parentId: null,
    sortOrder: 2,
    status: 'Active',
    createdAt: now(),
    updatedAt: now(),
    children: [],
  },
  {
    id: 'cat-software',
    name: '软件专业',
    description: '软件部署、接口联调和验收文档',
    parentId: null,
    sortOrder: 3,
    status: 'Active',
    createdAt: now(),
    updatedAt: now(),
    children: [],
  },
];

let articles = [
  {
    id: 'article-preview',
    categoryId: 'cat-software',
    title: '知识库附件在线查阅测试样例',
    countryCode: 'CN',
    projectType: 'software',
    stageCode: 'delivery',
    applicableRole: 'SOFTWARE_ENGINEER',
    contentType: 'article',
    fileUrl: null,
    fileSize: null,
    fileExt: null,
    markdownContent: [
      '# 知识库在线预览测试',
      '',
      '该条目用于验证 doc、xlsx、ppt、pdf、图片等附件在知识库内可上传、可列表展示、可在线查阅。',
      '',
      '- 文档类：使用 HTML 文档预览器展示关键内容。',
      '- 表格类：按工作表和单元格渲染。',
      '- 演示类：按页面内容渲染。',
      '- PDF / 图片：走浏览器原生预览。',
    ].join('\n'),
    sourceStatus: 'Ready',
    needsRevision: false,
    background: null,
    standardPractice: null,
    steps: null,
    notes: null,
    commonMistakes: null,
    relatedFlow: 'workflow-delivery',
    relatedChecklist: 'checklist-delivery',
    relatedTemplate: 'template-delivery',
    version: 'V1.0',
    status: 'Published',
    authorId: 'user-admin',
    reviewerId: null,
    publishedAt: now(),
    createdAt: now(),
    updatedAt: now(),
    category: { id: 'cat-software', name: '软件专业' },
    author: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
    reviewer: null,
    versions: [
      {
        id: 'version-preview-1',
        version: 'V1.0',
        changeNotes: '本地联调样例',
        createdAt: now(),
        creator: { id: 'user-admin', realName: '系统管理员' },
      },
    ],
  },
  {
    id: 'article-electrical',
    categoryId: 'cat-electrical',
    title: '电气调试交付检查知识',
    countryCode: 'CN',
    projectType: 'electrical',
    stageCode: 'commissioning',
    applicableRole: 'ELEC_ENGINEER',
    contentType: 'article',
    fileUrl: null,
    fileSize: null,
    fileExt: null,
    markdownContent: '现场调试前应完成图纸版本核对、设备铭牌确认、回路检查和安全隔离记录。',
    sourceStatus: 'Ready',
    needsRevision: false,
    background: null,
    standardPractice: null,
    steps: null,
    notes: null,
    commonMistakes: null,
    relatedFlow: '',
    relatedChecklist: '',
    relatedTemplate: '',
    version: 'V1.0',
    status: 'Published',
    authorId: 'user-admin',
    reviewerId: null,
    publishedAt: now(),
    createdAt: now(),
    updatedAt: now(),
    category: { id: 'cat-electrical', name: '电气专业' },
    author: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
    reviewer: null,
    versions: [],
  },
];

let attachments = [
  {
    id: 'att-doc',
    ownerType: 'KnowledgeArticle',
    ownerId: 'article-preview',
    category: 'document',
    originalName: '知识库-DOC-预览样例.doc',
    fileExt: 'doc',
    fileSize: '4096',
    mimeType: 'application/msword',
    createdAt: now(),
    uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
  },
  {
    id: 'att-xlsx',
    ownerType: 'KnowledgeArticle',
    ownerId: 'article-preview',
    category: 'document',
    originalName: '知识库-XLSX-预览样例.xlsx',
    fileExt: 'xlsx',
    fileSize: '8192',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    createdAt: now(),
    uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
  },
  {
    id: 'att-ppt',
    ownerType: 'KnowledgeArticle',
    ownerId: 'article-preview',
    category: 'document',
    originalName: '知识库-PPT-预览样例.ppt',
    fileExt: 'ppt',
    fileSize: '6144',
    mimeType: 'application/vnd.ms-powerpoint',
    createdAt: now(),
    uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
  },
  {
    id: 'att-pdf',
    ownerType: 'KnowledgeArticle',
    ownerId: 'article-preview',
    category: 'document',
    originalName: '知识库-PDF-预览样例.pdf',
    fileExt: 'pdf',
    fileSize: '2048',
    mimeType: 'application/pdf',
    createdAt: now(),
    uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
  },
  {
    id: 'att-image',
    ownerType: 'KnowledgeArticle',
    ownerId: 'article-preview',
    category: 'document',
    originalName: '知识库-图片-预览样例.png',
    fileExt: 'png',
    fileSize: '1024',
    mimeType: 'image/png',
    createdAt: now(),
    uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
  },
];

const knowledgeCatalog = JSON.parse(readFileSync(knowledgeCatalogPath, 'utf8'));
const knowledgeFixture = buildKnowledgeFixture(knowledgeCatalog);
adminUser.realName = '系统管理员';
categories.splice(0, categories.length, ...knowledgeFixture.categoryRows);
let categoryTree = knowledgeFixture.categoryTree;
articles = knowledgeFixture.articles;
attachments = knowledgeFixture.attachments;
let approvalTasks = [];

const localUsers = [
  adminUser,
  projectManagerUser,
  { id: 'user-sales-li', username: 'sales_li', realName: '李销售', email: 'sales.li@delivery-platform.local' },
  { id: 'user-elec-chen', username: 'elec_chen', realName: '陈电气', email: 'elec.chen@delivery-platform.local' },
  { id: 'user-sw-zhao', username: 'sw_zhao', realName: '赵软件', email: 'sw.zhao@delivery-platform.local' },
];

const archiveStageDefinitions = [
  { stageCode: '01_presale', stageName: '售前与合同' },
  { stageCode: '02_design', stageName: '深化方案' },
  { stageCode: '03_procurement', stageName: '采购与生产' },
  { stageCode: '04_construction', stageName: '施工与调试' },
  { stageCode: '05_acceptance', stageName: '验收与移交' },
  { stageCode: '06_review', stageName: '收尾与复盘' },
  { stageCode: '07_misc', stageName: '其他杂项' },
];

const archiveUploadGuides = {
  '01_presale': [
    ['合同与中标文件', '上传合同、补充协议、中标通知书和商务确认记录，便于后续验收与回款核对。'],
    ['项目启动资料', '上传启动会纪要、项目章程、范围边界说明和客户联系人清单。'],
    ['需求确认材料', '上传需求调研表、客户确认邮件、需求冻结记录和变更风险说明。'],
    ['项目成员任命', '上传项目经理、软件、电气、采购、财务等岗位任命与职责分工。'],
    ['交付计划基线', '上传总进度计划、里程碑清单、资源计划和关键路径说明。'],
    ['风险初评记录', '上传合同风险、技术风险、现场风险和客户配合风险初评表。'],
    ['客户资料接入', '上传客户现场网络、设备、组织、沟通窗口和资料接收规则。'],
    ['回款节点计划', '上传合同回款节点、开票要求、验收触发条件和责任人说明。'],
    ['合规与保密要求', '上传客户保密协议、资料权限要求、跨境数据限制和审批记录。'],
    ['启动阶段审批', '上传启动阶段内部审批、领导确认和阶段门放行材料。'],
  ],
  '02_design': [
    ['深化设计输入', '上传客户图纸、设备参数、软件接口、点表和现场边界条件。'],
    ['方案评审记录', '上传方案评审会议纪要、评审问题清单、整改闭环和客户确认。'],
    ['电气设计文件', '上传控制柜图纸、原理图、接线图、IO 分配和电源设计说明。'],
    ['软件设计文件', '上传架构说明、部署拓扑、接口清单、账号权限和数据点配置。'],
    ['设备选型清单', '上传主要设备选型、品牌型号、技术参数和替代方案审批。'],
    ['材料清单与 BOM', '上传 BOM、备件清单、线缆清册、辅材清单和版本说明。'],
    ['图纸会审记录', '上传内部会审、客户会审、供应商会审和问题关闭记录。'],
    ['设计变更记录', '上传变更申请、影响分析、成本工期评估和审批结果。'],
    ['设计输出基线', '上传已冻结的设计输出包，标明版本、适用范围和发布日期。'],
    ['设计阶段放行', '上传设计阶段门评审表、放行审批和遗留问题清单。'],
  ],
  '03_procurement': [
    ['采购计划', '上传采购计划、交期要求、供应商责任人和风险物料预警。'],
    ['供应商报价', '上传供应商报价、比价表、技术澄清和商务谈判记录。'],
    ['采购合同', '上传采购合同、订单、交付条款、质保要求和付款节点。'],
    ['生产进度记录', '上传生产排程、过程照片、质检记录和延期风险说明。'],
    ['出厂验收资料', '上传 FAT 记录、测试报告、整改记录和出厂放行单。'],
    ['包装与发运清单', '上传装箱单、包装照片、运输计划、保险和物流单号。'],
    ['进出口资料', '上传发票、箱单、报关资料、原产地证明和清关要求。'],
    ['到货验收记录', '上传到货照片、数量核对、破损记录和客户签收凭证。'],
    ['采购变更审批', '上传替代物料、供应商变更、费用变更和审批记录。'],
    ['采购阶段放行', '上传采购阶段门评审、遗留问题和下一阶段交接清单。'],
  ],
  '04_construction': [
    ['进场准备', '上传进场申请、人员资质、安全培训、工具设备和施工计划。'],
    ['现场交底记录', '上传技术交底、安全交底、客户协调会议纪要和签到表。'],
    ['安装过程记录', '上传安装照片、隐蔽工程记录、设备定位和线缆敷设记录。'],
    ['安全文明施工', '上传安全晨会、风险告知、整改通知和安全检查记录。'],
    ['施工质量检查', '上传质量检查表、问题整改单、复验记录和客户确认。'],
    ['现场变更签证', '上传现场签证、工程量确认、费用影响和客户签字材料。'],
    ['软件部署记录', '上传服务器配置、软件版本、部署日志和回滚方案。'],
    ['联调准备清单', '上传联调条件确认、网络开通、账号权限和测试用例。'],
    ['现场问题清单', '上传问题台账、责任人、解决期限和关闭证据。'],
    ['施工阶段放行', '上传施工阶段验收、调试准入和阶段门审批材料。'],
  ],
  '05_acceptance': [
    ['单机调试记录', '上传单机调试表、参数记录、问题处理和复测结论。'],
    ['系统联调记录', '上传系统联调报告、接口测试、性能测试和异常记录。'],
    ['客户培训资料', '上传培训课件、签到表、考核记录和客户反馈。'],
    ['试运行记录', '上传试运行日志、值班记录、报警处理和稳定性说明。'],
    ['验收测试报告', '上传 SAT、UAT、功能验收、性能验收和客户签字报告。'],
    ['移交资料清单', '上传最终图纸、软件包、账号清单、操作手册和维护资料。'],
    ['问题关闭记录', '上传验收遗留问题、责任人、关闭证据和客户确认。'],
    ['验收会议纪要', '上传验收会纪要、参会人员、结论和后续安排。'],
    ['回款触发材料', '上传验收证明、开票申请、回款节点证明和财务交接。'],
    ['验收阶段放行', '上传验收阶段门审批、移交确认和结项条件检查。'],
  ],
  '06_review': [
    ['项目复盘报告', '上传进度、成本、质量、客户满意度和风险复盘报告。'],
    ['经验教训清单', '上传成功经验、失败教训、可复用模板和改进建议。'],
    ['成本结算资料', '上传成本归集、供应商结算、差旅费用和预算偏差分析。'],
    ['合同收尾文件', '上传合同关闭、质保条款、尾款计划和法律风险确认。'],
    ['质保移交资料', '上传质保联系人、备件清单、维护周期和服务响应机制。'],
    ['客户满意度', '上传客户评价、满意度调查、投诉处理和改进措施。'],
    ['内部绩效材料', '上传项目团队绩效、贡献记录、奖惩建议和审批。'],
    ['资料归档确认', '上传档案完整性检查、缺失说明、涉密资料处理记录。'],
    ['改进事项跟踪', '上传改进任务、责任人、完成期限和跟踪状态。'],
    ['项目关闭审批', '上传项目关闭申请、领导审批和系统归档确认。'],
  ],
  '07_misc': [
    ['客户临时资料', '上传客户临时要求、说明材料和有效期备注。'],
    ['第三方检测资料', '上传第三方检测报告、证书、校准记录和整改证明。'],
    ['特殊工具软件', '上传临时工具、授权文件、使用说明和安全确认。'],
    ['现场影像素材', '上传照片、视频、铭牌、整改前后对比和拍摄清单。'],
    ['跨文化沟通记录', '上传海外沟通纪要、翻译确认、文化差异处理记录。'],
    ['物流异常记录', '上传清关异常、运输延误、破损处理和索赔资料。'],
    ['供应商往来资料', '上传供应商澄清、邮件、会议纪要和承诺文件。'],
    ['客户管理资料', '上传客户组织关系、关键联系人、沟通偏好和注意事项。'],
    ['临时审批材料', '上传不属于固定流程但需要留痕的临时审批。'],
    ['其他归档说明', '上传无法归入前述目录的资料，并在备注中说明原因。'],
  ],
};

const localProjects = buildLocalProjects();
let archiveItems = buildLocalArchiveItems(localProjects);
let projectFiles = buildLocalProjectFiles(localProjects, archiveItems);
let fileReviews = buildLocalFileReviews(projectFiles, archiveItems, localProjects);

const dictionaries = {
  project_type: {
    id: 'dict-project-type',
    categoryCode: 'project_type',
    categoryName: '项目类型',
    items: [
      { id: 'pt-software', itemValue: 'software', itemLabel: '软件交付', status: 'Active', sortOrder: 1 },
      { id: 'pt-electrical', itemValue: 'electrical', itemLabel: '电气交付', status: 'Active', sortOrder: 2 },
    ],
  },
  project_stage: {
    id: 'dict-project-stage',
    categoryCode: 'project_stage',
    categoryName: '项目阶段',
    items: [
      { id: 'stage-design', itemValue: 'design', itemLabel: '设计阶段', status: 'Active', sortOrder: 1 },
      { id: 'stage-delivery', itemValue: 'delivery', itemLabel: '交付阶段', status: 'Active', sortOrder: 2 },
      { id: 'stage-commissioning', itemValue: 'commissioning', itemLabel: '调试阶段', status: 'Active', sortOrder: 3 },
    ],
  },
};

function buildKnowledgeFixture(catalog) {
  const categoryRows = [];
  const articleRows = [];
  const attachmentRows = [];

  catalog.modules.forEach((module, moduleIndex) => {
    const moduleCategory = makeCategory({
      id: `cat-${module.id}`,
      name: module.name,
      description: module.description,
      parentId: null,
      sortOrder: (moduleIndex + 1) * 10,
    });
    categoryRows.push(moduleCategory);

    module.contents.forEach((content) => {
      const articleId = `article-${module.id}-${content.id}`;
      const article = {
        id: articleId,
        categoryId: moduleCategory.id,
        title: `${module.name} - ${content.title}`,
        countryCode: 'CN',
        projectType: inferProjectType(module.id),
        stageCode: inferStageCode(module.id),
        applicableRole: inferRole(module.id),
        contentType: 'article',
        fileUrl: null,
        fileSize: null,
        fileExt: null,
        markdownContent: buildKnowledgeMarkdown(module, content),
        sourceStatus: 'Ready',
        needsRevision: content.files.some((file) => file.needsRevision),
        background: module.description,
        standardPractice: '按知识分类维护文件索引，附件必须可下载、可在线查阅，并按修订状态维护。',
        steps: null,
        notes: content.updateFrequency ? `更新频率：${content.updateFrequency}` : null,
        commonMistakes: null,
        relatedFlow: 'workflow-delivery',
        relatedChecklist: 'checklist-delivery',
        relatedTemplate: 'template-delivery',
        version: 'V1.0',
        status: 'Published',
        authorId: 'user-admin',
        reviewerId: null,
        publishedAt: now(),
        createdAt: now(),
        updatedAt: now(),
        category: { id: moduleCategory.id, name: moduleCategory.name },
        author: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
        reviewer: null,
        versions: [
          {
            id: `version-${articleId}-1`,
            version: 'V1.0',
            changeNotes: '标准知识库目录初始化',
            createdAt: now(),
            creator: { id: 'user-admin', realName: '系统管理员' },
          },
        ],
      };
      articleRows.push(article);

      content.files.forEach((file, fileIndex) => {
        const samplePath = join(knowledgeSampleDir, file.name);
        attachmentRows.push({
          id: `att-${module.id}-${content.id}-${fileIndex + 1}`,
          ownerType: 'KnowledgeArticle',
          ownerId: articleId,
          category: 'document',
          originalName: file.name,
          fileExt: fileExt(file.name),
          fileSize: String(fileSize(samplePath)),
          mimeType: mimeTypeFor(file.name),
          storagePath: samplePath,
          createdAt: now(),
          uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
        });
      });
    });
  });

  return {
    categoryRows,
    categoryTree: buildCategoryTree(categoryRows),
    articles: articleRows,
    attachments: attachmentRows,
  };
}

function makeCategory({ id, name, description, parentId, sortOrder }) {
  return {
    id,
    name,
    description,
    parentId,
    sortOrder,
    status: 'Active',
    createdAt: now(),
    updatedAt: now(),
    children: [],
  };
}

function buildCategoryTree(rows) {
  const clones = new Map(rows.map((category) => [category.id, { ...category, children: [] }]));
  const roots = [];
  rows.forEach((category) => {
    const node = clones.get(category.id);
    const parent = category.parentId ? clones.get(category.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function rebuildCategoryTree() {
  categoryTree = buildCategoryTree(categories);
}

function descendantCategoryIds(parentId) {
  const directChildren = categories.filter((category) => category.parentId === parentId);
  return directChildren.flatMap((category) => [
    category.id,
    ...descendantCategoryIds(category.id),
  ]);
}

function withArticleFileCounts(list) {
  return list.map((article) => ({
    ...article,
    files: articleFiles(article.id),
    fileCount: articleFiles(article.id).length,
  }));
}

function articleFiles(articleId) {
  return attachments.filter((attachment) =>
      attachment.ownerType === 'KnowledgeArticle'
      && attachment.ownerId === articleId
      && !attachment.deletedAt
    );
}

function parseAttachmentRemark(remark) {
  if (!remark) return {};
  try {
    const parsed = JSON.parse(remark);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function attachmentSummary(item) {
  if (!item) return null;
  return {
    id: item.id,
    ownerType: item.ownerType,
    ownerId: item.ownerId,
    category: item.category,
    originalName: item.originalName,
    fileExt: item.fileExt,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    createdAt: item.createdAt,
    uploader: item.uploader,
  };
}

function buildFileRevisionDiff(revisionId) {
  const revision = attachments.find((item) =>
    item.id === revisionId
    && item.ownerType === 'KnowledgeFileRevision'
    && !item.deletedAt
  );
  if (!revision) return null;
  const payload = parseAttachmentRemark(revision.remark);
  const originalId = payload.originalAttachmentId || revision.ownerId;
  const original = attachments.find((item) =>
    item.id === originalId
    && item.ownerType === 'KnowledgeArticle'
    && !item.deletedAt
  );
  if (!original) return null;
  const articleId = payload.articleId || original.ownerId;
  const article = articles.find((item) => item.id === articleId);
  const changes = [
    ['文件名', original.originalName, revision.originalName],
    ['扩展名', original.fileExt, revision.fileExt],
    ['文件大小', String(original.fileSize), String(revision.fileSize)],
    ['MIME 类型', original.mimeType, revision.mimeType],
  ].map(([label, before, after]) => ({
    label,
    before,
    after,
    changed: before !== after,
  }));
  return {
    article: article
      ? {
          id: article.id,
          title: article.title,
          version: article.version,
          status: article.status,
          category: article.category,
        }
      : null,
    original: attachmentSummary(original),
    incoming: attachmentSummary(revision),
    changes,
    submittedAt: payload.submittedAt || revision.createdAt,
  };
}

function createApprovalTask({ businessType, businessId, businessTitle, applicantId }) {
  const task = {
    id: `approval-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    businessType,
    businessId,
    businessTitle,
    applicantId,
    currentStep: 1,
    approverId: 'user-admin',
    status: 'Pending',
    comment: '',
    createdAt: now(),
    updatedAt: now(),
    template: {
      templateCode: businessType === 'knowledge-file-update' ? 'KNOWLEDGE_FILE_UPDATE' : 'KNOWLEDGE_PUBLISH',
      templateName: businessType === 'knowledge-file-update' ? '知识库文件更新审批' : '知识发布审核',
    },
    applicant: adminUser,
    approver: adminUser,
    actions: [
      {
        id: `approval-action-${Date.now()}`,
        stepOrder: 1,
        action: 'Submitted',
        comment: '发起审批',
        createdAt: now(),
        actor: adminUser,
      },
    ],
  };
  approvalTasks = [task, ...approvalTasks];
  return task;
}

function applyApprovalDecision(task, decision, comment) {
  task.status = decision;
  task.comment = comment || '';
  task.decidedAt = now();
  task.updatedAt = now();
  task.actions.push({
    id: `approval-action-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    stepOrder: task.currentStep,
    action: decision,
    comment: comment || '',
    createdAt: now(),
    actor: adminUser,
  });

  if (task.businessType !== 'knowledge-file-update') return;
  const revision = attachments.find((item) =>
    item.id === task.businessId
    && item.ownerType === 'KnowledgeFileRevision'
    && !item.deletedAt
  );
  if (!revision) return;
  const payload = parseAttachmentRemark(revision.remark);
  const originalId = payload.originalAttachmentId || revision.ownerId;
  const original = attachments.find((item) =>
    item.id === originalId
    && item.ownerType === 'KnowledgeArticle'
    && !item.deletedAt
  );
  if (!original) return;

  if (decision === 'Rejected') {
    revision.deletedAt = now();
    revision.remark = JSON.stringify({ ...payload, decision, comment, decidedAt: now() });
    return;
  }

  original.deletedAt = now();
  const articleId = payload.articleId || original.ownerId;
  revision.ownerType = 'KnowledgeArticle';
  revision.ownerId = articleId;
  revision.category = original.category || 'document';
  revision.remark = JSON.stringify({ ...payload, decision, comment, originalAttachmentId: originalId, decidedAt: now() });
  const article = articles.find((item) => item.id === articleId);
  if (article) {
    const currentVersion = Number.parseFloat(String(article.version || 'V1.0').replace('V', ''));
    article.version = `V${((Number.isFinite(currentVersion) ? currentVersion : 1) + 0.1).toFixed(1)}`;
    article.status = 'Published';
    article.updatedAt = now();
    article.publishedAt = now();
    article.versions = [
      {
        id: `version-${article.id}-${Date.now()}`,
        version: article.version,
        changeNotes: `附件更新审批通过：${original.originalName}`,
        createdAt: now(),
        creator: { id: 'user-admin', realName: adminUser.realName },
      },
      ...(article.versions || []),
    ];
  }
}

function findLocalUser(id) {
  return localUsers.find((user) => user.id === id) || adminUser;
}

function makeProjectMember(projectId, user, role, index) {
  return {
    id: `member-${projectId}-${role.toLowerCase()}`,
    projectId,
    userId: user.id,
    projectRole: role,
    permissionLevel: role === 'PROJECT_MANAGER' ? 'admin' : 'write',
    dataScope: 'project',
    createdAt: now(),
    updatedAt: now(),
    user: {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
    },
    sortOrder: index,
  };
}

function buildLocalProjects() {
  const seed = [
    ['project-1', 'CN-SH-ACME-EMS-SW-2026', '上海 ACME 能源管理平台交付', 'CN', '上海', '上海示例客户', 'software', 'Active', 'Medium', '02_design', 1680000, 'CNY', 1],
    ['project-2', 'VN-HCM-FACTORY-ELEC-2026', '越南胡志明工厂电气调试', 'VN', '胡志明', '越南示例客户', 'electrical', 'Delayed', 'High', '04_construction', 260000, 'USD', 7.2],
    ['project-3', 'TH-BKK-HVAC-SW-2026', '泰国曼谷空调节能系统交付', 'TH', '曼谷', '泰国工业园客户', 'software', 'Active', 'Low', '03_procurement', 185000, 'USD', 7.2],
    ['project-4', 'MY-KUL-DATA-ELEC-2026', '马来西亚数据中心配电改造', 'MY', '吉隆坡', '马来西亚数据中心', 'electrical', 'Active', 'Medium', '02_design', 940000, 'CNY', 1],
    ['project-5', 'ID-JKT-WATER-SW-2026', '印尼雅加达水务平台升级', 'ID', '雅加达', '印尼水务集团', 'software', 'Active', 'Medium', '05_acceptance', 212000, 'USD', 7.2],
    ['project-6', 'AE-DXB-LOGI-ELEC-2026', '迪拜物流园电气监控项目', 'AE', '迪拜', '迪拜物流园客户', 'electrical', 'Suspended', 'High', '03_procurement', 430000, 'USD', 7.2],
    ['project-7', 'CN-SZ-BATTERY-SW-2026', '深圳电池工厂软件部署', 'CN', '深圳', '深圳新能源客户', 'software', 'Active', 'Low', '04_construction', 1280000, 'CNY', 1],
    ['project-8', 'SA-RYD-STEEL-ELEC-2026', '沙特利雅得钢厂电气联调', 'SA', '利雅得', '沙特钢铁客户', 'electrical', 'Active', 'Critical', '05_acceptance', 510000, 'USD', 7.2],
    ['project-9', 'BR-SP-CEMENT-SW-2026', '巴西圣保罗水泥线节能平台', 'BR', '圣保罗', '巴西水泥客户', 'software', 'Draft', 'Medium', '01_presale', 320000, 'USD', 7.2],
    ['project-10', 'CN-BJ-PHARM-ELEC-2026', '北京制药厂电气改造项目', 'CN', '北京', '北京制药客户', 'electrical', 'Accepted', 'Low', '06_review', 1560000, 'CNY', 1],
  ];

  const sales = findLocalUser('user-sales-li');
  const pm = projectManagerUser;
  const elec = findLocalUser('user-elec-chen');
  const sw = findLocalUser('user-sw-zhao');

  return seed.map((row, index) => {
    const [
      id,
      projectCode,
      projectName,
      countryCode,
      city,
      customerName,
      projectType,
      projectStatus,
      riskLevel,
      currentStage,
      contractAmount,
      contractCurrency,
      exchangeRate,
    ] = row;
    const baseAmount = Number(contractAmount) * Number(exchangeRate);
    const members = [
      makeProjectMember(id, sales, 'SALES_OWNER', 1),
      makeProjectMember(id, pm, 'PROJECT_MANAGER', 2),
      makeProjectMember(id, elec, 'ELEC_LEADER', 3),
      makeProjectMember(id, sw, 'SOFTWARE_LEADER', 4),
    ];

    return {
      id,
      projectCode,
      projectName,
      countryCode,
      city,
      customerName,
      projectType,
      contractCurrency,
      baseCurrency: 'CNY',
      currencyCode: contractCurrency,
      contractAmount: Number(contractAmount),
      exchangeRate: Number(exchangeRate),
      convertedAmount: Math.round(baseAmount),
      baseCurrencyAmount: Math.round(baseAmount),
      exchangeRateDate: '2026-07-08',
      exchangeRateSource: 'local-test',
      projectLanguage: 'zh-CN',
      salesOwnerId: sales.id,
      projectManagerId: pm.id,
      electricLeaderId: elec.id,
      softwareLeaderId: sw.id,
      currentStage,
      projectStatus,
      riskLevel,
      startDate: `2026-0${(index % 6) + 1}-01`,
      plannedStartDate: `2026-0${(index % 6) + 1}-01`,
      plannedEndDate: `2026-${String((index % 6) + 6).padStart(2, '0')}-28`,
      createdBy: adminUser.id,
      createdAt: now(),
      updatedAt: now(),
      projectManager: { id: pm.id, realName: pm.realName },
      members,
    };
  });
}

function buildLocalArchiveItems(projects) {
  return projects.flatMap((project) =>
    archiveStageDefinitions.flatMap((stage, stageIndex) =>
      archiveUploadGuides[stage.stageCode].map(([name, usageDescription], itemIndex) => {
        const serial = stageIndex * 100 + itemIndex + 1;
        return {
          id: `archive-${project.id}-${stage.stageCode}-${String(itemIndex + 1).padStart(2, '0')}`,
          projectId: project.id,
          templateItemId: `tpl-${stage.stageCode}-${String(itemIndex + 1).padStart(2, '0')}`,
          parentId: null,
          stageCode: stage.stageCode,
          itemNo: serial,
          level: 1,
          name,
          secondName: name,
          usageDescription,
          isRequired: itemIndex < 7,
          isStar: itemIndex % 4 === 0,
          isSensitive: /合同|账号|保密|客户/.test(name),
          needReview: true,
          allowedFileTypes: 'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,md',
          responsibleUserId: project.projectManagerId,
          reviewUserId: adminUser.id,
          status: 'PendingUpload',
          dueDate: project.plannedEndDate,
          completedAt: null,
          sortOrder: serial,
          createdAt: now(),
          updatedAt: now(),
        };
      }),
    ),
  );
}

function buildLocalProjectFiles(projects, items) {
  const extensions = ['docx', 'xlsx', 'pdf', 'pptx', 'png', 'docx', 'xlsx', 'pdf', 'docx', 'xlsx', 'pptx', 'pdf'];
  const files = [];
  projects.forEach((project) => {
    const projectItems = items.filter((item) => item.projectId === project.id).slice(0, 12);
    projectItems.forEach((item, index) => {
      const ext = extensions[index % extensions.length];
      const status = index % 5 === 0 ? 'Reviewing' : 'Approved';
      item.status = status;
      item.completedAt = status === 'Approved' ? now() : null;
      files.push({
        id: `file-${project.id}-${String(index + 1).padStart(2, '0')}`,
        projectId: project.id,
        archiveItemId: item.id,
        fileName: `${item.name}.${ext}`,
        originalName: `${item.name}.${ext}`,
        fileExt: ext,
        fileSize: 24000 + index * 3072,
        mimeType: mimeTypeFor(`${item.name}.${ext}`),
        storagePath: null,
        versionNo: 'V1.0',
        isCurrent: status === 'Approved',
        fileStatus: status,
        uploadUserId: project.projectManagerId,
        uploadTime: now(),
        remark: item.usageDescription,
        createdAt: now(),
        updatedAt: now(),
      });
    });
  });
  return files;
}

function buildLocalFileReviews(files, items, projects) {
  return files
    .filter((file) => file.fileStatus === 'Reviewing')
    .map((file, index) => {
      const item = items.find((entry) => entry.id === file.archiveItemId);
      const project = projects.find((entry) => entry.id === file.projectId);
      return {
        id: `review-${file.id}`,
        fileId: file.id,
        archiveItemId: file.archiveItemId,
        reviewUserId: adminUser.id,
        reviewStatus: 'Pending',
        reviewComment: null,
        reviewTime: null,
        createdAt: now(),
        updatedAt: now(),
        reviewer: { id: adminUser.id, realName: adminUser.realName },
        file: {
          id: file.id,
          fileName: file.originalName,
          versionNo: file.versionNo,
          project: project
            ? { id: project.id, projectName: project.projectName, projectCode: project.projectCode }
            : null,
        },
        archiveItem: {
          id: item?.id || file.archiveItemId,
          name: item?.secondName || item?.name || '档案项',
        },
        sortOrder: index,
      };
    });
}

function attachArchiveRelations(item) {
  const responsibleUser = findLocalUser(item.responsibleUserId);
  const reviewUser = findLocalUser(item.reviewUserId || adminUser.id);
  return {
    ...item,
    responsibleUser: { id: responsibleUser.id, realName: responsibleUser.realName, username: responsibleUser.username },
    reviewUser: { id: reviewUser.id, realName: reviewUser.realName, username: reviewUser.username },
    files: projectFiles
      .filter((file) => file.archiveItemId === item.id && !file.deletedAt)
      .sort((a, b) => String(b.uploadTime).localeCompare(String(a.uploadTime)))
      .map(fileResponse),
    children: [],
  };
}

function archiveTreeForProject(projectId) {
  return {
    projectId,
    stages: archiveStageDefinitions.map((stage) => ({
      stageCode: stage.stageCode,
      items: archiveItems
        .filter((item) => item.projectId === projectId && item.stageCode === stage.stageCode && !item.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(attachArchiveRelations),
    })),
  };
}

function archiveStatisticsForProject(projectId) {
  const items = archiveItems.filter((item) => item.projectId === projectId && !item.deletedAt);
  const totalItems = items.length;
  const completedItems = items.filter((item) => ['Approved', 'Archived'].includes(item.status)).length;
  const requiredItems = items.filter((item) => item.isRequired).length;
  const starItems = items.filter((item) => item.isStar).length;
  return {
    totalItems,
    completedItems,
    requiredItems,
    starItems,
    completionRate: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    stages: archiveStageDefinitions.map((stage) => {
      const stageItems = items.filter((item) => item.stageCode === stage.stageCode);
      const stageCompleted = stageItems.filter((item) => ['Approved', 'Archived'].includes(item.status)).length;
      return {
        stageCode: stage.stageCode,
        stageName: stage.stageName,
        totalItems: stageItems.length,
        completedItems: stageCompleted,
        completionRate: stageItems.length ? Math.round((stageCompleted / stageItems.length) * 100) : 0,
      };
    }),
  };
}

function fileResponse(file) {
  const uploadUser = findLocalUser(file.uploadUserId || adminUser.id);
  return {
    ...file,
    uploadUser: {
      id: uploadUser.id,
      realName: uploadUser.realName,
    },
  };
}

function reviewResponse(review) {
  const file = projectFiles.find((entry) => entry.id === review.fileId);
  const item = archiveItems.find((entry) => entry.id === review.archiveItemId);
  const project = localProjects.find((entry) => entry.id === file?.projectId);
  return {
    ...review,
    reviewer: { id: adminUser.id, realName: adminUser.realName },
    file: {
      id: file?.id || review.fileId,
      fileName: file?.originalName || review.file?.fileName || '待审核文件',
      versionNo: file?.versionNo || 'V1.0',
      project: project
        ? { id: project.id, projectName: project.projectName, projectCode: project.projectCode }
        : null,
    },
    archiveItem: {
      id: item?.id || review.archiveItemId,
      name: item?.secondName || item?.name || '档案项',
    },
  };
}

function createProjectFile({ projectId, archiveItemId, originalName, fileSize, mimeType, storagePath, remark }) {
  const ext = fileExt(originalName);
  const file = {
    id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectId,
    archiveItemId,
    fileName: originalName,
    originalName,
    fileExt: ext,
    fileSize,
    mimeType: mimeType || mimeTypeFor(originalName),
    storagePath: storagePath || null,
    versionNo: 'V1.0',
    isCurrent: false,
    fileStatus: 'Reviewing',
    uploadUserId: activeUser.id,
    uploadTime: now(),
    remark: remark || '新上传文件，等待审核后成为当前版本。',
    createdAt: now(),
    updatedAt: now(),
  };
  projectFiles = [file, ...projectFiles];

  const item = archiveItems.find((entry) => entry.id === archiveItemId);
  if (item) {
    item.status = 'Reviewing';
    item.updatedAt = now();
  }

  const project = localProjects.find((entry) => entry.id === projectId);
  fileReviews = [
    {
      id: `review-${file.id}`,
      fileId: file.id,
      archiveItemId,
      reviewUserId: adminUser.id,
      reviewStatus: 'Pending',
      reviewComment: null,
      reviewTime: null,
      createdAt: now(),
      updatedAt: now(),
      reviewer: { id: adminUser.id, realName: adminUser.realName },
      file: {
        id: file.id,
        fileName: file.originalName,
        versionNo: file.versionNo,
        project: project
          ? { id: project.id, projectName: project.projectName, projectCode: project.projectCode }
          : null,
      },
      archiveItem: {
        id: item?.id || archiveItemId,
        name: item?.secondName || item?.name || '档案项',
      },
    },
    ...fileReviews,
  ];

  return file;
}

function decideProjectFile(fileId, decision, comment) {
  const file = projectFiles.find((entry) => entry.id === fileId && !entry.deletedAt);
  if (!file) return null;
  const review = fileReviews.find((entry) => entry.fileId === fileId && entry.reviewStatus === 'Pending');
  if (review) {
    review.reviewStatus = decision;
    review.reviewComment = comment || '';
    review.reviewTime = now();
    review.updatedAt = now();
  }

  const item = archiveItems.find((entry) => entry.id === file.archiveItemId);
  if (decision === 'Approved') {
    projectFiles.forEach((entry) => {
      if (entry.archiveItemId === file.archiveItemId && entry.id !== file.id) {
        entry.isCurrent = false;
      }
    });
    file.fileStatus = 'Approved';
    file.isCurrent = true;
    file.updatedAt = now();
    if (item) {
      item.status = 'Approved';
      item.completedAt = now();
      item.updatedAt = now();
    }
  } else {
    file.fileStatus = 'Rejected';
    file.isCurrent = false;
    file.updatedAt = now();
    if (item) {
      const hasApproved = projectFiles.some((entry) =>
        entry.archiveItemId === item.id
        && entry.fileStatus === 'Approved'
        && !entry.deletedAt
      );
      item.status = hasApproved ? 'Approved' : 'Rejected';
      item.updatedAt = now();
    }
  }
  return file;
}

function filePreview(file) {
  if (!file) return null;
  if (file.fileExt === 'pdf') {
    return {
      fileName: file.originalName,
      fileExt: file.fileExt,
      mimeType: file.mimeType,
      previewKind: 'pdf',
      viewer: 'pdf',
      title: file.originalName,
    };
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(file.fileExt)) {
    return {
      fileName: file.originalName,
      fileExt: file.fileExt,
      mimeType: file.mimeType,
      previewKind: 'image',
      viewer: 'image',
      title: file.originalName,
    };
  }
  const viewer = file.fileExt.includes('xls')
    ? 'spreadsheet'
    : file.fileExt.includes('ppt')
      ? 'presentation'
      : 'document';
  return {
    fileName: file.originalName,
    fileExt: file.fileExt,
    mimeType: file.mimeType,
    previewKind: 'html',
    viewer,
    title: file.originalName,
    html: buildOfficePreview(file),
  };
}

function buildKnowledgeMarkdown(module, content) {
  return [
    `# ${module.name} / ${content.title}`,
    '',
    module.description,
    '',
    content.updateFrequency ? `更新频率：${content.updateFrequency}` : '更新频率：按制度变更维护',
    '',
    '## 文件索引',
    '',
    '| 文件 | 类型 | 状态 |',
    '| --- | --- | --- |',
    ...content.files.map((file) =>
      `| ${file.name}（${content.title}） | ${labelForKind(file.kind)} | ${file.needsRevision ? '待修订' : '已生成'} |`,
    ),
    '',
    '## 测试要求',
    '',
    '1. 从左侧分类进入当前知识条目。',
    '2. 在附件列表点击“在线预览”。',
    '3. Word、Excel、PPT、PDF、图片均应能正常打开预览。',
  ].join('\n');
}

function inferProjectType(moduleId) {
  if (moduleId.includes('software')) return 'software';
  if (moduleId.includes('electrical')) return 'electrical';
  return 'delivery';
}

function inferStageCode(moduleId) {
  if (moduleId.includes('debug')) return 'commissioning';
  if (moduleId.includes('technical')) return 'design';
  return 'delivery';
}

function inferRole(moduleId) {
  if (moduleId.includes('software')) return 'SOFTWARE_ENGINEER';
  if (moduleId.includes('electrical')) return 'ELEC_ENGINEER';
  if (moduleId.includes('project-manager')) return 'PROJECT_MANAGER';
  return '';
}

function labelForKind(kind) {
  return {
    document: 'Word 文档',
    spreadsheet: 'Excel 表格',
    presentation: 'PPT 演示',
    pdf: 'PDF 文档',
    image: '图片',
  }[kind] ?? '文件';
}

function fileExt(fileName) {
  return extname(fileName).replace('.', '').toLowerCase();
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function mimeTypeFor(fileName) {
  const types = {
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
  return types[fileExt(fileName)] ?? 'application/octet-stream';
}

function envelope(data, message = 'ok', code = 0) {
  return { code, message, data, timestamp: now() };
}

function page(list, pageNumber = 1, pageSize = 100) {
  return {
    list,
    pagination: {
      page: Number(pageNumber) || 1,
      pageSize: Number(pageSize) || 100,
      total: list.length,
      totalPages: Math.max(1, Math.ceil(list.length / (Number(pageSize) || 100))),
    },
  };
}

function normalizeCategoryName(name) {
  return String(name ?? '').trim().toLocaleLowerCase('zh-CN');
}

function categoryDuplicate(name, parentId, excludeId) {
  const normalized = normalizeCategoryName(name);
  return categories.some((category) =>
    category.id !== excludeId
    && (category.parentId ?? null) === (parentId ?? null)
    && normalizeCategoryName(category.name) === normalized,
  );
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendRaw(res, buffer, contentType) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Content-Length': buffer.length,
  });
  res.end(buffer);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return {};
  }
}

function parseMultipart(buffer, contentTypeHeader) {
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(';')
    : String(contentTypeHeader ?? '');
  const boundary = contentType.match(/boundary=([^;]+)/i)?.[1];
  if (!boundary) return [];

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = buffer.indexOf(boundaryBuffer);

  while (cursor >= 0) {
    const partStart = cursor + boundaryBuffer.length;
    if (buffer.slice(partStart, partStart + 2).toString() === '--') break;

    const nextBoundary = buffer.indexOf(boundaryBuffer, partStart);
    if (nextBoundary < 0) break;

    let part = buffer.slice(partStart, nextBoundary);
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > 0) {
      const headerText = part.slice(0, headerEnd).toString('utf8');
      const data = part.slice(headerEnd + 4);
      const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] ?? '';
      const name = disposition.match(/name="([^"]+)"/i)?.[1] ?? '';
      const rawFilename = disposition.match(/filename="([^"]*)"/i)?.[1] ?? '';
      const filename = rawFilename || '';
      const contentType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim();
      if (name) {
        parts.push({ name, filename, contentType, data });
      }
    }

    cursor = nextBoundary;
  }

  return parts;
}

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-').slice(0, 140);
}

function attachmentPreview(id) {
  const item = attachments.find((attachment) => attachment.id === id);
  if (!item) return null;

  if (item.fileExt === 'pdf') {
    return {
      fileName: item.originalName,
      fileExt: item.fileExt,
      mimeType: item.mimeType,
      previewKind: 'pdf',
      viewer: 'pdf',
      title: item.originalName,
    };
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(item.fileExt)) {
    return {
      fileName: item.originalName,
      fileExt: item.fileExt,
      mimeType: item.mimeType,
      previewKind: 'image',
      viewer: 'image',
      title: item.originalName,
    };
  }

  const viewer = item.fileExt.includes('xls')
    ? 'spreadsheet'
    : item.fileExt.includes('ppt')
      ? 'presentation'
      : 'document';

  return {
    fileName: item.originalName,
    fileExt: item.fileExt,
    mimeType: item.mimeType,
    previewKind: 'html',
    viewer,
    title: item.originalName,
    html: buildOfficePreview(item),
  };
}

function buildOfficePreview(item) {
  if (item.fileExt.includes('xls')) {
    return [
      '<article class="attachment-preview office-excel">',
      '<div class="excel-workbook">',
      '<section class="preview-sheet"><h3>交付检查表</h3>',
      '<div class="preview-table-block"><div class="preview-table-caption">表 1</div>',
      '<div class="preview-table-wrap"><table>',
      '<tr><th>专业</th><th>检查项</th><th>责任人</th><th>状态</th><th>备注</th></tr>',
      '<tr><td>软件</td><td>部署包版本校验</td><td>软件工程师</td><td>通过</td><td>与项目台账版本一致</td></tr>',
      '<tr><td>电气</td><td>控制柜回路编号核对</td><td>电气工程师</td><td>通过</td><td>按交付清单复核</td></tr>',
      '<tr><td>项目</td><td>客户验收资料归档</td><td>项目经理</td><td>待审批</td><td>上传后进入审批流</td></tr>',
      '</table></div></div></section>',
      '<section class="preview-sheet"><h3>风险跟踪</h3>',
      '<div class="preview-table-block"><div class="preview-table-wrap"><table>',
      '<tr><th>风险项</th><th>等级</th><th>处理措施</th><th>计划完成</th></tr>',
      '<tr><td>现场网络未开通</td><td>中</td><td>提前协调客户 IT</td><td>2026-07-15</td></tr>',
      '<tr><td>设备资料缺页</td><td>低</td><td>供应商补传并复核</td><td>2026-07-18</td></tr>',
      '</table></div></div></section>',
      '</div></article>',
    ].join('');
  }

  if (item.fileExt.includes('ppt')) {
    return [
      '<article class="attachment-preview office-presentation">',
      '<section class="preview-slide"><span class="slide-page-no">1 / 3</span><div class="slide-content"><h3>交付目标</h3><ul class="slide-list"><li>统一知识沉淀、附件归档和在线查阅流程</li><li>按岗位一级目录维护资料，减少重复分类</li><li>更新内容进入审批并保留差异对比</li></ul></div></section>',
      '<section class="preview-slide"><span class="slide-page-no">2 / 3</span><div class="slide-content"><h3>专业适配</h3><ul class="slide-list"><li>项目经理关注进度、验收和客户沟通资料</li><li>电气工程师关注点表、图纸和设备配置资料</li><li>软件工程师关注部署、配置和远程交付资料</li></ul></div></section>',
      '<section class="preview-slide"><span class="slide-page-no">3 / 3</span><div class="slide-content"><h3>审批要求</h3><p>新增或替换资料后，由对应权限人员审批，审批完成后成为当前可查阅版本。</p></div></section>',
      '</article>',
    ].join('');
  }

  return [
    '<article class="attachment-preview office-word">',
    '<section class="word-page">',
    `<div class="word-page-meta">${item.originalName}</div>`,
    '<div class="word-body">',
    '<h1>项目交付资料在线预览样例</h1>',
    '<p>本文档用于验证 Word 类资料上传后，可在平台内以接近 Office/WPS 的纸张样式进行在线查阅。页面仅提供阅读能力，不提供在线编辑。</p>',
    '<h2>一、岗位归档要求</h2>',
    '<p>资料按照一级岗位目录归档，例如项目经理、电气工程师、软件工程师、运维管理等。二级说明通过文件简介和备注承载，不再进入左侧分类树。</p>',
    '<h2>二、审批与版本</h2>',
    '<p>当岗位职责、流程或模板文件需要更新时，提交人上传新版本，审批人查看新旧差异后确认。审批通过后，平台展示最新版本，旧版本作为历史记录保留。</p>',
    '<h2>三、查看要求</h2>',
    '<p>用户点击文件标题后直接打开在线预览，预览窗口应完整显示 Word、Excel、PPT、PDF 和图片内容，并记录预览热度与下载热度。</p>',
    '</div></section>',
    '</article>',
  ].join('');
}

function samplePdf(item = {}) {
  const safeName = (item.originalName || 'knowledge-preview.pdf').replace(/[^\x20-\x7e]/gu, ' ');
  const stream = [
    'BT',
    '/F1 20 Tf',
    '72 720 Td',
    `(${escapePdfText(safeName)}) Tj`,
    '/F1 12 Tf',
    '0 -34 Td',
    '(Delivery Management Platform PDF online preview verification.) Tj',
    '0 -22 Td',
    '(This page is generated by the local test server with valid xref offsets.) Tj',
    '0 -22 Td',
    '(Expected result: PDF.js renders this page inside the preview modal.) Tj',
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function samplePng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAASwAAACgCAYAAABkW7XSAAAACXBIWXMAAAsTAAALEwEAmpwYAAAEJElEQVR4nO3dQU7bQBiG0T9ogB24T9kF2CB7Aw6gwAt0AHaADeAG3QGIG1RFYhJpJ5E4h0yT8v4nGuxqS4T+ZpLQIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4Hq7r+t5wOBy2bdu2fX7f99s0zQMAwMlkcrfb7dY0TXN3d7e9Xq+v6/puWZYNAIC7u7t93/f9dLvdXq/Xt20bAAB4fX3d9/3+9fV1Xdd1nU4nAADw+vq677v9+fn5er2+bdvWMA0AAPDw8LDv+/3r6+u6rus6nU4AAOD19XXfd/vT09N1Xdd1Op0AAAB8fHzc933+8fFxnU6nruu6TqcTAADw8PCw7/v86+vrOp1O27ZtAwAA3t7e9n2/f319Xdd1nU4nAADw8vKy7/v96+vrOp1O27ZtAwAA3t/f933f9fV1Xdd1nU4nAADw9va277v9+fn5er2+bdvWMA0AAPD29rbv+/3p6WmdTqeu67pOpxMAAPD09LTv+/3p6WmdTqeu67pOpxMAAPD8/Lzv+/3p6WmdTqeu67pOpxMAAPD+/r7v+/3p6WmdTqeu67pOpxMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwH9wCDsE0qN7wAAAAAElFTkSuQmCC',
    'base64',
  );
}

function ensureAuthorized(req) {
  if (req.url.includes('/auth/login') || req.url.includes('/system-config/public')) return true;
  return Boolean(req.headers.authorization);
}

function localToolCategories() {
  return [
    { id: 'tool-cat-plan', name: '项目启动与计划', description: '交付启动、计划排程、项目编号和启动材料检查。', sortOrder: 10, status: 'Active' },
    { id: 'tool-cat-quality', name: '档案与质量检查', description: '交付资料完整率、命名规范和阶段门资料核对。', sortOrder: 20, status: 'Active' },
    { id: 'tool-cat-finance', name: '商务回款与币种', description: '回款节点、币种换算和汇率人工复核。', sortOrder: 30, status: 'Active' },
    { id: 'tool-cat-site', name: '现场施工与HSE', description: '现场安全、影像资料、时差沟通和问题整改。', sortOrder: 40, status: 'Active' },
    { id: 'tool-cat-software', name: '调试与软件配置', description: '点表、软件配置、联调验证和设备选型资料。', sortOrder: 50, status: 'Active' },
    { id: 'tool-cat-review', name: '物流与复盘', description: '进出口资料、物流节点、项目复盘和知识沉淀。', sortOrder: 60, status: 'Active' },
  ];
}

function localToolItems() {
  return [
    { id: 'tool-plan-code', categoryId: 'tool-cat-plan', name: '项目编号生成规则', description: '按国家、客户、年份生成项目编号并提示重复风险。', toolType: 'internal', url: '', icon: 'FileText', sortOrder: 10, status: 'Active' },
    { id: 'tool-plan-kickoff', categoryId: 'tool-cat-plan', name: '启动会材料清单', description: '汇总合同、中标通知、成员表、启动会纪要等必备材料。', toolType: 'internal', url: '', icon: 'Checklist', sortOrder: 20, status: 'Active' },
    { id: 'tool-plan-schedule', categoryId: 'tool-cat-plan', name: '项目实施计划排程器', description: '生成阶段计划、关键里程碑和责任人清单。', toolType: 'internal', url: '', icon: 'Calendar', sortOrder: 30, status: 'Active' },
    { id: 'tool-quality-complete', categoryId: 'tool-cat-quality', name: '资料完整率检查', description: '按档案模板统计缺失、待审、驳回和已归档资料。', toolType: 'internal', url: '', icon: 'CheckCircle', sortOrder: 10, status: 'Active' },
    { id: 'tool-quality-name', categoryId: 'tool-cat-quality', name: '文件命名规范检查', description: '校验项目编号、阶段、版本号、日期和文件后缀。', toolType: 'internal', url: '', icon: 'FileSearch', sortOrder: 20, status: 'Active' },
    { id: 'tool-quality-gate', categoryId: 'tool-cat-quality', name: '阶段门资料核对', description: '按启动、设计、采购、施工、调试、验收、收尾检查交付物。', toolType: 'internal', url: '', icon: 'Archive', sortOrder: 30, status: 'Active' },
    { id: 'tool-quality-office', categoryId: 'tool-cat-quality', name: 'Office 在线入口', description: '打开 Office 在线应用，便于查看或协作编辑交付资料。', toolType: 'external', url: 'https://www.office.com/', icon: 'Link', sortOrder: 40, status: 'Active' },
    { id: 'tool-finance-currency', categoryId: 'tool-cat-finance', name: '多币种金额换算', description: '结合项目币种和基准币生成合同额、回款额折算结果。', toolType: 'internal', url: '', icon: 'Swap', sortOrder: 10, status: 'Active' },
    { id: 'tool-finance-payment', categoryId: 'tool-cat-finance', name: '回款节点提醒清单', description: '按合同里程碑展示计划回款、已回款、逾期和责任人。', toolType: 'internal', url: '', icon: 'Notification', sortOrder: 20, status: 'Active' },
    { id: 'tool-finance-boc', categoryId: 'tool-cat-finance', name: '中国银行外汇牌价', description: '查询人民币汇率参考，用于人工复核币种折算。', toolType: 'external', url: 'https://www.boc.cn/sourcedb/whpj/', icon: 'Link', sortOrder: 30, status: 'Active' },
    { id: 'tool-site-hse', categoryId: 'tool-cat-site', name: '安全晨会记录生成器', description: '生成每日安全晨会签到、风险交底和照片要求。', toolType: 'internal', url: '', icon: 'SafetyCertificate', sortOrder: 10, status: 'Active' },
    { id: 'tool-site-photo', categoryId: 'tool-cat-site', name: '项目影像拍摄清单', description: '按阶段提示现场照片、视频、铭牌和整改前后对比要求。', toolType: 'internal', url: '', icon: 'Camera', sortOrder: 20, status: 'Active' },
    { id: 'tool-site-clock', categoryId: 'tool-cat-site', name: '世界时钟', description: '跨国项目会议排期和现场沟通时差确认。', toolType: 'external', url: 'https://www.timeanddate.com/worldclock/', icon: 'Link', sortOrder: 30, status: 'Active' },
    { id: 'tool-software-io', categoryId: 'tool-cat-software', name: '点表模板校验', description: '检查点表字段、命名、单位、量程和缺失项。', toolType: 'internal', url: '', icon: 'Table', sortOrder: 10, status: 'Active' },
    { id: 'tool-software-config', categoryId: 'tool-cat-software', name: '软件配置清单', description: '汇总服务器、客户端、策略、版本和远程连接信息。', toolType: 'internal', url: '', icon: 'Code', sortOrder: 20, status: 'Active' },
    { id: 'tool-software-diagram', categoryId: 'tool-cat-software', name: '图纸流程图工具', description: '打开 diagrams.net 绘制流程图、网络拓扑和设备连接图。', toolType: 'external', url: 'https://app.diagrams.net/', icon: 'Link', sortOrder: 30, status: 'Active' },
    { id: 'tool-software-deepl', categoryId: 'tool-cat-software', name: 'DeepL 翻译', description: '海外项目技术资料和客户沟通内容的辅助翻译入口。', toolType: 'external', url: 'https://www.deepl.com/translator', icon: 'Link', sortOrder: 40, status: 'Active' },
    { id: 'tool-review-logistics', categoryId: 'tool-cat-review', name: '进出口资料清单', description: '汇总箱单、发票、报关、物流追踪和到货验收资料。', toolType: 'internal', url: '', icon: 'Truck', sortOrder: 10, status: 'Active' },
    { id: 'tool-review-report', categoryId: 'tool-cat-review', name: '项目复盘报告生成器', description: '从项目风险、延期、回款、资料完整率生成复盘提纲。', toolType: 'internal', url: '', icon: 'FileText', sortOrder: 20, status: 'Active' },
    { id: 'tool-review-faq', categoryId: 'tool-cat-review', name: '常见问题指导手册', description: '聚合项目管理 FAQ、禁忌、商务沟通和质量安全要求。', toolType: 'internal', url: '', icon: 'Book', sortOrder: 30, status: 'Active' },
    { id: 'tool-review-speed', categoryId: 'tool-cat-review', name: '网络测速', description: '远程联调和现场网络质量排查辅助入口。', toolType: 'external', url: 'https://www.speedtest.net/', icon: 'Link', sortOrder: 40, status: 'Active' },
  ];
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  if (!ensureAuthorized(req)) {
    sendJson(res, envelope(null, '未登录', 401), 401);
    return;
  }

  const path = url.pathname.replace(/^\/api\/v1/, '');

  if (req.method === 'GET' && path === '/system-config/public') {
    sendJson(res, envelope({
      'platform.name': '交付管理平台',
      'platform.login_slogan': '让交付工作保持高效、清晰、有序。',
    }));
    return;
  }

  if (req.method === 'POST' && path === '/auth/login') {
    const body = await readJson(req);
    if (!body.username || !body.password || String(body.password).length < 6) {
      sendJson(res, envelope(null, '用户名或密码错误', 401), 401);
      return;
    }
    if (body.username === 'pm_wang') {
      if (body.password !== 'Pm@123456') {
        sendJson(res, envelope(null, '用户名或密码错误', 401), 401);
        return;
      }
      activeUser = projectManagerUser;
    } else {
      activeUser = adminUser;
    }
    sendJson(res, envelope({ accessToken: `local-test-token-${activeUser.username}-${Date.now()}`, user: activeUser }));
    return;
  }

  if (req.method === 'GET' && path === '/auth/profile') {
    sendJson(res, envelope(activeUser));
    return;
  }

  if (req.method === 'POST' && path === '/auth/logout') {
    sendJson(res, envelope(null));
    return;
  }

  if (req.method === 'GET' && path === '/dashboard/overview') {
    sendJson(res, envelope({
      totalProjects: 8,
      activeProjects: 5,
      highRiskProjects: 1,
      delayedProjects: 1,
      pendingReviews: 3,
      avgCompletionRate: 72,
      byStatus: [
        { status: 'Active', count: 5 },
        { status: 'Delayed', count: 1 },
        { status: 'Accepted', count: 2 },
      ],
      byStage: [
        { stage: 'design', count: 2 },
        { stage: 'delivery', count: 4 },
        { stage: 'commissioning', count: 2 },
      ],
      acceptedProjects: 2,
      draftProjects: 0,
      totalContractAmount: 38600000,
      totalPlannedPaymentAmount: 28000000,
      totalReceivedAmount: 21800000,
      outstandingPaymentAmount: 6200000,
      overduePaymentAmount: 900000,
      overduePaymentCount: 2,
      paymentCompletionRate: 78,
      recentProjects: [
        { id: 'project-1', projectCode: 'CN-SW-2026-001', projectName: '软件交付样板项目', countryCode: 'CN', status: 'Active', riskLevel: 'Medium', createdAt: now() },
        { id: 'project-2', projectCode: 'VN-EL-2026-001', projectName: '电气调试样板项目', countryCode: 'VN', status: 'Delayed', riskLevel: 'High', createdAt: now() },
      ],
    }));
    return;
  }

  if (req.method === 'GET' && path === '/dashboard/my-projects') {
    sendJson(res, envelope([
      { id: 'project-1', projectCode: 'CN-SW-2026-001', projectName: '软件交付样板项目', countryCode: 'CN', projectStatus: 'Active', riskLevel: 'Medium', currentStage: 'delivery', role: '项目经理' },
      { id: 'project-2', projectCode: 'VN-EL-2026-001', projectName: '电气调试样板项目', countryCode: 'VN', projectStatus: 'Delayed', riskLevel: 'High', currentStage: 'commissioning', role: '电气工程师' },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/knowledge/categories') {
    sendJson(res, envelope(categoryTree));
    return;
  }

  const categoryMatch = path.match(/^\/knowledge\/categories\/([^/]+)$/);
  if (req.method === 'GET' && categoryMatch) {
    const category = categories.find((item) => item.id === categoryMatch[1]);
    sendJson(res, envelope(category ?? null), category ? 200 : 404);
    return;
  }

  if (req.method === 'POST' && path === '/knowledge/categories') {
    const body = await readJson(req);
    const name = String(body.name ?? '').trim();
    const parentId = body.parentId || null;
    if (!name) {
      sendJson(res, envelope(null, '分类名称不能为空', 400), 400);
      return;
    }
    if (categoryDuplicate(name, parentId)) {
      sendJson(res, envelope(null, '同级知识分类已存在', 409), 409);
      return;
    }
    const category = {
      id: `cat-${Date.now()}`,
      name,
      description: body.description || '',
      parentId,
      sortOrder: Number(body.sortOrder) || categories.length + 1,
      status: 'Active',
      createdAt: now(),
      updatedAt: now(),
      children: [],
      parent: parentId ? categories.find((item) => item.id === parentId) : undefined,
    };
    categories.push(category);
    rebuildCategoryTree();
    sendJson(res, envelope(category));
    return;
  }

  if (req.method === 'PUT' && categoryMatch) {
    const body = await readJson(req);
    const category = categories.find((item) => item.id === categoryMatch[1]);
    if (!category) {
      sendJson(res, envelope(null, '知识分类不存在', 404), 404);
      return;
    }
    const nextName = body.name == null ? category.name : String(body.name).trim();
    if (!nextName) {
      sendJson(res, envelope(null, '分类名称不能为空', 400), 400);
      return;
    }
    if (categoryDuplicate(nextName, category.parentId, category.id)) {
      sendJson(res, envelope(null, '同级知识分类已存在', 409), 409);
      return;
    }
    category.name = nextName;
    if (body.description !== undefined) category.description = body.description || '';
    if (body.sortOrder !== undefined) category.sortOrder = Number(body.sortOrder) || category.sortOrder;
    category.updatedAt = now();
    rebuildCategoryTree();
    sendJson(res, envelope(category));
    return;
  }

  if (req.method === 'DELETE' && categoryMatch) {
    const index = categories.findIndex((item) => item.id === categoryMatch[1]);
    if (index < 0) {
      sendJson(res, envelope(null, '知识分类不存在', 404), 404);
      return;
    }
    const categoryId = categories[index].id;
    if (articles.some((item) => item.categoryId === categoryId)) {
      sendJson(res, envelope(null, '分类下存在知识条目，不能删除', 409), 409);
      return;
    }
    categories.splice(index, 1);
    rebuildCategoryTree();
    sendJson(res, envelope(null));
    return;
  }

  if (req.method === 'GET' && path === '/knowledge/articles') {
    const keyword = url.searchParams.get('keyword')?.trim();
    const status = url.searchParams.get('status')?.trim();
    const sourceStatus = url.searchParams.get('sourceStatus')?.trim();
    const categoryId = url.searchParams.get('categoryId')?.trim();
    let list = articles;
    if (categoryId) {
      const categoryIds = new Set([categoryId, ...descendantCategoryIds(categoryId)]);
      list = list.filter((item) => categoryIds.has(item.categoryId));
    }
    if (keyword) {
      list = list.filter((item) => item.title.includes(keyword) || item.markdownContent?.includes(keyword));
    }
    if (status) list = list.filter((item) => item.status === status);
    if (sourceStatus) list = list.filter((item) => item.sourceStatus === sourceStatus);
    sendJson(res, envelope(page(withArticleFileCounts(list), url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  const articleMatch = path.match(/^\/knowledge\/articles\/([^/]+)$/);
  if (req.method === 'GET' && articleMatch) {
    const article = articles.find((item) => item.id === articleMatch[1]);
    sendJson(res, envelope(article ? withArticleFileCounts([article])[0] : null), article ? 200 : 404);
    return;
  }

  if (req.method === 'POST' && path === '/knowledge/articles') {
    const body = await readJson(req);
    const category = categories.find((item) => item.id === body.categoryId) ?? categories[0];
    const article = {
      ...articles[0],
      id: `article-${Date.now()}`,
      categoryId: category.id,
      title: body.title || '新建知识条目',
      countryCode: body.countryCode || null,
      projectType: body.projectType || null,
      stageCode: body.stageCode || null,
      applicableRole: body.applicableRole || null,
      markdownContent: body.markdownContent || '',
      sourceStatus: body.sourceStatus || 'Ready',
      needsRevision: Boolean(body.needsRevision),
      relatedFlow: body.relatedFlow || '',
      relatedChecklist: body.relatedChecklist || '',
      relatedTemplate: body.relatedTemplate || '',
      status: 'Draft',
      category: { id: category.id, name: category.name },
      createdAt: now(),
      updatedAt: now(),
      publishedAt: null,
      versions: [],
    };
    articles = [article, ...articles];
    sendJson(res, envelope(article));
    return;
  }

  if (req.method === 'PUT' && articleMatch) {
    const body = await readJson(req);
    const index = articles.findIndex((item) => item.id === articleMatch[1]);
    if (index < 0) {
      sendJson(res, envelope(null, '知识条目不存在', 404), 404);
      return;
    }
    articles[index] = { ...articles[index], ...body, updatedAt: now() };
    sendJson(res, envelope(articles[index]));
    return;
  }

  if (req.method === 'DELETE' && articleMatch) {
    const index = articles.findIndex((item) => item.id === articleMatch[1]);
    if (index < 0) {
      sendJson(res, envelope(null, '知识条目不存在', 404), 404);
      return;
    }
    const articleId = articles[index].id;
    articles.splice(index, 1);
    attachments = attachments.filter((item) => item.ownerId !== articleId);
    sendJson(res, envelope(null));
    return;
  }

  const publishMatch = path.match(/^\/knowledge\/articles\/([^/]+)\/publish$/);
  if (req.method === 'POST' && publishMatch) {
    const article = articles.find((item) => item.id === publishMatch[1]);
    if (article) {
      article.status = 'Reviewing';
      article.updatedAt = now();
    }
    sendJson(res, envelope(article ?? null), article ? 200 : 404);
    return;
  }

  const deprecateMatch = path.match(/^\/knowledge\/articles\/([^/]+)\/deprecate$/);
  if (req.method === 'POST' && deprecateMatch) {
    const article = articles.find((item) => item.id === deprecateMatch[1]);
    if (article) {
      article.status = 'Deprecated';
      article.updatedAt = now();
    }
    sendJson(res, envelope(article ?? null), article ? 200 : 404);
    return;
  }

  const versionsMatch = path.match(/^\/knowledge\/articles\/([^/]+)\/versions$/);
  if (req.method === 'GET' && versionsMatch) {
    const article = articles.find((item) => item.id === versionsMatch[1]);
    sendJson(res, envelope(article?.versions ?? []), article ? 200 : 404);
    return;
  }

  const revisionSubmitMatch = path.match(/^\/knowledge\/articles\/([^/]+)\/files\/([^/]+)\/revisions$/);
  if (req.method === 'POST' && revisionSubmitMatch) {
    const article = articles.find((item) => item.id === revisionSubmitMatch[1]);
    const original = attachments.find((item) =>
      item.id === revisionSubmitMatch[2]
      && item.ownerType === 'KnowledgeArticle'
      && item.ownerId === revisionSubmitMatch[1]
      && !item.deletedAt
    );
    if (!article || !original) {
      sendJson(res, envelope(null, '知识库文件不存在', 404), 404);
      return;
    }
    const pendingRevision = attachments.find((item) =>
      item.ownerType === 'KnowledgeFileRevision'
      && item.ownerId === original.id
      && !item.deletedAt
      && approvalTasks.some((task) =>
        task.businessType === 'knowledge-file-update'
        && task.businessId === item.id
        && task.status === 'Pending'
      )
    );
    if (pendingRevision) {
      sendJson(res, envelope(null, '该文件已有待审批的更新申请', 409), 409);
      return;
    }

    const body = await readBody(req);
    const parts = parseMultipart(body, req.headers['content-type']);
    const filePart = parts.find((part) => part.filename) ?? {
      filename: `更新-${original.originalName}`,
      contentType: original.mimeType,
      data: Buffer.from(`Local revision content for ${original.originalName}`, 'utf8'),
    };
    const name = filePart.filename || `更新-${original.originalName}`;
    const ext = extname(name).replace('.', '').toLowerCase() || fileExt(original.originalName);
    const targetDir = join(localStorageRoot, 'attachments', 'KnowledgeFileRevision', original.id);
    await mkdir(targetDir, { recursive: true });
    const storagePath = join(targetDir, `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeFileName(name)}`);
    await writeFile(storagePath, filePart.data);
    const revision = {
      id: `att-revision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ownerType: 'KnowledgeFileRevision',
      ownerId: original.id,
      category: 'revision',
      originalName: name,
      fileExt: ext,
      fileSize: String(filePart.data.length),
      mimeType: filePart.contentType || mimeTypeFor(name),
      storagePath,
      remark: JSON.stringify({
        revisionType: 'knowledge-file-update',
        articleId: article.id,
        originalAttachmentId: original.id,
        originalName: original.originalName,
        submittedAt: now(),
      }),
      createdAt: now(),
      uploader: { id: 'user-admin', realName: adminUser.realName, username: 'admin' },
    };
    attachments = [revision, ...attachments];
    const task = createApprovalTask({
      businessType: 'knowledge-file-update',
      businessId: revision.id,
      businessTitle: `知识库文件更新：${original.originalName}`,
      applicantId: 'user-admin',
    });
    sendJson(res, envelope(task));
    return;
  }

  const revisionDiffMatch = path.match(/^\/knowledge\/file-revisions\/([^/]+)\/diff$/);
  if (req.method === 'GET' && revisionDiffMatch) {
    const diff = buildFileRevisionDiff(revisionDiffMatch[1]);
    sendJson(res, envelope(diff), diff ? 200 : 404);
    return;
  }

  if (req.method === 'GET' && path === '/attachments') {
    const ownerType = url.searchParams.get('ownerType');
    const ownerId = url.searchParams.get('ownerId');
    const list = attachments.filter((item) =>
      (!ownerType || item.ownerType === ownerType) && (!ownerId || item.ownerId === ownerId),
    );
    sendJson(res, envelope(page(list, url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'POST' && path === '/attachments') {
    const body = await readBody(req);
    const parts = parseMultipart(body, req.headers['content-type']);
    const fields = Object.fromEntries(
      parts
        .filter((part) => !part.filename)
        .map((part) => [part.name, part.data.toString('utf8').trim()]),
    );
    const fileParts = parts.filter((part) => part.filename);
    const ownerId = fields.ownerId || 'article-preview';
    const ownerType = fields.ownerType || 'KnowledgeArticle';
    const targetDir = join(localStorageRoot, 'attachments', ownerType, ownerId);
    await mkdir(targetDir, { recursive: true });
    const uploadParts = fileParts.length
      ? fileParts
      : [{
          name: 'files',
          filename: '本地上传测试文件.txt',
          contentType: 'text/plain; charset=utf-8',
          data: Buffer.from('本地上传测试文件', 'utf8'),
        }];

    const created = [];
    for (const part of uploadParts) {
      const name = part.filename || '本地上传测试文件.txt';
      const ext = extname(name).replace('.', '').toLowerCase() || 'txt';
      const storagePath = join(targetDir, `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeFileName(name)}`);
      await writeFile(storagePath, part.data);
      const attachment = {
        id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ownerType,
        ownerId,
        category: 'document',
        originalName: name,
        fileExt: ext,
        fileSize: String(part.data.length),
        mimeType: part.contentType || mimeTypeFor(name),
        storagePath,
        createdAt: now(),
        uploader: { id: 'user-admin', realName: '系统管理员', username: 'admin' },
      };
      attachments = [attachment, ...attachments];
      created.push(attachment);
    }
    sendJson(res, envelope(created));
    return;
  }

  const attachmentMatch = path.match(/^\/attachments\/([^/]+)$/);
  if (req.method === 'DELETE' && attachmentMatch) {
    const index = attachments.findIndex((attachment) => attachment.id === attachmentMatch[1]);
    if (index < 0) {
      sendJson(res, envelope(null, '附件不存在', 404), 404);
      return;
    }
    attachments.splice(index, 1);
    sendJson(res, envelope(null));
    return;
  }

  const previewMatch = path.match(/^\/attachments\/([^/]+)\/preview$/);
  if (req.method === 'GET' && previewMatch) {
    const preview = attachmentPreview(previewMatch[1]);
    sendJson(res, envelope(preview ?? null), preview ? 200 : 404);
    return;
  }

  const contentMatch = path.match(/^\/attachments\/([^/]+)\/content$/);
  if (req.method === 'GET' && contentMatch) {
    const item = attachments.find((attachment) => attachment.id === contentMatch[1]);
    if (!item) {
      sendJson(res, envelope(null, '附件不存在', 404), 404);
      return;
    }
    if (item.storagePath && existsSync(item.storagePath)) {
      sendRaw(res, await readFile(item.storagePath), item.mimeType);
      return;
    }
    if (item.fileExt === 'pdf') {
      sendRaw(res, samplePdf(item), 'application/pdf');
      return;
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(item.fileExt)) {
      sendRaw(res, samplePng(), 'image/png');
      return;
    }
    sendRaw(res, Buffer.from(`Local preview content for ${item.originalName}`, 'utf8'), 'text/plain; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && path === '/countries') {
    sendJson(res, envelope(page([
      { id: 'country-cn', countryCode: 'CN', nameZh: '中国', nameEn: 'China', defaultLanguage: 'zh-CN', defaultCurrency: 'CNY', timezone: 'Asia/Shanghai', weekendRule: 'Sat/Sun', entryRequirements: null, safetyNotes: null, taxNotes: null, paymentNotes: null, supplierNotes: null, status: 'Active', createdAt: now(), updatedAt: now() },
      { id: 'country-vn', countryCode: 'VN', nameZh: '越南', nameEn: 'Vietnam', defaultLanguage: 'vi-VN', defaultCurrency: 'VND', timezone: 'Asia/Ho_Chi_Minh', weekendRule: 'Sat/Sun', entryRequirements: null, safetyNotes: null, taxNotes: null, paymentNotes: null, supplierNotes: null, status: 'Active', createdAt: now(), updatedAt: now() },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  const dictMatch = path.match(/^\/dictionaries\/([^/]+)$/);
  if (req.method === 'GET' && dictMatch) {
    sendJson(res, envelope(dictionaries[dictMatch[1]] ?? { id: dictMatch[1], categoryCode: dictMatch[1], categoryName: dictMatch[1], items: [] }));
    return;
  }

  if (req.method === 'GET' && path === '/roles') {
    sendJson(res, envelope([
      { id: 'role-super', roleCode: 'SUPER_ADMIN', roleName: '超级管理员', roleDesc: '本地联调管理员', status: 'Active', createdAt: now(), updatedAt: now() },
      { id: 'role-sw', roleCode: 'SOFTWARE_ENGINEER', roleName: '软件工程师', roleDesc: '软件交付', status: 'Active', createdAt: now(), updatedAt: now() },
      { id: 'role-elec', roleCode: 'ELEC_ENGINEER', roleName: '电气工程师', roleDesc: '电气交付', status: 'Active', createdAt: now(), updatedAt: now() },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/workflow/documents') {
    sendJson(res, envelope(page([
      { id: 'workflow-delivery', categoryId: 'wf-cat-1', name: '软件部署交付流程', documentNo: 'WF-SW-001', version: 'V1.0', status: 'Active', responsibleRole: 'SOFTWARE_ENGINEER', applicableScope: '{}', triggerCondition: '{}', inputMaterials: '{}', steps: '{}', outputMaterials: '{}', relatedChecklist: '', relatedTemplates: '', relatedArchive: '', riskNotes: '{}', createdAt: now(), updatedAt: now() },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/checklist/templates') {
    sendJson(res, envelope(page([
      { id: 'checklist-delivery', templateCode: 'CK-SW-001', templateName: '软件交付检查模板', countryCode: 'CN', projectType: 'software', stageCode: 'delivery', version: 'V1.0', status: 'Active', itemCount: 6, items: [] },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/templates') {
    const templates = [
      { id: 'template-kickoff', templateNo: 'DC-TPL-KICKOFF', name: '项目启动会纪要模板', category: 'Meeting', countryCode: 'CN', projectType: null, stageCode: '01_presale', applicableRole: 'PROJECT_MANAGER', language: 'zh-CN', fileFormat: 'docx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-plan', templateNo: 'DC-TPL-PLAN', name: '项目实施计划排程模板', category: 'Plan', countryCode: 'CN', projectType: null, stageCode: '01_presale', applicableRole: 'PROJECT_MANAGER', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-cable', templateNo: 'DC-TPL-CABLE', name: '电缆清册模板', category: 'Form', countryCode: 'CN', projectType: 'electrical', stageCode: '02_design', applicableRole: 'ELEC_ENGINEER', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-io', templateNo: 'DC-TPL-IO-LIST', name: '上位机点表模板', category: 'Form', countryCode: 'CN', projectType: 'software', stageCode: '02_design', applicableRole: 'SOFTWARE_ENGINEER', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-purchase', templateNo: 'DC-TPL-PURCHASE', name: '设备选型及报价模板', category: 'Form', countryCode: 'CN', projectType: null, stageCode: '03_procurement', applicableRole: 'PURCHASE', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-logistics', templateNo: 'DC-TPL-LOGISTICS', name: '进出口资料清单模板', category: 'Checklist', countryCode: 'CN', projectType: null, stageCode: '03_procurement', applicableRole: 'PURCHASE', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-hse', templateNo: 'DC-TPL-HSE-MEETING', name: '安全晨会记录模板', category: 'Record', countryCode: 'CN', projectType: null, stageCode: '04_construction', applicableRole: 'HSE', language: 'zh-CN', fileFormat: 'docx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-commissioning', templateNo: 'DC-TPL-COMMISSIONING', name: '现场调试记录模板', category: 'Record', countryCode: 'CN', projectType: null, stageCode: '04_construction', applicableRole: 'PROJECT_MANAGER', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-acceptance', templateNo: 'DC-TPL-ACCEPTANCE', name: '项目验收资料移交清单模板', category: 'Checklist', countryCode: 'CN', projectType: null, stageCode: '05_acceptance', applicableRole: 'PROJECT_MANAGER', language: 'zh-CN', fileFormat: 'xlsx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
      { id: 'template-review', templateNo: 'DC-TPL-REVIEW', name: '项目管理复盘报告模板', category: 'Report', countryCode: 'CN', projectType: null, stageCode: '06_review', applicableRole: 'PROJECT_MANAGER', language: 'zh-CN', fileFormat: 'docx', storagePath: null, status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
    ];
    sendJson(res, envelope(page(templates, url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/dashboard/my-todos') {
    sendJson(res, envelope([
      { id: 'todo-1', title: '审核项目交付检查项', businessType: 'archive', priority: 'High', dueDate: now(), status: 'Pending' },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/projects') {
    const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase();
    const list = localProjects
      .filter((project) => !project.deletedAt)
      .filter((project) => !keyword
        || project.projectName.toLowerCase().includes(keyword)
        || project.projectCode.toLowerCase().includes(keyword)
        || String(project.customerName || '').toLowerCase().includes(keyword));
    sendJson(res, envelope(page(list, url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'POST' && path === '/projects') {
    const body = await readJson(req);
    const id = `project-${Date.now()}`;
    const project = {
      id,
      projectCode: body.projectCode || `${body.countryCode || 'CN'}-${Date.now().toString().slice(-6)}`,
      projectName: body.projectName || '新建交付项目',
      countryCode: body.countryCode || 'CN',
      city: body.city || '',
      customerName: body.customerName || '',
      projectType: body.projectType || 'software',
      contractCurrency: body.contractCurrency || 'CNY',
      baseCurrency: body.baseCurrency || 'CNY',
      currencyCode: body.contractCurrency || 'CNY',
      contractAmount: Number(body.contractAmount || 0),
      exchangeRate: 1,
      convertedAmount: Number(body.contractAmount || 0),
      baseCurrencyAmount: Number(body.contractAmount || 0),
      projectLanguage: body.projectLanguage || 'zh-CN',
      salesOwnerId: body.salesOwnerId || 'user-sales-li',
      projectManagerId: body.projectManagerId || projectManagerUser.id,
      electricLeaderId: body.electricLeaderId || 'user-elec-chen',
      softwareLeaderId: body.softwareLeaderId || 'user-sw-zhao',
      currentStage: body.currentStage || '01_presale',
      projectStatus: 'Active',
      riskLevel: body.riskLevel || 'Medium',
      startDate: body.startDate || now().slice(0, 10),
      plannedStartDate: body.startDate || now().slice(0, 10),
      plannedEndDate: body.plannedEndDate || '2026-12-31',
      createdBy: activeUser.id,
      createdAt: now(),
      updatedAt: now(),
      projectManager: { id: projectManagerUser.id, realName: projectManagerUser.realName },
      members: [
        makeProjectMember(id, findLocalUser('user-sales-li'), 'SALES_OWNER', 1),
        makeProjectMember(id, projectManagerUser, 'PROJECT_MANAGER', 2),
        makeProjectMember(id, findLocalUser('user-elec-chen'), 'ELEC_LEADER', 3),
        makeProjectMember(id, findLocalUser('user-sw-zhao'), 'SOFTWARE_LEADER', 4),
      ],
    };
    localProjects.unshift(project);
    const newItems = buildLocalArchiveItems([project]);
    archiveItems = [...newItems, ...archiveItems];
    sendJson(res, envelope(project), 201);
    return;
  }

  const projectDetailMatch = path.match(/^\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectDetailMatch) {
    const project = localProjects.find((item) => item.id === projectDetailMatch[1] && !item.deletedAt);
    sendJson(res, envelope(project ?? null), project ? 200 : 404);
    return;
  }

  const projectUpdateMatch = path.match(/^\/projects\/([^/]+)$/);
  if (req.method === 'PUT' && projectUpdateMatch) {
    const project = localProjects.find((item) => item.id === projectUpdateMatch[1] && !item.deletedAt);
    if (!project) {
      sendJson(res, envelope(null, '项目不存在', 404), 404);
      return;
    }
    Object.assign(project, await readJson(req), { updatedAt: now() });
    sendJson(res, envelope(project));
    return;
  }

  const projectDeleteMatch = path.match(/^\/projects\/([^/]+)$/);
  if (req.method === 'DELETE' && projectDeleteMatch) {
    const project = localProjects.find((item) => item.id === projectDeleteMatch[1] && !item.deletedAt);
    if (project) project.deletedAt = now();
    sendJson(res, envelope(null));
    return;
  }

  const archiveTreeMatch = path.match(/^\/projects\/([^/]+)\/archives$/);
  if (req.method === 'GET' && archiveTreeMatch) {
    const project = localProjects.find((item) => item.id === archiveTreeMatch[1] && !item.deletedAt);
    if (!project) {
      sendJson(res, envelope(null, '项目不存在', 404), 404);
      return;
    }
    sendJson(res, envelope(archiveTreeForProject(project.id)));
    return;
  }

  const archiveGenerateMatch = path.match(/^\/projects\/([^/]+)\/archives\/generate$/);
  if (req.method === 'POST' && archiveGenerateMatch) {
    const project = localProjects.find((item) => item.id === archiveGenerateMatch[1] && !item.deletedAt);
    if (!project) {
      sendJson(res, envelope(null, '项目不存在', 404), 404);
      return;
    }
    const existing = archiveItems.some((item) => item.projectId === project.id && !item.deletedAt);
    if (!existing) {
      archiveItems = [...buildLocalArchiveItems([project]), ...archiveItems];
    }
    sendJson(res, envelope({ message: '档案目录生成成功', totalItems: 70, templateName: '标准交付档案模板' }));
    return;
  }

  const archiveStatsMatch = path.match(/^\/projects\/([^/]+)\/archives\/statistics$/);
  if (req.method === 'GET' && archiveStatsMatch) {
    sendJson(res, envelope(archiveStatisticsForProject(archiveStatsMatch[1])));
    return;
  }

  const archiveItemMatch = path.match(/^\/projects\/([^/]+)\/archives\/([^/]+)$/);
  if (req.method === 'GET' && archiveItemMatch) {
    const item = archiveItems.find((entry) =>
      entry.projectId === archiveItemMatch[1]
      && entry.id === archiveItemMatch[2]
      && !entry.deletedAt
    );
    sendJson(res, envelope(item ? attachArchiveRelations(item) : null), item ? 200 : 404);
    return;
  }

  if (req.method === 'PUT' && archiveItemMatch) {
    const item = archiveItems.find((entry) =>
      entry.projectId === archiveItemMatch[1]
      && entry.id === archiveItemMatch[2]
      && !entry.deletedAt
    );
    if (!item) {
      sendJson(res, envelope(null, '档案项不存在', 404), 404);
      return;
    }
    Object.assign(item, await readJson(req), { updatedAt: now() });
    sendJson(res, envelope(attachArchiveRelations(item)));
    return;
  }

  const archiveNotApplicableMatch = path.match(/^\/projects\/([^/]+)\/archives\/([^/]+)\/mark-not-applicable$/);
  if (req.method === 'POST' && archiveNotApplicableMatch) {
    const item = archiveItems.find((entry) =>
      entry.projectId === archiveNotApplicableMatch[1]
      && entry.id === archiveNotApplicableMatch[2]
      && !entry.deletedAt
    );
    if (item) {
      item.status = 'NotApplicable';
      item.updatedAt = now();
    }
    sendJson(res, envelope(item ? attachArchiveRelations(item) : null), item ? 200 : 404);
    return;
  }

  if (req.method === 'GET' && path === '/reports') {
    sendJson(res, envelope(page([
      { id: 'report-1', projectId: 'project-1', reportType: 'weekly', reportDate: '2026-07-04', content: '完成部署联调和资料归档检查。', workHours: 6.5, projectProgress: '交付阶段推进中', paymentProgress: '本周无新增回款', riskNotes: '暂无重大风险', nextPlan: '继续完成验收资料', status: 'Draft', project: { id: 'project-1', projectCode: 'CN-SW-2026-001', projectName: '软件交付样板项目' }, creator: { id: 'user-admin', realName: '系统管理员' }, createdAt: now(), updatedAt: now() },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/reports/my-reports') {
    sendJson(res, envelope(page([], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path.startsWith('/reports/summary/project/')) {
    sendJson(res, envelope({ reports: [], weeklyCount: 0, latestProgress: [], summary: '暂无报告汇总' }));
    return;
  }

  if (req.method === 'GET' && path === '/currencies') {
    sendJson(res, envelope([
      { id: 'currency-cny', currencyCode: 'CNY', currencyName: '人民币', symbol: '¥', decimalPlaces: 2, isBaseCurrency: true, status: 'Active', createdAt: now(), updatedAt: now() },
      { id: 'currency-usd', currencyCode: 'USD', currencyName: '美元', symbol: '$', decimalPlaces: 2, isBaseCurrency: false, status: 'Active', createdAt: now(), updatedAt: now() },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/exchange-rates') {
    sendJson(res, envelope([
      { id: 'rate-usd-cny', sourceCurrency: 'USD', targetCurrency: 'CNY', rate: 7.2, rateDate: '2026-07-04', source: 'local-test', isLocked: false, createdAt: now(), updatedAt: now() },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/languages') {
    sendJson(res, envelope([
      { id: 'lang-zh', languageCode: 'zh-CN', languageName: '简体中文', nativeName: '简体中文', isDefault: true, status: 'Active', createdAt: now(), updatedAt: now() },
      { id: 'lang-en', languageCode: 'en-US', languageName: 'English', nativeName: 'English', isDefault: false, status: 'Active', createdAt: now(), updatedAt: now() },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/translations') {
    sendJson(res, envelope([]));
    return;
  }

  if (req.method === 'GET' && path === '/archive-templates') {
    const templates = [
      ['archive-template-standard', 'AR-STD-001', '标准交付档案模板', null, '适用于软件、电气、海外和国内项目的通用档案目录。'],
      ['archive-template-software', 'AR-SW-001', '软件交付档案模板', 'software', '强调部署、配置、接口、账号和上线记录。'],
      ['archive-template-electrical', 'AR-EL-001', '电气工程档案模板', 'electrical', '强调图纸、设备、施工、调试和验收记录。'],
      ['archive-template-oversea', 'AR-OS-001', '海外项目档案模板', null, '补充跨文化沟通、清关、物流和外币回款资料。'],
      ['archive-template-china', 'AR-CN-001', '国内项目档案模板', null, '适用于国内客户现场交付与资料归档。'],
      ['archive-template-hse', 'AR-HSE-001', '安全文明施工档案模板', null, '聚焦安全晨会、交底、整改和事故处理记录。'],
      ['archive-template-procurement', 'AR-PUR-001', '采购物流档案模板', null, '聚焦供应商、采购、生产、发运和到货验收。'],
      ['archive-template-acceptance', 'AR-ACC-001', '验收移交档案模板', null, '聚焦验收测试、培训、移交和回款触发材料。'],
      ['archive-template-review', 'AR-RVW-001', '复盘收尾档案模板', null, '聚焦复盘、成本结算、质保移交和项目关闭。'],
      ['archive-template-light', 'AR-LITE-001', '轻量项目档案模板', null, '适用于小型改造或短周期交付项目。'],
    ].map(([id, templateCode, templateName, projectType, description]) => ({
      id,
      templateCode,
      templateName,
      countryCode: projectType ? 'CN' : null,
      projectType,
      languageCode: 'zh-CN',
      version: 'V1.0',
      status: 'Active',
      description,
      _count: { items: 70 },
      createdAt: now(),
      updatedAt: now(),
    }));
    sendJson(res, envelope(templates));
    return;
  }

  if (req.method === 'GET' && path === '/dictionaries') {
    sendJson(res, envelope(Object.values(dictionaries)));
    return;
  }

  if (req.method === 'GET' && path === '/references/roles') {
    sendJson(res, envelope([
      { id: 'role-super', roleCode: 'SUPER_ADMIN', roleName: '超级管理员' },
      { id: 'role-sw', roleCode: 'SOFTWARE_ENGINEER', roleName: '软件工程师' },
      { id: 'role-elec', roleCode: 'ELEC_ENGINEER', roleName: '电气工程师' },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/users') {
    sendJson(res, envelope(page([
      { id: 'user-admin', username: 'admin', realName: '系统管理员', email: 'admin@delivery-platform.local', phone: '13800000000', departmentId: 'dept-delivery', status: 'Active', lastLoginAt: now(), createdAt: now(), updatedAt: now(), roles: [{ id: 'role-super', roleCode: 'SUPER_ADMIN', roleName: '超级管理员' }] },
      { id: 'user-sw', username: 'software', realName: '软件负责人', email: 'software@example.com', phone: '13800000001', departmentId: 'dept-delivery', status: 'Active', lastLoginAt: null, createdAt: now(), updatedAt: now(), roles: [{ id: 'role-sw', roleCode: 'SOFTWARE_ENGINEER', roleName: '软件工程师' }] },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/departments') {
    sendJson(res, envelope([
      { id: 'dept-delivery', departmentCode: 'DELIVERY', departmentName: '交付中心', parentId: null, managerId: 'user-admin', status: 'Active', sortOrder: 1, manager: { id: 'user-admin', realName: '系统管理员' }, userCount: 2, children: [] },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/permissions') {
    sendJson(res, envelope([
      { resource: 'project', permissions: [{ id: 'perm-project-view', permissionCode: 'project:view', permissionName: '查看项目', resource: 'project', action: 'view', actionGroup: 'view', description: null, createdAt: now() }] },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/approvals/templates') {
    sendJson(res, envelope(page([
      { id: 'approval-report', templateCode: 'REPORT_REVIEW', templateName: '工作报告审核', businessType: 'report', countryCode: 'CN', isEnabled: true, steps: [{ id: 'step-1', stepOrder: 1, stepName: '主管审核', approverType: 'role', approverValue: 'PROJECT_MANAGER' }] },
      { id: 'approval-knowledge-file', templateCode: 'KNOWLEDGE_FILE_UPDATE', templateName: '知识库文件更新审批', businessType: 'knowledge-file-update', countryCode: '', isEnabled: true, steps: [{ id: 'step-knowledge-file-1', stepOrder: 1, stepName: '管理员审核', approverType: 'user', approverValue: 'user-admin' }] },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/reviews/pending') {
    sendJson(res, envelope(
      fileReviews
        .filter((review) => review.reviewStatus === 'Pending')
        .map(reviewResponse),
    ));
    return;
  }

  const archiveFilesMatch = path.match(/^\/archive-items\/([^/]+)\/files$/);
  if (req.method === 'GET' && archiveFilesMatch) {
    sendJson(res, envelope(
      projectFiles
        .filter((file) => file.archiveItemId === archiveFilesMatch[1] && !file.deletedAt)
        .map(fileResponse),
    ));
    return;
  }

  if (req.method === 'POST' && path === '/files/upload') {
    const body = await readBody(req);
    const parts = parseMultipart(body, req.headers['content-type']);
    const fields = {};
    let filePart = null;
    parts.forEach((part) => {
      if (part.filename) {
        filePart = part;
      } else {
        fields[part.name] = part.data.toString('utf8');
      }
    });
    if (!filePart || !fields.projectId) {
      sendJson(res, envelope(null, '缺少上传文件或项目 ID', 400), 400);
      return;
    }
    const name = safeFileName(filePart.filename || `项目档案文件-${Date.now()}.dat`);
    const targetDir = join(localStorageRoot, 'files', fields.projectId, fields.archiveItemId || 'general');
    await mkdir(targetDir, { recursive: true });
    const storagePath = join(targetDir, `${Date.now()}-${name}`);
    await writeFile(storagePath, filePart.data);
    const file = createProjectFile({
      projectId: fields.projectId,
      archiveItemId: fields.archiveItemId || null,
      originalName: name,
      fileSize: filePart.data.length,
      mimeType: filePart.contentType || mimeTypeFor(name),
      storagePath,
      remark: fields.remark || '项目档案上传，等待审核。',
    });
    sendJson(res, envelope(fileResponse(file)), 201);
    return;
  }

  const filePreviewMatch = path.match(/^\/files\/([^/]+)\/preview$/);
  if (req.method === 'GET' && filePreviewMatch) {
    const file = projectFiles.find((entry) => entry.id === filePreviewMatch[1] && !entry.deletedAt);
    const preview = filePreview(file);
    sendJson(res, envelope(preview ?? null), preview ? 200 : 404);
    return;
  }

  const fileDownloadMatch = path.match(/^\/files\/([^/]+)\/download$/);
  if (req.method === 'GET' && fileDownloadMatch) {
    const file = projectFiles.find((entry) => entry.id === fileDownloadMatch[1] && !entry.deletedAt);
    if (!file) {
      sendJson(res, envelope(null, '文件不存在', 404), 404);
      return;
    }
    if (file.storagePath && existsSync(file.storagePath)) {
      sendRaw(res, await readFile(file.storagePath), file.mimeType);
      return;
    }
    if (file.fileExt === 'pdf') {
      sendRaw(res, samplePdf(file), 'application/pdf');
      return;
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(file.fileExt)) {
      sendRaw(res, samplePng(), file.mimeType || 'image/png');
      return;
    }
    sendRaw(res, Buffer.from(`Local project archive file content for ${file.originalName}`, 'utf8'), file.mimeType || 'text/plain; charset=utf-8');
    return;
  }

  const fileReviewsMatch = path.match(/^\/files\/([^/]+)\/reviews$/);
  if (req.method === 'GET' && fileReviewsMatch) {
    sendJson(res, envelope(
      fileReviews
        .filter((review) => review.fileId === fileReviewsMatch[1])
        .map(reviewResponse),
    ));
    return;
  }

  const fileApproveMatch = path.match(/^\/files\/([^/]+)\/review\/approve$/);
  if (req.method === 'POST' && fileApproveMatch) {
    const body = await readJson(req);
    const file = decideProjectFile(fileApproveMatch[1], 'Approved', body.comment || '');
    sendJson(res, envelope(file ? fileResponse(file) : null), file ? 200 : 404);
    return;
  }

  const fileRejectMatch = path.match(/^\/files\/([^/]+)\/review\/reject$/);
  if (req.method === 'POST' && fileRejectMatch) {
    const body = await readJson(req);
    const file = decideProjectFile(fileRejectMatch[1], 'Rejected', body.comment || '');
    sendJson(res, envelope(file ? fileResponse(file) : null), file ? 200 : 404);
    return;
  }

  const fileDetailMatch = path.match(/^\/files\/([^/]+)$/);
  if (req.method === 'GET' && fileDetailMatch) {
    const file = projectFiles.find((entry) => entry.id === fileDetailMatch[1] && !entry.deletedAt);
    sendJson(res, envelope(file ? fileResponse(file) : null), file ? 200 : 404);
    return;
  }

  if (req.method === 'DELETE' && fileDetailMatch) {
    const file = projectFiles.find((entry) => entry.id === fileDetailMatch[1] && !entry.deletedAt);
    if (file) {
      file.deletedAt = now();
      const item = archiveItems.find((entry) => entry.id === file.archiveItemId);
      if (item) {
        const hasFiles = projectFiles.some((entry) => entry.archiveItemId === item.id && !entry.deletedAt && entry.id !== file.id);
        item.status = hasFiles ? item.status : 'PendingUpload';
        item.updatedAt = now();
      }
    }
    sendJson(res, envelope(null));
    return;
  }

  if (req.method === 'GET' && path === '/approvals/tasks') {
    sendJson(res, envelope(page(approvalTasks, url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  const approvalDecisionMatch = path.match(/^\/approvals\/tasks\/([^/]+)\/decision$/);
  if (req.method === 'POST' && approvalDecisionMatch) {
    const task = approvalTasks.find((item) => item.id === approvalDecisionMatch[1]);
    if (!task) {
      sendJson(res, envelope(null, '审批任务不存在', 404), 404);
      return;
    }
    if (task.status !== 'Pending') {
      sendJson(res, envelope(null, '审批任务已处理', 409), 409);
      return;
    }
    const body = await readJson(req);
    const decision = body.decision === 'Rejected' ? 'Rejected' : 'Approved';
    applyApprovalDecision(task, decision, body.comment || '');
    sendJson(res, envelope(task));
    return;
  }

  if (req.method === 'GET' && path === '/workforce/skills') {
    sendJson(res, envelope(page([
      { id: 'skill-deploy', skillCode: 'SW-DEPLOY', skillName: '软件部署', category: 'software', maxLevel: 5, status: 'Active', assessments: [{ id: 'assess-1', level: 4, selfScore: 86, managerScore: 88, finalScore: 87, period: '2026-Q3', evidenceNote: '完成本地部署测试', user: { id: 'user-sw', realName: '软件负责人' }, assessor: { id: 'user-admin', realName: '系统管理员' } }] },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/workforce/training') {
    sendJson(res, envelope(page([
      { id: 'training-1', title: '交付平台操作培训', category: 'platform', trainerName: '系统管理员', trainerId: 'user-admin', trainer: { id: 'user-admin', realName: '系统管理员', username: 'admin' }, startAt: now(), endAt: now(), location: '线上会议', status: 'Planned', description: '本地测试培训记录', attachments: [], participants: [{ id: 'participant-1', attendance: 'Pending', user: { id: 'user-sw', realName: '软件负责人', username: 'software' } }] },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/retrospectives') {
    sendJson(res, envelope(page([
      { id: 'retro-1', projectId: 'project-1', summary: '部署联调过程需要提前固化检查清单。', lessonsLearned: '环境变量、版本包和回滚脚本需同步归档。', problemCategory: 'process', status: 'InProgress', project: { id: 'project-1', projectCode: 'CN-SW-2026-001', projectName: '软件交付样板项目' }, actions: [{ id: 'action-1', title: '补充上线前检查表', status: 'Open', dueDate: '2026-07-10', owner: { id: 'user-sw', realName: '软件负责人' } }] },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/system-operations/storage') {
    const attachmentBytes = attachments.reduce((total, item) => total + Number(item.fileSize || 0), 0);
    sendJson(res, envelope({ bucket: 'local-delivery-test', available: true, provider: 'local', attachmentCount: attachments.length, attachmentBytes: String(attachmentBytes), backupCount: 1 }));
    return;
  }

  if (req.method === 'GET' && path === '/system-operations/backups') {
    sendJson(res, envelope(page([
      { id: 'backup-1', backupType: 'database', status: 'Success', storagePath: 'local://backup-1.zip', fileSize: '102400', createdAt: now(), requester: { id: 'user-admin', realName: '系统管理员', username: 'admin' } },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/system-operations/integrations') {
    sendJson(res, envelope([
      { id: 'integration-oss', provider: 'aliyun_oss', configName: '阿里云 OSS', configValue: { endpoint: 'oss-cn-shanghai.aliyuncs.com', authType: 'none' }, isEnabled: true, description: '本地测试对象存储配置', updatedAt: now() },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/operation-logs') {
    sendJson(res, envelope(page([
      { id: 'log-1', userId: 'user-admin', module: 'auth', action: 'login', targetType: 'user', targetId: 'user-admin', beforeData: null, afterData: null, ipAddress: '127.0.0.1', userAgent: 'local-test', result: 'Success', createdAt: now(), user: { id: 'user-admin', username: 'admin', realName: '系统管理员' } },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  const systemConfigList = [
    { id: 'cfg-name', configKey: 'platform.name', configValue: '交付管理平台', description: '平台名称', configType: 'string', updatedBy: 'user-admin', createdAt: now(), updatedAt: now() },
    { id: 'cfg-report', configKey: 'report.reminder_hour', configValue: '18', description: '日报提醒小时', configType: 'number', updatedBy: 'user-admin', createdAt: now(), updatedAt: now() },
  ];

  if (req.method === 'GET' && path === '/system-config') {
    sendJson(res, envelope(systemConfigList));
    return;
  }

  if (req.method === 'GET' && path === '/system-config/batch') {
    const keys = (url.searchParams.get('keys') || '').split(',').filter(Boolean);
    const data = Object.fromEntries(keys.map((key) => [key, systemConfigList.find((item) => item.configKey === key)?.configValue ?? null]));
    sendJson(res, envelope(data));
    return;
  }

  if (req.method === 'GET' && ['/okr/objectives', '/okr/my-objectives', '/okr/team-objectives'].includes(path)) {
    sendJson(res, envelope([]));
    return;
  }

  if (req.method === 'GET' && path === '/reviews/pending') {
    sendJson(res, envelope([]));
    return;
  }

  if (req.method === 'GET' && path === '/workflow/categories') {
    sendJson(res, envelope([{ id: 'wf-cat-1', categoryCode: 'delivery', categoryName: '交付流程', status: 'Active', sortOrder: 1 }]));
    return;
  }

  if (req.method === 'GET' && path === '/workflow/search') {
    sendJson(res, envelope([]));
    return;
  }

  if (req.method === 'GET' && path === '/tools/categories') {
    const categoryRows = localToolCategories().map((category) => ({
      ...category,
      tools: localToolItems().filter((item) => item.categoryId === category.id),
    }));
    sendJson(res, envelope(categoryRows));
    return;
  }

  if (req.method === 'GET' && path === '/tools/items') {
    const categoryId = url.searchParams.get('categoryId');
    const items = localToolItems().filter((item) => !categoryId || item.categoryId === categoryId);
    sendJson(res, envelope(items));
    return;
  }

  if (req.method === 'GET' && path === '/notifications') {
    sendJson(res, envelope(page([], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/notifications/unread-count') {
    sendJson(res, envelope({ count: 0 }));
    return;
  }

  if (req.method === 'GET' && path === '/notifications/rules') {
    sendJson(res, envelope([]));
    return;
  }

  if (req.method === 'GET' && path === '/process-records') {
    sendJson(res, envelope(page([], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/project-payments') {
    sendJson(res, envelope(page([], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  sendJson(res, envelope(null, `本地测试服务未实现接口: ${path}`, 404), 404);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, url) {
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const safePath = normalize(join(webDist, requestedPath));
  const filePath = safePath.startsWith(webDist) && existsSync(safePath) ? safePath : join(webDist, 'index.html');
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not file');
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    const indexHtml = await readFile(join(webDist, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/v1')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, envelope(null, error instanceof Error ? error.message : 'local server error', 500), 500);
  }
});

server.listen(port, host, () => {
  console.log(`Delivery platform local test server: http://localhost:${port}`);
  console.log('Login: admin / Admin@123456');
});
