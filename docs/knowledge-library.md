# 知识库

知识库页面以 Figma 文件 `IZMfwVd0NPQM5mm4v84dxM` 的节点 `125:624` 为唯一视觉基准，入口为 `/knowledge`，路由和后台查询均要求 `knowledge:view`。

## 页面基线

1440×900 桌面视口下，应用壳内知识库内容区为 `1234×784px`：

| 区域 | 约束 |
| --- | --- |
| 页面 | 上 8px、左右 13px、下 13px 内边距；模块间距 8px |
| 指标 | 88px 高；三列等分；指标内容高 76px；不增加边框、分隔线或图标底色 |
| 工具栏 | 32px 高；搜索框 270px；查询和新增按钮均为 82×32px |
| 主工作区 | 1208×625px，1px `#E5E6EB` 边框 |
| 分类栏 | 270px；标题和分类行均为 44px；选中背景 `#E8EFFC` |
| 内容栏 | 固定 937px；分类说明 72px |
| 表格 | 表头和数据行均为 44px；白色/`#F7F8FA` 斑马纹；无分页器 |

表格列契约：

| 列名 | 宽度 | 表头 | 内容 | 格式 | 溢出 |
| --- | ---: | --- | --- | --- | --- |
| 资料标题 | 365px | 居中 | 左对齐 | 蓝色单行标题，点击打开详情 | 省略号 + Tooltip |
| 当前版本 | 90px | 居中 | 居中 | 当前发布版本号；无发布版本显示 `-` | 截断 |
| 生效日期 | 130px | 居中 | 居中 | `YYYY-MM-DD`；无日期显示 `-` | 截断 |
| 更新人 | 170px | 居中 | 居中 | 字段格式化后的真实姓名 | 省略号 + Tooltip |
| 操作 | 182px | 居中 | 居中 | 按权限显示编辑或下载、归档；间距 24px | 不换行 |

最小桌面宽度下不允许页面级横向溢出。右侧 937px 内容栏在可用宽度不足时由 `.knowledge-content-scroll` 独立承载横向滚动，列宽不得压缩或均分。

## 字段配置

`KNOWLEDGE_CATEGORY` 是知识分类的唯一配置源。页面通过 `/field-options/module/knowledge` 获取稳定主键、稳定编码、名称、说明、排序、默认值和启停状态：

- 搜索分类、分类说明、分类排序、创建和编辑表单均使用同一配置结果。
- `KnowledgeItem.categoryId` 关联字段选项主键，禁止通过显示名称关联。
- 新建和改分类只接受启用选项，后台再次校验字段分类、启用状态和软删除状态。
- 停用选项不再出现在新增或改分类候选中；仍有非归档历史知识时，分类栏继续保留该历史分类，详情通过字段选项实时名称展示。
- 目标种子只维护 Figma 的十个分类；旧目标种子根据知识版本 `legacy_snapshot.catalogModuleId` 定向迁移，不改写用户历史分类。

## 后台查询与指标

列表接口 `GET /api/v1/knowledge` 真实支持：

- `page`、`pageSize`
- `keyword`
- `categoryId`
- `contentType`、`status`
- `sortBy=title|effectiveAt|updatedAt`
- `sortOrder=asc|desc`

同值排序追加主键方向作为稳定次序。页面按 Figma 不显示分页器，固定请求第一页 100 条并使用 `updatedAt desc`。

`GET /api/v1/knowledge/category-counts` 按当前用户可见范围、非归档状态和关键词聚合稳定分类主键。`GET /api/v1/knowledge/summary` 返回可见总数、知识详情查看与文件预览累计次数、文件下载累计次数；指标来自操作日志，不由前端模拟。

## 版本、文件和权限

知识主内容必须在 `FILE`、`MARKDOWN`、`LINK` 中严格选择一种；每个版本显式提交完整辅助文件集合。文件和辅助附件先以 `ownerType=KNOWLEDGE` 上传受控草稿，再由知识版本绑定。预览会话和下载都使用统一文件接口，并在后台校验知识、文件状态、数据范围和权限。

创建、草稿编辑、提交审核、发布、下载和归档分别受 `knowledge:create`、`knowledge:update_draft`、`knowledge:submit_review`、`knowledge:publish`、`knowledge:download`、`knowledge:archive` 约束。前端只控制展示，最终校验始终在 NestJS。

## 自动化验收

`tests/ui/knowledge-library-figma.spec.ts` 连接真实 NestJS、MySQL、Redis 和 MinIO，覆盖固定几何、列宽和行高、分类配置、关键词、后台分页排序、长标题、日期、空态、加载态、错误恢复、详情与新增入口、文件和辅助附件上传/预览/下载、1280px 内部横向滚动、只读账号和无权限账号。测试创建的数据在 `finally` 中软归档，截图和 trace 不提交 Git。
