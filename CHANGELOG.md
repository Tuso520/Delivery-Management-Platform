# 更新记录

## 2026-07-13

- 按前后端重构实施规范完成工作台、项目、两级档案、档案模版、统一文件与审核、标准、知识、工具、组织权限和系统设置的运行时切换。
- 新增并验证 26 个 Prisma migration、目标内容/档案/项目/集成 Secret 数据迁移脚本和严格数据完整性门禁；旧业务表仅作为只读迁移源保留。
- 文件统一为 LogicalFile、FileAsset 和不可变 FileVersion，审核统一为 ReviewTask/Step/Assignee/ActionEvent，支持单人、全员、ANY_N、串行与并行审批。
- 前端统一使用 Arco Design Vue、业务组件、TanStack Query、权限路由和单一只读文件预览入口，删除旧页面、旧 API、兼容组件和重复状态流程。
- API、File Worker 与 Outbox Worker 独立运行；通知投递、文件处理、敏感操作审计、Refresh Token 轮换、数据范围和敏感字段裁剪完成加固。
- lint、类型检查和生产构建通过；前端 40/173、后端 63/369、真实 API 2/2、依赖冒烟 2/2、Chrome 关键流程 2/2 全部通过。
- 修复 GitHub 自动部署在解压发布包后污染服务器 Git 工作区、又因脏工作区门禁无法切换提交的问题；改为校验并导入固定 SHA 的 Git bundle，且在切换前同时保护受跟踪和未跟踪源码。
- Dockerfile 改用 Docker/BuildKit 内置解析器，移除对 `docker/dockerfile:1.7` 外部 frontend 镜像的强制构建时依赖，同时保留内置 BuildKit 支持的依赖缓存挂载，兼容受限镜像源的部署服务器。
- API、File Worker 与 Outbox Worker 统一使用同一 release 后端镜像；部署在 migration 前按 Worker→API 顺序静默，切换后按 API→Worker→前端顺序启动并校验四个容器的 release 标签，避免新旧进程混跑。

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
