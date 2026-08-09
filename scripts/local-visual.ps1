[CmdletBinding()]
param(
  [ValidateSet('msedge', 'chrome', 'chromium')]
  [string]$BrowserChannel = 'msedge',
  [switch]$SkipBuild,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Core') {
  throw '请使用 PowerShell 7（pwsh.exe）运行本脚本。'
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $projectRoot 'delivery-platform-web'
$workRoot = Join-Path $projectRoot '.ai-work/local-visual'
$reportRoot = Join-Path $projectRoot '.ai-work/visual-report'
$playwrightReport = Join-Path $reportRoot 'playwright'
$serverLog = Join-Path $workRoot 'mock-server.log'
$serverErrorLog = Join-Path $workRoot 'mock-server.error.log'
$port = 18080

New-Item -ItemType Directory -Force -Path $workRoot, $reportRoot | Out-Null

# Remove only known generated screenshots so the report never presents a stale
# image as the result of the current run. Design references are left untouched.
$currentScreenshots = @(
  (Join-Path $projectRoot '.ai-work/acceptance-project-overview-1440x900.png'),
  (Join-Path $projectRoot '.ai-work/acceptance-archive-template-1440x900.png'),
  (Join-Path $projectRoot '.ai-work/acceptance-standard-library-1440x900.png'),
  (Join-Path $projectRoot '.ai-work/acceptance-user-shell-1440x900.png'),
  (Join-Path $projectRoot '.ai-work/project-archive-43-317/local-1440x900.png'),
  (Join-Path $projectRoot '.ai-work/project-modal/local-create-1440x900.png')
)
Remove-Item -LiteralPath $currentScreenshots -Force -ErrorAction SilentlyContinue

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
$env:PLAYWRIGHT_HTML_OUTPUT_DIR = $playwrightReport
$env:E2E_ADMIN_USERNAME = 'admin'
$env:E2E_ADMIN_PASSWORD = $adminPassword
$env:E2E_LIMITED_USERNAME = 'pm_wang'
$env:E2E_LIMITED_PASSWORD = $pmPassword
$env:VITE_RELEASE_ID = "local-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

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
  -RedirectStandardOutput $serverLog `
  -RedirectStandardError $serverErrorLog `
  -WindowStyle Hidden `
  -PassThru

$testExitCode = 1
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
      tests/ui/project-overview-layout.spec.ts `
      tests/ui/project-archive-layout.spec.ts `
      tests/ui/project-detail-dialog.spec.ts `
      tests/ui/standard-library-figma.spec.ts `
      tests/ui/user-shell-layout.spec.ts `
      tests/ui/sidebar-embedded-layout.spec.ts `
      --config playwright.ui.config.ts `
      --grep 'match'
    $testExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
    $server.WaitForExit()
  }
  & $node (Join-Path $projectRoot 'scripts/generate-visual-report.mjs') --output '.ai-work/visual-report'
  if ($LASTEXITCODE -ne 0) { throw "视觉报告生成失败，退出码 $LASTEXITCODE" }
}

$reportPath = Join-Path $reportRoot 'index.html'
Write-Host "视觉对比报告：$reportPath"
Write-Host "Playwright 测试报告：$(Join-Path $playwrightReport 'index.html')"
if (-not $NoOpen) {
  Start-Process $reportPath
}
if ($testExitCode -ne 0) {
  throw "视觉验收失败，退出码 $testExitCode；报告仍已生成。"
}
