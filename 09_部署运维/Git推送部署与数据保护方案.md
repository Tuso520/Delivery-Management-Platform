# Git 推送部署与数据保护方案

## 变更背景

旧流程是本地打包后手工上传服务器一键部署。新流程调整为：

1. 本地完成代码、文档、测试和构建验证。
2. 推送到 GitHub `origin/main`。
3. 服务器从 GitHub 拉取最新代码。
4. 服务器执行部署脚本，完成备份、构建、迁移和启动。

## 推荐流程

```mermaid
flowchart LR
  Dev["本地开发与测试"] --> Push["git push origin main"]
  Push --> Server["服务器 git pull"]
  Server --> Backup["备份 MySQL / MinIO / .env"]
  Backup --> Build["Docker 构建"]
  Build --> Migrate["数据库迁移"]
  Migrate --> Up["docker compose up -d"]
  Up --> Health["健康检查"]
```

## 服务器目录建议

```text
/opt/delivery-platform/
  app/              # Git 仓库
  backups/          # 数据库和 MinIO 备份
  env/              # 生产 .env 备份
  logs/             # 部署日志
```

## 数据保护

- `.env`：生产 `.env` 只在服务器维护，部署脚本不得覆盖。
- MySQL：部署前执行 `mysqldump`，备份文件写入 `backups/mysql/`。
- MinIO：部署前同步对象数据或打包 MinIO volume。
- Redis：缓存可重建；如承载队列或会话，部署前做 RDB 备份。
- Docker volume：部署脚本禁止执行 `docker volume rm` 和无保护的 `down -v`。

## 数据库迁移

- 先运行迁移预检查。
- 只执行向前兼容迁移。
- 大字段、大表变更拆分执行。
- 迁移失败时停止发布，保留旧容器和备份。

## 回滚策略

- 代码回滚：`git checkout <last-good-commit>`。
- 镜像回滚：保留上一版本镜像 tag。
- 数据回滚：使用部署前备份恢复 MySQL 和 MinIO。
- 配置回滚：恢复服务器 `env/` 中的 `.env` 备份。

## 验收

- `git pull --ff-only` 成功。
- 数据备份文件生成。
- Docker Compose 启动成功。
- `/api/v1/health` 返回成功。
- 登录、项目列表、知识库预览验证通过。
