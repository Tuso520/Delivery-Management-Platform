# 测试验收

## 质量门禁

提交前按影响范围执行；架构、权限、文件、项目、档案、审核或部署变更必须执行完整集合：

```powershell
pnpm --dir delivery-platform-web lint
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --filter ./delivery-platform-server lint
pnpm --filter ./delivery-platform-server type-check
pnpm --filter ./delivery-platform-server test
pnpm --filter ./delivery-platform-server build
pnpm --dir delivery-platform-server exec prisma validate
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q
docker compose --env-file .env.local.example -f docker-compose.test.yml config -q
```

Lint 命令会修正可自动修复的格式；执行后必须重新检查工作区差异。生产构建允许报告分块体积警告，但不允许类型、测试、Lint 或构建错误。

真实 Docker/集成测试必须从 `.env.local.example` 创建被 Git 忽略的 `.env.local`，并显式注入非空、非 `CHANGE_ME...` 的 `SEED_ADMIN_PASSWORD` 和 `SEED_DEFAULT_PASSWORD`。测试 Compose 默认不重置既有种子账号；需要验证密码轮换时，必须在隔离数据库中显式设置 `SEED_RESET_EXISTING_USER_PASSWORDS=true`。

## 真实 API E2E

`delivery-platform-server/test/real-api.e2e-spec.ts` 只连接已经启动的真实 NestJS、MySQL、Redis 和 MinIO，不使用页面模拟服务。账号通过临时环境变量提供，不写入仓库：

```powershell
$env:E2E_API_BASE_URL='http://127.0.0.1:3000/api/v1'
$env:E2E_USERNAME='<测试账号>'
$env:E2E_PASSWORD='<测试密码>'
pnpm --filter ./delivery-platform-server test:e2e --runInBand
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

至少覆盖：

- 管理员和一个受限业务角色使用真实登录、退出和重新登录流程。
- 主导航、设置齿轮、隐藏详情深链以及无权限路由落点。
- 项目列表实际行、筛选、分页、查看/编辑/归档；物理删除只对超级管理员显示，并有项目编码二次核验。
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

## 权限与数据范围矩阵

权限种子覆盖 `SUPER_ADMIN`、`SYSTEM_ADMIN`、`DELIVERY_MANAGER`、`COUNTRY_MANAGER`、`PROJECT_MANAGER`、专业负责人/工程师、`PURCHASE`、`FINANCE`、`HSE`、`STANDARD_ADMIN`、`PARTNER`、`VIEWER` 和 `AUDITOR`。

自动化与人工验收共同确认：

- Controller 使用权限码，`SUPER_ADMIN` 只绕过权限集合，不绕过业务状态、指派、数据完整性和审计规则。
- 项目 `ALL / DEPARTMENT / COUNTRY / OWNED / PARTICIPATED / CUSTOM` 数据范围由后端查询条件执行。
- 财务、合同、验收和下载字段按独立权限裁剪；前端隐藏按钮不是授权依据。
- 文件审核动作只允许当前步骤指派人执行，多人会签并发只能产生一个终态。
- 设置只读账号落到第一个可访问设置页；无任何可访问页时进入 `/forbidden`，不清除有效会话。

## 2026-07-13 验收记录

本轮最终工作区已完成不依赖 Docker daemon 的合并门禁：前端 lint、类型检查、40 个 Vitest 文件 / 175 个用例和生产构建通过；后端 lint、类型检查、67 个 Jest 套件 / 464 个用例、Prisma schema/client 生成和生产构建通过；三组 Compose 静态解析、Bash 语法、ShellCheck 与完整部署契约通过。前端构建仅保留既有分块体积和 user store 动静态导入警告。

以下真实 MySQL、Redis、MinIO 和浏览器结果是新增两条 migration 前的 26 migration 基线；最终 28 migration、内容物化和共享服务器发布必须由同一目标提交的 GitHub `integration`/`deploy` 或服务器复验补充，不能用该基线替代：

基线在隔离临时 MySQL、Redis、MinIO 和真实 NestJS API 上完成：

- 前端 lint、TypeScript 检查和生产构建通过；Vitest 40 个测试文件、173 个用例全部通过。
- 后端 lint、TypeScript 检查和生产构建通过；Jest 63 个测试套件、369 个用例全部通过，Prisma schema 校验通过。
- NestJS 真实 API E2E 2 个用例、Playwright 真实依赖就绪冒烟 2 个用例、Chrome 管理员/项目经理关键流程 2 个用例全部通过；三套 Docker Compose 配置解析通过。
- 26 个 migration 顺序成功且无未完成或回滚记录；seed 连续两次成功，目标权限、项目成员、档案模板和项目计数稳定。
- 当前隔离库包含 10 个有效项目、450 个档案文件夹、690 个基线档案项和 1 个多人会签验收临时档案项；档案项、档案文件、文件版本、审核步骤和审核指派的孤儿关联均为 0，开放迁移异常为 0。
- 代表性旧项目升级后原状态归档、目标状态/阶段正确，旧运行时列已退出；无效目标状态和重复有效成员均为 0。
- 项目创建幂等、revision 冲突、阶段修改、暂停、档案快照、受限角色分页和敏感字段裁剪通过。
- 系统分页、上传扩展名/大小和登录失败次数配置在运行时生效。
- PDF 实际写入 MinIO；`{version}` 命名规则、首个独立文件、幂等重试、预览、下载和审计通过。
- 需审核档案文件由实际指派人通过后，ReviewTask、FileVersion、LogicalFile 和当前版本指针同时进入终态。
- `ANY_N` 真实多人会签使用 2 名直接指派人和阈值 2 完成并发审批；两名指派人各保留一条动作，任务只生成一条去重的 `ReviewTaskApproved` 终态 Outbox 事件，文件当前版本只晋级一次。
- File Worker 与 Outbox Worker 均连续运行且重启次数为 0；终态通知已处理，无投递目标的创建通知按契约标记 `SKIPPED`。未配置可选文件转换器时，转换任务以 `FILE_CONVERTER_NOT_CONFIGURED` 进入受控失败，不伪造预览产物。
- QEMU 压力验收复现 Prisma `P1017` 关闭连接；认证资料和 JWT 权限重载现仅对该瞬时错误执行一次幂等读取重试，写入与事务不自动重试。修复后真实登录、Refresh 轮换和两角色 Chrome 流程复验通过。
- 项目物理删除对有关联项目返回包含阻断计数的 409 并记录失败审计；无关联测试项目删除成功并保留成功审计。
- 浏览器验证管理员和项目经理登录、项目、档案、审核深链、PDF Canvas、模板、日志、角色权限矩阵、标准和知识页面；项目经理只看到 7 个范围内项目，金额为空且无物理删除按钮，最终项目页控制台无警告或错误。

该记录只证明明确标注的本地门禁与隔离环境基线；没有同一提交的共享环境部署成功记录时，不得把它表述为生产或测试服务器已发布。

## GitHub 部署验收

推送后以同一提交的实际结果为准：

1. `quality`、`validate`、`integration` 成功后才能进入 `deploy`；`integration` 的 `RELEASE_ID` 必须来自 checkout 后解析出的完整 Git HEAD，不能使用可能指向其他提交的事件 SHA。
2. Environment 使用固定核验的 SSH host key，目标提交与 Git bundle 中的 `HEAD` 一致。
3. 服务器 Git HEAD、`build-info.json.releaseId` 和工作流目标提交一致。
4. `/api/v1/ready`、API E2E、浏览器关键路径通过，File Worker 与 Outbox Worker 均保持 running，且容器 ID 和重启次数在稳定窗口内不变。
5. `scripts/test-deploy-git.sh`、ShellCheck 和 Actionlint 必须通过；契约至少覆盖部署锁内的 Git bundle/环境上传、远端八参数位置契约、Dockerfile syntax frontend 禁用、数据库变更边界、MinIO 停止门禁、跨进程 incomplete-restore 标记及绑定备份重试、完整 MySQL/MinIO 备份、精确 migration runtime 与 code-only rollback 选择、未知 dirty worktree 保留、继承密钥不得掩盖 `.env` 缺项、MySQL 就绪等待不得丢失已准备密钥、API/Worker 停写必须早于密文检查和密钥持久化、密钥失败恢复、人工备份/代码回滚顺序、旧备份拒绝、密钥严格解密、跨拓扑 Worker、restore `--no-build`，以及部署后未使用镜像清理只删除容器、当前/上一发布和 checksummed v3 备份均未引用的 Image ID。
6. migration 可能写库后的失败不得启动旧代码；日志必须明确显示“保留目标并停服”或“v3 成对数据/环境/不可变运行时已验证恢复”，不能只以 `/ready` 作为旧版本兼容证据。
7. 失败时保存诊断与回滚事实；“工作流已配置”不等于“当前版本部署成功”。

2026-07-10 的历史测试环境发布记录只用于追溯旧基线，不覆盖本轮整体重构。
