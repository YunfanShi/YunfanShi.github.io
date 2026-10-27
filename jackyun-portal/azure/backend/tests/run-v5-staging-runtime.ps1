$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$credentialPath = Join-Path $repoRoot '.migration-private\stage-runtime-password.dpapi'
if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
  throw 'Missing current-user DPAPI credential at .migration-private\stage-runtime-password.dpapi'
}

$cipher = [IO.File]::ReadAllText($credentialPath)
$secure = ConvertTo-SecureString -String $cipher -ErrorAction Stop
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
  Remove-Variable cipher,secure,pointer,previous -ErrorAction SilentlyContinue
}
