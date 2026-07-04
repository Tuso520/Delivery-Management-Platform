# 2026-07-03 Arco Design 迁移检查记录

## 已完成

- 全局接入 `@arco-design/web-vue` 和 Arco 图标插件。
- Vite 自动导入增加 `ArcoResolver`，支持直接使用 `a-*` 组件。
- 主框架 `BasicLayout` 去除 Element 布局容器，统一使用 Arco CSS 变量和清晰中文页面描述。
- 顶部栏 `AppHeader` 改为 Arco Button、Breadcrumb、Dropdown、Avatar。
- 侧边栏 `AppSidebar` 改为 Arco Menu，并保留权限过滤、展开、空状态和移动端抽屉行为。
- 全局请求错误提示从 Element `ElMessage` 切换为 Arco `Message`。
- 知识库列表页、详情页、附件表格、预览弹窗、表单控件已迁移为 Arco 组件。

## 知识库模块

- 规范分类：项目管理、电气工程、软件工程、运维管理、安全管理、通用标准、流程标准、绩效与激励、团队文化、日常制度、客户与跨文化、物流与供应商。
- 后端增加同父级同名分类防重。
- API 返回分类树时去重，种子数据初始化时合并重复分类并停用历史乱码分类。
- 新增私有附件在线预览接口：`GET /api/v1/attachments/:id/preview`。
- 支持图片、PDF、文本、doc/docx、xls/xlsx、ppt/pptx 的差异化预览路径。

## 样例文件

路径：`delivery-platform-server/prisma/seed-files/knowledge-samples`

- `knowledge-preview-doc.doc`
- `knowledge-preview-table.xlsx`
- `knowledge-preview-slides.ppt`
- `knowledge-preview-pdf.pdf`
- `knowledge-preview-image.png`

Docker 初始化时，种子脚本会把这些文件写入 MinIO 并挂载到知识库测试条目。

## 剩余 Element 检查

当前全局扫描仍有历史 Element Plus 使用，主要在非知识库旧页面：

```powershell
rg -n "element-plus|ElMessage|<el-|el-" delivery-platform-web\src
```

本轮未做机械全量替换，原因是这些页面存在表单、弹窗、分页、表格、上传和权限按钮等复杂交互，逐文件无验证替换会增加回归风险。下一批建议按业务域迁移：

1. 系统设置：国家、币种、语言、用户、角色。
2. 项目交付：项目列表、项目详情、归档、流程记录。
3. 审批与报表：待审、日报、复盘。
4. 绩效培训：OKR、技能、培训。

## 验证结果

- 后端类型检查：通过。
- 后端测试：25 个测试套件，105 个用例通过。
- 后端构建：通过。
- 前端类型检查：通过。
- 前端测试：14 个测试文件，59 个用例通过。
- 前端构建：通过。
- 前后端生产依赖审计：无已知漏洞。

## 已知非阻塞警告

- 前端构建仍有 Sass legacy JS API 警告。
- 前端构建仍有大 chunk 警告，知识库 Markdown 编辑器和历史 Element 页面都会增加包体。
