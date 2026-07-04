# 交付管理平台

面向跨国家交付团队的项目、档案、流程、知识、绩效和组织权限管理系统。

## 技术栈

- 前端：Vue 3、TypeScript、Element Plus、Pinia、Vue Router、Vite
- 后端：NestJS 10、TypeScript、Prisma 5.22.0
- 数据：MySQL 8、Redis 7、MinIO
- 部署：Docker Compose、Nginx、Node 20、pnpm 10.34.4

## 当前信息架构

- 工作台
- 项目管理
- 标准与知识
- 绩效与团队
- 组织与权限
- 系统设置

## 标准目录

- `00_项目说明/`：项目背景、目标和入口说明
- `01_产品设计/`：产品范围和模块说明
- `02_需求分析/`：业务规则、状态流转和验收口径
- `03_UIUX设计/`：界面规范和交互要求
- `04_技术设计/`：架构、数据、权限和部署设计
- `05_代码实现/`：源码索引，实际源码保留在根目录稳定路径
- `06_测试验收/`：测试命令、验收清单和 Docker 验收记录
- `07_代码审查/`：代码审查记录
- `08_安全性能/`：安全和性能检查记录
- `09_部署运维/`：本地 Docker、生产部署、回滚和健康检查说明
- `10_最终交付/`：交付清单和发布物说明
- `11_复盘归档/`：复盘和可复用组件沉淀

## 工程入口

- `delivery-platform-web/`：前端源码
- `delivery-platform-server/`：后端源码、Prisma 和种子数据
- `docker/`：数据库初始化
- `docs/`：当前有效文档
- `docker-compose.test.yml`：本地 Docker 测试环境
- `docker-compose.prod.yml`、`docker-compose.yml`、`deploy.sh`：生产部署入口
- `scripts/local-docker.ps1`：Windows 本地 Docker 启停脚本
- `scripts/package-release.sh`、`scripts/package-release.ps1`：发布包生成脚本

## 本地 Docker 测试

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
```

访问地址：

- 平台：`http://delivery-platform.localhost:18080`
- 后端健康检查：`http://delivery-platform.localhost:18080/api/v1/health`
- 后端直连调试：`http://127.0.0.1:13000/api/v1/health`

本地测试环境使用 `.env.local`，不会覆盖生产 `.env`。

开发规范见 [AGENTS.md](AGENTS.md)，文档索引见 [docs/README.md](docs/README.md)，手动部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。
