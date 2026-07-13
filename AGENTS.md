# 交付管理平台工程协作规范（AGENTS.md）

本文是交付管理平台的工程协作入口。所有 AI 或人工改动都必须以源码、`docs/` 文档和本文件为准，不再维护历史编号阶段目录。

## 项目身份

- 名称：交付管理平台。
- 英文名：Delivery Management Platform。
- 定位：面向软件交付中心、项目经理、专业工程师、采购、财务、HSE 和标准管理员的企业级交付管理系统。
- 范围：工作台、项目台账、项目档案、档案模板、统一文件与审核、标准库、知识库、工具中心、组织权限、系统设置和通知集成。
- 部署：本地使用模拟服务或 Docker Compose 测试，生产使用 Git 拉取部署。

## 技术栈

```text
前端：Vue 3 + TypeScript + Vite + Pinia + Vue Router + Arco Design Vue
后端：NestJS 11 + TypeScript + Prisma 5 + MySQL 8
缓存：Redis 7
存储：MinIO，兼容 S3 协议
运行：Docker / Docker Compose + Nginx + Node.js 20 + pnpm
```

## 全局工程规则

1. 后端必须做最终权限校验，前端权限只用于界面展示。
2. API 成功响应统一为 `{ code, message, data, timestamp }`，异常响应由全局过滤器输出。
3. 金额必须保存原币种、原金额、汇率、折算币种、折算金额和汇率日期。
4. 文件实体存储在 MinIO，数据库只保存索引、版本、审批和预览元数据。
5. 国家、币种、语言、项目类型、档案模板、检查模板和审批规则必须配置化。
6. 合同查看、成本查看、文件下载、权限变更、备份下载等敏感操作必须写入操作日志。
7. 核心业务数据默认软删除；项目物理删除仅限超级管理员，且文件、审核、财务或审计任一存在即拒绝并记录失败审计。
8. 公共组件、Service、DTO 和工具函数优先复用，避免复制业务逻辑。
9. TypeScript 严格模式下禁止新增无约束 `any`。
10. 文档只维护在 `README.md`、`DEPLOYMENT.md`、`CONTRIBUTING.md`、`SECURITY.md`、`THIRD_PARTY_NOTICES.md`、`CHANGELOG.md` 和 `docs/`。
11. 标准版本只允许统一 `FileVersion` 作为正文；知识版本必须在 FILE、MARKDOWN、LINK 中严格选择一个主内容源，支持文件必须显式提交完整集合。
12. 生产升级固定执行 schema migration、三个数据 migrator 的 dry-run/apply/只读 verify 和二次幂等 seed；旧迁移源不得重新接入运行时双读或双写。

## 目录结构

```text
delivery-platform-server/src/
  common/
  config/
  database/
  modules/

delivery-platform-web/src/
  api/
  components/
  composables/
  layouts/
  locales/
  router/
  store/
  styles/
  types/
  utils/
  views/
```

新增后端模块必须包含 module、controller、service、DTO、权限装饰器和必要测试。Controller 只处理协议层，业务逻辑放在 Service。

前端页面使用 Vue 3 `<script setup lang="ts">`。业务 API 只能通过 `src/api/` 调用，禁止在页面中拼接重复请求逻辑。

## Arco Design 规范

1. 全局只使用 `@arco-design/web-vue` 作为 UI 组件库。
2. 页面表格优先使用 `BusinessTable`；声明式 `a-table-column` 不得直接放入 `a-table`。显式 `columns` 数组可直接使用 Arco Table。筛选区使用 `a-form`、`a-input`、`a-select`、`a-range-picker`。
3. 弹窗使用 `a-modal`，抽屉使用 `a-drawer`，确认类操作使用 `Modal.confirm`。
4. 提示使用 `Message` 或 `Notification`，不再引入旧组件库提示、弹窗和标签组件。
5. 主布局保持工作台式密度，不做营销化视觉。
6. 按钮文字、选择框占位、表格标题必须是可读中文或配置化文案，禁止提交乱码。

## 测试要求

提交前按影响范围执行：

```powershell
pnpm --dir delivery-platform-web lint
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --filter ./delivery-platform-server lint
pnpm --filter ./delivery-platform-server type-check
pnpm --filter ./delivery-platform-server test
pnpm --filter ./delivery-platform-server build
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q
```

涉及页面、登录、知识库、标准、项目台账、项目档案、文件预览或上传审批时，必须连接真实 NestJS、MySQL、Redis 和 MinIO 做浏览器验证。`scripts/local-test-server.mjs` 只用于页面开发，不能替代权限、数据范围或事务验收。

## Git 与部署

- 主分支：`main`。
- 提交格式：Conventional Commits，例如 `docs(project): update Chinese documentation`。
- 推送目标：`origin/main`。
- 禁止提交 `.env`、密钥、Token、数据库备份、发布包、截图产物和本地测试日志。
- README、示例配置和种子说明不得写入可直接使用的默认密码；所有环境的初始化密码只能通过显式环境变量注入，缺失、空白和占位值必须 fail fast，既有账号默认不得自动重置密码。
- 生产部署采用 Git 拉取部署，流程见 `docs/deployment.md`。

## 标准开发流程

1. 产品设计：确认目标用户、业务目标和模块边界。
2. 需求分析：拆分功能、权限、数据和验收标准。
3. UI/UX 设计：确定页面布局、组件规范、状态和异常体验。
4. 技术设计：定义 API、数据模型、权限、集成和部署影响。
5. 代码实现：前后端同步开发，保持类型和响应契约一致。
6. 测试验收：执行单元测试、构建、模拟服务、Docker 配置和关键页面验证。
7. 代码审查：检查 bug、漏洞、冗余、乱码和未用依赖。
8. 安全性能：检查鉴权、日志、文件、数据保护和性能风险。
9. 部署运维：更新部署、回滚、备份和迁移说明。
10. 最终交付：更新交付说明并推送 GitHub。
11. 复盘归档：记录问题、整改和后续优化。

## 文档优先级

1. `AGENTS.md`
2. `docs/frontend-architecture-refactored.md`
3. `docs/backend-architecture-refactored.md`
4. `README.md`
5. `docs/product.md`
6. `docs/architecture.md`
7. `docs/development.md`
8. `docs/deployment.md`
9. `docs/testing.md`
10. `docs/security.md`
11. `docs/frontend-architecture.md`
12. `docs/frontend-business-flows.md`
13. `docs/ui-ux.md`
14. `docs/open-source.md`
15. 用户当前消息

如果代码与文档不一致，先按代码核实实际行为，再同步修正文档。

`docs/frontend-rebuild-review.md` 是非规范性讨论稿，不参与上述事实与工程规则优先级；其中条目只有在形成正式决策并同步到对应规范或源码后才有约束力。
