# 交付管理平台基础架构模型 v0.1

## 1. 文档定位

本文定义交付管理平台的产品级基础架构、前端目标分层和长期扩展边界。它不定义具体页面布局、字段、交互细节或单个业务组件实现。

- 版本：v0.1
- 基线日期：2026-07-25
- 当前实现事实：以源码、[技术架构](architecture.md)、[前端页面架构](frontend-architecture.md)和[后端实施规范](backend-architecture-refactored.md)为准。
- 目标架构约束：以本文和[前端实施规范](frontend-architecture-refactored.md)为准。
- 迁移策略：渐进调整，不要求一次性重排现有源码，不在新旧目录之间建立重复实现。

## 2. 信息来源与可信边界

### 2.1 Figma 项目说明明确的信息

Figma 文件“交付管理平台｜Design System App Shell v0.1”的项目说明页明确给出：

- 产品名称：交付管理平台。
- 首期关注：产品范围、Design System、Modal Framework。
- 平台领域：工作台、项目管理、标准与知识、系统设置。
- 首期能力名称：数据看板、审核中心、项目概览、项目档案、档案模板、标准库、知识库，以及系统设置下的基础配置能力。

Figma 项目说明没有明确给出用户角色、详细使用场景、设计原则、App Shell 交互规则或未来路线。本文不会把这些内容误写成 Figma 结论。

### 2.2 产品与工程事实来源

- 产品定位、用户和业务目标来自 [产品说明](product.md)。
- 运行技术栈、数据和部署边界来自源码与 [技术架构](architecture.md)。
- App Shell、路由、状态、API 和组件现状来自 `delivery-platform-web/src/`。
- 权限、审计、文件、审核、迁移和后端领域边界来自 `delivery-platform-server/src/`、Prisma schema 和后端实施规范。

## 3. 平台定位

交付管理平台是面向跨国家、跨专业软件交付团队的企业内部运营平台。它以项目交付为主线，把项目、档案、文件、审核、标准、知识、组织权限和平台配置放在统一的身份、权限、审计、通知与数据规则之下。

平台基础架构服务三个目标：

1. **统一入口**：用户通过稳定的 App Shell、导航和权限入口访问平台能力。
2. **统一规则**：文件、审核、权限、审计、配置和请求契约只维护一套。
3. **可持续扩展**：新增业务域时复用平台能力，不复制应用壳、设计语言、请求客户端或基础服务。

## 4. 当前代码结构分析

### 4.1 已形成的基础

| 方面 | 当前实现 | 判断 |
| --- | --- | --- |
| 应用启动 | `main.ts` 组装 Vue、Pinia、Vue Query、Router、i18n 和 Arco | 依赖清晰，但启动与 Provider 尚未形成独立 `app/` 层 |
| App Shell | `layouts/BasicLayout.vue` 与 Header、Sidebar、Breadcrumb | 已有稳定壳层，可迁入 `app/shell/`，不应由业务模块复制 |
| 路由与导航 | `router/index.ts` 的 `shellRoutes` 生成主菜单和设置菜单 | 已实现单一事实源，是平台化的重要基础 |
| Design System | `styles/variables.scss`、`components/business/`、Arco Design Vue | 已有令牌与平台组件雏形，但目录和命名尚未显式表达 Design System |
| 客户端状态 | Pinia 保存会话、权限、主题、侧栏和语言 | 边界合理，应继续限制为跨页面客户端状态 |
| 服务端状态 | TanStack Query、统一 Query Key 和领域查询 composable | 已形成统一缓存与失效机制，可作为 `services/query` 基础 |
| API | `src/api/` 统一 Axios 客户端和领域请求 | 请求契约统一，但领域 API 与跨域基础服务仍混放 |
| 业务组织 | 页面集中在 `views/<domain>/`，类型、API、查询分散在横向目录 | 小规模清晰，规模扩大后领域改动会跨多个顶层目录 |
| 跨域能力 | 文件预览、权限、审核和业务组件已有复用 | 能力存在，但尚未以明确的共享服务边界组织 |
| 后端 | NestJS 按业务模块组织，公共能力和数据库边界独立 | 模块化程度高于前端，可作为前端领域边界的参照 |

### 4.2 当前主要风险

1. **领域内聚不足**：一个业务域的页面、API、类型、查询和测试分散，修改范围难以从目录直接判断。
2. **Design System 隐式存在**：`components/business/` 同时容纳视觉基础、页面容器、权限组件和业务语义，长期容易形成职责混合。
3. **跨域服务边界不够显式**：文件预览、权限、审核、通知等平台能力存在，但没有统一的服务层归属。
4. **应用装配分散**：启动、路由、布局、Provider 分布在多个顶层目录，新入口或多应用形态会放大维护成本。
5. **迁移命名残留**：`store/` 是实际状态目录，`stores/` 仅残留测试路径，容易误导后续开发。
6. **大型页面风险**：部分领域仍由单个页面承担查询、编排和展示；未来应在领域模块内部拆分，而不是继续扩大全局公共层。

## 5. 前端目标架构

### 5.1 目标目录

```text
delivery-platform-web/src/
  app/
    bootstrap/
    providers/
    router/
    shell/
    guards/

  design-system/
    tokens/
    foundations/
    components/
    patterns/
    status/

  modules/
    <domain>/
      routes.ts
      pages/
      components/
      model/
      api/
      queries/
      stores/
      tests/

  shared/
    types/
    utils/
    i18n/
    validation/
    constants/
    testing/

  services/
    http/
    query/
    auth/
    permissions/
    files/
    reviews/
    notifications/
    observability/
```

该结构是迁移目标，不表示当前目录已经完成调整。

### 5.2 分层职责

#### `app/`

负责应用装配与运行外壳：

- 创建应用和注册 Provider。
- 维护根路由、导航元数据、路由守卫和访问回退。
- 提供 App Shell、全局错误边界和全局挂载点。
- 只编排模块，不实现业务规则。

#### `design-system/`

负责稳定、可复用、与业务域无关的视觉语言：

- 设计令牌、主题、间距、排版、颜色和层级。
- 基础组件及基于 Arco Design Vue 的平台封装。
- 页面容器、表格、表单、弹窗、抽屉和状态反馈等通用模式。
- 状态颜色与显示规则的统一注册机制。

Design System 不请求业务 API，不依赖 `modules/`，不保存业务实体状态。

#### `modules/`

按业务域组织可交付能力：

- 一个模块聚合自身的路由、页面、组件、领域模型、API、Query、局部 Store 和测试。
- 模块只能通过公开入口暴露能力。
- 模块之间不直接引用对方的页面内部文件。
- 需要跨域复用的能力上移到 `services/`；纯技术或无业务状态的内容上移到 `shared/` 或 `design-system/`。

首期模块边界沿用已经确认的平台领域，不在本文中重新设计具体页面。

#### `shared/`

负责无业务状态、无基础设施副作用的共享代码：

- 通用类型、格式化、校验、常量、国际化和测试工具。
- 不包含 HTTP 客户端、全局缓存、权限判定或业务流程。
- 不依赖 `app/`、`modules/` 或 `services/`。

#### `services/`

负责跨业务域的平台服务和基础设施适配：

- HTTP、Query Client、认证会话和权限。
- 文件、审核、通知等跨域能力的稳定接口。
- Trace、错误归一化和客户端可观测性。
- 可以依赖 `shared/`，但不能依赖某个模块的页面或内部组件。

`services/` 不是后端 Service 的前端镜像，也不是放置任意工具函数的兜底目录。

### 5.3 依赖方向

```text
app ───────────────> modules
 │                    │
 ├──> design-system <─┤
 ├──> services <──────┤
 └──> shared <────────┘

services ──> shared
design-system ──> shared
```

禁止的依赖：

- `shared` 依赖 `modules`、`app` 或 `services`。
- `design-system` 依赖业务模块或业务 API。
- `services` 依赖模块页面或模块内部组件。
- 模块通过深层相对路径直接访问另一个模块的内部实现。
- 页面绕过模块 API 或平台 HTTP 服务自行拼接重复请求。

### 5.4 当前目录到目标目录的映射

| 当前目录或文件 | 目标归属 | 迁移说明 |
| --- | --- | --- |
| `main.ts`、`App.vue` | `app/bootstrap`、`app/providers` | 最后迁移，先保持现有启动稳定 |
| `router/` | `app/router`、`app/guards` | 保留 `shellRoutes` 单一事实源 |
| `layouts/` | `app/shell` | App Shell 只保留一份 |
| `styles/variables.scss` | `design-system/tokens` | 先明确令牌语义，再移动文件 |
| `components/business/` | `design-system/components` 或 `design-system/patterns` | 按“基础组件 / 平台模式”拆分，不按页面拆分 |
| `views/<domain>/` | `modules/<domain>/pages` | 与对应 API、Query、类型和测试一起迁移 |
| `api/request.ts` | `services/http` | 维持统一响应、刷新和错误契约 |
| 领域 `api/*.ts` | `modules/<domain>/api` | 只暴露领域契约 |
| `query/` | `services/query` | Query Client 属于平台服务，领域 Query Key 可归模块 |
| `composables/queries/` | `modules/<domain>/queries` | 按领域逐步迁移 |
| `store/` | `services/auth`、`services/permissions` 或 `app/` | 按状态职责拆分，避免建立第二套 Store |
| `types/` | `modules/<domain>/model` 或 `shared/types` | 领域类型就近，真正通用类型进入 shared |
| `utils/` | `shared/utils` 或对应 service/module | 按副作用和业务语义分类 |

## 6. App Shell 与 Design System 的平台边界

### 6.1 App Shell

App Shell 是平台运行框架，而不是业务页面：

- 路由注册表继续作为导航、标题、权限和入口的单一来源。
- 主导航与设置导航是同一注册表的不同投影。
- 侧栏、头部、面包屑、内容出口和全局挂载点由 `app/shell` 统一维护。
- 业务模块只提交路由元数据和页面入口，不直接修改侧栏内部状态。
- 前端权限只负责入口和操作展示，后端始终执行最终权限与数据范围校验。

### 6.2 Design System

Design System 的扩展顺序固定为：

1. 复用现有令牌和平台组件。
2. 在现有模式上增加通用变体。
3. 仅当多个模块存在稳定共性时新增平台模式。
4. 业务特有展示保留在模块内部，不提前抽象。

Arco Design Vue 是底层 UI 依赖，Design System 是平台对其建立的稳定语义层。业务模块不应把 Arco 的偶然实现细节扩散为新的平台契约。

## 7. 模块契约

每个新模块至少声明：

- 业务边界和负责人群。
- 路由入口与权限码。
- 公开 API、领域模型和 Query Key。
- 依赖的平台服务。
- 敏感操作、审计和数据范围要求。
- 加载、空、错、无权限和不可重试状态。
- 单元测试、契约测试及必要的真实环境验收。

模块注册必须是显式的。不得通过全目录扫描把任意页面自动暴露为路由，也不得因前端菜单隐藏而省略后端权限校验。

## 8. 渐进迁移原则

1. **先定边界，后搬文件**：先补齐模块公开入口和依赖规则，再移动源码。
2. **按业务域垂直迁移**：一次迁移一个领域的页面、API、Query、类型和测试。
3. **不建立双轨**：新旧目录过渡期只允许转发导出，不复制业务逻辑、状态或请求。
4. **基础设施后收口**：HTTP、路由、认证和 Query Client 在模块迁移稳定后集中移动。
5. **每步可验证**：每次迁移都保持 lint、类型检查、测试和构建通过；关键链路继续连接真实后端依赖验收。
6. **删除残留**：迁移完成后立即删除旧导出、空目录、重复测试和失效文档。

建议顺序：

```text
阶段 0：架构文档与依赖规则
阶段 1：显式建立 design-system 边界
阶段 2：选择一个低耦合领域试点 modules/
阶段 3：迁移跨域 services
阶段 4：逐域迁移其余 modules
阶段 5：收口 app/，删除旧顶层目录与转发层
```

## 9. 未来扩展原则

- **新增业务域**：优先新增独立模块，通过路由元数据注册；不得直接扩展 App Shell 内部逻辑。
- **新增平台级能力**：只有被多个领域复用、拥有稳定契约时才进入 `services/`。
- **新增视觉模式**：先验证跨模块复用，再进入 Design System；单页样式留在模块内。
- **多租户或多组织**：身份、权限、数据范围和审计在服务端统一扩展，不能由前端模块各自实现。
- **外部集成**：通过后端集成与 Outbox 边界接入；前端只消费稳定服务契约，不直接保存 Secret。
- **多语言与多地区**：固定文案使用同构 i18n key，国家、币种、语言和业务字典继续配置化。
- **新文件类型或审核类型**：扩展统一文件/审核能力，不建立模块私有的上传、预览或审批主流程。
- **新客户端形态**：复用 `modules`、`services` 与领域契约，单独提供新的 `app` 装配层。

## 10. v0.1 决策结论

1. 保留当前 Vue 3、TypeScript、Vite、Pinia、Vue Router、TanStack Query 和 Arco Design Vue 技术基线。
2. 保留当前 `shellRoutes` 单一事实源和后端最终权限校验原则。
3. 将 `src/app / design-system / modules / shared / services` 确定为前端渐进迁移目标。
4. Design System 与跨域 Services 分离；前者负责视觉语义，后者负责平台能力和基础设施。
5. 不在本轮创建业务模块代码或批量搬迁目录；后续迁移必须按领域执行并保持单轨。
6. 删除未采纳的前端重构评审稿；历史版本统一维护在根目录 `CHANGELOG.md`。

## 11. 文档治理结果

| 处理 | 文档 | 原因 |
| --- | --- | --- |
| 保留 | `README.md`、`docs/product.md`、`docs/architecture.md`、`docs/development.md` | 分别承担项目入口、产品事实、运行架构和开发规则 |
| 保留 | 前后端实施规范、前端页面架构、业务流程 | 分别承担正式约束、实现清单和流程事实，职责不同 |
| 保留 | 部署、测试、安全、开源文档 | 属于独立治理领域，不能由基础架构文档替代 |
| 保留 | `docs/design/` 与专题兼容说明 | 作为具体实现交接或迁移记录，不提升为平台架构事实 |
| 新增 | 本文 | 集中承载平台定位、目标分层、依赖规则和扩展原则 |
| 删除 | `docs/frontend-rebuild-review.md` | 未采纳的候选方案与当前正式信息架构分叉 |
| 合并后删除 | `docs/release.md` | 内容已被更完整、更新的根目录 `CHANGELOG.md` 覆盖 |

今后不得新建第二份“总体架构”“前端重构方案”或“版本记录”。新决策应进入对应正式规范，历史变更进入 `CHANGELOG.md`。
