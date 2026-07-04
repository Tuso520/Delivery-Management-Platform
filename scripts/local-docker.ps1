param(
  [ValidateSet('up', 'down', 'restart', 'logs', 'ps', 'health', 'reset')]
  [string]$Action = 'up',
  [switch]$Build
)

$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$ComposeArgs = @(
  '--project-name', 'delivery-platform-local',
  '--env-file', '.env.local',
  '-f', 'docker-compose.test.yml'
)
$script:ComposeExecutable = $null
$script:ComposePrefix = @()

function Assert-DockerDaemon {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    docker info *> $null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    throw @"
Docker daemon is not running.

Current machine has Docker CLI, but cannot connect to npipe:////./pipe/docker_engine.
Start Docker Desktop, or run scripts\enable-windows-docker-features.ps1 in an elevated PowerShell and reboot before retrying.
"@
  }
}

function Invoke-Compose {
  param([string[]]$ComposeCommandArgs)
  Push-Location $Root
  try {
    Initialize-ComposeCommand
    $allArgs = @($script:ComposePrefix + $ComposeArgs + $ComposeCommandArgs)
    & $script:ComposeExecutable @allArgs
  } finally {
    Pop-Location
  }
}

function Initialize-ComposeCommand {
  if ($script:ComposeExecutable) { return }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
      $script:ComposeExecutable = 'docker'
      $script:ComposePrefix = @('compose')
      return
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $script:ComposeExecutable = 'docker-compose'
    $script:ComposePrefix = @()
    return
  }

  throw 'Docker Compose is not installed. Install Docker Compose v2 plugin or docker-compose.exe.'
}

switch ($Action) {
  'up' {
    Assert-DockerDaemon
    $args = @('up', '-d')
    if ($Build) { $args += '--build' }
    Invoke-Compose $args
    & (Join-Path $PSScriptRoot 'healthcheck.ps1')
  }
  'down' {
    Assert-DockerDaemon
    Invoke-Compose @('down')
  }
  'restart' {
    Assert-DockerDaemon
    Invoke-Compose @('restart')
    & (Join-Path $PSScriptRoot 'healthcheck.ps1')
  }
  'logs' {
    Assert-DockerDaemon
    Invoke-Compose @('logs', '-f', '--tail=200')
  }
  'ps' {
    Assert-DockerDaemon
    Invoke-Compose @('ps')
  }
  'health' {
    & (Join-Path $PSScriptRoot 'healthcheck.ps1')
  }
  'reset' {
    Assert-DockerDaemon
    Invoke-Compose @('down', '-v', '--remove-orphans')
  }
}
