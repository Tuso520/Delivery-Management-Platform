# 测试验收

本地默认入口已经调整为 [本地轻量化测试](local-testing-lightweight.md)。本文保留的 Docker 与真实 E2E 命令用于 CI、隔离验收机或明确需要的集成排障，不再作为每次本地修改的默认步骤。

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

开始开发前可执行 `node scripts/preflight.mjs` 检查 Node.js、pnpm、工作区依赖、真实验收环境文件和 Docker Compose 可用性；发布验收使用 `--require-docker` 将 Docker 缺失升级为失败。前端体积预算按未压缩产物执行：单个常规 JavaScript 分块不超过 500 KiB、CSS 不超过 450 KiB、Worker/ES module 不超过 1500 KiB，常规 JavaScript 总量不超过 2600 KiB。预算用于阻止意外整体引入大依赖，同时给现有 Arco 和 PDF 预览分块保留有限余量。

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

该套件验证真实 HTTP 响应包装、登录、Refresh Cookie 轮换、项目扁平分页、字段配置来源关联，以及国家/币种改名联动、项目类型/客户类型/项目阶段新增、排序、重命名、停用历史值保留和字段管理权限边界。变更用例使用唯一测试编码，并在 `finally` 中恢复系统选项、软删除自建选项；运行前也会清理由上次异常中断遗留的同前缀测试值。`E2E_USERNAME`、`E2E_PASSWORD`、`E2E_LIMITED_USERNAME`、`E2E_LIMITED_PASSWORD` 缺失时对应认证或权限用例必须失败，不能以跳过伪装通过。

前端另有真实依赖就绪冒烟；它是 API 冒烟，不是 UI E2E：

```powershell
$env:PLAYWRIGHT_API_BASE_URL='http://127.0.0.1:3000'
pnpm --dir delivery-platform-web test:smoke:api
```

该套件要求 `/api/v1/health` 和 `/api/v1/ready` 成功，并确认数据库、缓存和对象存储均为 `ok`。

## 真实浏览器验收

涉及登录、项目、档案、审核、标准、知识、文件预览或设置时，必须把前端连接到真实 NestJS API 后使用浏览器验证。`scripts/local-test-server.mjs` 只用于页面演示和前端局部开发，不能替代权限、数据范围、事务、MinIO 和审核并发验证。

UI E2E 默认使用 Playwright 锁定版本的 Chromium，CI 通过 `playwright install --with-deps chromium` 安装。开发机仅在需要复用系统浏览器时通过 `PLAYWRIGHT_BROWSER_CHANNEL` 显式选择受支持通道。浏览器通道差异不能降低真实 API、权限、MinIO 或 Worker 的验收范围。

至少覆盖：

- 管理员和一个受限业务角色使用真实登录、退出和重新登录流程。
- 左侧四个导航分组、系统设置叶子、隐藏详情深链以及无权限路由落点。
- 项目列表实际行、筛选、20 条批次滚动续载、查看/编辑/归档；物理删除只对超级管理员显示，并有项目编码二次核验。
- 项目概览在 1440×900 下必须断言主内容 `1234×784`、统计标签横坐标、工具栏控件 `100 / 242 / 82 / 82`、表格 `1208×602`、13 列固定宽度和 44px 行高；1280、1440、1920 三种桌面宽度均不得出现页面横向溢出。
- 项目概览的加载、空数据、接口异常、固定项目名列、横向/纵向滚动、项目经理升降序和只读统计卡必须分别验收；控制台错误、页面异常、失败请求和图片资源加载失败均视为失败。
- 受限角色只看到数据范围内项目，合同/折算金额等敏感字段为空，且看不到物理删除操作。
- 项目档案在 1234×784 内容区断言 13px 内边距、100px 五指标区、32px 工具栏、270/937px 双栏、44px 目录/表格行和 `340/80/100/113/122/182px` 列宽；覆盖真实项目查询、上传、下载、逻辑文件删除、版本刷新、权限和 `FILE_TYPE` 启停联动。
- 档案模板在 1234×784 内容区断言 13px 内边距、32px 工具栏、280px 搜索框、44px 表头/数据行、670px 表体和 `280/120/111/111/95/160/149/182px` 列宽；覆盖真实关键字查询、模板名称/当前版本服务端排序、长文本截断、横向滚动、空/加载/错误/无权限状态、`COUNTRY`/`PROJECT_TYPE`/`FILE_TYPE` 配置启停和历史值展示。
- 标准库在 1440×900 下断言 88px 指标区、32px 工具栏、625px 主工作区、270/937px 双栏、44px 页签/分类/表头/数据行、80px 分类说明、`365/90/130/170/182px` 五列和无分页器；覆盖关键词、两个分类维度、详情、新增、字段配置联动、版本审核发布、下载、启停、归档和权限边界。
- 知识库在 1440×900 下断言 `1234×784` 内容区、88px 三指标区、32px 工具栏、625px 主工作区、270/937px 双栏、44px 分类/表头/数据行、72px 分类说明、`365/90/130/170/182px` 五列和无分页器；覆盖真实分类计数、关键词、后台分页排序、长标题 Tooltip、日期格式、详情、新增、字段配置启停、文件与辅助附件上传/预览/下载、归档、加载/空态/错误恢复、1280px 内部横向滚动和权限边界。
- 文件首传、同键重试、版本晋升、审核通过/驳回、审核历史和深链抽屉。
- PDF 至少实际渲染一页；Office、图片、Markdown、XMind、音视频按环境能力验证只读路由和明确降级。
- 标准、知识、档案模板、审核、用户中心、审批规则、通知、集成和角色权限矩阵表格有真实表头与数据行。
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
11. `_prisma_migrations` 必须恰好包含源码中的 45 个有效迁移，每个迁移完成且 `migration.sql` SHA-256 与数据库记录一致；数据库中不得存在源码缺失的有效迁移。
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

## 2026-08-02 当前仓库侧验收状态

源码静态事实由 `node scripts/verify-doc-facts.mjs` 在每次验收中重新计算。当前仓库扫描范围为 699 个受版本控制或待纳入版本控制的文件；前端 193 个 TypeScript/Vue 文件、24 个 `views/` Vue 文件、26 个运行时 API 文件和 44 个测试文件；后端 248 个 TypeScript 文件、28 个 Controller、42 个 Service、30 个 Module、170 个 HTTP 路由和 45 个 Prisma migration。以上数字只作为本次交付快照，后续发布仍以脚本实时计算结果为准。

发布迁移验收脚本核对应用迁移与校验和、二次 seed 全库表计数以及 MinIO/File Worker/Outbox Worker 一致性。日常本机不再启动这些依赖；相同正式发布物的真实依赖验收由 `.github/workflows/release.yml` 的 integration 作业执行。

本地自动化结果：

- 前端 Vitest：44 个测试文件、222 个用例全部通过。
- 前端 ESLint（只读模式）、TypeScript 类型检查和生产构建通过；普通 JavaScript 单块 500 KiB、CSS 450 KiB、独立 Worker 1500 KiB 和总 JavaScript 2600 KiB 预算门禁通过。
- 后端 Jest：74 个测试套件、548 个用例全部通过。
- 后端 ESLint（只读模式）、TypeScript 类型检查、生产构建和 Prisma schema 校验通过。
- 代码规则扫描：前后端源码未发现新增无约束 `any`，未发现其他 UI 组件库导入；前端常规业务请求集中在 `src/api/`，统一文件预览组件按只读会话使用受控 `fetch` 获取预览内容。
- 文档事实、86 个权限/16 个角色、前端循环 0、27 个历史 Prisma Model 生产调用 0、Release Manifest 和发布/恢复顺序契约全部通过。
- Vite 生产构建转换 1479 个模块；体积预算通过，共 105 个资产、JavaScript 2135.7 KiB，PDF Worker 1417.59 kB 仍在独立 Worker 预算内。
- 本地视觉验收 5/5 通过：项目台账、项目档案、档案模板、项目弹窗和标准库均使用单浏览器 Worker；前四项生成设计/实现/差异三联图，标准库因项目内尚无节点 `70:322` 参考截图而在报告中明确标记“缺少设计基准”。
- 本机实际运行 Node.js 24.14.0、pnpm 11.9.0、Docker Compose 5.3.1；本地脚本以直接工具入口完成诊断，正式 CI 仍固定 Node.js 20、pnpm 10.34.4。基础、生产、测试和 v2 应用/数据共五组 `compose config -q` 均 PASS，本轮未启动或修改任何容器，不能替代真实依赖验收。

这些结果只证明仓库侧轻量质量与视觉门禁通过。真实 MySQL、Redis、MinIO、45 个 migration、三个 migrator、API E2E 和浏览器权限矩阵，必须由同一 Release 的 GitHub integration 产生 PASS 后才可部署测试服务器；生产还必须取得测试验证凭据和 Environment 审批。

## GitHub 部署验收

推送后按 v2 链路逐级判定：

1. `质量检查` 必须在 Node 20、pnpm 10.34.4 下通过源码、文档、Release Shell、前后端测试/构建和三份 Compose config。
2. Release 必须以完整 40 位 main 历史 SHA 标识；后端与迁移器只能使用 GHCR digest，前端 checksum 和 Manifest 必须一致。
3. integration 必须使用上述正式发布物启动真实 MySQL、Redis、MinIO、API 和两个 Worker，执行 45 个 migration、三个数据 migrator、二次幂等 seed、真实 API/权限/浏览器 E2E。
4. 测试部署必须核对固定 SSH host key、服务器 `target-id`、`runtime.env` 0600、MySQL/MinIO 成对备份、API/Worker 稳定性以及内外网 `/ready` 和 `build-info.json`。
5. 只有测试部署成功后才可发布 `tested-release` 凭据；生产工作流必须验证该凭据并等待 `production` Environment 审批，不能重建 Release。
6. migration 开始后的失败禁止代码单边回退；成对恢复必须显式确认、校验备份 checksum 与源 Release，并恢复 MySQL、MinIO、Redis、后端、Worker 和前端后重新检查内外网入口。

服务器准备、首发接管和逐项记录模板见 `docs/deployment-architecture-v2.md`。部署成功只以目标 SHA 对应的 GitHub 作业、服务器状态、内外网 Release ID 和业务账号验收共同判定。
