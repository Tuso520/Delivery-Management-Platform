# 交付管理平台

面向软件交付中心、项目实施团队和管理层的企业级交付管理系统。平台覆盖项目台账、项目档案、文件审核、交付标准、知识库、团队绩效、组织权限和系统配置，支持多国家、多币种、多语言的交付过程管控。

## 技术栈

- 前端：Vue 3、TypeScript、Arco Design Vue、Pinia、Vue Router、Vite、vue-i18n、Axios
- 后端：NestJS 11、TypeScript、Prisma 5、MySQL 8、Redis 7、MinIO
- 部署：Docker Compose、Nginx、Node.js 20、pnpm
- 测试：Vitest、Jest、本地模拟服务、Docker Compose 配置校验

## 核心功能

- 工作台：数据看板、我的待办、交付风险与关键指标。
- 项目管理：项目台账、项目档案、文件审核、工时日报、项目复盘。
- 标准与知识：交付流程、检查模板、档案模板、文档模板、知识库、工具中心、培训记录。
- 绩效与团队：目标绩效、技能评估、培训参与。
- 组织与权限：组织架构、用户管理、角色权限、细粒度权限控制。
- 系统设置：国家、币种汇率、语言翻译、通知审批、操作日志、备份存储、接口集成。

## 工程入口

- `delivery-platform-web/`：前端源码。
- `delivery-platform-server/`：后端源码、Prisma schema 和种子数据。
- `docker/`：数据库初始化和容器辅助配置。
- `scripts/`：本地模拟、Docker、发布包和部署脚本。
- `00_项目说明/` 至 `11_复盘归档/`：标准化项目文档，当前工程唯一有效文档入口。
- `DEPLOYMENT.md`：服务器 Git 拉取部署说明。

## 标准目录

- `00_项目说明/`：项目背景、工程总览、原始资料和标准流程入口。
- `01_产品设计/`：产品方案、模块边界、信息架构。
- `02_需求分析/`：需求规格、业务规则、验收口径。
- `03_UIUX设计/`：Arco Design 设计规范、页面体验与组件迁移记录。
- `04_技术设计/`：架构、数据、权限、API、集成设计。
- `05_代码实现/`：源码结构、模块清单、实现约定。
- `06_测试验收/`：测试计划、Docker 验收、本地模拟验收。
- `07_代码审查/`：代码审查记录和整改项。
- `08_安全性能/`：安全、漏洞、性能和数据保护。
- `09_部署运维/`：Git 部署、Docker 本地测试、数据保护、回滚。
- `10_最终交付/`：交付清单和发布说明。
- `11_复盘归档/`：流程复盘和后续改进。

## 本地模拟测试

```powershell
pnpm --dir delivery-platform-web build
node scripts/local-test-server.mjs
```

默认访问地址：

- 平台：http://127.0.0.1:18080
- 登录账号：`admin`
- 登录密码：`Admin@123456`

## Docker 本地测试

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
```

默认访问地址：

- 平台：http://delivery-platform.localhost:18080
- 健康检查：http://delivery-platform.localhost:18080/api/v1/health
- 后端直连：http://127.0.0.1:13000/api/v1/health

## 开发规范

开发和 AI 协作规范见 `AGENTS.md`。新增功能必须同步更新标准目录中的产品、需求、UI/UX、技术、测试、部署和交付文档。
