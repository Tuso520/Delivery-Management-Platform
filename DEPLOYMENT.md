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
6. 在迁移前停止后端和前端写入。
7. 备份 MySQL、MinIO 和 `.env`。
8. 运行 `backend-migrate` 门禁：受保护 schema migration、幂等 seed、集成 Secret apply；首次旧架构升级还要按完整文档执行目标数据 dry-run/apply/verify。
9. 确认 `INTEGRATION_SECRET_ENCRYPTION_KEY` 在迁移容器、API 与 Outbox Worker 一致，审计账号 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 有效，再重建 API、两个 Worker 和前端容器。
10. 检查后端依赖就绪状态、Worker、前端响应和发布版本号；失败时先停 Worker，再记录诊断并尝试成对回滚 MySQL 与 MinIO。

## 健康检查

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
docker compose ps
```

`/api/v1/health` 只确认后端进程响应；`/api/v1/ready` 还会检查 MySQL、Redis 和 MinIO。`build-info.json` 中的 `releaseId` 必须和 `git rev-parse --short=12 HEAD` 一致，`file-worker` 与 `outbox-worker` 也必须处于 running。完整迁移顺序和回滚边界见 [docs/deployment.md](docs/deployment.md)。
