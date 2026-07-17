param(
  [string]$NodeExecutable,
  [string]$ServerRoot = (Join-Path $PSScriptRoot '..\delivery-platform-server')
)

$ErrorActionPreference = 'Stop'
$required = @('DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'SEED_ADMIN_PASSWORD', 'SEED_DEFAULT_PASSWORD', 'FIELD_TEST_MYSQL_PASSWORD')
foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Missing test environment variable $name" }
}

$ErrorActionPreference = 'Continue'
docker start dmp-field-mysql dmp-field-redis dmp-field-minio | Out-Null
for ($index = 0; $index -lt 20; $index++) {
  docker exec dmp-field-mysql mysqladmin ping -uroot "-p$env:FIELD_TEST_MYSQL_PASSWORD" --silent 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
}

$insertSql = "INSERT IGNORE INTO projects (id, project_code, project_name, country_code, status, current_stage, risk_level, created_at, updated_at) VALUES ('field-ref-project', 'FIELD-REF-001', 'Field reference project', 'CN', 'ACTIVE', 'STARTUP', 'Low', NOW(3), NOW(3));"
$insertSql | docker exec -i dmp-field-mysql mysql -uroot "-p$env:FIELD_TEST_MYSQL_PASSWORD" delivery_field_test
$ErrorActionPreference = 'Stop'

$env:NODE_ENV = 'test'
$env:PORT = '33000'
$env:MINIO_ENDPOINT = '127.0.0.1'
$env:MINIO_PORT = '39000'
$env:MINIO_ACCESS_KEY = 'fieldtest'
$env:MINIO_SECRET_KEY = 'FieldTestMinio_2026'
$env:MINIO_BUCKET = 'delivery-field-test'
$stdout = Join-Path $ServerRoot '.codex-field-api.out.log'
$stderr = Join-Path $ServerRoot '.codex-field-api.err.log'
$server = Start-Process -FilePath $NodeExecutable -ArgumentList 'dist/main.js' -WorkingDirectory $ServerRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden

try {
  $ready = $false
  for ($index = 0; $index -lt 30; $index++) {
    try {
      Invoke-RestMethod -Uri 'http://127.0.0.1:33000/api/v1/health' -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'API_NOT_READY' }

  $adminLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:33000/api/v1/auth/login' -ContentType 'application/json' -Body (@{ username = 'admin'; password = $env:SEED_ADMIN_PASSWORD } | ConvertTo-Json)
  $userLogin = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:33000/api/v1/auth/login' -ContentType 'application/json' -Body (@{ username = 'standard_zhou'; password = $env:SEED_DEFAULT_PASSWORD } | ConvertTo-Json)
  $adminHeaders = @{ Authorization = "Bearer $($adminLogin.data.accessToken)" }
  $userHeaders = @{ Authorization = "Bearer $($userLogin.data.accessToken)" }
  $categories = Invoke-RestMethod -Headers $adminHeaders -Uri 'http://127.0.0.1:33000/api/v1/field-config/categories'
  Write-Output "ADMIN_CATEGORIES_STATUS=200 COUNT=$($categories.data.Count)"
  try {
    Invoke-RestMethod -Headers $userHeaders -Uri 'http://127.0.0.1:33000/api/v1/field-config/categories' | Out-Null
    Write-Output 'NON_ADMIN_STATUS=UNEXPECTED_200'
  } catch { Write-Output "NON_ADMIN_STATUS=$([int]$_.Exception.Response.StatusCode)" }

  $projectType = $categories.data | Where-Object categoryCode -eq 'PROJECT_TYPE'
  $createUri = "http://127.0.0.1:33000/api/v1/field-config/categories/$($projectType.id)/values"
  $created = Invoke-RestMethod -Method Post -Headers $adminHeaders -Uri $createUri -ContentType 'application/json' -Body (@{ name = 'API test type'; code = 'API_TEST_TYPE'; sortOrder = 900 } | ConvertTo-Json)
  Write-Output "CREATE_STATUS=201 ID=$($created.data.id)"
  try { Invoke-RestMethod -Method Post -Headers $adminHeaders -Uri $createUri -ContentType 'application/json' -Body (@{ name = 'API test type'; code = 'API_TEST_TYPE_2'; sortOrder = 901 } | ConvertTo-Json) | Out-Null } catch { Write-Output "DUPLICATE_NAME_STATUS=$([int]$_.Exception.Response.StatusCode)" }
  try { Invoke-RestMethod -Method Post -Headers $adminHeaders -Uri $createUri -ContentType 'application/json' -Body (@{ name = 'API test type two'; code = 'API_TEST_TYPE'; sortOrder = 902 } | ConvertTo-Json) | Out-Null } catch { Write-Output "DUPLICATE_CODE_STATUS=$([int]$_.Exception.Response.StatusCode)" }

  $valueUri = "http://127.0.0.1:33000/api/v1/field-config/values/$($created.data.id)"
  $updated = Invoke-RestMethod -Method Patch -Headers $adminHeaders -Uri $valueUri -ContentType 'application/json' -Body (@{ name = 'API test type edited'; code = 'API_TEST_TYPE_EDITED'; sortOrder = 905 } | ConvertTo-Json)
  Write-Output "UPDATE_STATUS=200 NAME=$($updated.data.name)"
  $disabled = Invoke-RestMethod -Method Patch -Headers $adminHeaders -Uri "$valueUri/status" -ContentType 'application/json' -Body (@{ status = 'Inactive' } | ConvertTo-Json)
  Write-Output "DISABLE_STATUS=200 STATUS=$($disabled.data.status)"
  $enabled = Invoke-RestMethod -Method Patch -Headers $adminHeaders -Uri "$valueUri/status" -ContentType 'application/json' -Body (@{ status = 'Active' } | ConvertTo-Json)
  Write-Output "ENABLE_STATUS=200 STATUS=$($enabled.data.status)"

  $countryOptions = Invoke-RestMethod -Headers $userHeaders -Uri 'http://127.0.0.1:33000/api/v1/field-options/COUNTRY'
  Write-Output "READONLY_STATUS=200 ACTIVE_VALUES=$($countryOptions.data.values.Count)"
  $country = $categories.data | Where-Object categoryCode -eq 'COUNTRY'
  $countryValues = Invoke-RestMethod -Headers $adminHeaders -Uri "http://127.0.0.1:33000/api/v1/field-config/categories/$($country.id)/values"
  $cn = $countryValues.data | Where-Object code -eq 'CN'
  $reference = Invoke-RestMethod -Headers $adminHeaders -Uri "http://127.0.0.1:33000/api/v1/field-config/values/$($cn.id)/reference-status"
  Write-Output "REFERENCE_STATUS=200 REFERENCED=$($reference.data.referenced) TOTAL=$($reference.data.total)"
  try { Invoke-RestMethod -Method Delete -Headers $adminHeaders -Uri "http://127.0.0.1:33000/api/v1/field-config/values/$($cn.id)" | Out-Null } catch { Write-Output "REFERENCED_DELETE_STATUS=$([int]$_.Exception.Response.StatusCode)" }
  Invoke-RestMethod -Method Delete -Headers $adminHeaders -Uri $valueUri | Out-Null
  Write-Output 'CUSTOM_DELETE_STATUS=200'
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  if (Test-Path -LiteralPath $stderr) {
    $errors = [System.IO.File]::ReadAllText($stderr)
    if ($errors.Trim()) { Write-Output $errors }
  }
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
