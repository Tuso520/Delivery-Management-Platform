param(
  [string]$NodeExecutable,
  [string]$PnpmCli,
  [string]$ProjectRoot = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$serverRoot = Join-Path $ProjectRoot 'delivery-platform-server'
$webRoot = Join-Path $ProjectRoot 'delivery-platform-web'
$logs = @(
  (Join-Path $serverRoot '.codex-field-ui-api.out.log'),
  (Join-Path $serverRoot '.codex-field-ui-api.err.log'),
  (Join-Path $webRoot '.codex-field-ui-web.out.log'),
  (Join-Path $webRoot '.codex-field-ui-web.err.log')
)

$ErrorActionPreference = 'Continue'
docker start dmp-field-mysql dmp-field-redis dmp-field-minio | Out-Null
for ($index = 0; $index -lt 20; $index++) {
  docker exec dmp-field-mysql mysqladmin ping -uroot "-p$env:FIELD_TEST_MYSQL_PASSWORD" --silent 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
}
$ErrorActionPreference = 'Stop'

$env:NODE_ENV = 'test'
$env:PORT = '33000'
$env:MINIO_ENDPOINT = '127.0.0.1'
$env:MINIO_PORT = '39000'
$env:MINIO_ACCESS_KEY = 'fieldtest'
$env:MINIO_SECRET_KEY = 'FieldTestMinio_2026'
$env:MINIO_BUCKET = 'delivery-field-test'
$env:VITE_PROXY_TARGET = 'http://127.0.0.1:33000'

$api = Start-Process -FilePath $NodeExecutable -ArgumentList 'dist/main.js' -WorkingDirectory $serverRoot -RedirectStandardOutput $logs[0] -RedirectStandardError $logs[1] -PassThru -WindowStyle Hidden
$web = Start-Process -FilePath $NodeExecutable -ArgumentList 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '35173' -WorkingDirectory $webRoot -RedirectStandardOutput $logs[2] -RedirectStandardError $logs[3] -PassThru -WindowStyle Hidden

try {
  for ($index = 0; $index -lt 30; $index++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:35173' -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
  }
  $env:PLAYWRIGHT_WEB_BASE_URL = 'http://127.0.0.1:35173'
  $env:PLAYWRIGHT_BROWSER_CHANNEL = 'msedge'
  $env:E2E_ADMIN_USERNAME = 'admin'
  $env:E2E_ADMIN_PASSWORD = $env:SEED_ADMIN_PASSWORD
  Push-Location $webRoot
  try {
    & $NodeExecutable $PnpmCli exec playwright test tests/ui/field-settings.spec.ts --config playwright.ui.config.ts
    if ($LASTEXITCODE -ne 0) { throw "Playwright failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
} finally {
  foreach ($process in @($api, $web)) {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  }
  foreach ($log in $logs) {
    if (Test-Path -LiteralPath $log) {
      $content = [System.IO.File]::ReadAllText($log)
      if ($content -match '(?i)(error|exception)') { Write-Output $content }
    }
  }
  Remove-Item -LiteralPath $logs -Force -ErrorAction SilentlyContinue
}
