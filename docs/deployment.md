# 部署运维

## 部署方式

平台保留两种使用同一套 `deploy-git.sh` 的部署入口：

- 人工部署：在服务器应用目录执行脚本，适用于首次接入、故障处理和受控发布。
- GitHub 自动部署：推送 `main` 后，由 GitHub Actions 先完成质量门禁和部署配置校验，再把固定到具体提交的 Git bundle 与部署脚本上传到测试服务器并执行。

当前 `.github/workflows/deploy.yml` 只部署 GitHub Environment `test`。手动触发也只允许选择 `main` 历史中的提交或标签，并仍然部署到 `test`；生产发布不复用该测试 Environment，必须另行建立隔离的审批、凭据和环境变量。

## 人工部署命令

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

## GitHub 自动部署流程

推送 `main` 或手动触发工作流后，执行顺序如下：

1. `quality`：安装前后端依赖，执行后端类型检查、测试、构建，以及前端类型检查、测试、构建。
2. `validate`：校验本地、默认和生产 Compose 组合，并对 `deploy-git.sh` 执行 shell 语法检查。
3. `deploy`：仅当前两项都通过时进入 Environment `test`，固定目标提交，使用 SSH 上传并校验 Git bundle；bundle 只向服务器 Git 对象库导入目标提交，不预先覆盖线上工作区，随后由同一提交中的 `deploy-git.sh` 完成备份、migration、容器切换和健康检查。
4. 部署脚本备份 MySQL、MinIO 和环境快照，执行受控迁移，重建 API、File Worker、Outbox Worker 和前端容器，并检查依赖就绪状态、Worker 运行状态、前端响应和发布版本号；失败时保存诊断信息并尝试回滚到上一提交。

服务器工作区存在任何未提交的受跟踪或未跟踪源码时，自动部署都会在切换代码前拒绝继续；`.env`、备份、存储和发布元数据等 `.gitignore` 中的服务器专属文件不受影响。不得通过清理未知文件绕过该门禁，应先识别并保留服务器侧改动。

工作流已具备上述逻辑不等于自动部署已经跑通。首次启用或凭据变更后，必须以 GitHub Actions 中对应提交的 `quality`、`validate`、`deploy` 三个作业均成功，以及测试服务器版本核对结果为准。

## GitHub Environment 配置

在仓库的 GitHub Environment `test` 中配置以下 Variables：

```text
DEPLOY_HOST=<测试服务器地址，必填>
DEPLOY_PORT=22
DEPLOY_USER=<SSH 用户，必填>
DEPLOY_APP_DIR=/www/wwwroot/delivery-platform
DEPLOY_BRANCH=main
DEPLOY_COMPOSE_FILES=docker-compose.yml:docker-compose.prod.yml
```

其中 `DEPLOY_PORT`、`DEPLOY_APP_DIR`、`DEPLOY_BRANCH` 和 `DEPLOY_COMPOSE_FILES` 有工作流默认值，但建议在 Environment 中显式维护，避免服务器约定变化后产生歧义。`DEPLOY_HOST` 和 `DEPLOY_USER` 也兼容从同名 Secret 读取，但推荐使用 Variable；不得把服务器地址、用户名或目录硬编码到工作流。

配置以下 Secrets：

```text
DEPLOY_SSH_KEY=<仅用于测试环境部署、可登录服务器的私钥，必填>
DEPLOY_KNOWN_HOSTS=<经过线下核验并固定的服务器 SSH host key，必填>
DEPLOY_ENV_FILE_B64=<服务器 .env 的 base64 内容，可选>
```

`DEPLOY_KNOWN_HOSTS` 必须来自可信渠道核验后的完整 `known_hosts` 行。工作流启用 `StrictHostKeyChecking=yes`，不会在运行时使用 `ssh-keyscan` 自动信任未知主机；服务器 SSH host key 变化时，应先核验变更原因，再更新该 Secret。

`DEPLOY_SSH_KEY` 应使用测试环境专用、最小权限的部署密钥。私钥、`.env`、Token 和服务器备份不得提交到 Git。

`DEPLOY_ENV_FILE_B64` 为空时，服务器保留现有 `.env`。首次部署或明确需要刷新测试环境配置时，可在本机生成：

```bash
base64 -w0 .env.test
```

Windows PowerShell：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".env.test"))
```

## 服务器数据保护

切换应用容器前，`deploy-git.sh` 会生成：

- `mysql.sql.gz`
- `minio.tar.gz`
- `env.snapshot`
- `git-revision.txt`
- `docker-compose.resolved.yml`
- `table-counts.before.tsv`
- `table-counts.after.tsv`

备份目录：

```text
backups/git-deploy/YYYYMMDD_HHMMSS-<release-id>/
```

脚本会校验数据库备份和 MinIO 归档可读取后再继续。备份目录和解析后的 Compose 文件按受限权限保存；自动清理只处理超过保留期的 Git 部署备份。

## 数据迁移规则

- 生产环境只使用 `prisma migrate deploy`。
- 禁止在生产环境执行 `prisma db push --accept-data-loss`。
- 删除表、删除列、收紧唯一约束等变更必须先评审，并在测试环境演练。
- 种子脚本必须幂等，禁止截断或清空业务表。
- 生产环境必须显式配置种子账号密码；除非确实要重置已有种子账号密码，否则不要启用 `SEED_RESET_EXISTING_USER_PASSWORDS`。

默认 Compose 的 `backend-migrate` 是启动门禁，固定执行：

```text
prepare-migrate → prisma migrate deploy → 幂等 seed → 集成 Secret apply
```

`backend`、`file-worker` 和 `outbox-worker` 都等待该容器成功；任何一步失败都不得启动业务流量。API、Outbox Worker 和迁移容器必须使用同一个 `INTEGRATION_SECRET_ENCRYPTION_KEY`，迁移审计账号由 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 指定且必须处于启用状态。File Worker 不持有集成 Secret。

### 整体重构既有库升级

`prisma migrate deploy` 只负责 schema 迁移，不能替代目标数据审计。首次从旧架构升级时，必须先停止旧 API 和两个 Worker，在同一维护窗口执行 schema 门禁与以下脚本；`MIGRATION_ACTOR_ID` 必须是有效启用用户：

```bash
pnpm --filter ./delivery-platform-server prisma:audit-archive-migration
pnpm --filter ./delivery-platform-server prisma:migrate-target-content
pnpm --filter ./delivery-platform-server prisma:migrate-target-content -- --apply --actor-user-id="$MIGRATION_ACTOR_ID"
pnpm --filter ./delivery-platform-server prisma:migrate-target-foundation
pnpm --filter ./delivery-platform-server prisma:migrate-target-foundation -- --apply --actor-user-id="$MIGRATION_ACTOR_ID"
pnpm --filter ./delivery-platform-server prisma:migrate-target-foundation -- --verify --strict
pnpm --filter ./delivery-platform-server prisma:migrate-integration-secrets
pnpm --filter ./delivery-platform-server prisma:migrate-integration-secrets -- --apply --actor-user-id="$MIGRATION_ACTOR_ID"
```

若通过 Compose 执行发布，最后两条 Secret 命令已经由 `backend-migrate` 使用 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 执行；人工命令只用于保存 dry-run 报告或非 Compose 环境，不得对不同密钥重复 apply。若不存在旧标准/知识或旧集成配置，dry-run 会报告 0 项，仍应保存报告。加密密钥不得复用 JWT、数据库或 MinIO 密钥。完成后再运行一次幂等 seed、比较业务表计数并完成 strict verify，之后才启动 API 和 Worker。

迁移 094 删除旧项目运行时列前会将原状态写入 `project_legacy_state_archive` 并执行状态 preflight；出现异常必须中止，禁止绕过校验手工删列。旧业务表只读保留，不要在常规发布中物理删除。

## 健康与就绪检查

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
docker compose ps
```

- `/api/v1/health` 只确认后端进程能够响应。
- `/api/v1/ready` 会检查 MySQL、Redis 和 MinIO；任一依赖不可用时返回非成功状态。部署脚本以该就绪接口作为后端切换后的门禁。
- `build-info.json.releaseId`、容器的 `RELEASE_ID` 和目标 Git 提交的前 12 位必须一致。
- `file-worker` 与 `outbox-worker` 必须处于 running；检查不得只覆盖 `backend` 和 `frontend`。File Worker 停止会使复杂预览长期停在处理中，Outbox Worker 停止会使通知停在待投递。

## 异步 Worker

- File Worker 执行缩略图、大图、CAD/Visio、XMind 和视频处理；通过数据库租约领取任务，支持租约回收、指数退避和最大尝试次数。
- `FILE_CONVERTER_URL` 为空时，需要转换的格式返回 `FILE_CONVERTER_NOT_CONFIGURED`，不会伪装为预览成功。转换服务必须限制输出大小并使用独立 Token。
- Outbox Worker 解析通知规则并投递站内、飞书和企业微信，按事件/用户/通道记录 `NotificationDelivery`。缺少身份/配置是 `SKIPPED`，暂时错误重试，达到上限进入 `DEAD`。
- API、File Worker 与 Outbox Worker 使用同一个带 release 标签的后端镜像。发布切换前必须先停止两个 Worker，再停止 API；schema、目标数据与 Secret 迁移完成后按 API、Worker、前端顺序启动，并核对四个容器的 release 标签。回滚前同样先停 Worker，部署脚本不提供跳过静默阶段的开关。

## 文件预览环境

平台常规文件入口统一使用接近全视口的弹窗预览：弹窗左右各保留 12 像素，内容区默认占满可用高度，紧凑模式不重复展示文件信息栏。预览内容通过登录态接口、短时签名链接或受控内容流获取，不向浏览器暴露 MinIO 存储路径。

ONLYOFFICE 为可选增强能力：

```text
ONLYOFFICE_DOCS_URL=https://onlyoffice.example.com
ONLYOFFICE_JWT_SECRET=<与 ONLYOFFICE Docs 一致的 JWT 密钥，如启用 JWT>
PUBLIC_API_BASE_URL=https://delivery-platform.example.com
```

- 配置 `ONLYOFFICE_DOCS_URL`、`ONLYOFFICE_JWT_SECRET` 和可回调的公共 API 地址后，Office 只返回签名只读会话；全平台没有编辑模式、编辑按钮或保存回调。
- 未配置 ONLYOFFICE 或会话不可用时明确提示下载原文件，不恢复旧附件 HTML 兼容预览。
- PDF、图片、大图、Markdown、XMind、视频和音频使用统一只读 Viewer。CAD/Visio/不受浏览器支持的视频只有转换产物为 `READY` 时才能预览；处理中和失败均返回显式状态。
- MinIO bucket/key 只在服务端保存；浏览器获得短时签名 URL。预览与下载分别审计，读取预览内容不计为下载。

## 最近一次自动部署记录

2026-07-10，提交 `6ee245676e5e02f98504b044fab8b1ea763fb47e` 推送到 `main` 后，GitHub Actions 通过 Environment `test` 自动部署到共享测试环境；环境地址不在仓库文档记录。质量检查和部署工作流均在第一次运行成功，服务器 Git HEAD、`build-info.json.releaseId` 和目标提交一致；`/api/v1/ready`、账号登录、统一文件预览与培训页面复验通过。部署脚本生成备份 `backups/git-deploy/20260710_104429-6ee245676e5e`，上一成功版本记录为 `3244cfabca4c8119ce08cd3acb3b8c3a375c4dc8`。

## 历史人工部署记录

2026-07-08，版本 `1df2a618471e` 曾完成人工部署和基础验证，备份目录为 `backups/git-deploy/20260708_161928-1df2a618471e`。该记录只用于追溯历史基线，不代表当前提交或 GitHub 自动部署链路已经验证成功。
