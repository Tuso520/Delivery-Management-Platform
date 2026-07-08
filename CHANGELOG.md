# 更新记录

## 2026-07-08

- 将项目文档统一整理为 GitHub 风格结构，文档入口集中到 `docs/`。
- 删除历史编号阶段目录、旧发布包脚本、旧发布包测试和临时产物。
- 新增贡献规范、安全说明、开源依赖说明和开源准备清单。
- 新增直接依赖许可证清单、中文 Issue 模板和中文合并请求模板。
- 修正文档和包描述中的乱码内容。
- 将项目阶段 `04_construction` 统一为“施工与调试 / Construction & Commissioning”。
- 前端测试、前端构建、后端类型检查和 Git 空白检查已通过。

## 2026-07-03

- 按公司标准补齐项目交付目录、本地 Docker 测试部署、健康检查和回滚入口。
- 新增 `docker-compose.test.yml`，用于本机 Docker 测试环境。
- 新增 `.env.local.example` 和本地 `.env.local`，本地访问域名为 `delivery-platform.localhost`。
- 生产数据库同步保留 `prisma migrate deploy`，禁止发布链路使用 `db push --accept-data-loss`。
- 修复前后端依赖审计漏洞，生产依赖审计已无已知漏洞。
