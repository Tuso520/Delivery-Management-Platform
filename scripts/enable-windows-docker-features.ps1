$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal] $identity
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  throw 'Run this script from an elevated PowerShell session.'
}

$features = @(
  'Containers',
  'Microsoft-Hyper-V',
  'VirtualMachinePlatform',
  'Microsoft-Windows-Subsystem-Linux'
)

foreach ($feature in $features) {
  Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
}

Write-Host 'Windows Docker/WSL features enabled. Reboot Windows, start Docker Desktop or dockerd, then run scripts/local-docker.ps1 up -Build.'
