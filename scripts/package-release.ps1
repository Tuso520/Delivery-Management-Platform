param(
  [string]$ReleaseId = (Get-Date -Format 'yyyyMMdd-HHmmss')
)

$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$OutputDir = Join-Path $Root 'release'
$PackageName = "delivery-platform-deploy-$ReleaseId"
$StageDir = Join-Path ([System.IO.Path]::GetTempPath()) ("delivery-platform-release-" + [System.Guid]::NewGuid().ToString('N'))

function Fail([string]$Message) {
  throw "[package] ERROR: $Message"
}

function Copy-RequiredFile([string]$Source, [string]$Target) {
  $sourcePath = Join-Path $Root $Source
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    Fail "Missing required file: $Source"
  }
  $targetPath = Join-Path $StageDir $Target
  New-Item -ItemType Directory -Force -Path (Split-Path $targetPath -Parent) | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

function Copy-RequiredTree([string]$Source, [string]$Target) {
  $sourcePath = Join-Path $Root $Source
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    Fail "Missing required directory: $Source"
  }
  $targetPath = Join-Path $StageDir $Target
  New-Item -ItemType Directory -Force -Path (Split-Path $targetPath -Parent) | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force
}

function Get-RelativeArchivePath([string]$Path) {
  $rootPath = [System.IO.Path]::GetFullPath($StageDir)
  if (-not $rootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootPath += [System.IO.Path]::DirectorySeparatorChar
  }
  $rootUri = [System.Uri]::new($rootPath)
  $fileUri = [System.Uri]::new([System.IO.Path]::GetFullPath($Path))
  $relative = [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString())
  './' + ($relative -replace '\\', '/')
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

try {
  if ($ReleaseId -notmatch '^[A-Za-z0-9._-]+$') {
    Fail 'ReleaseId can only contain letters, digits, dots, underscores and hyphens'
  }

  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
  New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
  Get-ChildItem -LiteralPath $OutputDir -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq '.DS_Store' -or $_.Name.StartsWith('._') } |
    Remove-Item -Force

  $archiveDir = Join-Path $OutputDir ("archive/" + (Get-Date -Format 'yyyyMMdd'))
  $existingPackages = Get-ChildItem -LiteralPath $OutputDir -File -Filter 'delivery-platform-deploy-*' -ErrorAction SilentlyContinue
  if ($existingPackages.Count -gt 0) {
    New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null
    foreach ($package in $existingPackages) {
      Move-Item -LiteralPath $package.FullName -Destination (Join-Path $archiveDir $package.Name) -Force
    }
  }

  Copy-RequiredFile 'scripts/deploy-latest-release.sh' 'release/deploy-latest-release.sh'
  Copy-Item -LiteralPath (Join-Path $StageDir 'release/deploy-latest-release.sh') -Destination (Join-Path $OutputDir 'deploy-latest-release.sh') -Force
  Remove-Item -LiteralPath (Join-Path $StageDir 'release') -Recurse -Force

  Copy-RequiredFile '.env.example' '.env.example'
  Copy-RequiredFile 'docker-compose.yml' 'docker-compose.yml'
  Copy-RequiredFile 'docker-compose.prod.yml' 'docker-compose.prod.yml'
  Copy-RequiredFile 'deploy.sh' 'deploy.sh'
  Copy-RequiredFile 'rollback.sh' 'rollback.sh'
  Copy-RequiredFile 'healthcheck.sh' 'healthcheck.sh'
  Copy-RequiredFile 'DEPLOYMENT.md' 'DEPLOYMENT.md'
  Copy-RequiredFile 'CHANGELOG.md' 'CHANGELOG.md'
  Copy-RequiredFile 'docker/mysql/init.sql' 'docker/mysql/init.sql'

  foreach ($file in @(
    'Dockerfile', '.dockerignore', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json'
  )) {
    Copy-RequiredFile "delivery-platform-server/$file" "delivery-platform-server/$file"
  }
  Copy-RequiredTree 'delivery-platform-server/prisma' 'delivery-platform-server/prisma'
  Copy-RequiredTree 'delivery-platform-server/src' 'delivery-platform-server/src'

  foreach ($file in @(
    'Dockerfile', '.dockerignore', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'index.html', 'nginx.conf'
  )) {
    Copy-RequiredFile "delivery-platform-web/$file" "delivery-platform-web/$file"
  }
  Copy-RequiredTree 'delivery-platform-web/public' 'delivery-platform-web/public'
  Copy-RequiredTree 'delivery-platform-web/src' 'delivery-platform-web/src'

  Get-ChildItem -LiteralPath $StageDir -Directory -Recurse -Force -Filter '__tests__' |
    Sort-Object FullName -Descending |
    Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $StageDir -File -Recurse -Force |
    Where-Object { $_.Name -match '\.(spec|test)\.ts$' -or $_.Name -eq '.DS_Store' -or $_.Name.StartsWith('._') } |
    Remove-Item -Force

  Write-Utf8NoBom (Join-Path $StageDir 'RELEASE_ID') ($ReleaseId + "`n")
  Write-Utf8NoBom (Join-Path $StageDir 'RELEASE_BUILT_AT') ((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + "`n")

  $manifestLines = Get-ChildItem -LiteralPath $StageDir -File -Recurse -Force |
    Where-Object { $_.Name -ne 'RELEASE_MANIFEST.txt' } |
    Sort-Object FullName |
    ForEach-Object {
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      $size = $_.Length
      $relative = Get-RelativeArchivePath $_.FullName
      "$hash`t$size`t$relative"
    }
  Write-Utf8NoBom (Join-Path $StageDir 'RELEASE_MANIFEST.txt') (($manifestLines -join "`n") + "`n")

  $forbidden = Get-ChildItem -LiteralPath $StageDir -Recurse -Force |
    Where-Object {
      $relative = Get-RelativeArchivePath $_.FullName
      $relative -match '^\./(node_modules|dist|coverage|release|backups|dev-docs|docs|archive|\.git)(/|$)' -or
      $relative -match '(^|/)__tests__(/|$)' -or
      $relative -match '(^|/)\.env$' -or
      $relative -match '(^|/)\._' -or
      $relative -match '\.DS_Store$' -or
      $relative -match '\.(spec|test)\.ts$'
    }
  if ($forbidden) {
    $forbidden | ForEach-Object { Get-RelativeArchivePath $_.FullName } | Write-Error
    Fail 'Release directory contains forbidden files'
  }

  $archivePath = Join-Path $OutputDir "$PackageName.tar.gz"
  $manifestPath = Join-Path $OutputDir "$PackageName.manifest.txt"
  $checksumPath = "$archivePath.sha256"

  Push-Location $StageDir
  try {
    tar -czf $archivePath .
  } finally {
    Pop-Location
  }

  Copy-Item -LiteralPath (Join-Path $StageDir 'RELEASE_MANIFEST.txt') -Destination $manifestPath -Force
  $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Utf8NoBom $checksumPath ("$archiveHash  $PackageName.tar.gz`n")
  Get-ChildItem -LiteralPath $OutputDir -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq '.DS_Store' -or $_.Name.StartsWith('._') } |
    Remove-Item -Force

  Write-Host "[package] RELEASE_ID: $ReleaseId"
  Write-Host "[package] Archive: $archivePath"
  Write-Host "[package] SHA256: $checksumPath"
  Write-Host "[package] Manifest: $manifestPath"
} finally {
  if (Test-Path -LiteralPath $StageDir) {
    Remove-Item -LiteralPath $StageDir -Recurse -Force
  }
}
