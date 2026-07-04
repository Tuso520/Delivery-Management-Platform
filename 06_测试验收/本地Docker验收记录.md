# 本地 Docker 验收记录

## 验收时间

2026-07-05

## 验收范围

本次执行 Docker Compose 配置级校验，未在本机完整启动生产容器栈。页面和接口功能通过本地模拟服务完成验收。

## 校验结果

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 基础 Compose 配置 | `docker compose --env-file .env.example -f docker-compose.yml config -q` | 通过 |
| 生产 Compose 合并配置 | `docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q` | 通过 |
| Git 部署脚本语法 | `sh -n deploy-git.sh` | 通过 |
| 发布包脚本语法 | `sh -n scripts/package-release.sh` | 通过 |
| 旧包部署助手语法 | `sh -n scripts/deploy-latest-release.sh` | 通过 |

## 数据保护确认

- `.env.example` 只作为模板，不覆盖服务器生产 `.env`。
- Compose 配置保留持久化卷，部署脚本禁止无保护删除数据卷。
- `deploy-git.sh` 包含部署前备份、迁移保护、回滚和恢复路径。
- 生产发布前仍需在服务器环境执行完整 `docker compose up -d` 和健康检查。
