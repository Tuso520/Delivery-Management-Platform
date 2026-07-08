# Delivery Management Platform

企业级交付管理平台，面向软件交付中心、项目经理、专业工程师、采购、财务、HSE 与标准管理员，覆盖项目台账、项目档案、文件审批、交付流程、检查模板、文档模板、知识库、绩效与组织权限等流程。

## Features

- 项目台账：项目状态、国家、类型、风险、阶段、合同金额与成员管理。
- 项目档案：按交付一级流程生成档案目录，支持上传指导、文件审批、版本留痕和在线预览。
- 标准与知识：知识库、文档模板、档案模板、交付流程、检查模板与工具中心。
- 在线预览：支持 PDF、Word、Excel、PowerPoint、图片和 Markdown 的只读预览。
- 权限体系：基于角色与权限点控制菜单、按钮、接口和项目数据访问。
- 部署体系：Docker Compose 本地测试、Git 拉取生产部署、数据库和 MinIO 数据保护。

## Tech Stack

- Frontend: Vue 3, TypeScript, Vite, Pinia, Vue Router, Arco Design Vue, Axios.
- Backend: NestJS 11, TypeScript, Prisma 5, MySQL 8, Redis 7, MinIO.
- Runtime: Docker Compose, Nginx, Node.js 20, pnpm.
- Quality: TypeScript type check, Vite production build, Prisma guarded migration, browser regression screenshots.

## Repository Layout

```text
.
├── .github/                  # GitHub Actions workflow definitions
├── delivery-platform-web/     # Vue frontend application
├── delivery-platform-server/  # NestJS backend, Prisma schema, seed data
├── docker/                    # Container helper configuration
├── docs/                      # Product, architecture, development and operations docs
├── scripts/                   # Local test, Docker and release helper scripts
├── deploy-git.sh              # Git based production deployment
├── docker-compose.yml         # Production-like compose entry
├── docker-compose.test.yml    # Local Docker test compose entry
├── DEPLOYMENT.md              # Deployment quick entry
└── README.md
```

Historical phase documents have been consolidated into `docs/` for a cleaner GitHub-style project structure.

## Quick Start

```powershell
pnpm --filter ./delivery-platform-server type-check
pnpm --dir delivery-platform-web build
node scripts/local-test-server.mjs
```

Local mock URL:

- Platform: `http://127.0.0.1:18080`
- Admin account: `admin`
- Admin password: `Admin@123456`

Docker local test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
```

## Documentation

- [Documentation Index](docs/README.md)
- [Product Overview](docs/product.md)
- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Deployment Guide](docs/deployment.md)
- [Testing Guide](docs/testing.md)
- [Security Guide](docs/security.md)
- [Release Notes](docs/release.md)

## Production Deployment

Production deployment is Git based. Push to GitHub, then run on the server:

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

The deployment script keeps server-only `.env`, backups and Docker named volumes outside Git, and creates MySQL plus MinIO backups before migrations.

## Current Verified Environment

- Production URL: `http://42.193.176.248:8080`
- Latest verified release: `1df2a618471e`
- Verification date: `2026-07-08`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). Do not commit `.env`, production backups, release bundles, browser screenshots or local test artifacts.
