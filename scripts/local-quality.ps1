[CmdletBinding()]
param(
  [ValidateSet('quick', 'full')]
  [string]$Mode = 'quick'
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Core') {
  throw '请使用 PowerShell 7（pwsh.exe）运行本脚本。'
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $projectRoot 'delivery-platform-web'
$serverRoot = Join-Path $projectRoot 'delivery-platform-server'
$webBin = Join-Path $webRoot 'node_modules/.bin'
$serverBin = Join-Path $serverRoot 'node_modules/.bin'
$nodeVersion = (& node --version).Trim()
$pnpmVersion = (& pnpm.cmd --version).Trim()
Write-Host "本地运行时：Node $nodeVersion，pnpm $pnpmVersion（CI 固定 Node 20 / pnpm 10.34.4）"
if ($nodeVersion -notmatch '^v(20|2[1-9]|[3-9][0-9])\.') {
  throw "Node.js 版本过低：$nodeVersion；至少需要 Node 20。"
}

function Invoke-Checked {
  param([string]$Label, [scriptblock]$Command)
  Write-Host "`n== $Label =="
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label FAIL（退出码 $LASTEXITCODE）" }
  Write-Host "$Label PASS"
}

Invoke-Checked '架构边界' { node (Join-Path $projectRoot 'scripts/check-architecture-boundaries.mjs') }
Invoke-Checked '权限契约' { node (Join-Path $projectRoot 'scripts/sync-access-control-contract.mjs') }
Invoke-Checked 'Prisma 运行时边界' { node (Join-Path $projectRoot 'scripts/check-prisma-runtime-boundaries.mjs') }
Invoke-Checked '文档事实' { node (Join-Path $projectRoot 'scripts/verify-doc-facts.mjs') }
Invoke-Checked '发布契约' {
  node --test `
    (Join-Path $projectRoot 'scripts/release/release-manifest.test.mjs') `
    (Join-Path $projectRoot 'scripts/release/release-shell-contract.test.mjs') `
    (Join-Path $projectRoot 'scripts/release/test-runtime-acceptance-contract.test.mjs')
}
Invoke-Checked '前端 ESLint（只读）' {
  & (Join-Path $webBin 'eslint.cmd') --ext .vue,.ts (Join-Path $webRoot 'src')
}
Invoke-Checked '前端 TypeScript' {
  Push-Location $webRoot
  try { & (Join-Path $webBin 'vue-tsc.cmd') --noEmit } finally { Pop-Location }
}
Invoke-Checked '后端 ESLint（只读）' {
  Push-Location $serverRoot
  try { & (Join-Path $serverBin 'eslint.cmd') '{src,test,prisma}/**/*.ts' } finally { Pop-Location }
}
Invoke-Checked '后端 TypeScript' {
  Push-Location $serverRoot
  try { & (Join-Path $serverBin 'tsc.cmd') --noEmit } finally { Pop-Location }
}

if ($Mode -eq 'full') {
  Invoke-Checked '前端单元测试' {
    Push-Location $webRoot
    try { & (Join-Path $webBin 'vitest.cmd') run } finally { Pop-Location }
  }
  Invoke-Checked '前端构建' {
    Push-Location $webRoot
    try { & (Join-Path $webBin 'vite.cmd') build } finally { Pop-Location }
  }
  Invoke-Checked '前端体积预算' { node (Join-Path $projectRoot 'scripts/check-web-bundle-budget.mjs') }
  Invoke-Checked '后端单元测试' {
    Push-Location $serverRoot
    try { & (Join-Path $serverBin 'jest.cmd') --runInBand } finally { Pop-Location }
  }
  Invoke-Checked '后端构建' {
    Push-Location $serverRoot
    try { & (Join-Path $serverBin 'nest.cmd') build } finally { Pop-Location }
  }
}

Write-Host "`n本地 $Mode 检查全部 PASS；未启动 Docker、WSL、MySQL、Redis 或 MinIO。"
