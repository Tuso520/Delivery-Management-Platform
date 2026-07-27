# 架构基础整改报告

> 历史整改快照：本文记录领域重构前的基础整改阶段。现行目录、页面和运行时边界以 [平台目标架构](platform-architecture.md) 及源码为准。

## 1. 范围与约束

本轮基于 `docs/architecture-analysis.md` 的审计结论实施基础整改，保持 Vue 3、TypeScript、Vite、Pinia、Vue Router、Arco Design Vue、NestJS、Prisma 和 MySQL 技术栈。

本轮没有进行业务领域目录整体迁移，没有删除 Prisma Model、Migration、权限逻辑或未知用途文件，没有改变金额、文件版本、审核和项目核心业务规则。文件统一上限为 500 MiB，采用请求流直传 MinIO；按当前决策不增加分片、断点续传或大文件专用上传协议。

## 2. 当前架构状态

### 2.1 前端

- `router` 负责路由声明和访问决策，Session 失效处理通过回调在 `main.ts` 组装，不再由 Request 静态导入 Router 或 User Store。
- `src/api/` 仍为统一接口入口；刷新 Token、草稿上传和下载分别只有一个请求实现，领域 API 通过委托复用。
- `src/store/` 为唯一 Pinia 目录；历史 `src/stores/` 已清除。
- `src/design-system/` 承载纯视觉和通用交互组件。
- `src/platform/permission/`、`src/platform/file-preview/`、`src/platform/status/`、`src/platform/ui/` 分别承载权限、文件预览、状态语义和 UI 安装能力。
- 页面仍位于 `src/views/`，本阶段未提前迁移到 `domains/`。

数据流保持：

```text
Route/View
  -> composable / Pinia / Vue Query
  -> src/api
  -> Request
  -> NestJS API
```

### 2.2 后端

- Controller 继续负责协议层，Service 负责业务规则，Prisma、Redis、MinIO 提供数据、缓存和对象存储。
- `ProjectAccessModule` 提供项目访问能力，Project、ProjectArchive 和 Review 不再通过 `forwardRef` 相互装配。
- 权限仍由后端最终校验；仅登录接口使用显式 `AuthenticatedOnly`，业务接口使用权限装饰器和数据范围校验。
- 操作日志统一经 `OperationLogService` 写入，自动关联请求 `traceId`；领域审计已写入时，全局审计不重复写入。
- 文件 Multipart 请求通过自定义 Multer Storage 流式写入 MinIO，应用进程不缓存完整文件。

数据流保持：

```text
HTTP Request
  -> trace context
  -> JWT / permission / data-scope guard
  -> Controller
  -> Domain Service
  -> Prisma / Redis / MinIO
  -> uniform response envelope
```

## 3. 已完成的问题整改

| 原问题 | 整改结果 |
| --- | --- |
| Router、Layout、User Store、Request 静态循环 | Request 与会话失效导航解耦，前端静态循环门禁为 0 |
| Project ↔ ProjectArchive、Project ↔ Review `forwardRef` | 抽出 `ProjectAccessModule`，后端 `forwardRef` 门禁为 0 |
| `components/business` 混放多类职责 | 迁入 `design-system` 和各 `platform/*` 边界，旧目录禁止重新出现 |
| 下载、草稿上传、角色列表、刷新 Token 重复 | 文件 API 与 Session API 单点实现；删除未用角色列表 API |
| 权限码与实际校验漂移 | REPLACE 同时校验上传和替换权限；项目归档统一使用 `project:archive` 和状态规则 |
| 审计双写、失败吞掉、trace 丢失 | 统一写入服务、请求内去重、成功审计失败时 fail closed、前端错误暴露 traceId |
| 文件上传内存风险 | 500 MiB 固定上限，流式写入 MinIO，失败和未认领对象执行清理 |
| 部门树缺少环检测 | 更新父部门时沿祖先链检测自身、后代和既有损坏环 |
| 27 个历史 Prisma Model 无生产调用 | 保留 Schema，新增显式清单和生产运行时 delegate 门禁 |
| pnpm、coverage、Node tsconfig、依赖文档漂移 | 修正构建许可结构、补 coverage、Node 类型范围、依赖和第三方事实 |
| Arco 和 PDF 大块 | Arco 改为实际组件注册及按需加载；普通 JS 单块门禁收紧至 500 KiB；PDF Worker 保持懒加载独立预算 |
| 真实 E2E 覆盖不足 | 增加标准、知识、审核、通知和受限角色权限矩阵，并接入部署 CI |

## 4. 已建立的自动门禁

- `scripts/check-architecture-boundaries.mjs`
  - 前端静态循环必须为 0；
  - 后端 `forwardRef` 必须为 0；
  - 生产代码不得使用 `memoryStorage`；
  - 领域代码不得绕过统一审计服务直接写 `OperationLog`；
  - 跨 API 文件重复的 Method + Path 必须为 0；
  - `components/business` 不得恢复；
  - 模板使用的 Arco 组件必须已注册。
- `scripts/check-web-bundle-budget.mjs`
  - 普通 `.js` 单文件不超过 500 KiB；
  - CSS 单文件不超过 450 KiB；
  - PDF Worker 等 `.mjs` 单文件不超过 1500 KiB；
  - 普通 JavaScript 总量不超过 2600 KiB。
- `scripts/check-prisma-runtime-boundaries.mjs`
  - 固定 27 个历史模型；
  - 模型必须保留在 Prisma Schema；
  - 生产 `src/` 不得重新调用对应 delegate。

## 5. 当前保留风险

1. `src/views/knowledge/index.vue`、`src/views/archive/index.vue` 等大型页面仍需按领域用例拆分；本轮没有执行大规模页面迁移。
2. PDF Worker 仍为约 1.38 MiB，但已与首屏预加载隔离；PDF 预览本身需要该运行时代码。
3. 500 MiB 单请求流式上传降低了应用内存风险，但仍受请求持续时间、反向代理超时、MinIO 吞吐和并发连接数约束。
4. 27 个历史 Prisma Model 仍增加 Schema 和迁移理解成本；物理清理必须另立数据治理任务。
5. 领域 Service 仍有跨域编排和大文件，下一阶段需要先抽契约再迁目录。

## 6. 下一阶段推荐目录

```text
delivery-platform-web/src/
  domains/
    project/
    archive/
    standard/
    knowledge/
    tool-center/
    setting/
    user/
  platform/
    permission/
    notification/
    approval/
    file-preview/
    workflow/
    ui/
  shared/
  design-system/

delivery-platform-server/src/
  domains/
    project/
    archive/
    standard/
    knowledge/
    tool-center/
    setting/
    user/
  platform/
    permission/
    notification/
    approval/
    file/
    workflow/
    audit/
  shared/
  infrastructure/
```

## 7. 迁移优先级

1. P0：权限目录、后端权限装饰器和权限矩阵生成同一事实源。
2. P0：审计事件契约、领域审计 adapter 和失败补偿观测。
3. P1：先拆知识、档案和项目大型页面的 composable、表格、表单与对话框。
4. P1：将 Review 的跨域 Prisma 分支替换为领域 adapter。
5. P2：迁移文件、通知、审批和工作流到平台能力目录。
6. P2：按领域逐个迁移 API、类型、Store 和页面；每次只迁一个闭环。
7. P3：在 Migrator、备份、计数、外键和回滚验证完成后，另案评审历史表物理清理。

每一优先级都应保持 API 契约、权限结果和业务状态机不变，并先增加契约测试，再移动目录。

## 8. 最终验证实绩

- 前端：只读 ESLint、Vue TypeScript、生产构建和体积预算 PASS；Vitest 42 个套件、193 个用例 PASS。
- 后端：只读 ESLint 0 error（38 个既有 `console` warning）、TypeScript 和 Nest 编译 PASS；Jest 74 个套件、528 个用例 PASS。
- 架构门禁和 27 个 Prisma 历史模型运行时边界门禁 PASS。
- 隔离真实依赖环境：Nest API E2E 3/3、Playwright API 2/2、Chromium 关键 UI 场景 4/4、运行时一致性校验 PASS；全部应用和数据容器重启次数为 0。
- 本机环境门禁 FAIL：Node.js 24.14.0、pnpm 11.9.0 与固定版本不一致，脚本不能直接发现 WSL Docker Compose。
- 本机 Dockerfile 冷构建 PASS：前端、后端和迁移镜像均在 Node 20、pnpm 10.34.4 下从当前源码构建完成。
