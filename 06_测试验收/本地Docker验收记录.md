# 本地 Docker 验收记录

## 环境

- 本地域名：`http://delivery-platform.localhost:18080`
- 后端调试地址：`http://127.0.0.1:13000/api/v1/health`
- Compose 文件：`docker-compose.test.yml`
- 环境文件：`.env.local`

## 验收命令

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
powershell -ExecutionPolicy Bypass -File .\scripts\healthcheck.ps1
```

## 当前环境备注

- 当前机器检测到 Docker CLI，但 Docker daemon 未运行。
- 直接启动 Scoop `dockerd.exe` 失败：缺少 Windows Containers 功能。
- 当前 Codex 进程不是管理员，无法启用 Windows 可选功能。
- 当前机器没有 Docker Compose v2 子命令，但存在 `docker-compose.exe`；`scripts/local-docker.ps1` 已改为自动回退。
- `docker-compose --project-name delivery-platform-local --env-file .env.local -f docker-compose.test.yml config` 已通过。

## 验收项

- [x] Compose 配置可解析
- [ ] 前端 `/health` 返回成功（等待 Docker daemon）
- [ ] 后端 `/api/v1/health` 返回成功（等待 Docker daemon）
- [ ] `/build-info.json` 可访问
- [ ] 登录页可访问
- [ ] 管理员账号可登录
- [ ] 工作台页面加载成功
- [ ] 项目、知识、绩效、系统设置核心菜单可打开
- [ ] 知识库样例 doc/xlsx/ppt/pdf/图片附件可在线预览（等待 Docker daemon）
