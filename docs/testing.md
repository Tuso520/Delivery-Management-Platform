# 测试验收

## 必跑检查

```powershell
pnpm --filter ./delivery-platform-server type-check
pnpm --dir delivery-platform-web build
```

涉及前端界面时，还需要对变更页面做浏览器真实验证。

## 浏览器回归范围

当前关键浏览器流程包括：

- 登录。
- 数据看板按角色展示欢迎语和重点信息。
- 项目台账列表、关键词搜索和行操作。
- 项目档案阶段页签、上传说明、文件详情、上传入口和审批入口。
- 知识库分类列表、文件备注、热度指标和点击标题预览。
- 文档模板列表和点击标题预览。
- Word、Excel、PowerPoint、PDF、图片和 Markdown 文件预览。
- 文件审批通过和驳回链路。

## 2026-07-08 验证摘要

验证地址：`http://42.193.176.248:8080`。

| 验证项 | 结果 |
| --- | --- |
| 发布版本 | `1df2a618471e` |
| 后端健康检查 | 通过 |
| 前端健康检查 | 通过 |
| 管理员登录 | 通过 |
| 项目经理登录 | 通过 |
| 项目台账 | 管理员界面可见 11 条项目 |
| 项目经理项目接口 | `pm_wang` 可见 9 个项目 |
| 知识库 PDF 预览 | 通过 |
| 知识库 Word 预览 | 通过 |
| 知识库 Excel 预览 | 通过 |
| 知识库 PPT 预览 | 通过，旧版 `.ppt` 使用幻灯片布局 |
| 项目档案 | 阶段页签、上传说明、审批状态和详情弹窗通过 |

浏览器截图和临时测试产物不进入 Git。

## File Preview Regression Scope

For file preview changes, verify:

- `GET /api/v1/files/:id/preview-session` returns a route without `storagePath`.
- `GET /api/v1/files/:id/signed-content` and `signed-thumbnail` work only with a valid short-lived token.
- Office edit mode is returned only when backend permissions allow it and ONLYOFFICE configuration is present.
- Markdown raw HTML is escaped, while headings, TOC, code blocks, and tables render.
- Unsupported CAD and Visio files show degraded preview with download available.

Automated checks added in this area:

```powershell
pnpm --filter ./delivery-platform-server test -- file-preview-route.spec.ts
pnpm --dir delivery-platform-web test -- markdown-preview.spec.ts
```