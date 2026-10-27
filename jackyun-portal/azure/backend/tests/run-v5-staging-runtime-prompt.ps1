$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$secure = Read-Host 'Staging database password (hidden; never paste it into chat)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$previous = @{
  PGHOST = $env:PGHOST; PGDATABASE = $env:PGDATABASE; PGUSER = $env:PGUSER; PGPASSWORD = $env:PGPASSWORD
}
try {
  $env:PGHOST = 'jackyunasia.postgres.database.azure.com'
  $env:PGDATABASE = 'jackyun_v5_stage_20261026'
  $env:PGUSER = 'jackyun_sync_login'
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  Push-Location $repoRoot
  try {
    & node azure/backend/tests/v5-staging-runtime.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Staging v5 runtime verification failed' }
  } finally { Pop-Location }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  foreach ($name in $previous.Keys) {
    $value = $previous[$name]
    if ($null -eq $value) { Remove-Item "Env:\$name" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:\$name" $value }
  }
  Remove-Variable secure,pointer,previous -ErrorAction SilentlyContinue
}
