# 测试验收

## 必跑检查

提交前按影响范围执行，涉及本轮登录、文件预览和部署链路时应执行完整集合：

```powershell
pnpm --dir delivery-platform-web type-check
pnpm --dir delivery-platform-web test
pnpm --dir delivery-platform-web build
pnpm --filter ./delivery-platform-server type-check
pnpm --filter ./delivery-platform-server test
docker compose --env-file .env.example -f docker-compose.yml config -q
docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.prod.yml config -q
```

部署工作流还会校验测试 Compose 和部署脚本：

```powershell
docker compose --env-file .env.local.example -f docker-compose.test.yml config -q
bash -n deploy-git.sh
```

## 本地真实浏览器验证

涉及登录、知识库、文档模板、项目台账、项目档案、文件预览或上传审批时，构建前端后启动本地模拟服务：

```powershell
pnpm --dir delivery-platform-web build
node scripts/local-test-server.mjs
```

默认地址为 `http://127.0.0.1:18080`。`admin / Admin@123` 和 `pm_wang / Pm@123456` 只属于该本地模拟服务，不是生产固定账号；错误账号或错误密码应返回统一的“用户名或密码错误”，不得用任意密码登录。

浏览器回归至少覆盖：

- 管理员和项目经理使用正确密码登录，旧密码、错误密码和未知账号登录失败；登录失败只出现一次明确提示。
- 用户新增、编辑和重置密码表单按规则阻止空值、过短或超长密码；重置后只允许新密码登录。
- 数据看板按角色展示欢迎语和重点信息。
- 项目台账列表、关键词搜索和行操作。
- 项目档案阶段页签、上传说明、文件详情、上传入口和审批入口。
- 文件审核、知识库、文档模板、审批配置、培训资料和档案记录等文件入口都在当前页面打开统一弹窗，不新开预览页或浏览器标签。
- 预览弹窗宽度接近视口宽度、内容区占满可用高度，紧凑模式不显示重复文件信息或多余留白。
- PDF、图片、Markdown、文本、Word、Excel、PowerPoint 和视频预览；支持样例时再覆盖 XMind、音频和大图。
- ONLYOFFICE 未配置或不可用时，Office 文件仍在同一弹窗内进入兼容只读预览；旧版二进制 Office 无法提取内容以及 CAD、Visio 未配置转换服务时，应显示明确的降级提示。
- 文件预览和文件下载分别记录对应操作，预览内容读取不应误计为下载热度。
- 文件审批通过、驳回和新旧文件差异对比链路。
- 浏览器控制台无本次变更新增的运行时错误。

浏览器截图、录屏、日志和临时测试产物不进入 Git。

## 接口与自动化回归

文件预览相关改动至少验证：

- `GET /api/v1/files/:id/preview-session` 返回预览路由，但不返回 `storagePath`。
- `GET /api/v1/files/:id/signed-content` 和 `signed-thumbnail` 只接受有效的短时令牌。
- `GET /api/v1/files/:id/preview-content` 和 `GET /api/v1/attachments/:id/preview-content` 需要登录态和预览/下载权限，并记录预览审计。
- Office 编辑模式只在后端权限允许且 ONLYOFFICE 配置完整时返回。
- Markdown 原始 HTML 被转义，标题、目录、代码块和表格正常渲染。
- `GET /api/v1/ready` 在 MySQL、Redis、MinIO 都可用时返回 `status: ready`，任一依赖失败时返回服务不可用。

相关测试可以单独定位运行，但最终验收仍以完整前后端测试为准：

```powershell
pnpm --filter ./delivery-platform-server test -- attachment-preview.util.spec.ts file-preview-content.spec.ts app.service.spec.ts
pnpm --dir delivery-platform-web test -- useFilePreview.spec.ts
```

## GitHub 自动部署验收

推送 `main` 后检查同一提交对应的 GitHub Actions：

1. `quality` 和 `validate` 均成功后，`deploy` 才能开始。
2. `deploy` 使用 Environment `test`，且 SSH host key 由 `DEPLOY_KNOWN_HOSTS` 固定校验。
3. Actions 中显示的部署提交、测试服务器 `build-info.json.releaseId` 和目标 Git 提交一致。
4. 测试服务器 `/api/v1/ready` 返回就绪，登录和统一预览关键路径完成浏览器冒烟验证。
5. Actions 失败时保留失败事实并检查缺失的 Environment 配置、服务器诊断日志和回滚结果，不把“工作流已配置”写成“自动部署已成功”。

## 历史验证基线

2026-07-08，版本 `1df2a618471e` 曾在 `http://42.193.176.248:8080` 完成管理员/项目经理登录、项目台账、项目档案及知识库 PDF、Word、Excel、PPT 预览验证。该历史结果不覆盖当前提交，也不能作为本轮 GitHub 自动部署成功的证据。
