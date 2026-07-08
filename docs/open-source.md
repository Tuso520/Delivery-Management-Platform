# 开源依赖说明

## 说明

本项目使用多个成熟的开源组件构建。根目录 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 已列出主要直接依赖及常见许可证，[直接依赖许可证清单](open-source-dependencies.md) 按当前本地包元数据列出版本和许可证声明。本文件补充说明这些依赖在平台中的作用，以及公开开源前需要完成的许可证合规动作。

## 前端主要依赖

- Vue、Vue Router、Pinia：用于前端页面、路由和状态管理。
- Arco Design Vue：用于统一业务组件和页面风格。
- Axios：用于前后端接口通信。
- Day.js：用于日期和时间格式化。
- VueUse：提供常用组合式工具函数。
- vue-i18n：用于多语言能力。
- md-editor-v3：用于 Markdown 编辑和只读预览。
- PDF.js / pdfjs-dist：用于 PDF 在线预览。

## 后端主要依赖

- NestJS：提供模块化后端框架。
- Prisma：提供数据模型、迁移和数据库访问能力。
- bcrypt：用于密码哈希。
- class-validator、class-transformer：用于 DTO 校验和转换。
- Helmet：用于 HTTP 安全头。
- ioredis：用于 Redis 访问。
- JSZip：用于 Office 文件解析辅助。
- MinIO JavaScript SDK：用于对象存储访问。
- Multer：用于文件上传解析。
- Passport 和 passport-jwt：用于身份认证。
- RxJS：用于响应式编程支持。

## 开发工具依赖

- TypeScript：提供类型系统和编译能力。
- Vite：前端构建工具。
- Vitest：前端单元测试。
- Jest：后端单元测试。
- ESLint：代码检查。
- Prettier：代码格式化。
- Sass：样式预处理。

## 合规要求

公开发布前需要完成：

1. 补充项目自身的 `LICENSE` 文件。
2. 使用许可证扫描工具导出完整直接依赖和间接依赖清单。
3. 复核 `pnpm-lock.yaml` 中间接依赖的许可证。
4. 复核 Docker 基础镜像和运行镜像的许可证。
5. 确认示例数据和种子文件没有客户信息、内部项目资料或商业敏感内容。
6. 保留第三方组件声明和许可证扫描结果，便于后续审计。

## 当前结论

当前源码可以继续按内部私有项目维护。若要正式公开开源，必须先完成许可证选择、依赖许可证扫描和示例数据脱敏。
