# 标准库

## 设计基线

标准库入口为 `/standards`，页面唯一设计基线是 Figma 文件
`Delivery Management Platform｜Design System - App Shell v0.1` 的节点 `70:322`。
页面不复用旧版标准列表结构，也不增加设计中不存在的筛选器、卡片、分页器或操作。

1440×900 桌面基线下，应用壳内的标准库内容区按以下尺寸实现：

| 区域 | 设计约束 |
|---|---|
| 页面内边距 | 上 8px，左右和下 13px，区块间距 8px |
| 指标区 | 88px 高；每项 76px 高；图标区 48px、图标 32px |
| 工具栏 | 32px 高；关键词输入框 270px |
| 主工作区 | 1440×900 基线高 625px，并自适应撑满应用壳剩余高度；左栏 270px，右栏最小 937px |
| 维度页签 | 44px 高；选中下划线 2px |
| 分类行 | 44px 高 |
| 分类说明 | 80px 高；标题 16px，说明 13px |
| 表格 | 1440×900 基线列宽为 `365/90/130/170/182px`；标题列继续吸收更宽视口的剩余空间，其他四列保持固定；表头和数据行均为 44px |
| 表格滚动 | 表体纵向滚动；表格宽度不足时由工作区横向滚动；不显示分页器 |

表格只显示“资料标题、当前版本、生效日期、更新人、操作”五列。资料标题来自列表
返回的真实 `FileAsset.originalName`，保留扩展名、单行截断并通过 `title` 暴露完整
名称；点击标题直接打开统一文件预览，不再先打开标准详情。列表所有可编辑行统一显示
“编辑、归档”，列表不再显示“下载”；版本详情和统一预览仍按 `standard:download`
提供受控下载。表头、单元格和纵向分隔线使用同一列网格，白色与 `#F7F8FA` 交替行背景。
预览内容经后端鉴权 `/files/:id/preview-content` 接口流式读取为浏览器 Blob，避免浏览器
访问容器内部 MinIO 主机名，并确保查看权限和数据范围由后端终检；超长多字节文件名只对对象存储键做 UTF-8 字节安全截断，完整原名继续保存在
`FileAsset.originalName` 并用于列表、预览和下载。

左侧分类和右侧表体分别承担纵向滚动，主工作区不产生第二条纵向滚动条。1280×800、
1920×1080 和 2560×1440 下，左右区域底部保持对齐；宽屏时标题列弹性扩展，窄于
937px 内容最小宽度时由右侧唯一横向视口承载滚动。

## 字段配置联动

标准库通过 `/api/v1/field-options/module/standard` 获取字段定义、启用选项、默认值、
排序和历史标签。前端不维护备用枚举，后端写入时再次校验稳定编码。标准表和关联表
只保存稳定编码或主键，不保存显示名称。

| 配置编码 | 用途 | 持久化位置 |
|---|---|---|
| `STANDARD_TYPE` | 标准类型 | `Standard.type` |
| `STANDARD_DELIVERY_STAGE` | “交付阶段”页签和分类 | `Standard.deliveryStageCode` |
| `STANDARD_MANAGEMENT_DOMAIN` | “管理领域”页签和分类 | `Standard.managementDomainCode` |
| `STANDARD_BUSINESS_TYPE` | 业务类型 | `Standard.businessTypeCode` |
| `STANDARD_STATUS` | 草稿、审核、发布状态标签 | `Standard.status` |
| `STANDARD_ENABLED_STATUS` | 启用状态标签与默认值 | `Standard.isEnabled` |
| `STANDARD_CURRENT_VERSION` | 当前版本字段定义和展示名 | `Standard.currentPublishedVersionId` 关联 |
| `STANDARD_EFFECTIVE_DATE` | 生效日期字段定义和展示名 | `StandardVersion.effectiveDate` |
| `COUNTRY` | 使用国家 | `StandardCountry.countryCode` |

配置重命名或排序后，标准库筛选、分类、列表、详情和表单在配置缓存失效后同步刷新。
新增和编辑只提供启用选项；历史标准引用的停用选项仍用全量配置返回的历史标签展示。
删除配置项前由后端统计标准和国家关联引用，存在引用时拒绝删除。

`STANDARD_MANAGEMENT_DOMAIN` 的初始化单一事实源位于
`prisma/seed-data/target-platform.ts`，按稳定编码依次提供：

1. 进度与计划管理
2. 质量管理
3. 安全管理
4. 成本与预算管理
5. 合同、付款与商务管理
6. 采购与供应链管理
7. 风险、问题与待办管理
8. 变更与增项管理
9. 沟通、会议与汇报管理
10. 文件、档案与成果物管理
11. 阶段评审与审批管理
12. 分包商与相关方管理

既有七项旧管理领域只转为 `Inactive`，不物理删除；历史标准继续通过稳定编码解析旧标签。

旧 `STANDARD_CATEGORY` 已退出运行时配置。迁移先把旧值回填到交付阶段、管理领域和
业务类型稳定编码，再停用旧配置并删除 `Standard.category`，不保留双读或双写。

## API 与查询

标准库使用真实 NestJS 接口：

| 方法和路径 | 说明 |
|---|---|
| `GET /api/v1/standards/summary` | 标准总数、累计访问、累计下载 |
| `GET /api/v1/standards/category-counts` | 按交付阶段或管理领域返回分类计数 |
| `GET /api/v1/standards` | 关键词、维度、分类、类型、状态、启用、国家、业务类型、排序和 `page/pageSize` 分页 |
| `POST /api/v1/standards` | 创建标准及首个文件版本 |
| `GET /api/v1/standards/:id` | 详情、当前发布版本和版本历史 |
| `PATCH /api/v1/standards/:id` | 编辑标准主数据 |
| `PATCH /api/v1/standards/:id/enabled` | 启用或停用 |
| `POST /api/v1/standards/:id/versions` | 创建后续版本 |
| `PATCH /api/v1/standard-versions/:id` | 更新草稿或已驳回版本 |
| `POST /api/v1/standard-versions/:id/submit-review` | 提交统一审核 |
| `GET/POST/DELETE /api/v1/standards/:id/relations` | 查询和维护稳定 ID 关系 |
| `POST /api/v1/standards/:id/archive` | 软归档 |

列表排序、筛选、分类计数和分页全部在服务端执行。页面为匹配 Figma 不显示分页器，
当前请求 `page=1&pageSize=100` 供内部滚动表体展示；前端不对已获取行伪造全量排序或筛选。

## 版本与状态流转

`Standard` 保存主数据、当前发布版本指针、聚合状态和启停/归档状态；
`StandardVersion` 保存版本号、生效日期、发布状态、修订号和统一 `FileVersion`
正文关系。每个版本有真实父标准关系，当前版本只由
`currentPublishedVersionId` 指向已经发布的版本。

```text
DRAFT ──提交审核──> IN_REVIEW ──通过──> PUBLISHED
  ▲                     │
  └────继续修订 <── REJECTED <──驳回
```

最终审核通过时，审核事务发布目标版本、更新标准当前版本指针和聚合状态。驳回后保留
版本历史并允许修订。生效日期属于具体版本；启停不改写发布历史；归档为软归档，审核中
拒绝归档。文件下载通过统一文件权限和审计链路，数据库只保存文件索引和版本元数据。

## 权限与审计

| 动作 | 权限 |
|---|---|
| 查看列表、分类、详情和版本 | `standard:view` |
| 新增 | `standard:create` |
| 编辑、创建版本、维护关系、启停 | `standard:update_draft` |
| 提交审核 | `standard:submit_review` |
| 下载 | `standard:download` |
| 归档 | `standard:archive` |

前端权限只决定按钮是否显示；Controller 装饰器和 Service 状态校验共同执行最终授权。
查看、下载、修改、启停、发布和归档写入操作日志并共享请求 `traceId`。

## 验收与回滚

真实验收必须连接 NestJS、MySQL、Redis 和 MinIO，覆盖字段配置传播、查询、分类计数、
服务端排序、版本历史、文件上传下载、审核发布、当前版本、生效日期、启停、归档和权限
边界。Playwright 在 1440×900 下断言 Figma 基线几何、列宽、行高和无分页器，并在
1280×800、1920×1080、2560×1440 下断言剩余高度、左右底部、内部滚动和标题列弹性；
截图仅供本地比对，不提交仓库。

发布按 [部署运维](deployment.md) 执行 schema migration、三个 migrator 的
dry-run/apply/只读 verify 和二次幂等 seed。失败时不得只回退代码；必须使用部署脚本
生成并验证的 MySQL、MinIO、环境快照和匹配运行时成对恢复，或在目标版本上前向修复。
