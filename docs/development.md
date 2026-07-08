# 开发规范

## 环境要求

- Node.js 20。
- pnpm。
- Docker Desktop 或 Docker Engine，用于容器化测试。

## 安装依赖

```powershell
pnpm install
```

## 本地模拟服务

```powershell
node scripts/local-test-server.mjs
```

默认访问地址：

- `http://127.0.0.1:18080`

默认模拟账号：

- `admin / Admin@123456`

## 前端开发

```powershell
pnpm --dir delivery-platform-web build
```

前端约定：

- 使用 Arco Design Vue 组件。
- 页面保持紧凑、清晰、偏工作台风格。
- 表单、筛选区、表格、弹窗和按钮尽量复用统一组件。
- 筛选项保持简洁，能一行展示时不要拆成多行。
- 涉及布局的修改必须通过浏览器截图或实际页面检查。
- 具体 UI 规范见 [UI/UX 与 Arco Design 规范](ui-ux.md)。

## 后端开发

```powershell
pnpm --filter ./delivery-platform-server type-check
```

后端约定：

- Prisma 迁移必须可审查、可回滚，生产禁止破坏性 `db push`。
- 种子脚本必须幂等，禁止清空业务表。
- 新上传文件进入审批时，不能覆盖当前已审批版本。
- 文件预览逻辑集中在附件和文件预览服务中维护。
- Controller 只处理协议层，业务规则放在 Service。

## 文档更新要求

以下内容变化时必须同步更新 `docs/`：

- 产品行为。
- 权限规则。
- API 契约。
- 数据模型或迁移策略。
- 部署流程。
- 浏览器真实验证结果。
- 开源依赖或许可证信息。
