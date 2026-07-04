# AGENTS.md - 交付管理平台

本文是交付管理平台的工程协作规范。所有 AI 或人工改动都必须以本文件和标准目录为准，不再引用旧 `docs/` 目录。

## 项目身份

- 名称：交付管理平台，Delivery Management Platform。
- 定位：面向软件交付中心的企业级项目交付管理系统。
- 范围：项目、档案、文件审核、交付标准、知识库、团队绩效、组织权限、系统配置。
- 特性：多国家、多币种、多语言、Docker 本地测试、Git 推送服务器部署。

## 技术栈

```text
前端：Vue 3 + TypeScript + Arco Design Vue + Pinia + Vue Router + Axios + Vite + vue-i18n
后端：NestJS 11 + TypeScript + Prisma 5 + MySQL 8
缓存：Redis 7
存储：MinIO，兼容 S3 协议
部署：Docker / Docker Compose + Nginx
测试：Vitest + Jest + 本地模拟服务
包管理：pnpm
```

## 全局工程规则

1. 后端必须做最终权限校验，前端权限只用于界面展示。
2. API 成功响应统一为 `{ code, message, data, timestamp }`，异常响应由全局过滤器统一输出。
3. 金额必须保存原币种、原金额、汇率、折算币种、折算金额、汇率日期。
4. 文件实体存储在 MinIO，数据库只保存索引、版本、审核和预览相关元数据。
5. 国家、币种、语言、项目类型、档案模板、检查模板、审批规则必须配置化。
6. 合同查看、成本查看、文件下载、权限变更、系统备份下载等敏感操作必须写入操作日志。
7. 核心业务数据默认软删除，不做物理删除。
8. 公共组件、Service、DTO、工具函数应复用，不复制粘贴业务逻辑。
9. TypeScript 严格模式下禁止新增无约束 `any`。
10. 文档只维护在 `00_项目说明/` 至 `11_复盘归档/` 标准目录。

## 后端结构

```text
delivery-platform-server/src/
  main.ts
  app.module.ts
  common/
    decorators/
    filters/
    guards/
    interceptors/
    pipes/
  config/
  database/
  modules/
    auth/
    user/
    role/
    permission/
    project/
    project-member/
    project-payment/
    process/
    archive-template/
    project-archive/
    file/
    attachment/
    review/
    checklist/
    workflow/
    template/
    knowledge/
    tool/
    dashboard/
    notification/
    country/
    currency/
    language/
    operation-log/
    system-config/
```

后端新增模块必须包含 module、controller、service、DTO、权限装饰器、Swagger 注解和必要测试。Controller 只处理协议层，业务逻辑放在 Service。

## 前端结构

```text
delivery-platform-web/src/
  api/
  assets/
  components/
  composables/
  layouts/
  router/
  store/
  styles/
  types/
  utils/
  views/
    dashboard/
    project/
    archive/
    checklist/
    workflow/
    template/
    knowledge/
    tools/
    performance/
    organization/
    system/
  locales/
```

前端页面使用 Vue 3 `<script setup lang="ts">`。业务 API 只通过 `src/api/` 调用，禁止在页面中直接拼接重复请求逻辑。

## Arco Design 规范

1. 全局只使用 `@arco-design/web-vue` 作为主 UI 组件库。
2. 表格使用 `a-table`，筛选区使用 `a-form`、`a-input`、`a-select`、`a-range-picker`。
3. 弹窗使用 `a-modal`，抽屉使用 `a-drawer`，确认类操作使用 `Modal.confirm`。
4. 提示使用 `Message` 或 `Notification`，不引入旧组件库的提示、弹窗和标签组件。
5. 主布局使用侧边导航和顶栏，页面主体保持工作台式密度，不做营销化视觉。
6. 所有按钮文字、选择框占位、表格标题必须是可读中文或配置化文案，禁止提交乱码。

示例：

```vue
<template>
  <a-table :data="projectList" :loading="loading" row-key="id">
    <template #columns>
      <a-table-column title="项目编号" data-index="projectCode" :width="160" />
      <a-table-column title="项目名称" data-index="projectName" />
      <a-table-column title="操作" :width="180">
        <template #cell="{ record }">
          <a-button type="text" @click="handleEdit(record)">编辑</a-button>
        </template>
      </a-table-column>
    </template>
  </a-table>
</template>
```

## API 规范

- 路径前缀：`/api/v1`。
- 鉴权：JWT Bearer Token。
- 权限：RBAC + 细粒度 permission code。
- 分页参数：`page`、`pageSize`。
- 非 CRUD 动作用子资源或动词后缀，例如 `/files/:id/review`。
- 前端 Axios 封装位于 `delivery-platform-web/src/api/request.ts`。
- 后端响应包装位于 `delivery-platform-server/src/common/interceptors/transform.interceptor.ts`。

## 数据库规范

- Prisma 模型字段使用 camelCase，数据库字段使用 snake_case 和 `@map`。
- 所有核心表包含 `createdAt`、`updatedAt`，核心业务数据包含 `deletedAt`。
- 查询核心数据时默认过滤 `deletedAt: null`。
- 密码只存 bcrypt 哈希。
- 操作日志、文件版本、审批动作、通知记录不得随业务更新被覆盖。

## 测试规范

提交前至少执行：

```powershell
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --dir delivery-platform-server type-check
pnpm --dir delivery-platform-server test
pnpm --dir delivery-platform-server build
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q
```

涉及页面、登录、知识库、文件预览、上传流程时，还必须启动 `scripts/local-test-server.mjs` 做本地模拟验证。

## Git 规范

- 主分支：`main`。
- 提交格式：Conventional Commits，例如 `docs(project): standardize engineering docs`。
- 推送目标：`origin/main`。
- 禁止提交 `.env`、密钥、Token、数据库备份和构建产物。
- 发布到服务器采用 Git 拉取部署，部署流程见 `09_部署运维/Git推送部署与数据保护方案.md`。

## 标准流程

每个需求按以下顺序闭环：

1. 产品设计：确认目标用户、业务目标、模块边界。
2. 需求分析：拆分功能、权限、数据、验收标准。
3. UI/UX 设计：确定页面布局、组件规范、状态和异常体验。
4. 技术设计：定义 API、数据模型、权限、集成、部署影响。
5. 代码实现：前后端同步开发，保持类型和响应契约一致。
6. 测试验收：单元、构建、模拟服务、Docker 配置和关键页面验证。
7. 代码审查：检查 bug、漏洞、冗余、乱码、未用依赖。
8. 安全性能：检查鉴权、日志、文件、数据保护和性能风险。
9. 部署运维：生成部署、回滚、备份和迁移说明。
10. 最终交付：更新交付清单并推送 GitHub。
11. 复盘归档：记录问题、整改和后续优化。

## 文档优先级

1. `AGENTS.md`
2. `00_项目说明/项目总览.md`
3. `01_产品设计/产品方案.md`
4. `02_需求分析/需求规格说明书.md`
5. `04_技术设计/技术架构说明.md`
6. 用户当前消息

如果代码与文档不一致，必须先按代码核实实际行为，再同步修正文档。
