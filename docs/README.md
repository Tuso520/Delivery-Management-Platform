# 文档总览

`docs/` 是交付管理平台唯一的项目文档入口，所有文档直接描述当前产品、架构、流程、部署和验收要求。

## 文档索引

- [产品说明](product.md)
- [技术架构](architecture.md)
- [前端页面架构](frontend-architecture.md)
- [前端业务流程](frontend-business-flows.md)
- [前端实施规范](frontend-architecture-refactored.md)
- [后端实施规范](backend-architecture-refactored.md)
- [前端整体重构评审稿](frontend-rebuild-review.md)
- [界面体验与 Arco Design 规范](ui-ux.md)
- [开发规范](development.md)
- [部署运维](deployment.md)
- [测试验收](testing.md)
- [安全说明](security.md)
- [开源依赖说明](open-source.md)
- [直接依赖许可证清单](open-source-dependencies.md)
- [开源准备清单](open-source-readiness.md)
- [版本记录](release.md)

## 文档维护责任

- 产品规则、业务流程和用户角色变化：更新 `product.md`。
- 前端、后端、数据模型或权限变化：更新 `architecture.md` 和 `development.md`。
- 前端菜单、路由、页面、状态、API、权限或公共组件变化：同步更新 `frontend-architecture.md`。
- 前端端到端流程、状态机、角色可达性或异常分支变化：同步更新 `frontend-business-flows.md`。
- 前后端边界、状态模型、统一文件/审核或迁移规则变化：更新 `frontend-architecture-refactored.md`、`backend-architecture-refactored.md`。
- `frontend-rebuild-review.md` 仅保存非规范性讨论背景；正式决策必须同步到实施规范或源码才生效。
- 部署、迁移、服务器或数据保护变化：更新 `deployment.md`。
- 测试结果和浏览器真实验证记录：更新 `testing.md`。
- 安全、备份、访问控制或密钥处理变化：更新 `security.md`。
- 开源依赖、许可证或开源准备变化：更新 `open-source.md`、`open-source-readiness.md` 和根目录 `THIRD_PARTY_NOTICES.md`。
- 用户可见版本变化：更新 `release.md` 和根目录 `CHANGELOG.md`。
