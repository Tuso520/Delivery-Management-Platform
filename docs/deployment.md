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
