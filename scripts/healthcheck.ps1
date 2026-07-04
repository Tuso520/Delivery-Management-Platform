param(
  [string]$BaseUrl = "http://delivery-platform.localhost:18080"
)

$ErrorActionPreference = 'Stop'

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url
  )

  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$Name returned HTTP $($response.StatusCode): $Url"
  }
  Write-Host "[healthcheck] $Name: ok"
}

Test-Endpoint 'frontend' "$BaseUrl/health"
Test-Endpoint 'backend' "$BaseUrl/api/v1/health"
Test-Endpoint 'build-info' "$BaseUrl/build-info.json"

Write-Host "[healthcheck] all checks passed: $BaseUrl"
