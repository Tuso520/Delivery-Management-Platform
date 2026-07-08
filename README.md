# 交付管理平台

交付管理平台是面向软件交付中心、项目经理、专业工程师、采购、财务、HSE 和标准管理员的企业级交付过程管理系统。平台围绕项目台账、项目档案、文件审批、交付流程、检查模板、文档模板、知识库、绩效和组织权限，帮助团队把交付资料、流程标准、审批记录和项目风险统一管理起来。

## 核心功能

- 项目台账：维护项目状态、国家、项目类型、风险等级、交付阶段、合同金额和项目成员。
- 项目档案：按交付一级流程生成档案目录，提供上传说明、文件审批、版本留痕和在线预览。
- 标准与知识：管理知识库、文档模板、档案模板、交付流程、检查模板和工具中心。
- 在线预览：支持 PDF、Word、Excel、PowerPoint、图片和 Markdown 的只读预览。
- 权限体系：按角色和权限点控制菜单、按钮、接口和项目数据访问范围。
- 部署体系：支持本地模拟测试、本地 Docker 测试和服务器 Git 拉取部署。

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Pinia、Vue Router、Arco Design Vue、Axios。
- 后端：NestJS 11、TypeScript、Prisma 5、MySQL 8、Redis 7、MinIO。
- 运行环境：Docker Compose、Nginx、Node.js 20、pnpm。
- 质量检查：TypeScript 类型检查、前端生产构建、Prisma 受保护迁移、浏览器真实验证。

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
node scripts/local-test-server.mjs
```

本地模拟访问：

- 平台地址：`http://127.0.0.1:18080`
- 管理员账号：`admin`
- 管理员密码：`Admin@123456`

本地 Docker 测试：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
```

## 文档入口

- [文档总览](docs/README.md)
- [产品说明](docs/product.md)
- [技术架构](docs/architecture.md)
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

生产发布采用 Git 拉取部署。代码推送到 GitHub 后，在服务器执行：

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

部署脚本会保留服务器独立的 `.env`、备份目录和 Docker 命名卷，并在数据库迁移前备份 MySQL 和 MinIO。

## 贡献与安全

- 贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全说明见 [SECURITY.md](SECURITY.md)。
- 禁止提交 `.env`、生产备份、发布包、截图产物、本地测试日志和任何密钥。
