# 第三方开源组件声明

本文列出项目直接引用的主要开源组件。许可证信息按当前 `package.json` 依赖和常见包元数据整理，直接依赖版本明细见 [docs/open-source-dependencies.md](docs/open-source-dependencies.md)。正式公开发布前应再执行一次自动化许可证扫描。

## 前端运行依赖

| 组件 | 用途 | 常见许可证 |
| --- | --- | --- |
| Vue | 前端框架 | MIT |
| Vue Router | 前端路由 | MIT |
| Pinia | 状态管理 | MIT |
| Arco Design Vue | UI 组件库 | MIT |
| Axios | HTTP 请求 | MIT |
| Day.js | 日期时间处理 | MIT |
| VueUse | 组合式工具函数 | MIT |
| vue-i18n | 国际化 | MIT |
| md-editor-v3 | Markdown 编辑与预览 | MIT |
| PDF.js / pdfjs-dist | PDF 在线预览 | Apache-2.0 |
| Viewer.js | 图片缩放、旋转和查看器 | MIT |
| PhotoSwipe | 图片全屏画廊预览 | MIT |

## 后端运行依赖

| 组件 | 用途 | 常见许可证 |
| --- | --- | --- |
| NestJS | 后端框架 | MIT |
| Prisma Client | ORM 客户端 | Apache-2.0 |
| bcrypt | 密码哈希 | MIT |
| class-transformer | DTO 转换 | MIT |
| class-validator | 参数校验 | MIT |
| fast-xml-parser | XML 解析 | MIT |
| Helmet | HTTP 安全头 | MIT |
| ioredis | Redis 客户端 | MIT |
| JSZip | Office 文件解析辅助 | MIT 或 GPL-3.0-or-later |
| MinIO JavaScript SDK | 对象存储客户端 | Apache-2.0 |
| Multer | 文件上传解析 | MIT |
| Passport / passport-jwt | 身份认证 | MIT |
| reflect-metadata | TypeScript 元数据 | Apache-2.0 |
| RxJS | 响应式编程库 | Apache-2.0 |
| uuid | 唯一标识生成 | MIT |

## 开发与构建依赖

| 组件 | 用途 | 常见许可证 |
| --- | --- | --- |
| TypeScript | 类型系统和编译 | Apache-2.0 |
| Vite | 前端构建工具 | MIT |
| Vitest | 前端测试 | MIT |
| Jest | 后端测试 | MIT |
| ESLint | 代码检查 | MIT |
| Prettier | 代码格式化 | MIT |
| Sass | 样式预处理 | MIT |
| Prisma CLI | 数据库迁移和客户端生成 | Apache-2.0 |

## 容器与基础设施

项目部署使用 Node.js、Nginx、MySQL、Redis 和 MinIO 等容器镜像。镜像不会随本仓库源码重新分发，使用者需要遵守对应镜像和基础系统软件的许可证。公开发布前建议对 Docker 镜像和基础镜像执行单独的许可证合规审查。

## 发布前要求

- 补充项目自身的开源许可证文件，例如 `LICENSE`。
- 使用自动化工具导出完整依赖许可证清单。
- 复核 `pnpm-lock.yaml` 中的间接依赖许可证。
- 确认示例文档、种子数据和演示项目不包含客户或内部敏感信息。
