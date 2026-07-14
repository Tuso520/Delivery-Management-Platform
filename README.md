# 交付管理平台

交付管理平台是面向软件交付中心、项目经理、专业工程师、采购、财务、HSE 和标准管理员的企业级交付过程管理系统。平台围绕项目概览、项目档案、统一文件审核、标准库、知识库、工具中心、组织权限和平台设置，帮助团队把交付资料、版本、审批记录和项目风险统一管理起来。

## 核心功能

- 项目概览：支持“我的项目/全部项目”、项目分类与关键词、统一进度命令、详情抽屉及独立归档列表；原币/折算金额、验收、权限和高风险操作均由服务端终检并审计。
- 项目档案：创建项目时复制已发布档案模版快照，提供两级目录、临时项、只新增同步、版本留痕和统一审核。
- 标准与知识：交付流程、检查标准和文档模版统一进入仅文件化的标准库；知识版本在文件、Markdown 和链接中严格选择一个主内容源。
- 在线预览：统一只读预览 Office、PDF、图片、大图、Markdown、XMind、视频和音频；CAD/Visio 等使用异步转换产物。
- 权限体系：按角色和权限点控制菜单、按钮、接口和项目数据访问范围。
- 通知集成：站内、飞书和企业微信通过 Outbox Worker 幂等投递并保留逐通道回执。
- 部署体系：支持本地模拟、真实依赖测试和服务器 Git 拉取部署，迁移前成对备份 MySQL 与 MinIO。

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
├── deploy-git.sh              # 服务器 Git 拉取部署入口
├── docker-compose.yml         # 生产近似环境 Compose 配置
├── docker-compose.test.yml    # 本地 Docker 测试 Compose 配置
├── DEPLOYMENT.md              # 部署快速入口
└── README.md
```

历史阶段文档已经合并到 `docs/`，仓库不再维护旧的编号阶段目录。

## 快速启动

```powershell
pnpm --filter ./delivery-platform-server type-check
pnpm --dir delivery-platform-web build
$env:LOCAL_TEST_ADMIN_PASSWORD = Read-Host '请输入本地模拟管理员密码'
$env:LOCAL_TEST_PM_PASSWORD = Read-Host '请输入本地模拟项目经理密码'
node scripts/local-test-server.mjs
```

本地模拟访问：

- 平台地址：`http://127.0.0.1:18080`
- 管理员账号：`admin`
- 模拟账号只用于页面开发，不是 NestJS/Prisma 种子账号；模拟密码也必须通过上述本地环境变量显式提供，仓库和真实环境均不提供默认密码。

本地 Docker 测试：

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
- [前端页面架构](docs/frontend-architecture.md)
- [前端业务流程](docs/frontend-business-flows.md)
- [前端重构实施规范](docs/frontend-architecture-refactored.md)
- [后端重构实施规范](docs/backend-architecture-refactored.md)
- [前端整体重构评审稿](docs/frontend-rebuild-review.md)
- [开发规范](docs/development.md)
- [部署运维](docs/deployment.md)
- [测试验收](docs/testing.md)
- [安全说明](docs/security.md)
- [开源依赖说明](docs/open-source.md)
- [直接依赖许可证清单](docs/open-source-dependencies.md)
- [开源准备清单](docs/open-source-readiness.md)
- [版本记录](docs/release.md)

## 开源与第三方组件

本项目引用了 Vue、Arco Design Vue、NestJS、Prisma、PDF.js、MinIO SDK 等开源组件。主要直接依赖和许可证说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、[docs/open-source.md](docs/open-source.md) 和 [docs/open-source-dependencies.md](docs/open-source-dependencies.md)。

项目正式公开前，需要由项目负责人确认最终开源许可证，并复核示例数据、服务器地址、客户信息、截图和密钥是否已经清理。

## 生产部署

生产发布采用 Git 拉取部署。代码推送到 GitHub 后，可以通过 GitHub Environment 自动 SSH 到服务器执行 `deploy-git.sh`；首次配置方式见 [部署运维](docs/deployment.md)。

也可以在服务器手动执行：

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

部署脚本会保留服务器独立的 `.env`、备份目录和 Docker 命名卷，并在数据库迁移前成对备份 MySQL 和 MinIO。迁移容器按固定顺序执行 schema、标准/知识内容、项目档案/文件/审核基础数据以及集成 Secret 迁移，并在全部只读严格校验通过后才启动 API 和 Worker。GitHub 部署成功后还会在部署锁内清理未被容器、当前/上一发布或 checksummed v3 备份引用的旧镜像；该清理不使用强制删除，也不清理 Docker volume。

## 贡献与安全

- 贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全说明见 [SECURITY.md](SECURITY.md)。
- 禁止提交 `.env`、生产备份、发布包、截图产物、本地测试日志和任何密钥。
