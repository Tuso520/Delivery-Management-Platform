# 开发规范

## 环境要求

- Node.js 20。
- pnpm 10.34.4。
- Docker Desktop 或 Docker Engine，用于容器化测试。

开始开发前执行 `node scripts/preflight.mjs`。该只读检查报告 Node.js、pnpm、两个工作区依赖、Prisma Client、`.env.local`、Docker Compose 和本地验收端口状态；发布验收使用 `node scripts/preflight.mjs --require-docker`。

## 安装依赖

```powershell
pnpm --dir delivery-platform-web install
pnpm --dir delivery-platform-server install
pnpm --dir delivery-platform-server prisma:generate
```

前端和后端是两个独立 pnpm workspace，仓库根目录不承载包清单。后端首次安装或 Prisma schema 变化后必须执行 `prisma:generate`。

## 本地模拟服务

```powershell
$env:LOCAL_TEST_ADMIN_PASSWORD = Read-Host '请输入本地模拟管理员密码'
$env:LOCAL_TEST_PM_PASSWORD = Read-Host '请输入本地模拟项目经理密码'
node scripts/local-test-server.mjs
```

默认访问地址：

- `http://127.0.0.1:18080`

本地模拟账号：

- `admin`
- `pm_wang`

这些账号只由 `scripts/local-test-server.mjs` 提供，用于本地浏览器联调；密码必须分别由 `LOCAL_TEST_ADMIN_PASSWORD`、`LOCAL_TEST_PM_PASSWORD` 显式注入，缺失、空白或占位值会拒绝启动。生产和共享测试环境不得使用模拟账号，种子账号密码必须通过各自环境变量配置。

真实 NestJS/Prisma 环境不提供开发密码回退。启动 Docker 本地测试前，将 `.env.local.example` 复制为被 Git 忽略的 `.env.local`，并显式替换 `SEED_ADMIN_PASSWORD`、`SEED_DEFAULT_PASSWORD` 的 `CHANGE_ME...` 占位值；缺失、空白或占位值在 development、test、production 都会使 seed 失败。所有环境默认保留既有种子账号密码；仅在明确执行受控密码轮换时才设置 `SEED_RESET_EXISTING_USER_PASSWORDS=true`，该操作只更新密码，不会重新启用已停用或软删除的账号。

## 前端开发

```powershell
pnpm --dir delivery-platform-web lint
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --dir delivery-platform-web budget
```

前端约定：

- 使用 Arco Design Vue 组件。
- 页面保持紧凑、清晰、偏工作台风格。
- 表单、筛选区、表格、弹窗和按钮尽量复用统一组件。
- 声明式 `a-table-column` 必须放在 `BusinessTable` 内；直接 `a-table` 只允许显式 `columns` 数组，防止当前 Vue/Arco 组合丢失列注册。
- 服务端数据统一使用 `src/query/keys.ts` 和 `composables/queries/`；mutation 成功后按领域精确失效，提交不自动重试。
- Pinia 不保存项目、档案、审核、标准、知识或设置响应；页面局部状态只保存表单、抽屉、上传进度等客户端状态。
- 固定界面文案使用中英文同构 i18n key；状态文案和颜色通过 `components/business/status-registry.ts` 统一定义。
- 筛选项保持简洁，能一行展示时不要拆成多行。
- 涉及布局的修改必须通过浏览器截图或实际页面检查。
- UI E2E 默认使用稳定版 Chrome；本地已有其他 Playwright 支持的 Chromium 通道时，可通过 `PLAYWRIGHT_BROWSER_CHANNEL` 显式指定，例如 `msedge`。CI 不设置该变量并继续使用 Chrome。
- 具体 UI 规范见 [UI/UX 与 Arco Design 规范](ui-ux.md)。
- 改动菜单、路由、页面层级、Store、API 或公共组件前，先核对 [前端页面架构](frontend-architecture.md)。
- 改动业务动作、状态、审批、文件版本或角色权限前，同步核对 [前端业务流程](frontend-business-flows.md)。
- 正式约束见 [前端实施规范](frontend-architecture-refactored.md)；[前端整体重构评审稿](frontend-rebuild-review.md) 不作为当前事实来源。

## 后端开发

```powershell
pnpm --dir delivery-platform-server lint
pnpm --dir delivery-platform-server type-check
pnpm --dir delivery-platform-server test
pnpm --dir delivery-platform-server build
```

后端约定：

- Prisma schema 变化必须通过可审查迁移；生产禁止破坏性 `db push`，删除列前必须备份旧值并做 preflight。
- 种子脚本必须幂等，禁止清空业务表。
- 新上传文件进入审批时，不能覆盖当前已审批版本。
- 文件上传与预览逻辑集中在 `UnifiedFileService`；页面只调用全局只读预览弹窗，禁止恢复旧附件预览、独立预览页或新开浏览器窗口。
- 项目生命周期、阶段、验收、归档和物理删除使用专用命令；普通 DTO 不接受这些字段。项目写入携带 revision，创建/上传携带幂等键。
- 统一审核新增来源时必须同时注册提交校验、终态回写、权限、通知和并发测试，不能只插入 ReviewTask。
- 业务事务内写 Outbox；外部通知由 Outbox Worker 投递。文件转换由 File Worker 处理，API 进程不运行隐式定时任务。
- 集成 Secret 只存 AES-256-GCM 密文，API 返回掩码；任何日志、异常和审计详情都要脱敏。
- Controller 只处理协议层，业务规则放在 Service。

## 文档更新要求

以下内容变化时必须同步更新 `docs/`：

- 产品行为。
- 权限规则。
- API 契约。
- 数据模型或迁移策略。
- 部署流程。
- 浏览器真实验证结果。
- 开源依赖或许可证信息。
