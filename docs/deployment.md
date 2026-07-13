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
2. `validate`：对同一个目标 ref 校验本地、默认和生产 Compose 组合，并对 `deploy-git.sh` 执行 shell 语法检查和部署契约测试。
3. `integration`：以 checkout 后解析出的完整 Git HEAD 标记本次验收镜像，生成仅供本次 runner 使用并立即遮罩的临时凭据，启动真实 NestJS、MySQL、Redis、MinIO、File Worker、Outbox Worker 与前端；两个 Worker 必须保持 running 且容器 ID、重启次数稳定，之后才执行登录/Refresh Token API E2E、依赖就绪冒烟，以及管理员和受限项目经理的浏览器权限与数据范围 E2E。
4. `deploy`：仅前三项都通过时进入 Environment `test`，固定目标提交，使用 SSH 上传 Git bundle；bundle 导入、服务器工作区校验、可选环境原子替换都由同一提交中的 `deploy-git.sh` 在取得服务器部署锁后完成，随后执行备份、migration、容器切换和健康检查。
5. 部署脚本备份 MySQL、MinIO 和环境快照，执行受控迁移，重建 API、File Worker、Outbox Worker 和前端容器，并检查依赖就绪状态、Worker 运行状态、前端响应和发布版本号；失败时保存诊断信息。源码切换后、写库前可恢复来源运行时，写库后只能保留目标版本向前修复，或恢复经过验证的成对数据与运行时。

服务器工作区存在任何未提交的受跟踪或未跟踪源码时，自动部署都会在切换代码前拒绝继续；`.env`、备份、存储和发布元数据等 `.gitignore` 中的服务器专属文件不受影响。不得通过清理未知文件绕过该门禁，应先识别并保留服务器侧改动。

为从旧归档覆盖式发布切换到 Git 工作区，当前 Actions 只允许一次精确历史 release overlay 恢复：必须在部署锁内证明每个变更文件的 blob 都与同一历史提交完全一致，并把补丁和未跟踪文件移入 `.deploy/recovered-overlays/`；任何未知改动仍 fail closed。共享服务器完成一次新流程成功发布并确认工作区 clean 后，应删除 `ALLOW_RELEASE_OVERLAY_RECOVERY` 及对应兼容函数。

工作流已具备上述逻辑不等于自动部署已经跑通。首次启用或凭据变更后，必须以 GitHub Actions 中对应提交的 `quality`、`validate`、`integration`、`deploy` 四个作业均成功，以及测试服务器版本核对结果为准。

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

`DEPLOY_ENV_FILE_B64` 为空时，服务器保留现有 `.env`。上传环境时，GitHub 只写入带 checksum 的临时文件；`deploy-git.sh` 取得与人工发布共用的部署锁后，才验证 checksum、使用唯一 `DEPLOY_RUN_ID` 备份并原子替换 `.env`，因此人工发布和 Actions 不会并发覆盖配置。失败和成功清理都只处理当前 run 拥有的快照，历史残留标记不会覆盖当前配置。部署脚本会在构建阶段准备集成加密密钥：优先沿用当前或部署前环境中的有效值；两处都未配置时，仅在 MySQL 确认不存在任何既有集成密文后，才在服务器本地生成并以 `0600` 权限持久化新的 32 字节 Base64 密钥。上传环境若提供不同但格式有效的密钥，而源数据库已有密文，也会在停止业务容器前闭锁；密钥轮换必须走独立、事务化流程。密钥值不会写入日志。首次部署或明确需要刷新测试环境配置时，可在本机生成：

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
- `backup-format-version`
- `integration-secret-key.sha256`（对解码后 32 字节密钥计算，不保存密钥值）
- `git-revision.txt`
- `previous-successful-revision.txt`
- `target-git-revision.txt`
- `compose-files.txt`
- `docker-compose.resolved.yml`
- `database-migration-state.txt` 与三份 Prisma migration checksum 清单
- `runtime-selection.txt` 与 `paired-restore.status`
- `runtime-compose.resolved.yml` 与 `runtime-topology.services`
- `retained-images.tsv` 与 `restore-images.override.yml`
- `table-counts.before.tsv`
- `table-counts.after.tsv`
- `table-count-deltas.tsv`
- `foreign-keys.before.tsv`
- `foreign-keys.after.tsv`
- `checksums.sha256`

备份目录：

```text
backups/git-deploy/YYYYMMDD_HHMMSS-<source-release>-to-<target-release>/
```

备份格式固定为 v3；旧 v2 备份缺少可核验的运行时身份，自动恢复会 fail closed。`git-revision.txt` 记录与迁移前数据库中已完成 Prisma migration 名称和 checksum **完全一致**的可恢复运行时：通常是上一成功版本；若之前的不安全发布已经把数据库前向迁移，则选择与现有 migration 清单完全一致的目标版本，避免把新 schema 交给旧代码。两者都不匹配或存在未完成 migration 时，备份仍保存数据，但 `paired-restore.status=NO`，只能用于人工数据取证，不会执行自动破坏性恢复。`previous-successful-revision.txt` 和 `target-git-revision.txt` 分别保留来源与目标审计事实。

脚本对每张表执行精确 `COUNT(*)`，迁移后拒绝旧表消失或行数减少，并逐条检查 `information_schema.KEY_COLUMN_USAGE` 中的外键是否存在孤儿记录；任何 SQL 或报告写入失败都会阻断切换。数据库、MinIO、完整环境、revision、源 Compose 拓扑、不可变镜像 ID/OCI release label 和审计报告均进入 checksum 清单。上一运行版本没有不可变 tag 时，只允许从仍存在且 release label 匹配的运行容器捕获精确 Image ID 并补 tag，禁止通过重新构建旧 Dockerfile 伪造回滚镜像。

`restore-data` 是显式破坏性操作，必须同时提供 `CONFIRM_RESTORE=YES` 和备份路径。脚本会在任何 `DROP DATABASE` 前重新从 `git-revision.txt` 解包并解析源 Compose，核对 Worker 拓扑、完整环境中的 release id、集成密钥指纹、不可变镜像 tag/Image ID/OCI label、所有 checksum 及 MinIO 压缩包，并确认 MinIO 已成功停止、数据卷可定位。随后原子写入 database mutation marker 和 `.deploy/data-restore-incomplete` 才允许替换数据库；后者绑定备份绝对路径、checksum 清单摘要和 revision，跨进程保留恢复未完成事实。导入后要求表计数、Prisma migration 清单与备份完全一致，外键孤儿为零且既有密文通过 `--verify` 真正解密；再 checkout 已验证 revision，加载 checksummed image override，并使用 `--no-build` 启动。破坏前预检失败会恢复原运行时；破坏阶段开始后的任一失败都会保持停服，不会用不匹配代码或现场重建镜像启动已恢复数据。

`.deploy/data-restore-incomplete` 存在时，普通 deploy、backup 和 `rollback-code` 在源码或环境切换前即被阻断，也不会自动启动应用。恢复只能用标记绑定的原 `BACKUP_PATH` 重新执行 `CONFIRM_RESTORE=YES bash deploy-git.sh restore-data`；更换路径、revision 或 checksum 清单均会拒绝。只有 MySQL 与 MinIO 恢复、精确表计数、外键、Prisma migration 和密文解密全部验证通过后才清除此标记。

`backend-migrate` 启动前即标记数据库可能发生写入。此后发布失败时，默认保留目标源码和目标密钥并停服，供下一次前向修复；绝不只 checkout 旧代码。只有 `ROLLBACK_DATA_ON_FAILURE=YES` 且 MySQL、MinIO、完整 `.env`、迁移清单和对应不可变运行时全部恢复并验证成功，才允许成对回滚。`rollback-code` 还会拒绝任何未解决的 mutation marker，并要求候选提交的 Prisma migration 清单与在线数据库完全一致。基础设施启动在写库前失败时，脚本只在源码确已切换后恢复来源源码；若 release bundle 或未知 dirty worktree 在切换前被拒绝，则保留现场文件，不执行破坏性清理。

`.env` 是 `INTEGRATION_SECRET_ENCRYPTION_KEY` 的唯一部署事实源；脚本会先清除调用 shell 继承的同名值，再读取并持久化环境文件，避免“本次进程可解密、下次重启丢密钥”。

## 数据迁移规则

- 生产环境只使用 `prisma migrate deploy`。
- 禁止在生产环境执行 `prisma db push --accept-data-loss`。
- 删除表、删除列、收紧唯一约束等变更必须先评审，并在测试环境演练。
- 种子脚本必须幂等，禁止截断或清空业务表。
- 生产环境必须显式配置种子账号密码；除非确实要重置已有种子账号密码，否则不要启用 `SEED_RESET_EXISTING_USER_PASSWORDS`。

默认 Compose 的 `backend-migrate` 是启动门禁，固定执行：

```text
prepare-migrate → prisma migrate deploy → bootstrap 幂等 seed → Secret dry-run → Secret apply（单事务）→ 第二次幂等 seed → Secret verify → Target foundation strict verify
```

首次空库需要 bootstrap seed 创建迁移审计账号；第二次 seed 用于验证幂等性。Secret apply 会先验证所有既有密文都能由同一密钥解密，再把配置更新和成功审计放在同一个事务内；`--verify` 是只读严格门禁，要求 `plaintextSecretRows=0` 且 `planned=0`。最后的 Target foundation strict verify 会再次拒绝开放迁移异常、旧审核残留或目标关联不完整。`backend`、`file-worker` 和 `outbox-worker` 都等待该容器成功；任何一步失败都不得启动业务流量。API、Outbox Worker 和迁移容器必须使用同一个 `INTEGRATION_SECRET_ENCRYPTION_KEY`，迁移审计账号由 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 指定且必须处于启用状态。File Worker 不持有集成 Secret。

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
pnpm --filter ./delivery-platform-server prisma:migrate-integration-secrets -- --verify
```

若通过 Compose 执行发布，上述三条 Secret 命令已经由 `backend-migrate` 使用 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 执行；人工命令只用于保存报告或非 Compose 环境，不得对不同密钥重复 apply。若不存在旧标准/知识或旧集成配置，dry-run 会报告 0 项，仍应保存报告。加密密钥不得复用 JWT、数据库、Redis 或 MinIO 密钥。完成后再运行一次幂等 seed、比较业务表计数并完成 strict verify，之后才启动 API 和 Worker。

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
- API、File Worker 与 Outbox Worker 使用同一个带 release 标签的后端镜像，前端同样使用 release-tagged 镜像；发布构建不会覆盖上一成功版本镜像。发布切换前必须先停止两个 Worker，再停止 API；schema、目标数据与 Secret 迁移完成后按 API、Worker、前端顺序启动，并核对四个容器的 release 标签。回滚优先恢复未被替换的上一版本容器；若已开始切换，则从保留的 release 镜像重建，不把重新构建旧源码作为唯一恢复路径。跨版本回滚统一读取被回滚提交的 Compose 服务清单：当前目标版本仍严格要求两个 Worker；回滚到尚未引入 Worker 的历史提交时只恢复该提交实际声明的 API 与前端，并清除新拓扑的孤儿容器。

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
