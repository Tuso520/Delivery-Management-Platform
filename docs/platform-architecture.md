# 平台目标架构

## 1. 平台定位

交付管理平台面向软件交付中心、项目经理、专业工程师、采购、财务、HSE 和标准管理员，覆盖工作台、项目、档案、标准、知识、工具、组织权限、系统配置和通知集成。前端负责工作台式交互和权限可见性，NestJS 负责最终权限、数据范围、事务、审计和业务不变量。

## 2. 页面与路由

| 领域 | 页面 | 路由 |
|---|---|---|
| 工作台 | 数据看板、审核中心 | `/dashboard`、`/reviews` |
| 项目 | 项目概览、项目档案、档案模板 | `/projects`、`/archive`、`/archive-template` |
| 标准与知识 | 标准库、知识库 | `/standards`、`/knowledge` |
| 系统设置 | 币种与汇率、审批规则、字段配置、参数配置、用户中心 | `/settings/currency`、`/settings/approvals`、`/settings/fields`、`/settings/config`、`/settings` |

`BasicLayout` 组合 `AppHeader`、`AppSidebar`、`AppBreadcrumb` 和路由内容区。业务列表优先使用 `PageContainer`、`PageToolbar`、`StatCard`、`BusinessTable` 等设计系统组件。

## 3. 前端分层

- `src/app/`：应用安装和启动。
- `src/router/`、`src/layouts/`：路由、鉴权导航和 App Shell。
- `src/domains/`：项目、档案、标准、知识等领域页面、API、查询、类型和适配器。
- `src/platform/`：权限、字段配置、审批、文件、预览、工作流和通知等跨域能力。
- `src/api/`：统一请求、认证刷新和系统 API。
- `src/design-system/`：页面骨架和业务组件。
- `src/store/`：用户、权限和应用状态。

所有业务请求通过统一 request 客户端，TanStack Query 负责服务器状态；Pinia 不复制列表数据。页面使用 `<script setup lang="ts">`，严格模式下不新增无约束 `any`。

## 4. 后端分层

Controller 只处理协议、DTO、认证和权限装饰器；Service 执行业务规则、事务、数据范围和审计。Prisma 访问 MySQL，Redis 用于缓存和队列协调，MinIO 保存文件实体，数据库只保存索引、版本、审批和预览元数据。

核心模块关系：

- 项目模块消费字段配置并管理成员、进度、金额和生命周期。
- 档案模板发布不可变版本；项目创建时复制模板快照，后续同步只新增。
- 项目档案统一使用 `FileVersion`，并接入审核、预览、下载和审计。
- 标准正文只使用统一 `FileVersion`。
- 知识版本在 FILE、MARKDOWN、LINK 中严格选择一个主内容源，支持文件按完整集合提交。
- 审批模板按业务类型、国家和步骤解析；审核任务保留提交版本快照。
- 字段配置为页面枚举和后端写入校验提供唯一来源。

## 5. 页面、字段、API 与模型映射

| 页面 | 关键配置 | 主要 API | 主要模型 |
|---|---|---|---|
| 项目概览/详情 | 国家、币种、项目/客户/合同/产品类型、关键词、阶段、状态 | `/projects`、`/field-options/module/project` | `Project`、`ProjectMember`、`DictionaryCategory/Item` |
| 项目档案 | 项目、模板快照 | `/projects/:id/archive-tree`、文件/同步接口 | `ProjectArchiveFolder`、`ProjectArchiveEntry`、`ProjectArchiveFile`、`FileVersion` |
| 档案模板 | 国家、项目类型 | `/archive-templates`、模板版本接口 | `ArchiveTemplate`、`ArchiveTemplateVersion` |
| 标准库 | 标准分类 | `/standards`、`/field-options/module/standard` | `Standard`、`StandardVersion`、`FileVersion` |
| 知识库 | 知识分类 | `/knowledge`、`/field-options/module/knowledge` | `KnowledgeItem`、`KnowledgeVersion`、`KnowledgeCategory` |
| 审批规则 | 国家 | `/approval-templates`、`/field-options/module/approval` | `ApprovalTemplate`、`ApprovalTemplateStep` |
| 字段配置 | 全部字段定义 | `/field-config`、`/field-options` | `DictionaryCategory`、`DictionaryItem` |
| 币种与汇率 | 币种 | `/currencies`、`/field-options/CURRENCY` | `Currency`、`DictionaryItem` |

金额始终保存原币种、原金额、汇率、折算币种、折算金额和汇率日期。

## 6. 权限、安全和审计

- JWT 认证后由 `PermissionsGuard` 做 Controller 级权限校验，Service 再校验资源和数据范围。
- 字段配置拆分查看、编辑、新增选项和启停选项权限。
- 合同、成本、文件下载、权限变更、备份下载和物理删除等敏感操作写操作日志。
- 项目物理删除仅限超级管理员；文件、审核、财务或审计任一存在即拒绝并记录失败审计。
- 文件上传校验扩展名、MIME、大小和业务权限；对象实体只进入 MinIO。
- 初始化密码只能通过显式环境变量注入，缺失、空白或占位值 fail fast。

## 7. 配置同步

字段设置写入数据库后递增配置修订并使前端查询失效。业务页面按模块读取启用选项和默认值；后端保存时读取同一数据源复核。停用值不再用于新数据，历史数据通过完整配置或显式关联继续展示。详细规则见 `docs/field-configuration.md`。

## 8. 部署与升级

生产升级顺序固定为：

1. Prisma schema migration。
2. 三个数据 migrator 的 dry-run、apply 和只读 verify。
3. 二次幂等 seed。
4. API、Worker、MySQL、Redis 和 MinIO 就绪检查。
5. 前端和真实浏览器关键流程验收。

旧迁移源不得重新接入运行时双读或双写。回滚、备份和发布步骤以 `docs/deployment.md` 为准。

## 9. 旧系统删除与迁移结果

- 项目配置和知识分类的平行读取接口已经删除，业务统一读取 `/field-options`。
- 项目档案临时项创建、币种创建、项目归档列表 UI 及对应前端请求已经退役。
- 旧 `field_setting:manage` 拆为查看、编辑、新增选项和启停选项；临时档案项权限已从角色和权限目录移除。
- 国家、币种和知识分类通过 6 个顺序 migration 接入统一字段配置；历史 Prisma 模型仅供三个 migrator 读取，不进入生产运行时。
- 重复 Figma 交接文档和已被目标架构替代的兼容说明已经删除。完整文件与迁移清单见 [删除与迁移报告](deletion-report.md)。

## 10. Figma 追踪与反向补充缺口

本轮只读取 [Figma 页面清单](figma-page-inventory.md) 中列出的 8 个节点。节点均可独立读取，目标说明中关于节点重复的预判与文件实际内容不一致。

当前需要设计侧后续补充的真实缺口仅包括：加载/空/错误/无权限状态，创建与编辑弹窗或抽屉，上传/审核/预览交互，删除与停用确认，窄屏断点、键盘焦点和长文案溢出规则。实现没有据此增加新页面或推测新功能。
