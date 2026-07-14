# 更新记录

## 2026-07-14

- 修复同一 commit 重试部署时覆盖运行中 release tag、导致旧容器 Image ID 无法进入成对备份的问题；已成功发布的同版本后端和前端镜像现在必须通过 OCI release label 校验并直接复用，仅重建临时迁移镜像。
- 补充 GitHub Environment、仓库角色、部署账号、SSH、Docker 和网络的最小权限接入边界，明确服务器不保存 GitHub Token，生产与测试必须使用隔离凭据。

## 2026-07-13

- GitHub 部署成功后新增受保护的服务器镜像清理：保留全部容器、当前/上一成功发布及 checksummed v3 备份引用的 Image ID，只以非强制方式删除其余镜像；清理前后复核磁盘、API、Worker、前端和发布标签，绝不清理 Docker volume。

- 按前后端重构实施规范完成工作台、项目、两级档案、档案模版、统一文件与审核、标准、知识、工具、组织权限和系统设置的运行时切换。
- Prisma migration 增至 28 个；新增 UI 翻译表无损归档和标准/知识文件化准备迁移，目标内容、档案/项目与集成 Secret migrator 统一接入 dry-run/apply/只读严格门禁；旧业务表仅作为只读迁移源保留。
- 文件统一为 LogicalFile、FileAsset 和不可变 FileVersion，审核统一为 ReviewTask/Step/Assignee/ActionEvent，支持单人、全员、ANY_N、串行与并行审批。
- 前端统一使用 Arco Design Vue、业务组件、TanStack Query、权限路由和单一只读文件预览入口，删除旧页面、旧 API、兼容组件和重复状态流程。
- API、File Worker 与 Outbox Worker 独立运行；通知投递、文件处理、敏感操作审计、Refresh Token 轮换、数据范围和敏感字段裁剪完成加固。
- 合并后 lint、类型检查、Prisma 校验和生产构建通过；前端 40/175、后端 67/464 全部通过。此前隔离真实环境的 API 2/2、依赖冒烟 2/2、Chrome 关键流程 2/2 作为基线保留，最新 28 migration 的真实依赖验收以同提交 GitHub integration/deploy 为准。
- 修复 GitHub 自动部署在解压发布包后污染服务器 Git 工作区、又因脏工作区门禁无法切换提交的问题；改为校验并导入固定 SHA 的 Git bundle，且在切换前同时保护受跟踪和未跟踪源码。
- Dockerfile 改用 Docker/BuildKit 内置解析器，移除对 `docker/dockerfile:1.7` 外部 frontend 镜像的强制构建时依赖，同时保留内置 BuildKit 支持的依赖缓存挂载，兼容受限镜像源的部署服务器。
- API、File Worker 与 Outbox Worker 统一使用同一 release 后端镜像；部署在 migration 前按 Worker→API 顺序静默，切换后按 API→Worker→前端顺序启动并校验四个容器的 release 标签，避免新旧进程混跑。
- 修复生产 `.env` 缺少集成加密密钥时 MySQL 就绪等待丢失候选密钥的问题；密文检查与密钥持久化改为在 API/Worker 停写后、备份和 migration 前执行，并为自动部署、人工备份和代码回滚补齐顺序与恢复契约测试。
- 标准库删除 ONLINE/结构化正文双轨并强制有效文件版本；知识库强制 FILE/MARKDOWN/LINK 三选一、显式支持文件集合和版本化修改，公开响应统一裁剪 legacy 与对象存储元数据。
- MinIO 备份改为健康容器与唯一命名卷双门禁、临时归档校验后原子发布；不再允许空归档或数据库单边备份。表计数门禁显式核对 UI 翻译归档前后行数，其他表消失仍会阻断部署。

## 2026-07-08

- 将项目文档统一整理为 GitHub 风格结构，文档入口集中到 `docs/`。
- 删除历史编号阶段目录、旧发布包脚本、旧发布包测试和临时产物。
- 新增贡献规范、安全说明、开源依赖说明和开源准备清单。
- 新增直接依赖许可证清单、中文 Issue 模板和中文合并请求模板。
- 修正文档和包描述中的乱码内容。
- 将项目阶段 `04_construction` 统一为“施工与调试 / Construction & Commissioning”。
- 前端测试、前端构建、后端类型检查和 Git 空白检查已通过。

## 2026-07-03

- 按公司标准补齐项目交付目录、本地 Docker 测试部署、健康检查和回滚入口。
- 新增 `docker-compose.test.yml`，用于本机 Docker 测试环境。
- 新增 `.env.local.example` 和本地 `.env.local`，本地访问域名为 `delivery-platform.localhost`。
- 生产数据库同步保留 `prisma migrate deploy`，禁止发布链路使用 `db push --accept-data-loss`。
- 修复前后端依赖审计漏洞，生产依赖审计已无已知漏洞。
