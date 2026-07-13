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
7. 备份 MySQL、MinIO 和 `.env`。
8. 运行 `backend-migrate` 门禁：受保护 schema migration、bootstrap seed、集成 Secret dry-run/apply/verify、第二次幂等 seed；首次旧架构升级还要按完整文档执行目标数据 dry-run/apply/verify。
9. 确认 `INTEGRATION_SECRET_ENCRYPTION_KEY` 是独立的 32 字节 Base64 密钥并在迁移容器、API 与 Outbox Worker 一致；缺失时仅在确认无既有密文后由服务器安全生成，审计账号 `INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME` 必须有效。
10. 按 API、两个 Worker、前端的顺序切换并核验依赖就绪、Worker 状态、前端响应和四个发布标签；失败时先停止实际声明的 Worker，再保存诊断并回滚代码。MySQL 与 MinIO 数据恢复默认不自动执行，只有显式设置恢复确认和备份路径时才成对恢复。

## 健康检查

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
docker compose ps
```

`/api/v1/health` 只确认后端进程响应；`/api/v1/ready` 还会检查 MySQL、Redis 和 MinIO。`build-info.json` 中的 `releaseId` 必须和 `git rev-parse --short=12 HEAD` 一致，`file-worker` 与 `outbox-worker` 也必须处于 running。完整迁移顺序和回滚边界见 [docs/deployment.md](docs/deployment.md)。
