# 交付管理平台后端整体重构实施规范

## 文档定位

本文以前端正式架构为业务入口，记录交付管理平台后端整体重构后的**业务域、数据模型、接口、权限、统一审核、统一文件、集成和迁移边界**。

- 前端正式规范：`frontend-architecture-refactored.md`
- 当前业务流程基线：`frontend-business-flows.md`
- 适用范围：`delivery-platform-server/`
- 后端技术基线：NestJS、TypeScript、Prisma、MySQL
- 实现基线：2026-07-12
- 本文性质：已落地架构规范；运行事实以 Prisma schema、Controller/Service 和迁移脚本为准

本文的核心原则是：

1. 后端以业务域为边界，不按前端页面堆接口。
2. 权限码决定能否执行操作，数据范围决定能够访问哪些数据。
3. 角色只作为权限集合，不再成为业务 Controller 的固定白名单。
4. 项目、档案、审核、标准、知识统一使用清晰的版本和状态模型。
5. 项目文件、标准文件和知识文件统一接入文件中心和审核中心。
6. 删除已从目标前端移除的独立业务模块、重复创建流程和兼容接口。
7. 所有高风险业务动作使用专用命令接口，不再通过通用更新接口任意改状态。
8. 目标运行时已切换；旧表只作为未破坏的历史迁移源保留，应用不再双写或提供旧业务接口。

---

# 1. 后端运行范围

后端运行时只保留以下核心业务域：

```text
认证与会话
用户、角色、权限与数据范围
工作台与统计
项目管理
项目档案
档案模版
统一文件中心
统一文件审核
标准库
知识库
工具中心
通知规则
审批配置
币种与汇率
系统配置
接口集成
操作日志
```

不再作为运行时主业务域保留：

```text
国家配置管理
语言与翻译管理
工时与日报
独立项目复盘
OKR 与绩效评分
技能评估
培训记录
独立过程记录页面
旧文档模版独立业务域
旧检查模版独立业务域
旧交付流程独立业务域
旧知识文章与知识文件双流程
存储备份前端业务页
多供应商接口集成
旧附件预览兼容服务
```

说明：

- 已退出运行时的 Controller、Service、前端 API 和页面已删除。
- 旧表暂不物理删除，作为只读迁移源与审计依据；种子脚本不写入这些表，运行时也没有兼容读写链路。
- 对外契约只包含本文第 22 节目标 API；任何外部系统继续调用旧接口都必须先完成独立迁移评审，不在应用内恢复双轨实现。

---

# 2. 总体模块架构

后端逻辑边界如下；物理目录沿用 NestJS 单数模块名（例如 `project/`、`project-archive/`、`review/`、`file/`），不为追求目录外观再次搬迁：

```text
src/modules/
├── auth/
├── identity/
│   ├── users/
│   ├── roles/
│   ├── permissions/
│   └── data-scope/
├── dashboard/
├── projects/
├── project-archives/
├── archive-templates/
├── files/
├── file-reviews/
├── standards/
├── knowledge/
├── tools/
├── currencies/
├── notifications/
├── approval-config/
├── settings/
├── integrations/
├── audit-logs/
└── shared/
    ├── database/
    ├── events/
    ├── jobs/
    ├── security/
    ├── validation/
    └── observability/
```

每个业务模块统一采用：

```text
controller/
application/
domain/
infrastructure/
dto/
policies/
events/
tests/
```

建议职责：

- `controller`：HTTP 输入输出、认证上下文、DTO 校验。
- `application`：用例编排、事务边界、权限与数据范围调用。
- `domain`：业务状态、规则、实体行为。
- `infrastructure`：Prisma Repository、外部服务、存储、队列。
- `policies`：业务动作许可和字段可见性。
- `events`：领域事件定义与处理。

不建议继续保留一个模块聚合多个无关领域，例如把字典、审批、技能、复盘、备份和接口集成放在同一 Service 中。

---

# 3. 认证、权限与数据范围

这是本次后端重构的第一优先级。

## 3.1 去除角色白名单与权限码双重冲突

目标规则：

```text
角色 = 权限集合
权限码 = 动作许可
数据范围 = 可访问数据集合
业务状态 = 当前是否允许执行
```

业务 Controller 不再使用固定业务角色白名单控制入口，例如不再使用：

```ts
@Roles('SUPER_ADMIN', 'PROJECT_MANAGER')
```

统一改为：

```ts
@RequirePermissions('project:view')
```

需要多个权限时明确语义：

```ts
@RequirePermissions({
  all: ['project:update', 'project:stage:update'],
})
```

或：

```ts
@RequirePermissions({
  any: ['file_review:view', 'file_review:view_all'],
})
```

`SUPER_ADMIN` 可绕过权限集合检查，但不能绕过：

- 数据完整性约束
- 业务状态约束
- 文件版本保护
- 审批步骤约束
- 审计记录

## 3.2 权限码统一清单

### 项目

```text
project:view
project:create
project:update
project:stage:update
project:archive
project:restore
project:delete
project:view_contract
project:view_financial
project:view_acceptance
```

### 项目档案

```text
archive:view
archive:upload
archive:replace
archive:version:view
archive:item:create_temporary
archive:item:archive
archive:template:sync
```

### 文件

```text
file:preview
file:download
file:preview_pending
file:preview_history
file:archive
```

### 文件审核

```text
file_review:view
file_review:view_all
file_review:act
file_review:manage
```

### 档案模版

```text
archive_template:view
archive_template:create
archive_template:update_draft
archive_template:submit_review
archive_template:publish
archive_template:disable
```

### 标准库

```text
standard:view
standard:create
standard:update_draft
standard:submit_review
standard:publish
standard:archive
standard:download
```

### 知识库

```text
knowledge:view
knowledge:create
knowledge:update_draft
knowledge:submit_review
knowledge:publish
knowledge:archive
knowledge:download
```

### 设置

```text
settings:view
currency:view
currency:manage
notification_rule:view
notification_rule:manage
approval_config:view
approval_config:manage
audit_log:view
system_setting:view
system_setting:manage
integration:view
integration:manage
```

## 3.3 数据范围

建立统一 `DataScopeService`，不允许各模块自行拼接角色判断。

建议数据范围：

```text
ALL
DEPARTMENT
COUNTRY
OWNED
PARTICIPATED
CUSTOM
```

项目查询统一通过：

```ts
projectDataScope.buildWhere(userContext)
```

文件审核统一通过：

```ts
reviewDataScope.buildWhere(userContext)
```

标准库和知识库：

- 已发布内容：按查看权限开放。
- 草稿、审核中、已驳回：仅创建人、审核人、管理员或具备管理权限者可见。

后端必须负责数据范围过滤，不能将全部数据返回给前端后再隐藏。

## 3.4 字段级权限

项目概览包含合同金额、折算人民币、签约时间和验收时间，因此 DTO 必须按字段权限裁剪。

示例：

```ts
ProjectOverviewItemDto {
  id: string
  name: string
  countryName: string | null
  cityName: string | null
  currentStage: ProjectStage
  progressPercent: number
  contractSignedAt: Date | null
  expectedAcceptanceAt: Date | null
  actualAcceptanceAt: Date | null
  acceptanceTimeType: 'ACTUAL' | 'EXPECTED' | 'NONE'
  contractCurrencyCode: string | null
  contractAmount: Decimal | null
  convertedCnyAmount: Decimal | null
  salesOwner: UserSummaryDto | null
  projectManager: UserSummaryDto | null
}
```

无财务权限时：

```text
contractCurrencyCode = null
contractAmount = null
convertedCnyAmount = null
```

无合同权限时：

```text
contractSignedAt = null
```

无验收权限时：

```text
expectedAcceptanceAt = null
actualAcceptanceAt = null
acceptanceTimeType = NONE
```

## 3.5 用户与角色选项接口

业务表单不能继续依赖管理员专用用户列表。

新增受控选项接口：

```http
GET /references/users?purpose=project-member
GET /references/users?purpose=project-manager
GET /references/users?purpose=sales-owner
GET /references/users?purpose=file-reviewer
GET /references/roles?purpose=notification-recipient
```

接口只返回必要字段：

```ts
{
  id
  name
  displayName
  departmentName
  active
}
```

不返回用户敏感字段，也不要求用户管理权限。

---

# 4. 认证与会话

## 4.1 Token 模型

采用：

```text
Access Token：短期 JWT
Refresh Token：HttpOnly + Secure Cookie
```

接口：

```http
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/logout-all
GET  /auth/profile
GET  /auth/session
```

Refresh Token 要求：

- 数据库存储 hash，不存明文。
- 每次刷新进行轮换。
- 支持设备、IP、User-Agent 和过期时间记录。
- 登出和密码重置时吊销。
- 并发刷新由服务端防重放，前端只发起单次刷新。

## 4.2 登录回跳

后端不负责前端路由，但登录响应应稳定返回用户首个可访问业务域或默认首页信息：

```ts
{
  accessToken
  user
  permissions
  defaultRoute: '/dashboard'
}
```

## 4.3 会话与权限变更

角色、权限或用户状态变化时：

- 更新权限版本号。
- 下一次请求发现版本不一致时刷新 profile。
- 禁用用户立即吊销全部 Refresh Token。

---

# 5. 工作台与数据看板

工作台包含：

```text
数据看板
文件审核
```

## 5.1 数据看板接口

避免一个大接口失败导致整页不可用。建议分区接口：

```http
GET /dashboard/project-summary
GET /dashboard/my-tasks
GET /dashboard/high-risks
GET /dashboard/recent-projects
GET /dashboard/recent-activities
```

### 项目概览统计

```ts
{
  total: number
  active: number
  accepted: number
  highRisk: number
}
```

所有统计必须按数据范围计算。

### 我的待办

目标待办不再是独立通用审批页面，而是工作台数据块，至少包含：

- 待审核文件
- 被驳回需修改文件
- 项目阶段或风险提醒
- 系统通知

## 5.2 缓存

看板统计允许短缓存：

```text
项目概览：30～60 秒
风险统计：30 秒
近期项目：60 秒
```

项目、文件、审核状态变更后主动失效相关缓存。

---

# 6. 项目管理

## 6.1 项目数据模型收敛

建议项目核心字段：

```ts
Project {
  id
  code
  name
  shortName
  customerId
  customerNameSnapshot
  countryCode
  cityName
  projectType
  languageCode
  status
  currentStage
  progressPercent
  riskLevel
  riskDescription

  contractNo
  contractCurrencyCode
  contractAmount
  contractSignedAt
  cnyRateSnapshot
  convertedCnyAmount

  plannedStartAt
  plannedEndAt
  expectedAcceptanceAt
  actualAcceptanceAt

  salesOwnerId
  projectManagerId
  archiveTemplateId
  archiveTemplateVersionId

  createdBy
  createdAt
  updatedAt
  archivedAt
  deletedAt
}
```

### 项目状态

```text
DRAFT
ACTIVE
PAUSED
COMPLETED
CANCELLED
```

### 项目阶段

```text
STARTUP
DEEPENING
PROCUREMENT
CONSTRUCTION
COMMISSIONING
TESTING
INTERNAL_ACCEPTANCE
EXTERNAL_ACCEPTANCE
WARRANTY
```

状态与阶段严格分开。

## 6.2 项目概览接口

### 统计

```http
GET /projects/summary
```

查询参数：

```text
summaryFilter=ALL|ACTIVE|ACCEPTED|HIGH_RISK
```

返回：

```ts
{
  total
  active
  accepted
  highRisk
}
```

### 列表

```http
GET /projects
```

前端只保留关键词搜索，但后端可继续支持管理接口使用的结构化条件。

前端参数：

```text
keyword
summaryFilter
page
pageSize
sort
```

关键词搜索：

- 项目名称
- 项目编号
- 客户名称

返回字段严格匹配前端列表，不返回无关大对象。

## 6.3 创建项目

```http
POST /projects
```

项目创建必须使用数据库事务，单次完成：

1. 创建项目主记录。
2. 保存合同与金额信息。
3. 保存销售、项目经理和项目成员。
4. 保存项目状态、阶段、风险和进度。
5. 读取已发布档案模版版本。
6. 复制模版为项目档案快照。
7. 生成文件夹和文件项。
8. 写入项目创建事件和审计日志。
9. 如配置新建项目审批，则创建审核任务；审批通过前项目保持草稿或待审批状态。

未配置新建项目审批时，项目在上述事务完成后直接进入 `ACTIVE`，避免草稿项目缺少合法的激活路径。

任何关键步骤失败必须回滚，不能留下无档案结构的半成品项目。

## 6.4 项目详情与编辑

```http
GET   /projects/:id
PATCH /projects/:id
```

普通编辑接口不能直接修改：

- 项目阶段
- 项目状态
- 项目编号
- 已使用档案模版版本
- 实际验收状态

这些必须使用专用命令接口。

## 6.5 项目阶段修改

```http
PATCH /projects/:id/stage
```

请求：

```ts
{
  targetStage: ProjectStage
  reason?: string
}
```

规则：

- 具备 `project:stage:update`。
- 回退阶段必须填写原因。
- 记录原阶段、新阶段、操作人和原因。
- 写入审计日志和项目动态。
- 触发通知事件。

## 6.6 项目状态动作

```http
POST /projects/:id/pause
POST /projects/:id/resume
POST /projects/:id/complete
POST /projects/:id/cancel
POST /projects/:id/archive
POST /projects/:id/restore
DELETE /projects/:id
```

规则：

- 归档为软归档。
- `DELETE /projects/:id` 仅允许 `SUPER_ADMIN`，权限装饰器之外 Service 再做角色终检。
- 存在文件、审核记录、财务记录或审计记录时，默认禁止物理删除。
- 成功删除与因关联记录被拒绝都写审计日志；409 消息返回四类阻断数量，前端保持当前页面。
- 所有状态动作写审计日志。

## 6.7 项目验收时间

后端同时保存：

```text
expectedAcceptanceAt
actualAcceptanceAt
```

前端展示规则由后端辅助字段明确：

```text
ACTUAL：显示实际验收时间
EXPECTED：未验收时显示预计验收时间
NONE：显示 —
```

`actualAcceptanceAt` 只能通过专用验收动作或具备高权限的管理操作写入。

---

# 7. 项目档案

## 7.1 业务边界

项目档案只包含：

```text
项目档案文件夹
项目档案文件项
项目文件
文件版本
模版快照与同步记录
```

不再包含：

- 独立过程记录业务
- 工时日报
- 项目复盘
- 文件审核动作本身
- 按施工阶段组织目录

目录固定为两级：

```text
文件夹
└── 文件项
```

## 7.2 数据模型

### ProjectArchiveFolder

```ts
{
  id
  projectId
  name
  description
  sortOrder
  sourceTemplateFolderId
  isTemporary
  archivedAt
}
```

### ProjectArchiveItem

```ts
{
  id
  projectId
  folderId
  name
  description
  required
  reviewRequired
  approvalTemplateId
  ownerUserId
  ownerRoleId
  allowMultipleFiles
  allowedExtensions
  maxFileSize
  namingRule
  sortOrder
  sourceTemplateItemId
  isTemporary
  archivedAt
}
```

### ProjectArchiveFile

```ts
{
  id
  projectId
  archiveItemId
  currentVersionId
  status
  createdBy
  archivedAt
}
```

### FileVersion

统一进入文件中心，不在项目档案模块重复定义二进制存储结构。

## 7.3 档案树接口

```http
GET /projects/:projectId/archive-tree
```

返回已排序的完整两级树，支持前端全部展开：

```ts
{
  project: {
    id
    code
    name
    currentStage
  }
  template: {
    id
    version
    latestVersion
    hasDiff
  }
  folders: [
    {
      id
      name
      completedCount
      totalCount
      requiredCompletedCount
      requiredTotalCount
      items: [
        {
          id
          name
          required
          status
          currentVersion
          owner
          updatedAt
          canUpload
          canArchive
          pendingReviewSummary
        }
      ]
    }
  ]
}
```

## 7.4 文件上传

```http
POST /projects/:projectId/archive-items/:itemId/files
```

参数：

```text
file
uploadMode=REPLACE|NEW_VERSION
revisionLevel=MINOR|MAJOR
changeDescription
```

### 覆盖

覆盖只代表替换当前工作文件，不允许无痕删除历史。

规则：

- 审核中版本不能被普通用户覆盖。
- 已通过正式版本覆盖需要 `archive:replace`。
- 被覆盖内容保留审计恢复记录。
- 覆盖行为写操作日志。

### 新版本

- 版本号由系统生成。
- `MINOR` 递增小版本。
- `MAJOR` 递增主版本。
- 审核失败版本不成为当前正式版本。

## 7.5 临时档案项

```http
POST /projects/:projectId/archive-folders/:folderId/items
```

要求：

```text
archive:item:create_temporary
```

必须记录：

- 创建原因
- 创建人
- 负责人
- 是否必填
- 是否需要审核
- 是否建议加入档案模版

## 7.6 档案项归档

```http
POST /projects/:projectId/archive-items/:itemId/archive
POST /projects/:projectId/archive-items/:itemId/restore
```

不能直接删除有文件历史的档案项。

## 7.7 模版差异同步

```http
GET  /projects/:projectId/archive-template-diff
POST /projects/:projectId/archive-template-sync
```

同步原则：

- 默认只新增文件夹和文件项。
- 不自动删除项目已有档案项。
- 名称、必填、审核规则变更逐项确认。
- 记录同步来源版本和变更明细。

---

# 8. 档案模版

## 8.1 模型

### ArchiveTemplate

```ts
{
  id
  code
  name
  projectType
  status
  currentPublishedVersionId
  createdBy
  updatedBy
}
```

### ArchiveTemplateVersion

```ts
{
  id
  templateId
  version
  status
  submittedAt
  publishedAt
  publishedBy
}
```

### ArchiveTemplateFolder

```ts
{
  id
  templateVersionId
  name
  description
  sortOrder
}
```

### ArchiveTemplateItem

```ts
{
  id
  folderId
  name
  description
  required
  reviewRequired
  approvalTemplateId
  ownerRoleId
  allowMultipleFiles
  allowedExtensions
  maxFileSize
  namingRule
  sortOrder
}
```

只允许两级目录：

```text
文件夹
→ 文件项
```

## 8.2 状态

```text
DRAFT
IN_REVIEW
PUBLISHED
REJECTED
DISABLED
```

## 8.3 接口

```http
GET  /archive-templates
POST /archive-templates
GET  /archive-templates/:id
POST /archive-templates/:id/versions
PATCH /archive-template-versions/:versionId
POST /archive-template-versions/:versionId/submit-review
POST /archive-template-versions/:versionId/publish
POST /archive-templates/:id/disable
```

已发布版本只读。创建新版本时完整复制当前发布版本为草稿。

档案模版审核任务统一进入文件审核中心，但来源标记为 `ARCHIVE_TEMPLATE`；若前端最终不展示此来源，可以由管理员审批配置页处理，不应重新建立另一套审批实现。

---

# 9. 统一文件中心

## 9.1 目标

项目档案、标准库、知识库和审核任务不再各自维护附件模型。

统一文件中心负责：

```text
文件元数据
存储位置
版本
预览会话
下载
缩略图
格式转换
权限校验
归档
处理任务
```

## 9.2 核心模型

### FileAsset

```ts
{
  id
  ownerType
  ownerId
  originalName
  extension
  mimeType
  size
  storageProvider
  storageKey
  checksum
  status
  createdBy
  createdAt
  archivedAt
}
```

### FileVersion

```ts
{
  id
  logicalFileId
  version
  revisionLevel
  assetId
  status
  changeDescription
  uploadedBy
  uploadedAt
  approvedAt
}
```

### FileProcessingJob

```ts
{
  id
  fileAssetId
  type
  status
  progress
  outputAssetId
  errorCode
  errorMessage
  createdAt
  completedAt
}
```

处理类型：

```text
THUMBNAIL
PDF_PREVIEW
CAD_CONVERT
VISIO_CONVERT
XMIND_PARSE
VIDEO_TRANSCODE
LARGE_IMAGE_TILE
```

## 9.3 文件接口

```http
POST /files/drafts
POST /projects/:projectId/archive-items/:itemId/files
GET  /files/:id
GET  /files/:id/preview-session
GET  /files/:id/download
GET  /files/:id/versions
GET  /files/:id/thumbnail
GET  /files/:id/processing-status
POST /files/:id/archive
```

上传规则：

- 系统设置和档案项同时限制扩展名、大小、文件头与命名规则；部署级 `FILE_UPLOAD_HARD_LIMIT_MB` 只提供不可被运行时配置放大的安全上限。
- 档案命名规则可使用 `{version}`，匹配 `V1.0`、`1.0` 等版本片段；规则不写扩展名时同时匹配文件 basename，例如 `项目立项资料-{version}` 接受 `项目立项资料-V1.0.pdf`。
- `allowMultipleFiles=false` 允许创建第一个 LogicalFile，只阻止第二个独立 LogicalFile；后续版本必须复用已有逻辑文件。
- `Idempotency-Key` 与上传人、业务归属、文件名、大小、checksum 绑定；同请求重放返回同一版本，复用到不同内容返回 409。
- 上传参数清洗不得克隆或改写 Multer Buffer；数据库事务失败时删除未提交的 MinIO 对象。

## 9.4 预览会话

返回统一预览描述：

```ts
{
  fileId
  fileName
  mimeType
  extension
  viewerType
  previewUrl
  downloadAllowed
  metadata
  processingStatus
}
```

`viewerType`：

```text
ONLYOFFICE_VIEW
PDF
IMAGE
LARGE_IMAGE
MARKDOWN
CAD_CONVERTED
VISIO_CONVERTED
XMIND
VIDEO
AUDIO
UNSUPPORTED
```

Office 全局只读，不提供编辑配置和保存回调。

## 9.5 文件安全

- 文件 URL 使用短时签名或受控流式接口。
- 不暴露真实磁盘路径。
- 校验 MIME、扩展名和文件头。
- 防止路径穿越和 SSRF。
- 下载、预览和归档写审计日志。
- 密钥、环境变量和配置文件禁止进入普通预览范围。

---

# 10. 统一文件审核

## 10.1 目标

项目档案、标准库和知识库统一进入一个文件审核中心。

所有用户可见审核菜单，但列表数据按关系和权限过滤：

- 普通用户：自己的提交、自己参与的审批和可见进度。
- 审核人：待自己处理和已处理任务。
- 管理员或 `file_review:view_all`：全部审核任务。

审核统计、列表、详情和历史接口仅要求登录，统一由 `ReviewTaskService` 按上述关系、项目数据范围以及 `file_review:view_all`/`file_review:manage` 过滤，不能依赖角色种子是否恰好包含基础查看权限。

只有具备 `file_review:act` 且当前步骤轮到该用户时才能通过或驳回。

## 10.2 模型

### ReviewTask

```ts
{
  id
  sourceType
  sourceId
  sourceVersionId
  fileVersionId
  title
  locationLabel
  status
  reviewMode
  currentStepNo
  totalSteps
  submittedBy
  submittedAt
  completedAt
  dueAt
}
```

`sourceType`：

```text
PROJECT_ARCHIVE
STANDARD
KNOWLEDGE
ARCHIVE_TEMPLATE
PROJECT_CREATE
```

### ReviewStep

```ts
{
  id
  reviewTaskId
  stepNo
  mode
  requiredCount
  status
}
```

### ReviewAssignee

```ts
{
  id
  reviewStepId
  assigneeType
  assigneeId
  status
  actedAt
  comment
}
```

## 10.3 审核模式

支持：

```text
SINGLE
ALL_SIGN
ANY_N
SERIAL
PARALLEL
```

审核人必须在任务创建时解析为真实有效用户，并确认具备审核权限；禁止回退到上传人或无权限用户。

## 10.4 接口

```http
GET  /file-reviews/summary
GET  /file-reviews
GET  /file-reviews/:id
POST /file-reviews/:id/approve
POST /file-reviews/:id/reject
GET  /file-reviews/:id/history
```

列表字段直接支持前端：

```text
文件名
版本
来源
档案位置/标准类型/知识分类
上传人
审核进度
提交时间
状态
```

## 10.5 审核完成回写

统一业务适配器：

```ts
ReviewBusinessAdapter
```

各来源实现：

```text
ProjectArchiveReviewAdapter
StandardReviewAdapter
KnowledgeReviewAdapter
ArchiveTemplateReviewAdapter
ProjectCreateReviewAdapter
```

最终通过时由适配器原子回写业务状态。

不再允许审批配置出现“可创建任务但无法回写业务状态”的业务类型。

---

# 11. 标准库

## 11.1 业务范围

标准库统一承载：

```text
SOP
管理制度
交付流程
检查标准
文档模版
表单模版
技术标准
作业规范
```

删除原交付流程、检查模版、文档模版三个独立业务域和重复页面接口。

## 11.2 数据模型

### Standard

```ts
{
  id
  code
  name
  type
  category
  status
  currentPublishedVersionId
  effectiveAt
  createdBy
  archivedAt
}
```

### StandardVersion

```ts
{
  id
  standardId
  version
  fileVersionId
  status
  effectiveAt
  changeDescription
  submittedBy
  publishedAt
}
```

### StandardRelation

```ts
{
  id
  sourceStandardId
  targetStandardId
  relationType
}
```

关系：

```text
SUPPORTING_FORM
SUPPORTING_TEMPLATE
REFERENCES
REPLACES
PRECONDITION
FOLLOW_UP
```

禁止关联知识库条目。

## 11.3 状态

```text
DRAFT
IN_REVIEW
REJECTED
PUBLISHED
ARCHIVED
```

## 11.4 接口

```http
GET  /standards/summary
GET  /standards
POST /standards
GET  /standards/:id
PATCH /standards/:id
POST /standards/:id/versions
POST /standard-versions/:id/submit-review
GET  /standards/:id/relations
POST /standards/:id/relations
DELETE /standards/:id/relations/:relationId
POST /standards/:id/archive
```

标准新增或新版本提交后，进入统一文件审核。

已发布版本不能直接编辑，编辑动作必须创建新版本草稿。

---

# 12. 知识库

## 12.1 业务范围

知识库统一为一个列表型资料库，不再维护“文件快速新增”和“Markdown 文章详情”两套互不连通流程。

一个知识条目可以有一种内容：

```text
FILE
MARKDOWN
LINK
```

但都使用统一版本模型和审核流程。

## 12.2 数据模型

### KnowledgeItem

```ts
{
  id
  title
  categoryId
  summary
  contentType
  status
  currentPublishedVersionId
  effectiveAt
  createdBy
  archivedAt
}
```

### KnowledgeVersion

```ts
{
  id
  knowledgeItemId
  version
  contentType
  fileVersionId
  markdownContent
  externalUrl
  status
  changeDescription
  submittedBy
  publishedAt
}
```

## 12.3 状态

```text
DRAFT
IN_REVIEW
REJECTED
PUBLISHED
ARCHIVED
```

所有新增和版本更新必须审核。

## 12.4 接口

```http
GET  /knowledge/summary
GET  /knowledge
POST /knowledge
GET  /knowledge/:id
PATCH /knowledge/:id
POST /knowledge/:id/versions
POST /knowledge-versions/:id/submit-review
POST /knowledge/:id/archive
```

不再保留知识文件替换作为附件归属变更的隐式流程；每次修改都产生明确 `KnowledgeVersion`。

---

# 13. 工具中心

工具中心只保留工具目录和内部工具入口，不参与标准或知识审核。

## 模型

```ts
ToolDefinition {
  id
  name
  category
  description
  toolType
  routeOrUrl
  enabled
  sortOrder
  configuration
}
```

`toolType`：

```text
INTERNAL
EXTERNAL
```

接口：

```http
GET  /tools
POST /tools
PATCH /tools/:id
POST /tools/:id/enable
POST /tools/:id/disable
```

普通用户仅可读取启用工具；管理员可管理。

---

# 14. 设置模块

设置齿轮对所有用户可见，但每个配置页和动作单独鉴权。

## 14.1 币种与汇率

删除国家配置后，项目国家使用后端固定基础字典或独立只读国家数据，不再提供管理页面。

### 模型

```ts
Currency {
  code
  name
  symbol
  decimalPlaces
  status
  cnyRate
  rateDate
  rateLocked
  lockedBy
  lockedAt
  source
}
```

### 接口

```http
GET  /currencies
POST /currencies
PATCH /currencies/:code
POST /currencies/sync-rates
POST /currencies/:code/lock
POST /currencies/:code/unlock
POST /currencies/:code/disable
```

读取币种列表不要求管理员角色；修改必须有 `currency:manage`。

项目创建时保存汇率快照，历史折算金额不随实时汇率自动变化。

## 14.2 通知规则

渠道只保留：

```text
IN_APP
FEISHU
WECOM
```

### 模型

```ts
NotificationRule {
  id
  name
  eventType
  channels
  recipientPolicy
  templateId
  enabled
}

NotificationDelivery {
  id
  eventId
  userId
  channel
  status // PENDING | SENT | SKIPPED | FAILED
  attempts
  receiptId
  errorCode
  sentAt
}
```

`NotificationDelivery` 以 `(eventId, userId, channel)` 唯一约束保证逐通道幂等，并只记录稳定错误码，不保存第三方错误正文。

### 接口

```http
GET  /notification-rules
POST /notification-rules
PATCH /notification-rules/:id
DELETE /notification-rules/:id
POST /notification-rules/:id/toggle
```

有历史发送记录的规则删除应转为软删除或停用。

## 14.3 审批配置

业务类型仅保留：

```text
PROJECT_CREATE
PROJECT_ARCHIVE_FILE
STANDARD
KNOWLEDGE
ARCHIVE_TEMPLATE
```

### 接口

```http
GET  /approval-templates
POST /approval-templates
PATCH /approval-templates/:id
DELETE /approval-templates/:id
POST /approval-templates/:id/toggle
```

配置只能引用系统支持且已注册业务适配器的业务类型。

## 14.4 操作日志

### 接口

```http
GET /audit-logs
GET /audit-logs/:id
```

字段：

```text
操作时间
用户
模块
动作
对象
结果
IP
User-Agent
Trace ID
变更前
变更后
错误原因
```

敏感字段统一脱敏。

日志读取只检查 `audit_log:view`，不再额外限制角色。

## 14.5 系统配置

删除配置分组：

```text
汇率
通知
平台基础
公司报告
界面显示
国家
语言与翻译
```

保留当前源码中的其他有效配置项，但必须逐项确认是否仍有业务消费者。

接口：

```http
GET   /system-settings
PATCH /system-settings
GET   /system-time
```

`/system-time` 返回服务器时间和时区，只读。

配置项应定义 Schema，不允许继续以无约束 JSON 字符串任意写入。

## 14.6 接口集成

仅保留：

```text
FEISHU
WECOM
```

能力：

```text
通讯录同步
通知发送
```

接口：

```http
GET  /integrations
GET  /integrations/:provider
PATCH /integrations/:provider
POST /integrations/:provider/test
POST /integrations/:provider/sync-contacts
POST /integrations/:provider/test-notification
GET  /integrations/:provider/sync-logs
```

安全：

- Secret 加密存储。
- 查询不返回明文。
- 修改 Secret 必须重新输入。
- 同步失败不能影响主业务登录。
- 禁止默认删除本地用户。
- 通讯录同步提供新增、更新、停用、冲突统计。
- 外部身份统一写入 `ExternalIdentity`，以 `(provider, externalUserId)` 唯一关联 `User`，保存标识类型、活动状态、最后出现时间和是否由集成自动创建用户。
- 同步只按规范化后的精确邮箱或手机号匹配；多用户命中计入冲突，不自动合并。
- 同步通过 `IntegrationConfig` 上的租约所有者、到期时间和 revision 做 CAS 抢占；一次用户/身份变更在同一事务提交。
- 上游缺席只停用集成自动创建且已无其他活动外部身份的用户，不删除或停用普通本地用户。

---

# 15. 通知与领域事件

## 15.1 领域事件

建议发布：

```text
ProjectCreated
ProjectStageChanged
ProjectArchived
ProjectAccepted
ArchiveFileUploaded
ReviewTaskCreated
ReviewTaskApproved
ReviewTaskRejected
StandardPublished
KnowledgePublished
ArchiveTemplatePublished
CurrencyRateUpdated
IntegrationContactsSynced
```

## 15.2 事件消费者

```text
通知发送
操作日志
工作台缓存失效
文件转换任务
搜索索引
统计更新
```

外部通知和文件转换不得阻塞主事务。

建议采用队列：

```text
BullMQ + Redis
```

若当前阶段不引入队列，至少使用 Outbox 表保证事件不丢失。

当前 Outbox 实现约束：

- 业务事务只写入 `outbox_events`，通知投递由独立 `outbox-worker` 处理，不能阻塞主事务。
- Worker 通过 `PENDING -> PROCESSING` 条件更新原子抢占事件，以 `availableAt` 作为处理租约；租约超时后允许其他实例回收。
- 失败事件最多尝试 5 次，使用指数退避；达到上限进入 `DEAD`，只记录稳定错误码，不保存或输出事件载荷、密钥和外部错误正文。
- 已处理事件进入 `PROCESSED`；不支持的事件进入 `SKIPPED` 并记录 `UNSUPPORTED_EVENT_TYPE`，不得静默伪装为已投递。
- 所有渠道使用 `${eventId}:${userId}:${channel}` 作为稳定投递键，并由 `NotificationDelivery` 的数据库唯一约束去重。Worker 在通知写入或外部发送后异常重试，也不会重复生成站内通知；飞书同时使用稳定且不超过 50 字符的 `uuid`，企业微信启用服务端重复检查。
- `ReviewTaskCreated` 通知当前活动步骤审核人；审核通过或驳回通知提交人；项目事件通知项目负责人和成员；文件处理完成通知上传人；标准、知识和档案模板发布通知创建人、提交人。
- `ArchiveFileUploaded` 已产生审核任务时，由 `ReviewTaskCreated` 通知替代，避免重复；无需审核时通知档案项负责人、项目负责人和成员。`CurrencyRateUpdated` 是明确无需用户通知的已处理事件。
- `IN_APP`、`FEISHU` 和 `WECOM` 均由独立 Worker 真实投递并保存逐通道回执。永久缺少配置或外部身份时记录 `SKIPPED` 和稳定错误码；网络等暂时失败记录 `FAILED` 并随 Outbox 指数退避，达到上限后事件进入 `DEAD`。仅配置外部渠道且全部跳过的事件不得标记为 `PROCESSED`。

---

# 16. API 统一规范

## 16.1 响应结构

保持统一 Envelope：

```ts
{
  code: number
  message: string
  data: T
  timestamp: string
  traceId: string
}
```

分页：

```ts
{
  items: T[]
  page: number
  pageSize: number
  total: number
}
```

## 16.2 错误码

建议按业务域定义：

```text
AUTH_*
PERMISSION_*
PROJECT_*
ARCHIVE_*
FILE_*
REVIEW_*
STANDARD_*
KNOWLEDGE_*
SETTING_*
INTEGRATION_*
```

不要只返回通用 `400` 和字符串。

## 16.3 幂等与并发

以下操作必须支持幂等或并发保护：

- 项目创建
- 文件上传完成
- 审核通过/驳回
- 发布标准/知识/模版
- 汇率同步
- 通讯录同步

使用：

- 幂等键
- 乐观锁版本号
- 数据库唯一约束
- 事务

## 16.4 乐观锁

核心版本实体增加：

```text
revision
```

更新时携带当前 revision，避免两人同时覆盖。

---

# 17. 删除与合并结果

## 17.1 合并到标准库

运行时已删除独立 `workflow`、`checklist`、`template` 模块及其 Controller/Service；交付流程、检查模版和文档模版目标数据统一进入：

```text
standards
standard_versions
standard_relations
```

## 17.2 合并到知识库

前端与运行时已删除知识快捷创建、旧知识文章审批和修订附件双流程，统一为：

```text
knowledge_items
knowledge_versions
```

## 17.3 合并到文件审核

项目创建、项目档案、档案模版、标准和知识不再各自实现审核，统一为：

```text
review_tasks
review_steps
review_assignees
ReviewBusinessService
```

审批配置只用于生成不可变的任务/步骤/指派人快照；业务状态由注册的 `ReviewBusinessService` 在同一终态事务中回写。`activeReviewKey` 唯一约束、行锁和条件更新确保同一业务版本只有一个活动任务，终态只执行一次。

## 17.4 退出运行时的业务域

以下域的前端页面、API 客户端、后端 Controller/Service 和模块注册已删除：

```text
reports
retrospectives
okr
skills
training
country-management
language-management
storage-backup UI
process-records 独立业务页
```

对应 Prisma 旧模型/表暂时保留为只读历史数据和可审计迁移源，不参与应用运行时、种子写入或新接口响应；后续物理删表必须另建备份、计数、外键和回滚评审。

## 17.5 接口集成收敛

UI 和业务流程只保留飞书、企业微信；以下集成已退出：

```text
SMTP
OSS
Webhook
其他第三方供应商
候选人员审批独立工作流
```

飞书和企业微信通讯录同步使用租约和 revision 防并发，匹配结果直接写统一用户与 `ExternalIdentity`；冲突、未匹配和停用项进入脱敏同步日志，不建立候选人审批双轨。Secret 使用 AES-256-GCM 独立密钥加密，API 只返回掩码。

---

# 18. 数据迁移与回滚

## 18.1 已落地迁移

Prisma 迁移已新增目标档案、文件、审核、标准、知识、Outbox、集成身份与投递回执模型，并通过 `20260712094000_finalize_project_template_states_and_member_soft_delete` 完成最终状态切换：

- 项目运行时只保留 `status` 与 `current_stage`，旧状态原值和最终映射写入只读 `project_legacy_state_archive`。
- 项目生命周期限定为 `DRAFT / ACTIVE / PAUSED / COMPLETED / CANCELLED`；待审由统一 ReviewTask 表达，归档由 `archivedAt` 表达，不再复制为项目状态；运行时阶段支持启动、深化、采购、施工、调试、测试、内验、外验、维保。
- 档案模版聚合状态统一为 `DRAFT / IN_REVIEW / PUBLISHED / REJECTED / DISABLED`。
- 项目成员增加 `deleted_at`，删除后可按原唯一键安全恢复。
- 同一业务版本的活动审核使用 `active_review_key` 唯一约束。
- 集成增加 `ExternalIdentity`、`NotificationDelivery` 与同步租约 revision。
- 094 对未知历史项目状态或阶段写入 `migration_exceptions` 并在删旧列前失败；只有空阶段按确定规则初始化为 `STARTUP`，不会把无法识别的值伪装为成功迁移。

旧表未被截断或覆盖；目标 API 不再双读、双写旧表。所有不可自动判断的历史数据写入 `migration_exceptions`，不得用默认值伪造成功迁移。

## 18.2 既有环境安全升级顺序

1. 停止 API、File Worker 和 Outbox Worker 写入，备份 MySQL、MinIO、`.env` 和迁移前表计数。
2. 在副本或测试库执行 `prisma migrate deploy`，确认全部迁移（含 092、093、094）完成。
3. 运行 `prisma:audit-archive-migration`，审查档案层级和对象存储引用。
4. 若存在旧标准/知识审批，先对 `prisma:migrate-target-content` 做 dry-run，再使用 `--apply --actor-user-id=<active-id>`。
5. 对 `prisma:migrate-target-foundation` 做 dry-run；清理 ERROR 后执行 `--apply --actor-user-id=<active-id>`，再以 `--verify --strict` 校验数量、外键和关系。
6. 配置独立 32 字节 Base64 `INTEGRATION_SECRET_ENCRYPTION_KEY`，先 dry-run `prisma:migrate-integration-secrets`，再执行 `--apply --actor-user-id=<active-id>` 或 `--actor-username=<active-username>`，最后执行 `--verify`；确认明文 Secret 行为 0 且无待重写记录。
7. 运行幂等 seed 两次并比较业务表计数；确认无目标状态异常、无重复活动审核、无重复活动项目成员。
8. 启动 API，再启动 File Worker 与 Outbox Worker；检查 `/health`、`/ready`、预览、审核、通知回执和同步日志。

上述数据脚本默认只读；`--apply` 必须指定有效操作人。生产发布不得把脚本的 dry-run 报告当作已迁移，也不得使用 `db push --accept-data-loss`。

## 18.3 回滚边界

- 代码回滚前先停止 Worker，避免旧代码消费新 Outbox 或处理任务；code-only rollback 还必须确认不存在未解决的数据库变更标记，且目标提交的 Prisma migration 名称和 checksum 与在线数据库完全一致。
- 数据回滚以迁移前 MySQL/MinIO 成对备份为唯一可靠恢复点；不得只恢复数据库而不恢复对象存储。
- 破坏性恢复必须在替换数据库前持久化绑定备份路径、checksum 和 revision 的 incomplete-restore 标记；标记清除前禁止普通部署、备份或 code-only rollback 启动业务流量。
- `backend-migrate` 一旦启动即视为数据库可能已变更；此后不得只回滚代码或加密密钥。可恢复运行时必须与备份中的 Prisma migration 名称和 checksum 完全一致，并在破坏性恢复前验证完整 `.env`、源 Compose 拓扑、不可变 Image ID 与 OCI release label；启动时禁止现场重建旧镜像。
- 094 删除旧项目运行时列后，原值仍可从 `project_legacy_state_archive` 审计恢复，但恢复旧应用必须走单独、演练过的反向迁移，不能临时手工改列。
- 已发出的飞书/企微消息不可由数据库回滚撤回；`NotificationDelivery` 和服务商回执必须保留供追踪。
- 旧历史表继续只读保留，不以“回滚需要”为由恢复旧 Controller、Service 或双写。

---

# 19. 安全基线实施结果

- Controller 仅使用权限码守卫；角色作为权限集合，业务逻辑不再维护角色白名单。
- 项目范围由统一 `DataScopeService`/`ProjectAccessService` 生成，合同、金额、回款、待审文件和历史版本做字段与对象级校验。
- 业务表单使用目的化用户/角色引用接口，不读取管理员全量用户列表。
- 审核配置解析时校验指派人资格，`reviewRequired` 决定是否生成 ReviewTask；五类审核来源均注册业务回写。
- Access Token 短期使用，Refresh Token 仅存 HttpOnly Cookie 的服务端哈希会话；支持单端和全端吊销，登录失败次数与会话时长读取系统配置。
- 项目创建、档案快照、审核任务、审计和 Outbox 在事务中提交；项目创建与文件上传有稳定幂等键，项目写命令使用 revision。
- 文件预览、待审内容、历史版本和下载均在后端校验并审计；MinIO bucket/key 和集成 Secret 不返回浏览器。
- 用户角色、角色权限、项目成员、系统设置、集成和高风险项目动作写操作日志；未知异常只向客户端返回安全信息，服务端记录 trace stack。

---

# 20. 运行时实现总览

| 领域 | 当前实现 |
| ---- | -------- |
| 认证权限 | JWT + RefreshSession、权限码、项目数据范围、字段裁剪、受控引用、动态登录限制 |
| 项目 | 扁平分页与统计、事务创建、必选发布档案模版、幂等创建、revision、专用阶段/状态/验收命令、归档/恢复、受限物理删除 |
| 档案模版与项目档案 | 两级版本模版、发布快照、项目专属快照、临时项、ADD_ONLY 差异同步、成员软删除 |
| 文件 | LogicalFile/FileAsset/FileVersion、MinIO、上传策略与签名校验、幂等、当前版本指针、只读预览会话 |
| 文件处理 | 独立 File Worker，租约、过期回收、指数退避、稳定错误码；CAD/Visio/视频/大图/缩略图/XMind 处理按配置执行 |
| 审核 | ReviewTask/Step/Assignee/ActionEvent，SINGLE/ALL_SIGN/ANY_N/SERIAL/PARALLEL，活动键唯一约束与并发终态保护 |
| 标准与知识 | 独立版本、乐观 revision、统一审核发布、当前发布指针、历史版本和软归档 |
| 设置与审计 | 币种汇率、通知规则、审批快照、系统配置、操作日志明细与脱敏 |
| 集成与通知 | 仅 FEISHU/WECOM；AES-256-GCM Secret、通讯录租约同步、ExternalIdentity、Outbox Worker、NotificationDelivery 回执与通道幂等 |
| 清理 | 旧页面、API、Controller、Service、重复预览和角色守卫已退出；旧表只读保留，种子仅维护目标数据 |

File Worker 和 Outbox Worker 都是生产运行单元，不应与 API 合并成进程内定时器。多实例通过数据库条件更新原子领取，租约过期可回收；达到最大尝试次数后保留失败/死信事实。外部消息只有服务商返回成功并写入回执后才是 `SENT`，缺少身份或配置时记录稳定的 `SKIPPED` 原因。

---

# 21. 测试与验收

## 21.1 单元测试

覆盖：

- 权限和数据范围
- 项目阶段前进/回退
- 项目金额字段裁剪
- 档案模版复制和差异同步
- 文件版本覆盖/新版本
- 审核会签规则
- 标准和知识发布状态
- 汇率锁定和同步
- 集成 Secret 脱敏

## 21.2 集成测试

覆盖：

- 登录、刷新、登出和吊销
- 项目创建完整事务
- 档案上传、审核、驳回和版本生效
- 标准审核发布
- 知识审核发布
- 归档和恢复
- 审计日志写入
- 飞书/企业微信同步

## 21.3 角色矩阵测试

所有种子角色至少验证：

```text
菜单可见性
API 可达性
数据范围
字段权限
动作权限
审核权限
设置只读/可编辑状态
```

不允许再出现：

```text
前端可见但 API 403
有权限码但角色白名单拒绝
无成本权限却收到财务字段
```

## 21.4 真实环境 E2E

本地模拟服务不能作为权限验收依据。必须在真实 NestJS、MySQL 和真实守卫环境测试：

1. 项目概览统计与列表。
2. 创建项目并生成档案快照。
3. 修改项目阶段和阶段回退。
4. 上传档案文件并审核。
5. 多人会签。
6. 标准和知识发布。
7. 文件预览和下载权限。
8. 设置只读和管理权限。
9. 操作日志与敏感字段脱敏。
10. 会话刷新和多端退出。

2026-07-13 的重构验证已在隔离真实 MySQL、Redis、MinIO 和编译后的 NestJS API 上覆盖：连续应用全部 26 个迁移且无失败或回滚记录、seed 连续执行两次、094 代表性旧库升级；登录/Refresh 与扁平分页；项目创建幂等、revision 冲突、阶段和生命周期命令；档案快照；真实 PDF `{version}` 命名首传、重放、预览、下载审计；档案文件单人审核、`ANY_N` 2/2 多人会签和档案模版并发审核均只产生一个业务终态；项目物理删除阻断和成功分支。真实浏览器已进一步覆盖管理员/项目经理的数据范围、声明式与动态表格、审核深链、45 个档案文件夹和 PDF Canvas，证据见 `docs/testing.md`。

---

# 22. 运行时接口清单

## 认证

```text
/auth/login
/auth/refresh
/auth/logout
/auth/logout-all
/auth/profile
/auth/session
```

## 工作台

```text
/dashboard/project-summary
/dashboard/my-tasks
/dashboard/high-risks
/dashboard/recent-projects
/dashboard/recent-activities
```

## 项目

```text
/projects/summary
/projects
/projects/:id
/projects/:id/stage
/projects/:id/acceptance
/projects/:id/pause
/projects/:id/resume
/projects/:id/complete
/projects/:id/cancel
/projects/:id/archive
/projects/:id/restore
DELETE /projects/:id
```

## 项目档案

```text
/projects/:id/archive-tree
/projects/:id/archive-template-diff
/projects/:id/archive-template-sync
/projects/:id/archive-folders/:folderId/items
/projects/:id/archive-items/:itemId/files
/projects/:id/archive-items/:itemId/archive
/projects/:id/archive-items/:itemId/restore
```

## 档案模版

```text
/archive-templates
/archive-templates/:id
/archive-templates/:id/versions
/archive-template-versions/:id
/archive-template-versions/:id/submit-review
/archive-template-versions/:id/publish
/archive-templates/:id/disable
```

## 文件

```text
POST /files/drafts
/files/:id
/files/:id/preview-session
/files/:id/download
/files/:id/versions
/files/:id/thumbnail
/files/:id/processing-status
/files/:id/archive
```

## 文件审核

```text
/file-reviews/summary
/file-reviews
/file-reviews/:id
/file-reviews/:id/approve
/file-reviews/:id/reject
/file-reviews/:id/history
```

## 标准库

```text
/standards/summary
/standards
/standards/:id
/standards/:id/versions
/standard-versions/:id
/standard-versions/:id/submit-review
/standards/:id/relations
/standards/:id/archive
```

## 知识库

```text
/knowledge/summary
/knowledge
/knowledge/:id
/knowledge/:id/versions
/knowledge-versions/:id
/knowledge-versions/:id/submit-review
/knowledge/:id/archive
```

## 设置

```text
/currencies
/currencies/sync-rates
/notification-rules
/approval-templates
/audit-logs
/system-settings
/system-time
/integrations
/integrations/:provider/test
/integrations/:provider/sync-contacts
/integrations/:provider/test-notification
/integrations/:provider/sync-logs
```

---

# 23. 最终收敛结论

后端运行时已收敛为五条核心业务主线：

```text
1. 用户权限与数据范围
2. 项目及项目档案
3. 文件版本与文件审核
4. 标准库与知识库
5. 设置、通知、集成与审计
```

所有其他模块已满足以下之一：

- 合并进入上述主线；
- 转为内部支撑服务；
- 迁移为只读历史数据；
- 完成弃用后删除。

当前架构约束为：

1. 前端页面可见性和后端 API 权限一致。
2. 所有列表只返回当前用户允许的数据和字段。
3. 项目阶段、状态、归档和验收均通过专用业务动作修改。
4. 项目档案固定为文件夹和文件项两级，不再按阶段生成目录。
5. 项目、标准、知识共用文件版本和审核中心。
6. 标准、知识和档案模版发布后不可直接修改，必须创建新版本。
7. 文件预览只读、安全、可审计，复杂格式异步转换。
8. 设置入口所有人可见，写操作按权限控制。
9. 飞书和企业微信只承担通讯录同步和通知。
10. 旧流程、旧页面和重复 API 已退出运行时；历史表只读保留，不继续双轨读写。
