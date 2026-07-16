# 贡献规范

## 开发流程

1. 先阅读 `docs/` 下与本次修改相关的产品、架构和开发文档。
2. 修改范围要聚焦在当前需求涉及的模块，避免夹带无关重构。
3. 前端界面默认使用 Arco Design Vue，除非文档中明确记录了例外。
4. 行为、部署、数据模型、权限或用户流程发生变化时，必须同步更新文档。
5. 提交前按影响范围执行类型检查、测试、构建或浏览器验证。

## 本地校验

```powershell
pnpm --dir delivery-platform-web lint
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --dir delivery-platform-server lint
pnpm --dir delivery-platform-server type-check
pnpm --dir delivery-platform-server test
pnpm --dir delivery-platform-server build
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q
```

涉及页面、登录、上传、预览、审批、标准、知识或项目流程时，必须连接真实 NestJS、MySQL、Redis 和 MinIO 执行 API 与浏览器验证；本地模拟服务只用于页面开发，不能代替权限、数据范围、事务或迁移验收。

## 提交规则

- 不提交 `.env`、生产备份、发布包、浏览器截图和构建产物。
- 不提交生产密钥、服务器密码、GitHub Token、数据库密码和私有部署日志。
- 提交信息保持简洁，说明本次行为变化。
- 推荐格式：`docs(project): update Chinese documentation`。

## 合并检查清单

- 产品行为已经按需要更新文档。
- API、数据模型、权限或部署变化已经按需要更新文档。
- 类型检查、测试和构建已经按影响范围执行。
- 用户可见界面已经通过浏览器验证。
- 迁移、部署和数据保护风险已经说明清楚。
