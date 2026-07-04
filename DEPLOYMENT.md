# 交付管理平台部署说明

生产部署入口已经从“本地打包上传服务器”调整为“推送到 Git，服务器从 Git 拉取后部署”。旧包部署脚本暂时保留用于应急回退，但新发布按本文执行。

## 1. 首次准备

服务器需要安装：

- Git
- Docker
- Docker Compose

生产目录默认：

```bash
/www/wwwroot/delivery-platform
```

生产 `.env` 只保存在服务器，不提交到 Git。首次部署如果没有 `.env`，脚本会从 `.env.example` 创建后停止，填写完成后再次执行部署。

`.env` 中保留：

```text
COMPOSE_PROJECT_NAME=delivery-platform
```

这样可以固定 Docker Compose 项目名和命名卷前缀，避免目录名变化导致服务器误创建另一套空数据卷。

不要在迁移时临时切换 `COMPOSE_FILES` 或 Compose 项目名。除非确认旧服务器一直使用同一组 Compose 文件，否则可能导致 MySQL、Redis、MinIO 命名卷前缀变化。

## 2. 从旧包部署转换为 Git 部署

旧服务器如果已经有 `/www/wwwroot/delivery-platform`，不要删除该目录。执行：

```bash
cd /www/wwwroot

export REPO_URL=git@your-git-server:group/delivery-platform.git
export BRANCH=main
export APP_DIR=/www/wwwroot/delivery-platform
export ADOPT_EXISTING_PACKAGE=YES

bash deploy-git.sh deploy
```

转换过程会保留：

- 旧生产 `.env`
- 旧 `backups/`
- MySQL、Redis、MinIO Docker 命名卷
- 旧源码目录，改名为 `delivery-platform.source-YYYYMMDD_HHMMSS`

## 3. 日常发布

发布主干：

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

发布指定标签或提交：

```bash
cd /www/wwwroot/delivery-platform
REF=v20260704.1 bash deploy-git.sh deploy
```

脚本会自动执行：

1. `git fetch --tags --prune origin`
2. 切换到目标分支、标签或提交。
3. 写入 `RELEASE_ID` 和 `RELEASE_MANIFEST.txt`。
4. 校验 `.env`、Docker Compose、Dockerfile、Prisma 迁移保护脚本。
5. 构建 backend、backend-migrate、frontend 镜像。
6. 启动 MySQL、Redis、MinIO。
7. 停止 backend 和 frontend，进入停写。
8. 备份 MySQL、MinIO 和 `.env`。
9. 执行 `prepare-migrate.js`、`prisma migrate deploy` 和幂等种子。
10. 重建 backend 和 frontend。
11. 检查后端健康、前端首页和 `/build-info.json`。

## 4. 数据保护

备份目录：

```text
/www/wwwroot/delivery-platform/backups/git-deploy/YYYYMMDD_HHMMSS-<git短提交>/
```

每次部署前会生成：

- `mysql.sql.gz`
- `minio.tar.gz`
- `env.snapshot`
- `git-revision.txt`
- `docker-compose.resolved.yml`
- `table-counts.before.tsv`
- `table-counts.after.tsv`

生产数据库迁移规则：

- 禁止 `prisma db push --accept-data-loss`。
- 只允许 `prisma migrate deploy`。
- 删除表、删除列、字段重命名、唯一约束收紧必须单独评审并先在测试库演练。
- 种子数据必须幂等，禁止清空业务表。

## 5. 回滚

只回滚代码：

```bash
cd /www/wwwroot/delivery-platform
bash deploy-git.sh rollback-code
```

恢复数据库和 MinIO 是破坏性操作，必须显式确认：

```bash
cd /www/wwwroot/delivery-platform
CONFIRM_RESTORE=YES \
BACKUP_PATH=backups/git-deploy/YYYYMMDD_HHMMSS-<git短提交> \
bash deploy-git.sh restore-data
```

只有在维护窗口内确认没有备份后的新写入，才允许恢复数据。

## 6. 验证

```bash
cd /www/wwwroot/delivery-platform

bash deploy-git.sh status
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:8080/build-info.json
cat RELEASE_ID
git rev-parse --short=12 HEAD
```

`build-info.json` 的 `releaseId`、`RELEASE_ID` 和 `git rev-parse --short=12 HEAD` 必须一致。

浏览器访问生产域名后检查：

- 登录正常。
- 左侧菜单、选择框、按钮文字没有乱码。
- 项目台账、项目档案、日报周报月报正常。
- 知识库分类无重复，DOC、XLSX、PPT、PDF、图片附件能上传、下载和在线预览。
- KPI、OKR、评分流程、技能评估正常。
- 系统配置可保存。
- 浏览器控制台无资源加载错误。

## 7. 排查

```bash
cd /www/wwwroot/delivery-platform

bash deploy-git.sh logs
docker compose logs --tail=200 mysql
docker compose logs --tail=200 minio
docker compose run --rm backend-migrate ./node_modules/.bin/prisma -v
```

Prisma CLI 和 Client 必须都是 `5.22.0`。

MinIO 出现 `Unknown xl meta version` 时，不要删除生产数据卷或随意降级镜像。先确认创建数据卷的 MinIO 版本，再使用兼容版本启动或从备份恢复。
