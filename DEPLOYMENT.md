# 部署快速入口

完整部署说明维护在 [docs/deployment.md](docs/deployment.md)。本文件只保留最常用的生产更新命令和健康检查命令。

## 生产更新

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

`deploy-git.sh` 会执行以下步骤：

1. 拉取目标分支、标签或提交。
2. 写入 `RELEASE_ID` 和 `RELEASE_MANIFEST.txt`。
3. 检查 `.env`、Docker Compose、Dockerfile 和 Prisma 迁移保护脚本。
4. 构建后端、迁移容器、File Worker、Outbox Worker 和前端镜像。
5. 启动 MySQL、Redis 和 MinIO。
6. 在迁移前先停止 File Worker 与 Outbox Worker，再停止后端和前端写入。
7. 在业务写入停止后确认 `INTEGRATION_SECRET_ENCRYPTION_KEY` 是独立的 32 字节 Base64 密钥并在迁移容器、API 与 Outbox Worker 一致；缺失时由服务器生成仅限当前部署进程的候选值，并且仅在确认无既有密文后持久化启用，审计账号 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 必须有效。
8. 备份 MySQL、MinIO 和源版本 `.env`，记录 source/target revision、解码后集成密钥指纹、精确表计数、外键孤儿报告和所有 checksum。
9. 运行 `backend-migrate` 门禁：受保护 schema migration、bootstrap seed、档案迁移 ERROR 预审、标准/知识内容 strict dry-run/apply、项目档案/文件/审核基础数据 strict dry-run/apply、集成 Secret dry-run/apply、第二次幂等 seed 和同顺序只读严格校验；任何不可自动判断的 finding 都必须在对应 apply 前阻断，随后继续拒绝旧表消失、行数减少或任何外键孤儿。
10. 按 API、两个 Worker、前端的顺序切换并核验依赖就绪、Worker 状态、前端响应和四个发布标签。源码切换后、写库前失败会恢复来源环境、源码和基础设施；源码尚未切换时绝不对未知 dirty worktree 执行 `reset --hard`。migration 可能写库后，禁止单独回滚代码或密钥，默认保留目标版本并停服。只有 v3 备份的 MySQL、MinIO、完整环境、Prisma migration 清单、源 Compose 拓扑和不可变镜像身份全部通过校验，才允许以 `--no-build` 成对恢复。

服务器 `.env` 必须显式提供非空、非占位的 `SEED_ADMIN_PASSWORD` 和 `SEED_DEFAULT_PASSWORD`；仓库不提供任何运行环境的默认密码。`SEED_RESET_EXISTING_USER_PASSWORDS` 默认为 `false`，只有受控密码轮换时才允许显式启用。

## 健康检查

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
docker compose ps
```

GitHub 自动部署成功后会执行受保护的 `bash deploy-git.sh prune-unused-images`：只删除未被任何容器、当前/上一成功发布或受管理 v3 备份引用的镜像，并在清理前后核对磁盘占用和服务健康。该命令不使用强制删除，不清理容器、网络、备份或任何 Docker volume；保护元数据无法严格验证时不会删除任何镜像。

`docker system df` 只读诊断默认限时 30 秒，可通过部署进程变量 `DOCKER_DISK_USAGE_TIMEOUT_SECONDS` 调整；超时不会绕过 Image ID 保护和剩余候选校验。

镜像清理不新增 Secret，沿用既有 `APP_DIR`、`COMPOSE_FILES`、`COMPOSE_PROJECT_NAME` 和服务器 `.env`；`BACKUP_RETENTION_DAYS` 只控制备份目录保留期，不改变镜像保护边界。

`/api/v1/health` 只确认后端进程响应；`/api/v1/ready` 还会检查 MySQL、Redis 和 MinIO。`build-info.json` 中的 `releaseId` 必须和 `git rev-parse --short=12 HEAD` 一致，`file-worker` 与 `outbox-worker` 也必须处于 running。完整迁移顺序和回滚边界见 [docs/deployment.md](docs/deployment.md)。

`rollback-code` 仅在不存在数据库 mutation recovery marker，且目标提交的 Prisma migration 名称与 checksum 和在线数据库完全一致时允许执行；否则必须继续向前修复或使用成对数据/运行时恢复。

破坏性恢复开始前会原子创建 `.deploy/data-restore-incomplete`，绑定备份绝对路径、备份 checksum 清单摘要和运行时 revision。该标记存在时，普通 deploy、backup 和 `rollback-code` 全部 fail closed；只能使用同一 `BACKUP_PATH` 重试 `restore-data`，直到 MySQL、MinIO、表计数、外键、migration 和密文校验全部完成后由脚本清除。
