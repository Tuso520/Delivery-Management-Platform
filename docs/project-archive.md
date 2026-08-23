# 项目档案

## 设计基线

- 唯一界面基线：Figma 文件 `IZMfwVd0NPQM5mm4v84dxM`，节点 `43:317`。
- 目标画板为 `1234×784px`，页面内边距 `13px`，纵向区块间距 `12px`。
- 顶部为 `1208×100px` 五指标带；工具栏高 `32px`；主工作区为 `1208×602px`。
- 主工作区左侧目录宽 `270px`，右侧文件区宽 `937px`，中间 1px 分隔线。
- 目录表头和目录项均高 `44px`。文件区说明高 `79px`；文件表表头和数据行均高 `44px`。
- 文件表列为：文件名称 `340px`、版本 `80px`、文件大小 `100px`、上传人 `113px`、上传时间 `122px`、操作 `182px`。
- 节点没有分页、模板同步、恢复、批量操作、额外筛选或状态列。页面不得补充这些入口。

## 前端行为

路由 `/archive` 只通过 `src/domains/archive/api/archive.api.ts` 和统一文件 API 访问后端。

1. 项目选择器优先显示“项目简称”，简称为空时回退项目全称；下拉辅助显示企业/客户名称与项目全称。关键字提交给项目列表接口，服务端同时匹配 `shortName`、`customerName` 和 `projectName`，并继续执行数据范围、排序和分页。
2. 选择项目后请求 `GET /projects/:projectId/archive-tree`；URL 保存稳定项目主键。
3. 文件夹按快照 `sortOrder/name` 排序，目录数量显示有效档案项数量。
4. 文件名点击进入统一只读预览；更新沿用 `currentVersion.logicalFileId` 创建新版本；下载走鉴权下载接口。
5. “删除”调用 `POST /files/:logicalFileId/archive`，软归档逻辑文件和 `ProjectArchiveFile` 关联，保留 MinIO 对象、不可变版本与审计记录。页面不再把“删除文件”误实现为归档档案项。
6. 顶部“上传”默认选择当前目录中优先未上传的可上传档案项；“档案项”使用 Arco Select，可切换到其他目录的可上传档案项。Arco Upload 仅负责选取文件并隐藏内置“开始/重试”动作，实际上传统一由弹窗底部“上传”提交。
7. 上传控件从 `project-archive` 模块的 `FILE_TYPE` 字段配置读取启用扩展名，并与项目快照 `allowedExtensions` 取交集。
8. Office 文件预览优先读取“系统设置 → 文档预览配置”中的 ONLYOFFICE Docs 地址与加密 JWT Secret；数据库尚无配置时兼容部署环境变量。Secret 只写入、不回显。

## 后端与数据模型

- 项目、模板版本、模板文件夹和模板项分别使用主键及 `sourceStableKey` 关联，不通过显示名称关联。
- `ProjectArchiveFolder/ProjectArchiveEntry` 保存项目创建时的版本化模板快照；模板或字段选项重命名不会破坏历史关联。
- `ProjectArchiveFile.logicalFileId` 指向 `LogicalFile`；正文对象由 `FileAsset` 保存 MinIO bucket/key，`FileVersion` 保存不可变版本与上传人、时间、大小和审核状态。
- `FILE_TYPE` 使用小写扩展名稳定值。模板和项目快照保存稳定值；启用状态只约束新上传，历史记录继续显示和下载。
- 上传同时执行项目数据范围、`archive:upload`、系统上传策略、`FILE_TYPE` 启用状态、快照扩展名/大小/命名规则和文件签名校验。

## 权限与审计

| 行为 | 后端权限 | 审计 |
|---|---|---|
| 查看目录 | `archive:view` | 按现有读取策略 |
| 上传/更新版本 | `archive:upload` | 文件版本、审核与操作日志 |
| 预览 | `file:preview` 或对应待审/历史权限 | 预览审计 |
| 下载 | `file:download` | 敏感下载审计 |
| 删除文件 | `file:archive` | `logical_file/archive` 操作日志 |

前端只根据后端返回能力隐藏操作，最终权限、项目数据范围和资源归属始终由 NestJS 校验。

## 部署与回滚

本次没有新增 Prisma 表或列，不需要 schema migration；`FILE_TYPE` 通过幂等 seed 补齐。生产升级仍必须执行 `docs/deployment.md` 定义的 schema、三个 migrator dry-run/apply/verify 和二次 seed。

代码尚未发生数据库 mutation 时可使用 `bash deploy-git.sh rollback-code`；一旦 migration/seed 已进入写库阶段，只允许前向修复，或从同一个 v3 备份成对恢复 MySQL、MinIO、环境和匹配运行时。
