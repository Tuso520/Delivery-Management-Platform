# 技术架构

## 总体结构

```text
浏览器
  |
  | HTTP / HTTPS
  v
Nginx 前端容器
  |
  | /api/v1
  v
NestJS 后端容器
  |
  +--> MySQL 8        # 业务关系数据
  +--> Redis 7        # 缓存、会话和限流相关数据
  +--> MinIO          # 文件和附件对象存储
```

## 前端

- 位置：`delivery-platform-web/`
- 框架：Vue 3 + TypeScript + Vite。
- UI 组件库：Arco Design Vue。
- 状态管理：Pinia。
- 路由：Vue Router，当前使用 hash 路由。
- 接口调用：统一通过 `src/api/` 下的 Axios 封装。
- 文件预览：主要复用 `src/components/AttachmentPreviewPane/` 和预览弹窗封装。

## 后端

- 位置：`delivery-platform-server/`
- 框架：NestJS 11 + TypeScript。
- ORM：Prisma 5。
- 数据库：MySQL 8。
- 对象存储：MinIO。
- 认证授权：JWT、角色和权限守卫。
- 文件预览：附件和文件预览服务负责生成元数据、签名链接和 Office 风格只读 HTML 预览。

## 数据领域

- 项目：项目台账、项目成员、阶段、风险和项目访问范围。
- 档案：档案目录、当前文件、审批状态、上传说明和版本记录。
- 文件与附件：上传文件元数据、存储路径、版本、当前版本标识和审批流程。
- 知识库：一级分类、知识条目、附件、预览热度和下载热度。
- 文档模板：模板分类、附件、备注、预览热度和下载热度。
- 审批：待审、通过、驳回和差异对比信息。
- 组织：部门、用户、角色和权限。

## 在线预览策略

- PDF：浏览器端使用 PDF.js 进行只读渲染。
- 图片：使用浏览器原生图片预览。
- DOCX、XLSX、PPTX：后端提取 OpenXML 内容并生成只读文档、表格或演示样式 HTML。
- DOC、XLS、PPT：后端提取可读文本，并按文档、表格或幻灯片布局展示。
- Markdown 和文本：按只读文本或 Markdown 方式展示。

## 权限模型

- 菜单和路由需要权限码。
- 按钮按需要使用权限守卫。
- 后端 Controller 必须校验 JWT 和权限。
- 项目数据默认按项目成员关系限制，高权限角色可查看更大范围。

## File Preview Center

- Frontend entry: `delivery-platform-web/src/components/FilePreviewRouter/`.
- Backend session API: `GET /api/v1/files/:id/preview-session?mode=view|edit`.
- Signed content URLs are short-lived and do not expose MinIO bucket names or object paths.
- Office files (`doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`) route to ONLYOFFICE Docs Community when `ONLYOFFICE_DOCS_URL` and `PUBLIC_API_BASE_URL` are configured. OOXML files can be edited only when backend permissions allow it.
- PDF files render with PDF.js in read-only mode.
- Normal images render with Viewer.js. Large images over 15 MB route to OpenSeadragon.
- Image thumbnails are generated with `sharp`, stored under a private MinIO thumbnail prefix, and exposed only through authenticated or signed thumbnail endpoints.
- Markdown is fetched through signed content URLs and rendered by a safe renderer that escapes raw HTML, supports headings, TOC, code blocks, tables, links, lists, and quotes.
- XMind files are read-only and parsed into an outline from `content.json` or `content.xml`.
- CAD (`dwg`, `dxf`) and Visio (`vsd`, `vsdx`) are read-only degraded previews until a conversion service is configured.
- Video and audio use native HTML5 playback.