# 测试验收

## 质量门禁

提交前按影响范围执行；架构、权限、文件、项目、档案、审核或部署变更必须执行完整集合：

```powershell
pnpm --dir delivery-platform-web lint
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --dir delivery-platform-web budget
pnpm --dir delivery-platform-server lint
pnpm --dir delivery-platform-server type-check
pnpm --dir delivery-platform-server test
pnpm --dir delivery-platform-server build
pnpm --dir delivery-platform-server exec prisma validate
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q
docker compose --env-file .env.local.example -f docker-compose.test.yml config -q
node scripts/verify-doc-facts.mjs
```

开始开发前可执行 `node scripts/preflight.mjs` 检查 Node.js、pnpm、工作区依赖、真实验收环境文件和 Docker Compose 可用性；发布验收使用 `--require-docker` 将 Docker 缺失升级为失败。前端体积预算按未压缩产物执行：单个常规 JavaScript 分块不超过 850 KiB、CSS 不超过 450 KiB、Worker/ES module 不超过 1500 KiB，常规 JavaScript 总量不超过 2600 KiB。预算用于阻止意外整体引入大依赖，同时给现有 Arco 和 PDF 预览分块保留有限余量。

Lint 命令会修正可自动修复的格式；执行后必须重新检查工作区差异。生产构建允许报告分块体积警告，但不允许类型、测试、Lint 或构建错误。

真实 Docker/集成测试必须从 `.env.local.example` 创建被 Git 忽略的 `.env.local`，并显式注入非空、非 `CHANGE_ME...` 的 `SEED_ADMIN_PASSWORD` 和 `SEED_DEFAULT_PASSWORD`。测试 Compose 默认不重置既有种子账号；需要验证密码轮换时，必须在隔离数据库中显式设置 `SEED_RESET_EXISTING_USER_PASSWORDS=true`。

## 真实 API E2E

`delivery-platform-server/test/real-api.e2e-spec.ts` 只连接已经启动的真实 NestJS、MySQL、Redis 和 MinIO，不使用页面模拟服务。账号通过临时环境变量提供，不写入仓库：

```powershell
$env:E2E_API_BASE_URL='http://127.0.0.1:3000/api/v1'
$env:E2E_USERNAME='<测试账号>'
$env:E2E_PASSWORD='<测试密码>'
pnpm --dir delivery-platform-server test:e2e -- --runInBand
```

该套件验证真实 HTTP 响应包装、登录、Refresh Cookie 轮换和项目扁平分页。`E2E_USERNAME`、`E2E_PASSWORD` 缺失时认证用例必须失败，不能以跳过伪装通过。

前端另有真实依赖就绪冒烟；它是 API 冒烟，不是 UI E2E：

```powershell
$env:PLAYWRIGHT_API_BASE_URL='http://127.0.0.1:3000'
pnpm --dir delivery-platform-web test:smoke:api
```

该套件要求 `/api/v1/health` 和 `/api/v1/ready` 成功，并确认数据库、缓存和对象存储均为 `ok`。

## 真实浏览器验收

涉及登录、项目、档案、审核、标准、知识、文件预览或设置时，必须把前端连接到真实 NestJS API 后使用浏览器验证。`scripts/local-test-server.mjs` 只用于页面演示和前端局部开发，不能替代权限、数据范围、事务、MinIO 和审核并发验证。

UI E2E 默认使用稳定版 Chrome。开发机可通过 `PLAYWRIGHT_BROWSER_CHANNEL` 显式选择 Playwright 支持的本地 Chromium 通道，例如 `msedge`；CI 不设置该变量，继续使用 Chrome。浏览器通道差异不能降低真实 API、权限、MinIO 或 Worker 的验收范围。

至少覆盖：

- 管理员和一个受限业务角色使用真实登录、退出和重新登录流程。
- 主导航、设置齿轮、隐藏详情深链以及无权限路由落点。
- 项目列表实际行、筛选、20 条批次滚动续载、查看/编辑/归档；物理删除只对超级管理员显示，并有项目编码二次核验。
- 受限角色只看到数据范围内项目，合同/折算金额等敏感字段为空，且看不到物理删除操作。
- 项目档案两级目录、所有文件项列、上传和归档动作；模板差异同步仅新增。
- 文件首传、同键重试、版本晋升、审核通过/驳回、审核历史和深链抽屉。
- PDF 至少实际渲染一页；Office、图片、Markdown、XMind、音视频按环境能力验证只读路由和明确降级。
- 标准、知识、档案模板、审核、操作日志、审批配置、通知、集成和角色权限矩阵表格有真实表头与数据行。
- 页面没有本次变更新增的控制台错误；截图、录屏和临时日志不进入 Git。

## 数据与迁移验收

空库和既有库都要验证：

1. 空库顺序应用全部 migration，执行 seed 两次，业务表计数和唯一键保持稳定。
2. 既有库先备份 MySQL 与 MinIO，执行数据脚本 dry-run，保存报告后再 apply。
3. 迁移 094 前后比较项目数、成员数、档案模板数、外键和无效状态计数；旧项目状态必须进入 `project_legacy_state_archive`。
   无法识别的历史状态或阶段必须进入 `migration_exceptions` 并阻断删列，不能回填默认值伪装成功。
4. `ProjectMember.deleted_at` 不得产生重复有效成员；软删除成员不进入数据范围。
5. 项目最终状态只能是 `DRAFT / ACTIVE / PAUSED / COMPLETED / CANCELLED`；待审和归档分别由 ReviewTask 与 `archivedAt` 表达，阶段只能使用九个目标阶段。
6. 档案模板聚合状态只能是 `DRAFT / IN_REVIEW / PUBLISHED / REJECTED / DISABLED`。
7. 集成 Secret 迁移后，公开配置中不得残留明文 Secret；密钥、API 和 Outbox Worker 使用同一个加密密钥。
8. 标准历史结构化正文必须物化为经流式 checksum 校验的真实 MinIO 文件；每个有效 StandardVersion 都有唯一主文件。KnowledgeVersion 必须严格满足 FILE/MARKDOWN/LINK 三选一，支持文件归属和 published pointer 一致。
9. UI 翻译退役只允许把 `translations` 原子归档为 `retired_ui_translations_20260713`，部署表计数报告必须证明行数未减少；运行时 Prisma、seed 和 API 不再读写该表。
10. 迁移失败不得继续启动 API 或 Worker；回滚必须成对恢复数据库和 MinIO。
11. `_prisma_migrations` 必须恰好包含源码中的 29 个有效迁移，每个迁移完成且 `migration.sql` SHA-256 与数据库记录一致；数据库中不得存在源码缺失的有效迁移。
12. 三组 migrator apply 完成后捕获全部业务表计数，第二次 seed 后逐表比较；任一表新增、减少或消失均阻断应用启动。
13. 真实浏览器验收必须上传私有 PNG、通过鉴权下载并逐字节回读原文件，等待 File Worker 生成 WebP 缩略图，并确认 `ArchiveFileUploaded` 与 `FileProcessingCompleted` Outbox 事件进入终态。

## 权限与数据范围矩阵

权限种子覆盖 `SUPER_ADMIN`、`SYSTEM_ADMIN`、`DELIVERY_MANAGER`、`COUNTRY_MANAGER`、`PROJECT_MANAGER`、专业负责人/工程师、`PURCHASE`、`FINANCE`、`HSE`、`STANDARD_ADMIN`、`PARTNER`、`VIEWER` 和 `AUDITOR`。

自动化与人工验收共同确认：

- Controller 使用权限码，`SUPER_ADMIN` 只绕过权限集合，不绕过业务状态、指派、数据完整性和审计规则。
- 项目 `ALL / DEPARTMENT / COUNTRY / OWNED / PARTICIPATED / CUSTOM` 数据范围由后端查询条件执行。
- 财务、合同、验收和下载字段按独立权限裁剪；前端隐藏按钮不是授权依据。
- 文件审核动作只允许当前步骤指派人执行，多人会签并发只能产生一个终态。
- 设置只读账号落到第一个可访问设置页；无任何可访问页时进入 `/forbidden`，不清除有效会话。

## 2026-07-16 当前验收状态

当前仓库扫描范围为 635 个受版本控制或待纳入版本控制的文件。实现规模包括：前端 180 个 TypeScript/Vue 文件、33 个 `views/` Vue 文件、26 个运行时 API 文件和 41 个测试文件；后端 238 个 TypeScript 文件、28 个 Controller、40 个 Service、28 个 Module、165 个 HTTP 路由和 30 个 Prisma migration。发布迁移另有 3 个 Prisma 验收脚本，分别核对应用迁移与校验和、二次 seed 全库表计数以及 MinIO/File Worker/Outbox Worker 一致性。

本地自动化结果：

- 前端 Vitest：41 个测试文件、183 个用例全部通过。
- 前端 ESLint（只读模式）、TypeScript 类型检查和生产构建通过；构建保留分块体积和 user store 动静态导入提示。
- 后端 Prisma Client：按当前 schema 生成成功。
- 后端 Jest：70 个测试套件、492 个用例全部通过。
- 后端 ESLint（只读模式）、TypeScript 类型检查、生产构建和 Prisma schema 校验通过。
- 代码规则扫描：前后端源码未发现新增无约束 `any`，未发现其他 UI 组件库导入；前端常规业务请求集中在 `src/api/`，统一文件预览组件按只读会话使用受控 `fetch` 获取预览内容。
- 文档事实已按当前项目字段、统一进度命令、归档列表、迁移数量和测试数量校正。

本地真实依赖验收使用 Ubuntu 24.04 WSL2、Docker Engine 29.6.1、containerd 2.2.6 和 Docker Compose 5.3.1；应用镜像固定 Node.js 20 与 pnpm 10.34.4，依赖由锁文件冷构建。MySQL 8、Redis 7、MinIO、NestJS、前端、File Worker 和 Outbox Worker 均在隔离 Compose 项目中运行。

当前真实验收结果：

- `_prisma_migrations` 精确包含源码中的 29 个 migration，全部完成且 SHA-256 校验和一致。
- 三组数据 migrator 的 dry-run、apply 和只读 verify 全部通过；第二次 seed 前后的 86 张表计数逐表一致。
- `/api/v1/ready` 的 database、redis、storage 全部为 `ok`；真实 API E2E 2 个用例、Playwright API 冒烟 2 个用例全部通过。
- Chromium 浏览器关键流程 4 个场景全部通过，覆盖管理员导航、项目全生命周期、项目经理数据范围与敏感字段裁剪，以及私有 PNG 上传、逐字节下载和 WebP 缩略图读取。
- 运行时核验确认 LogicalFile、FileVersion、MinIO 对象、`THUMBNAIL` 输出资产、`ArchiveFileUploaded` 和 `FileProcessingCompleted` Outbox 事件一致。
- 后端、前端、MySQL、Redis、MinIO、File Worker 和 Outbox Worker 的重启次数均为 0。

这些结果证明当前工作区在隔离真实依赖环境中的发布事务和关键业务链路可运行。测试服务器或生产环境是否发布成功，仍只由同一目标提交的 GitHub `integration`、`deploy`、服务器 release id 和就绪检查共同判定。

## GitHub 部署验收

测试服务器发布还必须验证以下重置与数据生成契约：

1. `DEPLOY_TARGET_ID` 与服务器 `.deploy/target-id` 完全一致后才允许继续。
2. 数据删除只能作用于名称包含 `test` 的独立 Compose 项目；缺少
   `DEPLOY_ENV=test`、40 位 commit 或显式确认时必须失败。
3. 重置后不得残留该 Compose 项目的 MySQL、Redis、MinIO 命名卷或
   `backups/git-deploy*` 历史备份。
4. migration、基础 seed、API、Worker 和前端健康后，才运行随机测试数据生成器。
5. `prisma/verify-test-data.ts` 必须输出清单中全部数据集的实际数量，且每项均
   不少于 `TEST_DATA_MIN_COUNT`（默认 20）。
6. `bash scripts/test-test-server-release.sh` 必须通过，证明生产环境、错误 Compose
   项目、缺少确认和不足 20 条等情况都会失败关闭。

推送后以同一提交的实际结果为准：

1. `quality`、`validate`、`integration` 成功后才能进入 `deploy`；`integration` 的 `RELEASE_ID` 必须来自 checkout 后解析出的完整 Git HEAD，不能使用可能指向其他提交的事件 SHA。
2. Environment 使用固定核验的 SSH host key，目标提交与 Git bundle 中的 `HEAD` 一致。
3. 服务器 Git HEAD、`build-info.json.releaseId` 和工作流目标提交一致。
4. `/api/v1/ready`、API E2E、浏览器关键路径通过，File Worker 与 Outbox Worker 均保持 running，且容器 ID 和重启次数在稳定窗口内不变。
5. `scripts/test-deploy-git.sh`、ShellCheck 和 Actionlint 必须通过；契约至少覆盖部署锁内的 Git bundle/环境上传、远端八参数位置契约、Dockerfile syntax frontend 禁用、数据库变更边界、MinIO 停止门禁、跨进程 incomplete-restore 标记及绑定备份重试、完整 MySQL/MinIO 备份、精确 migration runtime 与 code-only rollback 选择、未知 dirty worktree 保留、继承密钥不得掩盖 `.env` 缺项、MySQL 就绪等待不得丢失已准备密钥、API/Worker 停写必须早于密文检查和密钥持久化、密钥失败恢复、人工备份/代码回滚顺序、旧备份拒绝、密钥严格解密、跨拓扑 Worker、restore `--no-build`，以及部署后未使用镜像清理只删除容器、当前/上一发布和 checksummed v3 备份均未引用的 Image ID。
6. migration 可能写库后的失败不得启动旧代码；日志必须明确显示“保留目标并停服”或“v3 成对数据/环境/不可变运行时已验证恢复”，不能只以 `/ready` 作为旧版本兼容证据。
7. 失败时保存诊断与回滚事实；“工作流已配置”不等于“当前版本部署成功”。

部署状态只以同一目标提交的 GitHub `integration` 与 `deploy` 结果、服务器 release id 和就绪检查为准。
