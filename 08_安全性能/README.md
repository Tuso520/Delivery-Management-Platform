# 安全性能

安全和性能检查以公司标准、Docker 本地测试结果和依赖审计为准。

当前安全基线：

- JWT 密钥在生产启动时强制长度不低于 32 位
- 前端 Nginx 开启基础安全响应头
- 后端启用 Helmet、CORS 白名单、全局参数校验和登录限流
- 生产数据库迁移使用 Prisma Migrate，不使用危险 `db push --accept-data-loss`
