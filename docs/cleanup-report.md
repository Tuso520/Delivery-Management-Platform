# 基础清理报告

## 1. 清理范围

清理日期：2026-07-26。

本次只处理满足以下全部条件的内容：

1. 位于项目根目录内。
2. 不涉及 `.env*`、业务数据、权限逻辑、数据库结构或部署密钥。
3. 已经过全项目路径、导入和导出符号搜索。
4. 没有生产、测试、配置、脚本或文档约束引用。
5. 删除或归位不会改变业务行为。

清理前已记录并保护工作树中既有的 README、CHANGELOG、架构文档和脚本改动；本次没有覆盖这些既有改动。

## 2. 已删除文件

| 文件 | 删除原因 | 引用确认 | 影响范围 |
| --- | --- | --- | --- |
| `delivery-platform-web/components.d.ts` | 仅 1 字节空行；没有组件自动导入配置；位于前端 tsconfig include 范围外 | 路径搜索 0 引用 | 无运行时和类型影响 |
| `delivery-platform-web/src/types/file.ts` | 只导出旧 `UploadedFile` 接口，前端已经使用统一文件/领域文件类型 | `UploadedFile` 在前端只命中该文件自身；无静态或动态导入 | 删除 1 个废弃类型文件 |
| `delivery-platform-web/src/utils/menu-icons.ts` | 旧菜单图标名称到 Arco Icon 的适配已不再使用；当前侧栏使用现有图标资源 | `resolveMenuIcon` 和文件路径只命中自身 | 不影响 Router、菜单或布局 |
| `delivery-platform-server/src/common/utils/index.ts` | 六个通用导出均无调用；实际代码直接使用 Node/领域实现 | 文件静态入度为 0；`generateUUID`、`generateProjectCode`、`md5Hash`、`calculateTotalPages`、`formatDate`、`delay` 均只命中自身 | 不影响相邻的 `request-trace.util.ts` |

删除文件共 4 个，删除源码约 114 行，均可从 Git 历史恢复。

## 3. 已归位文件

| 原路径 | 新路径 | 原因 | 验证 |
| --- | --- | --- | --- |
| `delivery-platform-web/src/stores/__tests__/user.spec.ts` | `delivery-platform-web/src/store/__tests__/user.spec.ts` | 实际 Store 目录一直是 `store/`；复数目录只残留这一份测试 | 目标无同名文件；测试只使用 `@/` 导入；Vitest 的 `src/**/*.spec.ts` 在移动前后均可发现 |

该操作消除了 `store/stores` 混用，没有修改测试内容。

## 4. 已删除空目录

以下目录删除前均再次确认条目数为 0：

- `.agents`
- `.codex-tmp`
- `delivery-platform-web/src/stores/__tests__`
- `delivery-platform-web/src/stores`

空目录没有数据可恢复；如后续工具需要可直接重建。

## 5. 删除前的全局确认

使用排除 `.env*`、`node_modules`、`dist`、`coverage`、`.git` 和 `.ai-work` 的全局搜索确认：

- `UploadedFile` 的前端命中只有已删除类型文件。
- `resolveMenuIcon` 的命中只有已删除工具文件。
- 后端 `common/utils/index.ts` 没有路径导入。
- 该文件六个导出没有调用；搜索到的同名格式化函数是其他文件内的独立实现。
- 仓库不存在 `src/stores` 或 `@/stores` 路径引用。
- 目标 `src/store/__tests__/user.spec.ts` 在移动前不存在。

同时使用静态 import 图从前端 `main.ts` 和后端 `main.ts`/Worker 入口遍历，四个删除文件均不可达。

## 6. 明确保留内容

以下内容虽然表现为零文本引用或本地产物，但用途不满足“明确无价值”，本次没有删除：

| 内容 | 保留原因 |
| --- | --- |
| `.ai-work` | 包含本地视觉验收截图、PR 草稿和嵌套验证副本，属于现有用户资产 |
| `node_modules`、`dist` | 分别用于本轮验证和本地构建；均被 Git 忽略 |
| `FormGrid`、`FormSection`、`ReadonlyField` | 当前生产零调用，但高优先级前端规范明确有后续用途 |
| 18 个零生产调用 API 成员 | 对应真实后端接口或测试契约，可能是尚未接入 UI 的能力 |
| 27 个无生产 delegate 调用的 Prisma Model | 包含迁移源、历史数据和未来域；禁止在本阶段删表 |
| `UnifiedFileService.exists`、FileStorage 默认桶包装方法 | 静态零调用，但属于公开 Service 表面，留待服务拆分时统一处理 |
| 零调用的局部导出工具函数 | 所在文件仍被使用，当前删除收益很小，留待行为测试更完整时处理 |
| `@vueuse/core`、`md-editor-v3`、`photoswipe`、`@pinia/testing` | 零源码引用，但移除需要同步锁文件、Vite 分包、第三方声明和开源文档 |
| 手工质量、验收、Redis 模拟和运维脚本 | 具有独立命令入口语义，不能按仓库文本入度删除 |
| 文件、审核、权限和迁移测试 | 均有当前契约或安全回归用途，没有无效测试文件 |

本次没有删除业务页面、Controller、Service、DTO、权限码、Migration、Prisma Model、Seed、二进制知识库种子或未知用途文件。

## 7. 验证结果

### 7.1 前端

为满足不读取 `.env*` 的约束，未直接执行会自动发现环境文件的普通 Vite CLI 构建。实际构建通过 Vite API 显式传入 `envDir: false`，仍加载项目 `vite.config.ts` 并生成真实 `dist`。

| 验证项 | 实际命令 | 结果 | 退出码 | 耗时 |
| --- | --- | ---: | ---: | ---: |
| TypeScript | `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit` | PASS | 0 | 39.169 秒 |
| ESLint | `node node_modules/eslint/bin/eslint.js --ext .vue,.ts src/` | PASS | 0 | 24.384 秒 |
| Build | `node --input-type=module -e "import { build } from 'vite'; await build({ envDir: false })"` | PASS | 0 | 21.804 秒 |

构建事实：

- Vite 版本：5.4.8。
- 转换模块：1,463 个。
- Vite 自报构建耗时：19.95 秒。
- 已生成 `dist/build-info.json`，`releaseId` 为 `development`。
- `dist` 被 Git 忽略，没有新增跟踪文件。

非阻断构建警告：

- `src/store/user.ts` 同时被静态和动态导入，动态导入无法形成独立 chunk。
- `vendor-arco` 为 788.80 kB，gzip 222.53 kB。
- PDF worker 为 1,417.59 kB。
- 两项体积均触发大 chunk 提示，但构建真实退出码为 0。

### 7.2 后端

后端只执行编译，不启动 Nest 应用，因此不会实例化 `ConfigModule` 或读取运行时环境文件。

| 验证项 | 实际命令 | 结果 | 退出码 | 耗时 |
| --- | --- | ---: | ---: | ---: |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | PASS | 0 | 23.695 秒 |
| Nest 编译 | `node node_modules/@nestjs/cli/bin/nest.js build` | PASS | 0 | 23.643 秒 |

编译器没有错误输出。

### 7.3 未执行项

本轮用户指定的五项检查全部执行并通过。未额外执行单元测试、E2E、Prisma、数据库、Redis、MinIO 或 Docker 命令；这些不属于本轮明确要求，且真实环境验收会扩大运行范围。

## 8. 清理后的结果

- 删除文件：4 个。
- 文件归位：1 个，内容未改。
- 删除空目录：4 个。
- 前端 TypeScript、ESLint、Build：全部 PASS。
- 后端 TypeScript、Nest Build：全部 PASS。

## 9. 整改阶段最终补充

- 删除 4 个明确冗余源码/契约文件；其余组件路径调整均为移动，不是业务功能删除。
- 测试完成后删除项目内 Chromium 二进制、Playwright 失败报告、4 个临时编排文件，并销毁隔离 Compose 项目的容器、网络和数据卷。
- 前端最终结果：ESLint、TypeScript、Build、体积预算、42 个 Vitest 套件/193 个用例全部 PASS。
- 后端最终结果：ESLint 0 error、TypeScript、Nest Build、74 个 Jest 套件/528 个用例全部 PASS。
- 真实依赖结果：Nest API 3/3、Playwright API 2/2、Chromium UI 4/4、运行时一致性检查全部 PASS。
- 本机版本前置门禁为真实 FAIL；Dockerfile 冷构建已 PASS，原因及边界见 `docs/testing.md` 和 `docs/architecture-remediation-report.md`。
- 业务逻辑、权限逻辑、API 路由、Prisma Schema、Migration：无修改。
- `.env*`：未读取、未修改。

## 10. 后续基础整改补充

架构整改阶段继续完成了以下经引用扫描确认的基础清理。本节更新第 6 节中“暂不移除依赖”的历史判断，以本节为准：

| 内容 | 处理 | 原因与影响 |
| --- | --- | --- |
| `@vueuse/core` | 从前端依赖和锁文件移除 | 生产与测试源码均无引用 |
| `md-editor-v3` | 从前端依赖、Vite 分包和第三方文档移除 | 页面未使用该编辑器 |
| `photoswipe` | 从前端依赖、Vite 分包和第三方文档移除 | 文件预览已使用现有 Viewer/PDF/OpenSeadragon 路径 |
| `@pinia/testing` | 从前端开发依赖移除 | 测试未使用该辅助包 |
| `src/components/business/` | 内容按职责迁入 `src/design-system/` 和 `src/platform/` 后删除空旧目录 | 文件内容保留并更新全部引用，不属于业务功能删除 |

同时移除了已经确认未被调用的 `userApi.getAllRoles` 表面；后端角色能力和实际接口未删除。权限、数据库结构、Migration、27 个历史 Prisma Model 和未知用途文件仍全部保留。

## 11. 2026-07-26 总体重构后的清理复核

本轮在领域和平台单轨迁移完成后重新扫描 `src/`、测试、配置、脚本和文档引用，并排除 `node_modules`、`dist`、`coverage` 与 Git 元数据。

| 内容 | 处理 | 删除前证据 | 影响 |
| --- | --- | --- | --- |
| `delivery-platform-web/src/views/knowledge/` | 删除空目录 | Knowledge 页面迁入 `src/domains/knowledge/pages/` 后条目数为 0 | 无文件、不可恢复数据为 0 |
| `delivery-platform-web/src/views/project/components/` | 删除空目录 | `ProjectPaymentPlan.vue` 迁入 `src/domains/project/components/` 后条目数为 0 | 无文件、不可恢复数据为 0 |

本轮没有新增删除源文件。Knowledge、Archive、Project 以及 notification、approval、review、file 的旧路径在 Git 中表现为删除，但对应文件均为单轨移动到 `domains/` 或 `platform/`，不是功能删除；架构门禁会拒绝旧生产入口重新出现。

复核结果：

- 零字节源码：0。
- `.tmp`、`.bak`、`.old`、编辑器备份和明确临时文件：0。
- 完全重复文件组：0。
- 新增可确认无引用的生产文件：0。
- 27 个历史 Prisma Model：全部保留。
- Prisma schema 和 migration：本轮因审计补偿与异步 trace 新增结构，不能再沿用“数据库结构无修改”的旧阶段描述。
- 权限与业务行为：本轮实施了类型化权限契约、审计失败补偿和任务恢复，不能再沿用“权限/业务逻辑无修改”的旧阶段描述。

## 12. 最终验证与临时资源回收

- 前端 ESLint、TypeScript、Build、体积预算、42 个 Vitest 套件/193 个用例全部 PASS。
- 后端 ESLint 0 error、TypeScript、Nest Build、74 个 Jest 套件/528 个用例全部 PASS。
- 当前源码 Docker 冷构建 PASS；35 个 migration 在全新 MySQL 应用成功，`/ready` 的 MySQL、Redis、MinIO 全部为 `ok`。
- Nest 真实 API 3/3、Playwright API 2/2、干净数据库 Chromium UI 12/12 PASS。
- 本轮独立 Compose 项目的容器、网络、MySQL/Redis/MinIO 测试卷和 Playwright 临时报告已删除；不影响其他现有验收栈。
- 宿主 Node 24.14.0 / pnpm 11.9.0 版本门禁为真实 FAIL；容器使用项目锁定的 Node 20 / pnpm 10.34.4 并通过。
