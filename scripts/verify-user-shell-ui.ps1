[CmdletBinding()]
param(
  [ValidateSet('msedge', 'chrome', 'chromium')]
  [string]$BrowserChannel = 'msedge',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Core') {
  throw '请使用 PowerShell 7（pwsh.exe）运行本脚本。'
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $projectRoot 'delivery-platform-web'
$workRoot = Join-Path $projectRoot '.ai-work/user-shell-ui'
$port = 18080
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

function New-EphemeralSecret {
  return [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
}

$adminPassword = New-EphemeralSecret
$pmPassword = New-EphemeralSecret
$env:LOCAL_TEST_ADMIN_PASSWORD = $adminPassword
$env:LOCAL_TEST_PM_PASSWORD = $pmPassword
$env:LOCAL_TEST_PORT = [string]$port
$env:LOCAL_TEST_HOST = '127.0.0.1'
$env:PLAYWRIGHT_WEB_BASE_URL = "http://127.0.0.1:$port"
$env:PLAYWRIGHT_BROWSER_CHANNEL = if ($BrowserChannel -eq 'chromium') { '' } else { $BrowserChannel }
$env:E2E_ADMIN_USERNAME = 'admin'
$env:E2E_ADMIN_PASSWORD = $adminPassword

if (-not $SkipBuild) {
  Push-Location $webRoot
  try {
    & (Join-Path $webRoot 'node_modules/.bin/vite.cmd') build
    if ($LASTEXITCODE -ne 0) { throw "前端构建失败，退出码 $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$server = Start-Process -FilePath $node `
  -ArgumentList (Join-Path $projectRoot 'scripts/local-test-server.mjs') `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput (Join-Path $workRoot 'mock-server.log') `
  -RedirectStandardError (Join-Path $workRoot 'mock-server.error.log') `
  -WindowStyle Hidden `
  -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $ready) { throw '本地模拟服务未在 10 秒内启动。' }

  Push-Location $webRoot
  try {
    & (Join-Path $webRoot 'node_modules/.bin/playwright.cmd') test `
      tests/ui/user-shell-layout.spec.ts `
      --config playwright.ui.config.ts `
      --reporter list
    if ($LASTEXITCODE -ne 0) { throw "用户中心浏览器验收失败，退出码 $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
    $server.WaitForExit()
  }
}

Write-Output '[user-shell-ui] PASS'
