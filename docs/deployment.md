# 部署运维

## 部署方式

平台采用 Git 拉取部署：

1. 本地提交代码并推送 `main` 到 GitHub。
2. 登录服务器。
3. 在生产目录执行 `deploy-git.sh`。
4. 服务器拉取最新 Git 版本，备份数据，执行安全迁移，并重建容器。

## 生产部署命令

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

## GitHub 自动部署

`.github/workflows/deploy.yml` 已配置自动部署流程：

- 推送 `main` 后自动部署到 GitHub Environment `test`。
- 手动触发 `workflow_dispatch` 时可选择 `test` 或 `production`。
- 自动部署仍复用服务器上的 `deploy-git.sh`，不会绕过备份、迁移、健康检查和回滚逻辑。
- GitHub Actions 会打包当前提交并通过 SSH 上传到服务器，服务器不需要配置 GitHub 私有仓库读取权限。

GitHub Environment 需要配置：

```text
Variables:
DEPLOY_HOST=公司当前默认测试服务器地址
DEPLOY_PORT=22
DEPLOY_USER=root
DEPLOY_APP_DIR=/www/wwwroot/delivery-platform
DEPLOY_COMPOSE_FILES=docker-compose.yml:docker-compose.prod.yml

Secrets:
DEPLOY_SSH_KEY=<可登录服务器的私钥>
DEPLOY_ENV_FILE_B64=<可选，服务器 .env 的 base64 内容>
```

`DEPLOY_ENV_FILE_B64` 为空时，服务器保留现有 `.env`。首次部署或需要刷新测试环境变量时，可在本机生成：

```bash
base64 -w0 .env.test
```

Windows PowerShell：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".env.test"))
```

测试服务器地址以公司级流程文档为准，不在项目代码中写死。生产环境必须使用单独的 GitHub Environment、独立 SSH key 和独立 `.env`。

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

## 数据迁移规则

- 生产环境只使用 `prisma migrate deploy`。
- 禁止在生产环境执行 `prisma db push --accept-data-loss`。
- 删除表、删除列、收紧唯一约束等变更必须先评审，并在测试环境演练。
- 种子脚本必须幂等，禁止截断或清空业务表。

## 健康检查

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
docker compose ps
```

`build-info.json.releaseId`、`RELEASE_ID` 和 `git rev-parse --short=12 HEAD` 必须一致。

## 已验证生产版本

2026-07-08，生产版本 `1df2a618471e` 已完成部署和验证：

- 前端健康检查通过。
- 后端健康检查通过。
- MySQL 健康检查通过。
- Redis 健康检查通过。
- MinIO 健康检查通过。
- 备份目录：`backups/git-deploy/20260708_161928-1df2a618471e`。

## File Preview Environment

The unified file preview center works without exposing storage paths. Office editing requires an ONLYOFFICE Docs Community server that can reach the backend public API.

Optional environment variables:

```text
ONLYOFFICE_DOCS_URL=https://onlyoffice.example.com
ONLYOFFICE_JWT_SECRET=<same secret configured in ONLYOFFICE Docs, if JWT is enabled>
PUBLIC_API_BASE_URL=https://delivery-platform.example.com
```

If `ONLYOFFICE_DOCS_URL` or `PUBLIC_API_BASE_URL` is missing, Office formats degrade to "preview unavailable + download". PDF, image, Markdown, XMind outline, video, audio, and thumbnail paths continue to work through signed file URLs.