$envFile = Join-Path $PSScriptRoot ".env"

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.*)\s*$') {
      [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
  }
}

$required = @('GOOGLE_CLIENT_ID', 'SESSION_SECRET', 'ADMIN_EMAILS')
foreach ($key in $required) {
  if (-not [System.Environment]::GetEnvironmentVariable($key)) {
    Write-Error "ERROR: $key is not set. Fill it in your .env file."
    exit 1
  }
}

Set-Location $PSScriptRoot
node server.js
