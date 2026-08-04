# 交付管理平台最终架构

> 状态：本轮架构治理已完成。本文同时承载 2026-07-26 架构审计基线、阶段迁移记录、最终落地状态和后续维护规范；历史基线用于说明问题来源，最终事实以第 8 节为准。

## 1. 架构审计基线

### 1.1 已完成目标

- 技术栈已稳定为 Vue 3、TypeScript、Vite、Pinia、Vue Router、Arco Design Vue、NestJS、Prisma、MySQL、Redis 和 MinIO。
- 前端 Router、Layout、User Store、Request 的静态循环已解除，架构门禁持续检查循环依赖。
- 后端 Project、ProjectArchive、Review 的 `forwardRef` 循环已由 `ProjectAccessModule` 解除。
- `src/design-system/` 已承载通用视觉组件；`src/platform/permission`、`file-preview`、`status`、`ui` 已形成首批平台边界。
- 文件上传已改为固定 500 MiB 上限的请求流直传 MinIO；文件下载、草稿上传和 Refresh Token 已收敛为单一实现。
- 请求、响应、前端错误和操作日志已具备 `traceId` 关联；领域审计与全局审计具备请求内去重。
- 27 个无生产 delegate 调用的历史 Prisma Model 已建立保留清单和运行时禁止接回门禁，本阶段不删除表。
- 架构循环、重复 API、审计直写、历史 Prisma 运行时调用和前端体积预算已进入本地与 CI 门禁。

### 1.2 审计时进行中目标

- 权限种子目录是权限码和角色矩阵的主要来源，但 Controller 装饰器、前端路由、菜单、按钮和类型仍使用无约束字符串，缺少可验证的生成契约。
- `OperationLogService` 已统一落库并脱敏，Outbox 和文件处理任务已有重试、租约及终态；审计写入自身失败尚无独立补偿队列、恢复状态和运维查询入口。
- `src/platform/` 只完成权限、文件预览、状态和 UI 安装的局部迁移；notification、approval、file、workflow 尚未形成完整平台公开接口。
- Design System 已归位，但应用装配、领域代码、平台服务与共享工具仍同时存在于旧横向目录。

### 1.3 审计时未完成目标

- `src/domains/` 尚不存在。知识库、档案、项目仍由大型 `views/` 页面、全局 `api/`、横向 query composable、全局 `types/` 和领域工具共同实现。
- 知识库页面 1703 行；档案页面 1154 行、档案模板 1201 行；项目列表 1016 行、项目详情对话框 803 行。
- 页面仍承担查询编排、Mutation、权限展示、路由同步、DTO 构造和数据转换，尚未达到“页面只组合、Hook 管状态、Adapter 管转换”的目标。
- notification、approval、file、workflow 的前端入口与后端模块分散，业务模块仍直接依赖其内部 Service 或横向 API。
- 历史 Prisma 模型、旧字段、旧关系和兼容逻辑只有保留门禁，尚未形成逐项影响、迁移与回滚治理台账。
- 架构稳定后的无引用代码、重复导出和最终依赖精简尚未执行。

### 1.4 当前阻塞与约束

- 无需用户决策的功能阻塞。
- 实际 `.env`、`.env.local` 等敏感文件不读取、不修改；Vite 验证必须显式禁止环境文件自动加载。
- 当前工作树包含上一阶段尚未提交的架构治理改动，后续修改必须保留并在最终提交前整体审查。
- 数据库治理阶段只生成方案；没有明确迁移、备份、验证和回滚证据前不删除 Prisma Model、字段或表。
- 领域迁移保持单轨：迁移完成即删除旧入口，不建立长期双实现或双状态。

## 2. 执行顺序与验收

| 阶段 | 目标 | 完成证据 |
| --- | --- | --- |
| 权限统一 | 后端权限目录、角色矩阵、装饰器和 Guard 形成单一事实源；前端只消费受约束契约 | 权限契约门禁、角色矩阵测试、前后端类型检查 |
| 审计与可观测性 | 审计失败可补偿，任务失败可定位、重试和恢复 | 审计补偿测试、Outbox/File Job 状态测试、trace 契约 |
| Knowledge | 页面、组件、API、Hook、类型、Adapter 垂直归域 | 旧引用为 0、页面职责测试、类型/构建/真实浏览器 |
| Archive | 档案和档案模板垂直归域，共用平台文件与审批 | 文件/审批契约、类型/构建/真实 MinIO 验收 |
| Project | 项目列表、详情、付款与转换垂直归域 | 项目权限/状态机测试、类型/构建/真实浏览器 |
| 平台能力 | notification、approval、file、workflow 具备唯一公开入口 | 跨域重复实现门禁、平台模块测试 |
| Prisma 治理 | 历史模型逐项建立保留/迁移/废弃方案 | 治理台账、影响范围、迁移和回滚方案 |
| 精简交付 | 清理无引用内容并完成全量验证、部署、推送 | 清理报告、全量测试、部署检查、Git 提交和远端状态 |

## 3. 目标目录

```text
delivery-platform-web/src/
  app/
  domains/
    knowledge/
      pages/
      components/
      api/
      stores/
      hooks/
      types/
      adapters/
    archive/
      pages/
      components/
      api/
      stores/
      hooks/
      types/
      adapters/
    project/
      pages/
      components/
      api/
      stores/
      hooks/
      types/
      adapters/
  platform/
    permission/
    notification/
    approval/
    file/
    workflow/
    status/
    ui/
  design-system/
  shared/
```

```text
delivery-platform-server/src/
  common/
  config/
  database/
  domains/
  platform/
    permission/
    audit/
    notification/
    approval/
    file/
    workflow/
  modules/
```

后端采用渐进边界治理：先通过公开 Module 和 Service 接口明确平台依赖，再决定物理目录移动；不得为了目录外观批量改名而破坏 NestJS 模块装配、事务边界或生产迁移路径。

## 4. 依赖方向

```text
app -> domains -> platform -> shared
  |        |          |
  +------> design-system
```

- `shared` 不依赖业务领域、平台运行时或应用装配。
- `design-system` 不调用业务 API，不保存领域实体状态。
- `platform` 不依赖领域页面或领域内部组件。
- `domains` 只能通过平台公开入口使用权限、通知、审批、文件和工作流。
- `app` 只装配路由、Provider、Shell 和全局错误边界，不实现业务规则。
- 后端 Controller 只处理协议；权限、状态机、审计和事务由 Guard、领域 Service 与平台 Service 执行。

## 5. 数据流

```text
Route/Page
  -> Domain Hook / Store
  -> Domain API
  -> Platform HTTP
  -> NestJS Controller
  -> Permission and Data Scope
  -> Domain Service
  -> Prisma / Redis / MinIO
  -> Audit / Outbox / Task State
  -> { code, message, data, timestamp, traceId }
```

查询状态由 TanStack Query 管理；Pinia 只保存会话、权限、主题、语言等跨页面客户端状态。页面不得直接拼接 HTTP 请求、手工复制平台权限算法或把 DTO 转换逻辑散落在事件处理器中。

## 6. 迁移记录

| 日期 | 阶段 | 状态 | 说明 |
| --- | --- | --- | --- |
| 2026-07-26 | 架构状态审计 | 已完成 | 确认前端尚无 domains；Knowledge 1703 行、Archive 1154/1201 行、Project 1016/803 行；后端审计补偿、异步 trace、DEAD 恢复未完成；27 个历史模型运行时调用为 0 |
| 2026-07-26 | 权限统一 | 已完成 | 后端 86 个权限、16 个角色生成前后端类型契约；路由、菜单、首屏与按钮复用同一访问策略；契约漂移、类型检查、权限矩阵与 Controller 权限测试通过 |
| 2026-07-26 | 审计与可观测性 | 已完成 | 新增审计失败补偿表与 Worker 重试；事务审计提交后校验避免回滚漏记；审计异常不再覆盖业务结果或权限 403；Outbox/File Job 传播 traceId；提供失败查询及 DEAD 重入队接口 |
| 2026-07-26 | Knowledge / Archive / Project 领域化 | 已完成 | 页面、API、类型、查询按顺序单轨迁入 `src/domains`；Knowledge 内容校验与 payload 转换进入 Adapter；旧生产入口为 0 并由门禁阻止恢复 |
| 2026-07-26 | 平台能力边界 | 已完成 | notification、approval/review、file、file-preview、workflow 建立唯一前端入口；后端 Review source registry 移入 workflow 契约，FileModule 收窄为 ProjectAccessModule |
| 2026-07-26 | Prisma 历史治理 | 方案完成 | 27 个历史 Model、7 个旧字段和兼容关系形成分批迁移、验证、回滚台账；生产数据证据不足，物理删除保持阻塞 |

## 7. 后续维护规范

1. 后端权限目录和角色矩阵是授权事实源；前端仅使用生成并校验的权限码类型以及登录会话返回的授权结果。
2. 新增 Controller 必须声明权限要求或显式声明仅认证；无元数据端点不得进入生产。
3. 敏感成功和失败操作都必须形成可关联 `traceId` 的审计记录；审计基础设施失败必须进入可恢复状态，不能静默吞掉。
4. 领域页面只负责布局与组件组合；查询、Mutation 和路由同步进入 Hook，DTO 转换进入 Adapter。
5. notification、approval、file、workflow 只能通过平台公开入口调用，领域不得复制平台请求或状态机。
6. 历史 Prisma 结构先登记、迁移、验证、回滚，再物理清理；禁止运行时重新双读或双写旧源。
7. 删除前必须全局确认无静态、动态、脚本、配置、测试和文档约束引用，并记录到清理报告。
8. 每个迁移阶段至少执行只读 ESLint、TypeScript、相关单元测试和构建；涉及关键页面或文件能力时连接真实 NestJS、MySQL、Redis、MinIO 做浏览器验收。

## 8. 最终落地状态

### 8.1 当前架构

前端已从单一横向目录演进为“领域 + 平台 + 设计系统 + 共享层”的渐进架构：

- `domains/knowledge`、`domains/archive`、`domains/project` 分别拥有页面、API、类型、查询和 Adapter/组件，旧生产入口已删除，路由只指向新入口。
- `platform/permission` 统一路由、菜单、首屏、按钮与 `<Can>` 的访问策略；`platform/notification`、`approval`、`file`、`file-preview`、`workflow` 提供唯一平台入口。
- `design-system` 承载纯视觉和通用交互组件，不再与权限、业务状态和平台能力混放在 `components/business`。
- TanStack Query 管理服务端查询与 Mutation，Pinia 管理会话、权限和界面级全局状态；Router 通过懒加载 Layout 和纯权限策略解除与 Layout、User Store、Request 的静态循环。

后端保持 NestJS 模块结构，以渐进方式收紧公开边界：

- Controller 负责协议和权限声明，Guard 执行最终权限校验，Service 负责业务状态、数据范围、事务和审计。
- `ProjectAccessModule` 提供项目访问能力，解除 Project、ProjectArchive、Review 之间的 `forwardRef` 循环；File 只依赖项目访问公开模块。
- 权限种子的 86 个权限码和 16 个角色是生成契约的源码事实；后端装饰器、角色矩阵与前端权限类型由门禁校验，运行时授权仍以数据库和登录会话为准。
- 全局审计与领域审计通过请求上下文去重；审计写入失败进入 `AuditFailure` 补偿记录，Outbox、文件任务和补偿任务传播 `traceId`，运维接口可查询并重试终态失败。
- 文件统一为 500 MiB 上限并以请求流直传 MinIO，不在 NestJS 进程内聚合完整文件；本阶段按用户决定不引入分片或断点续传。
- 27 个历史 Prisma Model 继续保留且生产 delegate 调用为 0；运行时边界门禁阻止重新双读或双写，物理删除必须按 `docs/prisma-governance-plan.md` 取得生产数据证据后另行实施。

### 8.2 数据流与模块关系

```text
Vue Route
  -> Domain Page
  -> Domain Query / Adapter
  -> Domain or Platform API
  -> Request(traceId/session/refresh)
  -> NestJS Controller
  -> Permission Guard + Data Scope
  -> Domain Service + Prisma/Redis/MinIO
  -> AuditFailure / Outbox / FileProcessingJob
  -> { code, message, data, timestamp, traceId }
```

项目是档案、付款、成员和审核的数据范围根；档案与审核通过公开项目访问能力获取授权上下文。文件、审批、通知和工作流是跨领域平台能力，不再由页面或领域 API 复制实现。

### 8.3 已解决问题

1. 前端 Router、Layout、User Store、Request 静态循环为 0。
2. 后端 Project、ProjectArchive、Review `forwardRef` 循环为 0。
3. `components/business` 已按 design-system、permission、status、file-preview 等职责归位。
4. 文件下载、草稿上传、角色列表和 Refresh Token 的重复实现已收敛。
5. `archive:replace`、`project:archive` 等权限码进入生成契约，Controller、角色矩阵和前端访问策略受自动门禁约束。
6. 审计失败不再覆盖业务成功或权限 403；补偿、trace 传播和运维重试入口已落地。
7. 500 MiB 上传改为流式 MinIO 存储，避免按文件大小占用 Node 堆内存。
8. pnpm 构建许可占位、依赖清单、Node tsconfig、迁移计数和文档事实漂移已校正。

### 8.4 清理结果

- 明确删除 4 个无引用文件：`delivery-platform-web/components.d.ts`、`delivery-platform-web/src/types/file.ts`、`delivery-platform-web/src/utils/menu-icons.ts`、`delivery-platform-server/src/common/utils/index.ts`。
- 删除迁移后确认为空的 `delivery-platform-web/src/views/knowledge/` 和 `delivery-platform-web/src/views/project/components/`；其余旧路径删除均为单轨移动，不是业务功能删除。
- 移除确认无源码引用的 `@vueuse/core`、`md-editor-v3`、`photoswipe`、`@pinia/testing`，同步锁文件、Vite 分包和第三方依赖文档。
- 未删除业务功能、权限逻辑、数据库历史模型、Migration、Seed 或未知用途文件。

### 8.5 仍需后续治理的风险

1. 领域入口已经垂直拆分，但页面模板和局部状态仍大：Knowledge 1667 行、Archive 1157/1201 行、Project 1019 行、ProjectDetailDialog 806 行。下一轮应按列表区、筛选区、编辑器、预览区和状态协调器继续组件化，且先补行为测试。
2. PDF Worker 仍为 1,417.59 kB；普通最大 JavaScript 分块已降至 476.84 kB并通过预算，但 PDF 预览仍应按路由和文件类型延迟加载。
3. 当前开发机是 Node 24.14.0、pnpm 11.9.0，与正式基线 Node 20、pnpm 10.34.4 不同；本地轻量脚本可用于快速诊断，最终发布结论必须来自锁定版本的 CI。
4. 27 个历史 Prisma Model 只有运行时隔离和治理方案，没有生产数据核对证据，因此仍禁止物理删除。
5. 审计补偿和运维恢复接口已有单元/E2E 基础，但仍需生产告警、积压指标和故障演练。

### 8.6 最终验证

| 范围 | 结果 |
| --- | --- |
| 前端 ESLint | PASS，0 error / 0 warning |
| 前端 TypeScript | PASS |
| 前端 Vitest | PASS，44 套件 / 222 用例 |
| 前端生产 Build 与体积预算 | PASS，1,479 modules；105 assets；JavaScript 合计 2,135.7 KiB；PDF Worker 1,417.59 kB |
| 后端 ESLint | PASS，0 error；38 个既有 Seed/Verify `console` warning |
| 后端 TypeScript / Nest Build | PASS / PASS |
| 后端 Jest | PASS，74 套件 / 548 用例 |
| 权限、架构、Prisma、文档、Release 门禁 | PASS；86 权限、16 角色、前端循环 0、27 个历史 Model 生产调用 0、发布契约 20/20 |
| Release Shell / YAML 静态检查 | PASS；deploy/restore `bash -n`，5 个 workflow 与 2 个 v2 Compose YAML 可解析 |
| 本地视觉验收 | PASS，5/5；项目台账、项目档案、档案模板、项目弹窗已有三联对比，标准库缺少项目内设计参考图并明确标记 |
| Compose 配置 | PASS；基础、生产、测试、v2 数据和 v2 应用共 5 组 `config -q`，未启动容器 |
| v2 镜像构建 / 真实集成 E2E | PASS；Release `1192e3aa76db` 的后端、迁移镜像、前端包、Manifest、真实 MySQL/Redis/MinIO、API 与浏览器验收全部通过 |
| 测试/生产服务器接管 | 测试 PASS：main 自动发布、成对备份、45 个 migration、迁移校验、原子前端切换及内外网检查通过；生产 PENDING，等待按教程提供独立服务器和 Environment 参数 |
| 测试数据基线 | PASS：测试环境已获授权清除历史数据，三个数据卷受控重建；空库执行 45 个 migration、正式基础 seed 和真实 E2E，不恢复 legacy 数据 |
| 发布耗时与容错 | PASS：backend 135 MiB、migrator 174 MiB；两次缓存失效拉取分别为 17 分 04 秒和 13 分 42 秒，下载后的备份、迁移、启动和原子切换约 46～49 秒。Release `1192e3aa76db` 首次连接失败后自动续传约 4 分钟完成；另一次超过 36 分钟的拉取在停机前取消且旧 Release 持续 ready。当前脚本单次上限 20 分钟，最多重试 3 次 |

### 8.7 下一步优先级

1. P0：按 v2 教程完成生产服务器一次性接管，配置独立 Environment 参数，并以测试验收凭据人工审批推广同一 Release。
2. P1：继续拆分 Knowledge、Archive、Project 大页面，目标是页面只保留组合与路由协调。
3. P1：为审计补偿、Outbox、文件任务和 v2 备份接入积压/容量告警与定期恢复演练。
4. P2：按治理台账对 27 个历史 Model 做生产只读盘点，再决定分批迁移和删除。
5. P2：优化 PDF Worker 的加载路径与缓存策略，不改变 500 MiB 统一上传上限。

### 8.8 部署与测试架构

- 本地默认使用 `scripts/local-quality.ps1` 和 `scripts/local-visual.ps1`，不启动 WSL、Docker 或真实数据服务；视觉报告同时展示设计参考、本次实现和差异叠加，缺失基准时明确失败降级而不伪造参考图。
- GitHub 质量检查通过后只构建一次后端 runtime、migrator 和前端静态包；`release-manifest.json` 绑定完整 Git SHA、镜像 digest、前端 checksum 与 migration 数量。migrator 继承精简 runtime 以复用镜像层，只增加固定版本迁移命令，不携带 builder 工具链；Release ID 只在容器启动时注入，不写入镜像配置，Buildx 同时固定 `SOURCE_DATE_EPOCH=0`，因此后端内容相同时跨 Release 复用完全相同的不可变 digest。
- 测试和生产各自保留内部 MySQL、Redis、MinIO，但数据 Compose 与应用 Compose 分离；数据端口只监听 localhost，应用发布不删除命名卷。
- 宿主 Nginx 直接服务 `current/frontend`，发布脚本在停写、成对备份、migration、API/Worker 稳定后原子切换前端，并同时检查内网和公网 Release ID。
- 测试服务器由 main 的已验收 Release 自动发布；生产只接受同一测试验证凭据，经 `production` Environment 人工审批后原地切换，不重新构建。
- migration 开始后的回滚必须恢复同一 v2 备份中的 MySQL、MinIO、Redis 状态、后端、Worker 和前端；服务器身份、路径、checksum、源 Manifest 和显式确认均为 fail-closed 门禁。
