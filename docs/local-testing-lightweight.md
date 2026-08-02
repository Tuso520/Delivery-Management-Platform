# 本地轻量化测试

本地默认测试不再依赖 WSL、Docker Desktop、MySQL、Redis 或 MinIO。完整真实依赖验收移到 GitHub Release 的 integration 作业；本机只承担快速反馈和视觉对比。

## 环境

- Windows PowerShell 7。
- Node.js 20 为正式基线；更高版本可用于本地诊断，但最终结论以 CI 的 Node 20 为准。
- pnpm 10.34.4。
- 已安装 Microsoft Edge、Chrome，或 Playwright Chromium。

## 快速质量检查

日常改动执行：

```powershell
pwsh.exe -NoLogo -NoProfile -File scripts/local-quality.ps1 -Mode quick
```

它会执行架构边界、权限契约、Prisma 运行时边界、文档事实、Release Manifest/发布顺序单测、前后端只读 ESLint 和 TypeScript 检查。脚本不调用 Docker 或 WSL，也不会使用 `lint` 脚本中的 `--fix` 修改源码。

提交前执行：

```powershell
pwsh.exe -NoLogo -NoProfile -File scripts/local-quality.ps1 -Mode full
```

full 在 quick 基础上增加前后端单元测试、构建和前端体积预算。真实 MySQL/Redis/MinIO、migration、API E2E 和浏览器 E2E 由 GitHub Release integration 使用最终构建物完成。

## 视觉对比

执行：

```powershell
pwsh.exe -NoLogo -NoProfile -File scripts/local-visual.ps1
```

流程为：构建前端静态包、启动进程内模拟 API、用单个浏览器 Worker 运行项目台账/项目档案/档案模板/项目弹窗/标准库视觉契约、生成 HTML 报告、关闭模拟服务。凭据每次随机生成，只存在于脚本子进程环境。

输出：

- `.ai-work/visual-report/index.html`：设计参考、本次截图和差异叠加。
- `.ai-work/visual-report/playwright/index.html`：断言、trace 和失败上下文。

`.ai-work` 已被 Git 忽略。页面测试截图和报告都留在项目目录内，不提交 Git。

如果前端刚刚构建过且只修改了模拟服务或测试，可缩短为：

```powershell
pwsh.exe -NoLogo -NoProfile -File scripts/local-visual.ps1 -SkipBuild
```

视觉基准映射由 `delivery-platform-web/tests/visual-comparison.json` 管理。设计参考图片不存在时，报告会明确显示“缺少设计基准”，不会把当前实现冒充设计稿。更新基准必须来自已确认设计，并放入清单声明的 `.ai-work` 路径。

## 结果判定

- 脚本退出码 `0` 且每项打印 `PASS`，才算本地通过。
- 任一 Playwright 失败时，视觉报告仍会生成，但整个命令为 FAIL。
- 本地模拟服务只验证页面契约和视觉，不证明权限、事务、对象存储或 migration 正确。
- 发布是否可部署只由 GitHub quality、Release integration、服务器 Release ID 和内外网健康检查共同判定。
