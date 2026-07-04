# Git 推送部署与数据保护方案

## 目标

交付管理平台的生产发布从“本地打包、上传服务器、一键解压部署”改为“代码推送到 Git，服务器从 Git 拉取指定分支、标签或提交后部署”。服务器仍然使用 Docker Compose、本地 `.env`、MySQL、Redis、MinIO 和 Prisma Migrate，避免改动运行架构带来额外迁移风险。

## 部署链路

1. 开发分支完成修改后提交到 Git。
2. 合并前执行质量门禁：前端类型检查、前端测试、前端构建、后端测试、`docker compose config -q`。
3. 合并到 `main` 或打发布标签，例如 `v20260704.1`。
4. 服务器使用只读 Deploy Key 拉取 Git，不在服务器保存开发账号密码。
5. 服务器执行 `bash deploy-git.sh deploy`。
6. 脚本完成 Git 拉取、预检、镜像构建、应用停写、MySQL/MinIO 备份、Prisma 迁移、容器切换、健康检查和版本校验。

## 首次从旧包部署转换

旧服务器目录如果已经是 `/www/wwwroot/delivery-platform`，并且里面保存着生产 `.env` 和历史 `backups/`，不要删除原目录。使用下面流程转换：

```bash
cd /www/wwwroot

export REPO_URL=git@your-git-server:group/delivery-platform.git
export BRANCH=main
export ADOPT_EXISTING_PACKAGE=YES
export APP_DIR=/www/wwwroot/delivery-platform

# deploy-git.sh 可先从 Git 仓库复制到 /www/wwwroot，或在旧发布包内随版本带上。
bash deploy-git.sh deploy
```

转换时脚本会：

- 克隆 Git 仓库到临时目录。
- 复制旧生产 `.env` 到新 Git 工作区。
- 复制旧 `backups/`。
- 将旧源码目录改名为 `delivery-platform.source-YYYYMMDD_HHMMSS`。
- 将新 Git 工作区移动到原路径，保持 Docker Compose 项目路径不变，保护已有 Docker 命名卷。

如果服务器已经是 Git 工作区，后续只需要：

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

发布指定标签或提交：

```bash
cd /www/wwwroot/delivery-platform
REF=v20260704.1 bash deploy-git.sh deploy
```

## 数据保护策略

生产数据分三类保护：

| 数据 | 位置 | 保护方式 |
|---|---|---|
| 业务数据库 | MySQL Docker 命名卷 | 迁移前 `mysqldump --single-transaction --routines --triggers --events --hex-blob` |
| 附件与知识库文件 | MinIO Docker 命名卷 | 迁移前对 `/data` 卷打 `tar.gz` |
| 生产配置 | `/www/wwwroot/delivery-platform/.env` | 永远不进 Git，迁移前复制到备份快照 |

生产 `.env` 保留 `COMPOSE_PROJECT_NAME=delivery-platform`。这样 Docker Compose 项目名和命名卷前缀固定，不会因为目录名或部署方式变化误连到另一套空数据卷。

迁移时不要临时切换 `COMPOSE_FILES` 或 Compose 项目名。`docker-compose.prod.yml` 带有独立项目名，只有旧服务器原本就使用同一组 Compose 文件时才继续使用；否则先做卷名核对和备份恢复演练。

备份目录：

```text
/www/wwwroot/delivery-platform/backups/git-deploy/YYYYMMDD_HHMMSS-<git短提交>/
```

每个备份目录包含：

- `mysql.sql.gz`
- `minio.tar.gz`
- `env.snapshot`
- `git-revision.txt`
- `docker-compose.resolved.yml`
- `table-counts.before.tsv`
- `table-counts.after.tsv`

## 迁移保护规则

1. 生产禁止使用 `prisma db push --accept-data-loss`。
2. 生产只允许 `node prisma/prepare-migrate.js && prisma migrate deploy && ts-node prisma/seed.ts`。
3. `prepare-migrate.js` 只做一次性基线保护：已有核心表但没有 `_prisma_migrations` 时，标记 `20260703000000_init` 已应用；如果只存在部分核心表，会拒绝继续。
4. Schema 修改按“先兼容、再迁移、后清理”拆分：
   - 第一版只新增表、索引、可空字段或有默认值字段。
   - 第二步用脚本分批回填数据。
   - 第三版确认线上无旧代码依赖后，再删除旧字段或收紧约束。
5. 删除表、删除列、字段重命名、唯一约束收紧必须单独评审，并先在测试库恢复生产备份演练。
6. 种子数据必须幂等。允许针对系统字典、废弃权限做定向清理，禁止清空业务表。

## 部署脚本的保护动作

`deploy-git.sh deploy` 默认执行以下顺序：

1. 记录当前 Git 提交到 `.deploy/previous_rev`。
2. 拉取并切换到目标分支、标签或提交。
3. 写入 `RELEASE_ID` 和 `RELEASE_MANIFEST.txt`。
4. 执行 `.env`、Docker Compose、Prisma 文件和固定镜像版本预检。
5. 先构建新镜像，构建失败时不切换运行容器。
6. 启动 MySQL、Redis、MinIO。
7. 默认停止 `backend` 和 `frontend`，让业务进入停写状态。
8. 备份 MySQL、MinIO 和 `.env`。
9. 执行 Prisma 迁移和幂等种子。
10. 强制重建 `backend` 和 `frontend`。
11. 检查后端 `/api/v1/health`、前端首页和 `/build-info.json`。

失败时默认只做代码回滚，不自动恢复数据库。数据恢复是破坏性操作，必须显式执行：

```bash
cd /www/wwwroot/delivery-platform
CONFIRM_RESTORE=YES \
BACKUP_PATH=backups/git-deploy/YYYYMMDD_HHMMSS-<git短提交> \
bash deploy-git.sh restore-data
```

如果在维护窗口内确认没有备份后的新写入，也可以允许部署失败时自动恢复数据：

```bash
ROLLBACK_DATA_ON_FAILURE=YES bash deploy-git.sh deploy
```

默认不建议开启自动数据恢复，因为线上如果仍有用户写入，自动恢复会覆盖备份之后的新数据。

## 运维命令

```bash
cd /www/wwwroot/delivery-platform

bash deploy-git.sh preflight
bash deploy-git.sh deploy
bash deploy-git.sh status
bash deploy-git.sh backup
bash deploy-git.sh logs
bash deploy-git.sh rollback-code
CONFIRM_RESTORE=YES BACKUP_PATH=backups/git-deploy/<备份目录> bash deploy-git.sh restore-data
```

## 发布前检查

- Git 远端已配置 Deploy Key。
- 服务器 `.env` 存在，且没有 `CHANGE_ME`。
- `MINIO_IMAGE` 和 `MINIO_MC_IMAGE` 使用固定 `RELEASE` 版本。
- 当前生产目录没有未提交的跟踪文件修改。
- 已确认本次 Prisma migration 不包含未评审的 `DROP`、危险 `ALTER` 或不可逆数据更新。
- 已安排维护窗口或确认可以短暂停写。

## 发布后验收

1. `bash deploy-git.sh status` 显示容器正常。
2. `curl -fsS http://127.0.0.1:3000/api/v1/health` 正常。
3. `curl -fsS http://127.0.0.1:8080/build-info.json` 的 `releaseId` 等于 `git rev-parse --short=12 HEAD`。
4. 登录后台，检查项目台账、知识库附件预览、文件上传、流程、报表和系统配置。
5. 检查 `backups/git-deploy/` 已生成本次备份。
6. 检查 `backups/failures/` 没有新的失败日志。
