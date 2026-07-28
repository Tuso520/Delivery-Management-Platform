# 档案模板页面

## Figma 基准

- 文件：`IZMfwVd0NPQM5mm4v84dxM`
- 节点：`69:305`
- 路由：`/archive-template`
- 页面：`delivery-platform-web/src/domains/archive/pages/ArchiveTemplatePage.vue`
- 原始画板：`1234 × 784px`

节点名称是“项目管理/档案模板”。本页与“项目档案”文件工作区是两个独立路由；实现只采用节点 `69:305` 的实际内容，不沿用旧项目档案工作区结构。

## 修改前差异基线

修改前使用本地真实 NestJS、MySQL、Redis、MinIO 环境，在
`http://127.0.0.1:58080/#/archive-template` 登录后记录页面。接口来自
`GET /api/v1/archive-templates`，没有使用 Mock。

| 核验项           | Figma `69:305`                                   | 修改前实现              | 处理要求                           |
| ---------------- | ------------------------------------------------ | ----------------------- | ---------------------------------- |
| 页面内边距       | 四边 `13px`                                      | `13px`                  | 保留                               |
| 工具栏           | 左侧搜索和查询，右侧创建                         | 右侧刷新和创建模板      | 删除刷新；增加真实搜索和查询       |
| 搜索框           | `280 × 32px`，背景 `#F2F3F5`，占位“搜索模板名称” | 不存在                  | 精确增加                           |
| 查询按钮         | 高 `32px`，搜索图标，文字“查询”                  | 不存在                  | 使用 Arco 同语义图标               |
| 创建按钮         | 高 `32px`，加号图标，文字“创建”                  | 无图标，文字“创建模板”  | 按 Figma 修改                      |
| 工具栏与表格间距 | `12px`                                           | `12px`                  | 保留                               |
| 表头             | 高 `44px`，背景 `#F2F3F5`，字号 `13px`           | Arco 默认高度和样式     | 精确覆盖到页面表格契约             |
| 数据行           | 高 `44px`，白/`#F7F8FA` 交替                     | 默认表格行              | 固定行高并启用条纹                 |
| 状态列           | 不存在                                           | 存在                    | 从正常列表删除                     |
| 目录规模         | `45 / 69`                                        | `45 文件夹 / 69 文件项` | 仅展示数字比值                     |
| 日期             | `YYYY-MM-DD`                                     | `YYYY/MM/DD`            | 改为稳定的短横线格式               |
| 表格滚动         | 表体高 `670px`，纵向滚动；总宽 `1208px`          | 仅声明 `x:1080`         | 使用 `x:1208`、`y:670`             |
| 分页             | 节点无分页器                                     | 无分页器                | 不自行增加                         |
| 操作             | 查看、创建新版本、停用                           | 同三项                  | 保留权限与真实接口，调整几何和颜色 |

## 列配置

表头和内容共用固定列宽，禁止自动平均或按内容伸缩。

| 列名         | Figma 宽度 | 实现目标宽度 | 表头对齐 | 内容对齐 | 内容格式                                   | 溢出方式               |
| ------------ | ---------: | -----------: | -------- | -------- | ------------------------------------------ | ---------------------- |
| 模板名称     |      280px |        280px | 居中     | 左对齐   | 字段配置及模板记录中的显示名称，蓝色链接   | 单行省略并显示 Tooltip |
| 适用项目类型 |      120px |        120px | 居中     | 居中     | 通过 `PROJECT_TYPE` 稳定值解析字段配置名称 | 单行省略并显示 Tooltip |
| 当前版本     |      111px |        111px | 居中     | 居中     | `V1.0` 形式                                | 单行省略               |
| 目录规模     |      111px |        111px | 居中     | 居中     | `文件夹数 / 文件项数`                      | 单行                   |
| 使用项目数   |       95px |         95px | 居中     | 居中     | 十进制整数                                 | 单行                   |
| 更新人       |      160px |        160px | 居中     | 居中     | 用户真实姓名，缺失时显示系统管理员文案     | 单行省略并显示 Tooltip |
| 时间         |      149px |        149px | 居中     | 居中     | `YYYY-MM-DD`                               | 单行                   |
| 操作         |      182px |        182px | 居中     | 居中     | 查看 / 创建新版本 / 停用，间距 `12px`      | 单行，不换行           |

只有“模板名称”和“当前版本”在 Figma 表头显示排序标识，排序必须由
`GET /archive-templates` 的 `sortBy`、`sortOrder` 参数在数据库查询中完成。

## 字段配置与稳定关联

- 新建模板中的国家和项目类型分别读取 `COUNTRY`、`PROJECT_TYPE`。
- 模板列表以保存的稳定值解析当前字段配置显示名称，不通过显示名称关联。
- 停用配置不允许创建新数据；历史模板仍使用保存值和包含停用项的字段配置映射显示。
- 语言继续读取语言基础数据；文件类型策略由模板版本中的稳定扩展值和 `FILE_TYPE` 配置校验。

## 交互与后台契约

- 查询：输入仅在点击“查询”或回车后提交，调用真实后端搜索。
- 排序：模板名称、当前版本排序调用真实后端，前端不做假排序。
- 查看：进入模板详情抽屉并读取模板、版本和目录结构接口。
- 创建：创建模板及初始草稿版本。
- 创建新版本：调用版本接口并打开新草稿。
- 停用：后端权限校验并保留历史发布版本和项目快照。
- 节点没有分页器、状态列、刷新按钮、额外筛选或批量操作，因此正常列表不增加这些内容。

目标节点只定义正常列表状态。加载、空数据、错误、无权限及已有详情/编辑抽屉继续使用平台公共状态和真实业务接口，但不得改变正常列表的 Figma 几何。

## API、权限与数据模型

| 功能 | API | 后端权限 |
| --- | --- | --- |
| 列表、搜索、排序 | `GET /api/v1/archive-templates?keyword=&sortBy=&sortOrder=` | `archive_template:view` |
| 模板详情 | `GET /api/v1/archive-templates/:id` | `archive_template:view` |
| 创建模板 | `POST /api/v1/archive-templates` | `archive_template:create` |
| 版本列表与详情 | `GET /api/v1/archive-templates/:id/versions`、`GET /api/v1/archive-template-versions/:id` | `archive_template:view` |
| 创建、编辑版本 | `POST /api/v1/archive-templates/:id/versions`、`PATCH /api/v1/archive-template-versions/:id` | `archive_template:update_draft` |
| 提交审核 | `POST /api/v1/archive-template-versions/:id/submit-review` | `archive_template:submit_review` |
| 审核发布 | `POST /api/v1/archive-template-versions/:id/publish` | `file_review:act` |
| 停用模板 | `POST /api/v1/archive-templates/:id/disable` | `archive_template:disable` |

列表接口的 `sortBy` 只接受 `templateName`、`currentVersion`，`sortOrder` 只接受
`asc`、`desc`；DTO 在协议层拒绝未知值，Service 在 Prisma 查询中执行排序并追加稳定
ID 次序。API 仍使用平台统一响应体和全局异常格式。

`ArchiveTemplate` 保存模板稳定编码、适用国家/项目类型稳定值和当前发布版本指针；
`ArchiveTemplateVersion` 保存版本号、状态、乐观锁修订号及审核关系；
`ArchiveTemplateFolder`、`ArchiveTemplateVersionItem` 保存两级目录、稳定键、文件规则和排序。
项目创建时复制发布版本为项目快照，并保存模板及版本主键，不通过显示名称关联。
本次列表重构不改变 Prisma schema，不新增 migration。

## 文件存储与版本联动

- 模板目录只定义文件规则和审核策略，不在模板列表或模板版本表中保存文件实体。
- 项目按发布模板生成快照后，实际上传文件继续进入 MinIO；数据库只保存统一文件、
  `FileVersion`、审批和预览元数据。
- 新版本从真实版本接口创建为草稿；审核通过后更新当前发布版本，旧版本和已生成项目快照保持可追溯。
- 停用模板或字段配置项只阻止新的选择和创建，不删除历史模板、版本、项目快照或文件。
- 国家、项目类型、文件类型均以稳定值关联字段配置。字段显示名、排序、默认值和启停变化由
  字段配置接口实时反映到筛选、列表、详情和表单；历史停用值继续解析显示。

## 测试与部署

变更必须在真实 NestJS、MySQL、Redis、MinIO 环境中验证列表查询、升降序、权限、字段配置
启停、版本创建与读取，并执行：

```powershell
pnpm --dir delivery-platform-web lint
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --dir delivery-platform-web test:e2e
pnpm --dir delivery-platform-server lint
pnpm --dir delivery-platform-server type-check
pnpm --dir delivery-platform-server test
pnpm --dir delivery-platform-server build
```

该变更没有 schema migration。部署仍按 `docs/deployment.md` 的既定流程执行 migration、
三个 migrator 的 dry-run/apply/只读 verify 和二次幂等 seed，不得因“无新增 migration”跳过
发布门禁。回滚采用上一 Git 提交和上一组前后端镜像；数据库与 MinIO 没有本次专属回滚数据。
