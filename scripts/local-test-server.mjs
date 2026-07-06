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
    fileCount: attachments.filter((attachment) =>
      attachment.ownerType === 'KnowledgeArticle'
      && attachment.ownerId === article.id
      && !attachment.deletedAt
    ).length,
  }));
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
      '<article class="attachment-preview">',
      '<h2>知识库 XLSX 预览样例</h2>',
      '<section class="preview-sheet"><h3>交付检查表</h3>',
      '<div class="preview-table-wrap"><table>',
      '<tr><td>专业</td><td>检查项</td><td>状态</td></tr>',
      '<tr><td>软件</td><td>部署包校验</td><td>通过</td></tr>',
      '<tr><td>电气</td><td>回路编号核对</td><td>通过</td></tr>',
      '</table></div></section></article>',
    ].join('');
  }

  if (item.fileExt.includes('ppt')) {
    return [
      '<article class="attachment-preview">',
      '<h2>知识库 PPT 预览样例</h2>',
      '<section class="preview-slide"><h3>第 1 页：交付目标</h3><p>统一知识沉淀、附件归档和在线查阅流程。</p></section>',
      '<section class="preview-slide"><h3>第 2 页：专业适配</h3><p>电气、软件、运维按阶段维护不同类型的知识条目。</p></section>',
      '</article>',
    ].join('');
  }

  return [
    '<article class="attachment-preview">',
    '<h2>知识库 DOC 预览样例</h2>',
    '<p>用途：验证旧版 doc 文件上传后可在线查阅。</p>',
    '<h3>项目管理要求</h3>',
    '<p>上传资料应关联知识分类、适用国家、项目类型和交付阶段。</p>',
    '</article>',
  ].join('');
}

function samplePdf() {
  return Buffer.from([
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 160] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    '4 0 obj << /Length 62 >> stream',
    'BT /F1 14 Tf 40 100 Td (Knowledge PDF Preview Sample) Tj ET',
    'endstream endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref 0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000241 00000 n ',
    '0000000353 00000 n ',
    'trailer << /Root 1 0 R /Size 6 >>',
    'startxref',
    '423',
    '%%EOF',
  ].join('\n'), 'utf8');
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
    sendJson(res, envelope({ accessToken: `local-test-token-${Date.now()}`, user: adminUser }));
    return;
  }

  if (req.method === 'GET' && path === '/auth/profile') {
    sendJson(res, envelope(adminUser));
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
      sendRaw(res, samplePdf(), 'application/pdf');
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
    sendJson(res, envelope(page([
      { id: 'template-delivery', templateNo: 'TPL-SW-001', name: '软件交付报告模板', category: 'delivery', countryCode: 'CN', projectType: 'software', languageCode: 'zh-CN', version: 'V1.0', status: 'Published', publishedAt: now(), createdAt: now(), updatedAt: now() },
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/dashboard/my-todos') {
    sendJson(res, envelope([
      { id: 'todo-1', title: '审核项目交付检查项', businessType: 'archive', priority: 'High', dueDate: now(), status: 'Pending' },
    ]));
    return;
  }

  if (req.method === 'GET' && path === '/projects') {
    const projects = [
      { id: 'project-1', projectCode: 'CN-SW-2026-001', projectName: '软件交付样板项目', customerName: '上海示例客户', countryCode: 'CN', projectType: 'software', contractAmount: 1680000, currencyCode: 'CNY', exchangeRate: 1, baseCurrencyAmount: 1680000, currentStage: 'delivery', projectStatus: 'Active', riskLevel: 'Medium', plannedStartDate: '2026-07-01', plannedEndDate: '2026-09-30', projectManager: { id: 'user-admin', realName: '系统管理员' }, softwareLead: { id: 'user-admin', realName: '系统管理员' }, electricalLead: null, procurementLead: null, financeLead: null, createdAt: now(), updatedAt: now() },
      { id: 'project-2', projectCode: 'VN-EL-2026-001', projectName: '电气调试样板项目', customerName: '越南示例客户', countryCode: 'VN', projectType: 'electrical', contractAmount: 260000, currencyCode: 'USD', exchangeRate: 7.2, baseCurrencyAmount: 1872000, currentStage: 'commissioning', projectStatus: 'Delayed', riskLevel: 'High', plannedStartDate: '2026-06-01', plannedEndDate: '2026-08-15', projectManager: { id: 'user-admin', realName: '系统管理员' }, softwareLead: null, electricalLead: { id: 'user-admin', realName: '系统管理员' }, procurementLead: null, financeLead: null, createdAt: now(), updatedAt: now() },
    ];
    sendJson(res, envelope(page(projects, url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  const projectDetailMatch = path.match(/^\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectDetailMatch) {
    sendJson(res, envelope({ id: projectDetailMatch[1], projectCode: 'CN-SW-2026-001', projectName: '软件交付样板项目', customerName: '上海示例客户', countryCode: 'CN', projectType: 'software', contractAmount: 1680000, currencyCode: 'CNY', exchangeRate: 1, baseCurrencyAmount: 1680000, currentStage: 'delivery', projectStatus: 'Active', riskLevel: 'Medium', plannedStartDate: '2026-07-01', plannedEndDate: '2026-09-30', projectManager: { id: 'user-admin', realName: '系统管理员' }, members: [] }));
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
    sendJson(res, envelope([
      { id: 'archive-template-1', templateCode: 'AR-SW-001', templateName: '软件交付档案模板', countryCode: 'CN', projectType: 'software', languageCode: 'zh-CN', version: 'V1.0', status: 'Active', description: '本地测试档案模板', _count: { items: 3 }, createdAt: now(), updatedAt: now() },
    ]));
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
    ], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
    return;
  }

  if (req.method === 'GET' && path === '/approvals/tasks') {
    sendJson(res, envelope(page([], url.searchParams.get('page'), url.searchParams.get('pageSize'))));
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
    sendJson(res, envelope([{ id: 'tool-cat-1', name: '交付工具', description: '本地测试工具分类', sortOrder: 1, status: 'Active' }]));
    return;
  }

  if (req.method === 'GET' && path === '/tools/items') {
    sendJson(res, envelope([{ id: 'tool-1', categoryId: 'tool-cat-1', name: '文档预览工具', description: '用于验证知识库文件预览', toolType: 'internal', url: '/knowledge', icon: 'File', sortOrder: 1, status: 'Active' }]));
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
