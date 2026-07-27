# 本轮删除与迁移报告

## 1. 删除原则

本轮只删除与指定 Figma 正常态冲突、已经被统一字段配置替代、或没有运行时消费者的旧入口。仍承担权限、审计、历史展示或数据库迁移职责的能力不因页面隐藏而删除。

## 2. 已删除

### 前端

- 删除项目概览的归档视图切换、归档项目操作列、恢复和物理删除入口。
- 删除旧 `GET /projects/configuration` API、查询键、类型和页面消费逻辑。
- 删除知识分类 `/knowledge/categories` 前端 API、查询和树形分类类型。
- 删除项目档案“临时新增档案项”页面入口、表单、请求和相关类型。
- 删除币种新建入口和前端 `createCurrency` 请求；币种编码/名称由字段配置维护。
- 从侧栏移除 Figma 中不存在的通知和集成入口，保留已有深层路由供直接授权访问。
- 删除面包屑前导图标。

### 后端

- 删除 `/projects/configuration` Controller 路由；项目写入校验继续读取统一字段配置。
- 删除 `/knowledge/categories` Controller 路由；知识分类由字段配置只读接口提供。
- 删除本地模拟服务中的 `/knowledge/categories`、`/knowledge/articles` 及其子路由，避免开发环境继续暴露已退役契约。
- 删除项目档案临时项 DTO、Controller 路由和 Service 创建逻辑。
- 删除币种创建 DTO 和 Controller 路由；汇率页只维护币种专属元数据。
- 通过迁移移除 `archive:item:create_temporary` 和旧 `field_setting:manage` 角色关联及权限记录。

### 文档

- 删除 `docs/design/project-overview-figma-18-1341.md`，其节点和页面契约已经失效。
- 删除 `docs/design/field-settings-figma-handoff.md`，由当前 Figma 清单和字段配置架构替代。
- 删除 `docs/field-configuration-compatibility.md`，其中的待办状态已经被本轮迁移和实现取代。

## 3. 数据迁移

本轮新增 6 个顺序迁移：

1. 扩展字段配置定义、默认值、作用域、权限元数据和修订字段。
2. 把单一字段管理权限拆为查看、编辑、新增选项和启停选项。
3. 为项目增加 `customerType`。
4. 把知识分类关联到 `KNOWLEDGE_CATEGORY` 字段选项。
5. 移除临时档案项权限。
6. 把既有国家和币种导入统一字段选项。

迁移后仓库共有 41 个 Prisma migration。真实 MySQL 已从空库连续应用全部迁移，并重复执行 seed、三个数据 migrator 和只读 verify，第二次执行保持幂等。

## 4. 明确保留

- 项目归档、恢复和受限物理删除的后端能力保留，因为它们仍属于项目生命周期、安全校验和失败审计，不在 Figma 正常列表中展示。
- `Country` 表保留国家专属元数据，`Currency` 表保留汇率、符号、精度和同步信息；二者不再决定枚举集合。
- `KnowledgeCategory` 保留已有知识记录外键和历史兼容，通过 `fieldOptionId` 接入统一展示名。
- 档案项归档/恢复、文件版本、审核、下载和预览保留；只删除临时项创建能力。
- 通知和集成路由保留已有业务能力，但不出现在本轮目标 App Shell 中。

## 5. 不再允许回接

- 不得恢复 `/projects/configuration`、`/knowledge/categories` 或临时档案项接口。
- 不得把国家、币种、项目类型、客户类型等重新写成前端常量。
- 不得用运行时双读/双写兼容旧枚举源。
- 不得重新创建 `field_setting:manage` 或 `archive:item:create_temporary`。
