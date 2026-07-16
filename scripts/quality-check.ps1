param(
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Server = Join-Path $Root 'delivery-platform-server'
$Web = Join-Path $Root 'delivery-platform-web'

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command
}

Invoke-Step 'Check pnpm version' {
  $version = (pnpm --version).Trim()
  if ($version -ne '10.34.4') {
    throw "Expected pnpm 10.34.4, got $version"
  }
}

Invoke-Step 'Development preflight' {
  node (Join-Path $Root 'scripts/preflight.mjs')
}

Invoke-Step 'Document fact verification' {
  node (Join-Path $Root 'scripts/verify-doc-facts.mjs')
}

if (-not $SkipInstall) {
  Invoke-Step 'Install backend dependencies' {
    Push-Location $Server
    try {
      $env:CI = 'true'
      pnpm install --frozen-lockfile --prefer-offline
    } finally {
      Pop-Location
    }
  }

  Invoke-Step 'Install frontend dependencies' {
    Push-Location $Web
    try {
      $env:CI = 'true'
      pnpm install --frozen-lockfile --prefer-offline
    } finally {
      Pop-Location
    }
  }
}

Invoke-Step 'Backend type-check' {
  Push-Location $Server
  try {
    pnpm prisma:generate
    pnpm type-check
  } finally {
    Pop-Location
  }
}

Invoke-Step 'Backend tests' {
  Push-Location $Server
  try { pnpm test --runInBand } finally { Pop-Location }
}

if (-not $SkipBuild) {
  Invoke-Step 'Backend build' {
    Push-Location $Server
    try { pnpm build } finally { Pop-Location }
  }
}

Invoke-Step 'Frontend type-check' {
  Push-Location $Web
  try { pnpm type-check } finally { Pop-Location }
}

Invoke-Step 'Frontend tests' {
  Push-Location $Web
  try { pnpm test } finally { Pop-Location }
}

if (-not $SkipBuild) {
  Invoke-Step 'Frontend build' {
    Push-Location $Web
    try {
      pnpm build
      pnpm budget
    } finally { Pop-Location }
  }
}

Write-Host ""
Write-Host 'Quality check completed.'
