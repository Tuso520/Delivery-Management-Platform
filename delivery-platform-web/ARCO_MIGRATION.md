# Arco Design 迁移记录

## 当前状态

本项目已安装并接入 `@arco-design/web-vue@2.58.0`，入口文件为 `src/main.ts`。

当前仍保留 Element Plus 依赖和现有用法，避免一次性替换造成页面回归。

## 后续迁移规则

1. 新增页面和新增业务组件默认使用 Arco Design Vue。
2. 旧页面维护时，不做无关的大范围替换。
3. 改造旧页面时，优先替换 Button、Form、Input、Select、Table、Modal、Drawer、Pagination、Message、Notification 等基础组件。
4. 迁移完成一个页面后，必须检查 loading、empty、error、disabled、readonly、no-permission、validation 状态。
5. 逐步减少 Element Plus 组件和图标依赖，确认无引用后再删除依赖。

## 验收要求

- `pnpm build:checked` 通过。
- 关键页面视觉不回归。
- 表单校验、表格分页、弹窗确认、错误反馈可用。
- 不新增其他 UI 组件库。
