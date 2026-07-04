# Docker 本地测试部署

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 up -Build
```

如果提示 Docker daemon 不可用，说明本机只有 Docker CLI 或 Docker Desktop 未启动。先启动 Docker Desktop；如果 Windows 容器/WSL 功能未启用，请使用管理员 PowerShell 执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\enable-windows-docker-features.ps1
```

执行后需要重启电脑。

## 访问

- 平台：`http://delivery-platform.localhost:18080`
- 后端健康检查：`http://delivery-platform.localhost:18080/api/v1/health`
- 后端直连调试：`http://127.0.0.1:13000/api/v1/health`
- MinIO 控制台：`http://127.0.0.1:19001`

## 常用命令

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 ps
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 logs
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 health
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 down
powershell -ExecutionPolicy Bypass -File .\scripts\local-docker.ps1 reset
```

`reset` 会删除本地测试数据卷，仅用于清空本机测试环境。
