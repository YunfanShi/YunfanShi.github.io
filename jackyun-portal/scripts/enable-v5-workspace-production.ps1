$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secure = Read-Host 'Azure PostgreSQL jackyun_admin database password (hidden; not website or Azure sign-in password)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$previous = $env:V5_PRODUCTION_SCHEMA_PASSWORD
$pushed = $false
try {
  $env:V5_PRODUCTION_SCHEMA_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  Push-Location $repoRoot
  $pushed = $true
  & node scripts/enable-v5-workspace-production.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Workspace scope migration failed. See the structured JSON above; no rollout was changed.' }
} finally {
  if ($pushed) { Pop-Location }
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secure.Dispose()
  if ($null -eq $previous) { Remove-Item Env:\V5_PRODUCTION_SCHEMA_PASSWORD -ErrorAction SilentlyContinue }
  else { $env:V5_PRODUCTION_SCHEMA_PASSWORD = $previous }
}
