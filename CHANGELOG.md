# 更新记录

## 2026-07-03

- 按公司标准补齐项目交付目录、Docker 本地测试部署、健康检查和回滚入口。
- 新增 `docker-compose.test.yml`，用于本机 Docker 测试环境。
- 新增 `.env.local.example` 和本机 `.env.local`，本地访问域名为 `delivery-platform.localhost`。
- 生产数据库同步保留 `prisma migrate deploy`，禁止发布链路使用 `db push --accept-data-loss`。
- 修复前后端依赖审计漏洞，`pnpm audit --prod` 已无已知漏洞。
