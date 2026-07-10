# 部署运维

## 部署方式

平台保留两种使用同一套 `deploy-git.sh` 的部署入口：

- 人工部署：在服务器应用目录执行脚本，适用于首次接入、故障处理和受控发布。
- GitHub 自动部署：推送 `main` 后，由 GitHub Actions 先完成质量门禁和部署配置校验，再把固定到具体提交的发布包上传到测试服务器并执行脚本。

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
3. `deploy`：仅当前两项都通过时进入 Environment `test`，固定目标提交，使用 SSH 上传发布包并调用服务器上的 `deploy-git.sh`。
4. 部署脚本备份 MySQL、MinIO 和环境快照，执行受控迁移，重建应用容器，并检查后端就绪状态、前端响应和发布版本号；失败时保存诊断信息并尝试回滚到上一提交。

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

## 文件预览环境

平台常规文件入口统一使用接近全视口的弹窗预览：弹窗左右各保留 12 像素，内容区默认占满可用高度，紧凑模式不重复展示文件信息栏。预览内容通过登录态接口、短时签名链接或受控内容流获取，不向浏览器暴露 MinIO 存储路径。

ONLYOFFICE 为可选增强能力：

```text
ONLYOFFICE_DOCS_URL=https://onlyoffice.example.com
ONLYOFFICE_JWT_SECRET=<与 ONLYOFFICE Docs 一致的 JWT 密钥，如启用 JWT>
PUBLIC_API_BASE_URL=https://delivery-platform.example.com
```

- 配置 `ONLYOFFICE_DOCS_URL` 和 `PUBLIC_API_BASE_URL` 后，文件中心可按后端权限返回 ONLYOFFICE 查看或编辑会话。
- 未配置 ONLYOFFICE、ONLYOFFICE 不可用或高级预览会话创建失败时，Office 文件会在同一弹窗内切换到兼容只读预览，由后端提取 DOCX、XLSX、PPTX 内容并生成文档、表格或幻灯片视图。
- 旧版 DOC、XLS、PPT 仅在能安全提取出可读内容时提供兼容预览；无法解析的二进制旧格式会提示下载查看。
- 文件中心预览会话还支持 XMind、视频和音频；通用附件兼容预览支持 PDF、图片、Markdown/文本、Office 和视频。CAD、Visio 或未命中对应渲染器的格式保持明确的降级提示。

## 最近一次自动部署记录

2026-07-10，提交 `6ee245676e5e02f98504b044fab8b1ea763fb47e` 推送到 `main` 后，GitHub Actions 通过 Environment `test` 自动部署到 `http://1.117.73.165:18080`。质量检查和部署工作流均在第一次运行成功，服务器 Git HEAD、`build-info.json.releaseId` 和目标提交一致；`/api/v1/ready`、账号登录、统一文件预览与培训页面复验通过。部署脚本生成备份 `backups/git-deploy/20260710_104429-6ee245676e5e`，上一成功版本记录为 `3244cfabca4c8119ce08cd3acb3b8c3a375c4dc8`。

## 历史人工部署记录

2026-07-08，版本 `1df2a618471e` 曾完成人工部署和基础验证，备份目录为 `backups/git-deploy/20260708_161928-1df2a618471e`。该记录只用于追溯历史基线，不代表当前提交或 GitHub 自动部署链路已经验证成功。
