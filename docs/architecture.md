# 技术架构

## 总体结构

```text
浏览器
  |
  | HTTP / HTTPS
  v
Nginx 前端容器
  |
  | /api/v1
  v
NestJS API
  |
  +--> MySQL 8        # 业务、会话、审核、Outbox 与审计
  +--> Redis 7        # 缓存、登录失败计数与运行期协调
  +--> MinIO          # 原文件、预览产物和缩略图

File Worker ----------> MySQL + MinIO + 可选转换服务
Outbox Worker --------> MySQL + 站内通知 / 飞书 / 企业微信
```

API、File Worker 和 Outbox Worker 使用同一构建产物，但以独立进程部署。业务事务只写数据库和 Outbox，不等待外部通知；文件转换也不阻塞上传请求。

## 前端

- 位置：`delivery-platform-web/`。
- 框架：Vue 3 + TypeScript + Vite，`strict`、`strictTemplates`、`noUnusedLocals`、`noUnusedParameters` 已开启。
- UI：只使用 Arco Design Vue；`components/business/` 统一页面容器、表格、抽屉、状态、表单和空/错/无权限态，不存在旧 UI 兼容层。
- 路由：Vue Router hash 模式。`shellRoutes` 是路由、主菜单、设置菜单、标题、图标和页面权限的单一来源。
- 状态：Pinia 只保存会话、权限、主题/侧栏和语言；所有在用页面的服务端数据由 TanStack Query 管理。
- 请求：`src/api/` 的 Axios 客户端统一解包响应；Access Token 仅在内存，Refresh Token 使用 HttpOnly Cookie；并发 401 共享一次刷新。
- 文件预览：根节点挂载单一 `AttachmentPreviewModal`，业务页面通过 `useFilePreview` 打开，`FilePreviewRouter` 根据后端只读会话选择 Viewer。
- 国际化：中文与英文 key 集合同构；核心业务与设置页面使用 i18n，业务数据不自动翻译。

完整路由、页面、Query Key、组件和运行边界见 [前端页面架构](frontend-architecture.md)，端到端状态流见 [前端业务流程](frontend-business-flows.md)，正式设计约束见 [前端实施规范](frontend-architecture-refactored.md)。

## 后端

- 位置：`delivery-platform-server/`。
- 框架：NestJS 11 + TypeScript，Prisma 5 访问 MySQL 8。
- 模块：认证、用户/角色/权限/数据范围、看板、项目、项目成员与回款、项目档案、档案模版、文件、统一审核、标准、知识、工具、币种、通知、审批配置、系统配置、集成和操作日志。
- 权限：Controller 使用权限码守卫；角色是权限集合，不维护业务角色白名单。项目数据范围和敏感字段在 Service 再校验。
- 配置：端口、显式 CORS 来源、JWT/Refresh 生命周期、Redis、文档预览和上传硬上限统一由类型化配置解析；生产环境拒绝通配 CORS 和短 JWT Secret。
- 响应：成功响应为 `{ code, message, data, timestamp, traceId }`；列表 `data` 固定为 `{ items, page, pageSize, total }`。异常由全局过滤器返回安全信息，堆栈只写服务端日志。
- 审计：合同/财务查看、文件预览与下载、审核决定、成员/权限/密码/设置/集成变更等敏感操作写操作日志。
- 软删除：项目、成员、回款、用户等核心业务默认软删除；项目物理删除仅限超级管理员，且存在文件、审核、财务或审计记录时拒绝。
- 进程：API、File Worker 和 Outbox Worker 均响应关闭信号，停止领取新任务并释放数据库、Redis 与对象存储连接。

完整模型、接口、并发和迁移契约见 [后端实施规范](backend-architecture-refactored.md)。

## 核心业务模型

### 项目与档案

- `Project` 使用生命周期 `DRAFT / ACTIVE / PAUSED / COMPLETED / CANCELLED` 和九个固定交付阶段；项目类型、合同类型、产品与关键词使用配置化取值。
- 项目团队负责人包含销售、项目经理、电气和软件负责人；阶段、进度百分比及预计/实际验收时间由统一进度命令维护，普通编辑不接收这些受控字段。
- 创建项目要求稳定 `Idempotency-Key`，并在事务中完成项目、成员、发布档案模版快照、可选新建审核、审计和 Outbox。
- 项目写操作携带 `revision`；陈旧 revision 返回 409，前端刷新后由用户重新确认。
- 档案模版由不可变发布版本、两级文件夹/文件项和 stable key 构成；项目创建后复制专属快照，后续同步只允许 `ADD_ONLY`。

### 文件与只读预览

- `LogicalFile` 表示逻辑文件及当前版本指针；`FileAsset` 只记录一个 MinIO 对象；`FileVersion` 保存不可变版本历史和上传幂等键。
- 上传同时受系统允许扩展名、系统可编辑大小、部署硬上限、档案项扩展名/大小/命名规则和文件签名约束。
- 待审版本不会覆盖已批准当前版本；通过后原子切换指针，驳回保留旧当前版本。
- `FileProcessingJob` 由独立 Worker 以租约、过期回收和指数退避处理缩略图、大图、CAD/Visio、XMind 和视频产物。
- 预览会话只读且短时有效，不返回 MinIO bucket/key。Office 使用 ONLYOFFICE 只读会话；PDF 使用 PDF.js；图片使用 Viewer.js/OpenSeadragon；Markdown 先转义原始 HTML；XMind、视频和音频使用专用只读 Viewer；未配置转换器时返回稳定失败码和下载入口。

### 统一审核

- `ReviewTask`、`ReviewStep`、`ReviewAssignee`、`ReviewActionEvent` 统一处理项目创建、项目档案、档案模版、标准和知识。
- 审批配置在任务创建时快照，后续修改不影响进行中的任务。
- 支持 `SINGLE`、`ALL_SIGN`、`ANY_N`、`SERIAL`、`PARALLEL`。
- `activeReviewKey` 唯一约束防止同一业务版本重复活动任务；行锁与条件更新确保并发动作只有一次终态和业务回写。

### 通知与外部集成

- 集成只保留飞书和企业微信；Secret 使用独立密钥 AES-256-GCM 加密，API 只返回掩码。
- 通讯录同步以数据库租约和 revision 防并发，结果写统一用户与 `ExternalIdentity`，冲突写脱敏同步日志。
- Outbox Worker 按通知规则投递 `IN_APP / FEISHU / WECOM`；`NotificationDelivery` 按事件、用户、通道保存幂等回执。缺身份/配置记录 `SKIPPED`，暂时失败重试，达到上限进入 `DEAD`。

## 数据迁移边界

运行时使用统一项目状态、档案、文件、审核、标准、知识与集成模型。流程、检查模版、文档模版、知识文章、附件、报告、绩效等迁移源表保持只读，不参与应用运行。生产升级必须先备份，按 dry-run → apply → verify 执行数据脚本；详细顺序和回滚边界见 [部署运维](deployment.md)。

标准正文只引用统一不可变 FileVersion；知识版本严格使用 FILE、MARKDOWN、LINK 中一个主内容源，并显式维护支持文件集合。旧结构化标准正文只由迁移器读取并物化到 MinIO，不属于运行时兼容契约。
