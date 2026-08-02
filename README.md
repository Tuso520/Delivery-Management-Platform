# 交付管理平台

交付管理平台是面向软件交付中心、项目经理、专业工程师、采购、财务、HSE 和标准管理员的企业级交付过程管理系统。平台围绕项目概览、项目档案、统一文件审核、标准库、知识库、工具中心、组织权限和平台设置，帮助团队把交付资料、版本、审批记录和项目风险统一管理起来。

## 核心功能

- 项目概览：按当前 Figma 提供 5 项只读指标、项目范围、项目名称查询、新建和容器内滚动宽表格；原币/折算金额、验收、权限和高风险操作均由服务端终检并审计。
- 项目档案：按 Figma `43:317` 提供五项完成度指标、270px 项目目录和固定列宽文件表；上传、下载、逻辑文件删除、版本留痕和统一审核均使用真实后端能力，说明见 [docs/project-archive.md](docs/project-archive.md)。
- 档案模板：按 Figma `69:305` 提供 1208px 固定列宽列表、真实关键字查询和服务端排序；模板、版本、项目快照及字段配置使用稳定编码关联，说明见 [docs/archive-template.md](docs/archive-template.md)。
- 标准与知识：标准库按 Figma `70:322` 提供交付阶段/管理领域分类、固定列宽文件列表和真实版本审核，类型、状态、生效日期、业务类型、使用国家与启停均由字段配置驱动，说明见 [docs/standard-library.md](docs/standard-library.md)；知识版本在文件、Markdown 和链接中严格选择一个主内容源。
- 字段配置：国家、币种、项目类型、客户类型、文件类型等字段的枚举、默认值、排序、启停和展示名称统一由数据库字段配置驱动，前后端不维护平行枚举。
- 在线预览：统一只读预览 Office、PDF、图片、大图、Markdown、XMind、视频和音频；CAD/Visio 等使用异步转换产物。
- 权限体系：按角色和权限点控制菜单、按钮、接口和项目数据访问范围。
- 通知集成：站内和飞书通过 Outbox Worker 幂等投递并保留逐通道回执。
- 部署体系：本地轻量模拟与视觉对比、CI 真实依赖验收、不可变 Release 逐环境推广，迁移前成对备份 MySQL 与 MinIO。

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Pinia、Vue Router、TanStack Query、Arco Design Vue、Axios。
- 后端：NestJS 11、TypeScript、Prisma 5、MySQL 8、Redis 7、MinIO。
- 运行环境：Docker Compose、Nginx、Node.js 20、pnpm。
- 质量检查：TypeScript 严格类型检查、前后端测试与构建、Prisma 受保护迁移、真实 API 和浏览器验证。

## 目录结构

```text
.
├── .github/                  # GitHub 工作流配置
├── delivery-platform-web/     # Vue 前端工程
├── delivery-platform-server/  # NestJS 后端工程、Prisma 模型和种子数据
├── docker/                    # 容器辅助配置
├── docs/                      # 产品、架构、开发、部署、测试、安全和开源说明
├── scripts/                   # 本地测试、Docker 和运维辅助脚本
├── deploy/                     # v2 应用/数据 Compose 与宿主 Nginx 模板
├── deploy-git.sh              # legacy 备份与迁移期兜底入口
├── docker-compose.yml         # 生产近似环境 Compose 配置
├── docker-compose.test.yml    # 本地 Docker 测试 Compose 配置
├── DEPLOYMENT.md              # 部署快速入口
└── README.md
```

项目文档统一维护在根目录规范文件和 `docs/` 中。

## 快速启动

```powershell
pwsh.exe -NoLogo -NoProfile -File scripts/local-quality.ps1 -Mode quick
pwsh.exe -NoLogo -NoProfile -File scripts/local-visual.ps1
```

第二条命令会自动生成进程内临时凭据、启动本地模拟服务、完成四个关键页面的视觉验收并关闭服务。报告路径：

- `.ai-work/visual-report/index.html`
- `.ai-work/visual-report/playwright/index.html`

需要隔离真实依赖排障时才使用本地 Docker：

```powershell
Copy-Item .env.local.example .env.local
# 在被 Git 忽略的 .env.local 中替换所有 CHANGE_ME 占位值
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
```

`SEED_ADMIN_PASSWORD` 和 `SEED_DEFAULT_PASSWORD` 必须由每个运行环境显式注入；缺失、空白或 `CHANGE_ME...` 占位值都会使 seed 失败。既有种子账号默认保留原密码，只有受控轮换时才显式设置 `SEED_RESET_EXISTING_USER_PASSWORDS=true`。

## 文档入口

- [文档总览](docs/README.md)
- [产品说明](docs/product.md)
- [技术架构](docs/architecture.md)
- [平台目标架构](docs/platform-architecture.md)
- [Figma 页面清单](docs/figma-page-inventory.md)
- [字段配置说明](docs/field-configuration.md)
- [标准库说明](docs/standard-library.md)
- [删除与迁移报告](docs/deletion-report.md)
- [基础架构模型 v0.1](docs/platform-foundation-architecture-v0.1.md)
- [前端页面架构](docs/frontend-architecture.md)
- [前端业务流程](docs/frontend-business-flows.md)
- [前端实施规范](docs/frontend-architecture-refactored.md)
- [后端实施规范](docs/backend-architecture-refactored.md)
- [开发规范](docs/development.md)
- [本地轻量化测试](docs/local-testing-lightweight.md)
- [发布与服务器架构 v2](docs/deployment-architecture-v2.md)
- [部署运维](docs/deployment.md)
- [测试验收](docs/testing.md)
- [安全说明](docs/security.md)
- [开源依赖说明](docs/open-source.md)
- [直接依赖许可证清单](docs/open-source-dependencies.md)
- [开源准备清单](docs/open-source-readiness.md)
- [版本记录](CHANGELOG.md)

## 开源与第三方组件

本项目引用了 Vue、Arco Design Vue、NestJS、Prisma、PDF.js、MinIO SDK 等开源组件。主要直接依赖和许可证说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、[docs/open-source.md](docs/open-source.md) 和 [docs/open-source-dependencies.md](docs/open-source-dependencies.md)。

项目正式公开前，需要由项目负责人确认最终开源许可证，并复核示例数据、服务器地址、客户信息、截图和密钥是否已经清理。

## 生产部署

生产发布采用“构建一次、逐环境推广”：前端为静态发布包，后端和迁移器为 GHCR digest 镜像；测试环境自动部署，生产环境人工审批后复用同一 Release。服务器使用宿主 Nginx，应用层和 MySQL/Redis/MinIO 数据层分离。首次配置和旧架构接管见 [发布与服务器架构 v2](docs/deployment-architecture-v2.md)。

本地默认不启动 WSL 或 Docker，使用 [轻量化测试与视觉对比](docs/local-testing-lightweight.md)。真实依赖集成验收在 GitHub Release 工作流中执行。

旧 Git 拉取/重置发布工作流只保留手动兜底，要求显式确认，不用于生产日常更新。v2 每次 migration 前仍会成对备份 MySQL 和 MinIO；数据发生变更后只允许成对恢复数据与匹配 Release。

## 贡献与安全

- 贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全说明见 [SECURITY.md](SECURITY.md)。
- 禁止提交 `.env`、生产备份、发布包、截图产物、本地测试日志和任何密钥。
