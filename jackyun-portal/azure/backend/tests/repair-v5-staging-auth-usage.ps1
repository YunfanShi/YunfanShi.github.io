param([Parameter(Mandatory = $true)][string]$TestSubject)

$ErrorActionPreference = 'Stop'
if ($TestSubject -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') {
  throw 'A verified website test account UUID is required.'
}
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$secure = Read-Host 'Azure PostgreSQL admin jackyun_admin password (hidden; NOT Azure sign-in, Supabase, or runtime Secret)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$previous = $env:V5_STAGING_ADMIN_PASSWORD
$pushed = $false
try {
  $env:V5_STAGING_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  Push-Location $repoRoot
  $pushed = $true
  & node azure/backend/tests/v5-staging-grant-auth-usage.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Staging permission repair failed; runtime tests were not started.' }
} finally {
  if ($pushed) { Pop-Location }
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secure.Dispose()
  if ($null -eq $previous) { Remove-Item Env:\V5_STAGING_ADMIN_PASSWORD -ErrorAction SilentlyContinue }
  else { $env:V5_STAGING_ADMIN_PASSWORD = $previous }
  Remove-Variable secure,pointer,previous -ErrorAction SilentlyContinue
}

# The actual sync/RLS tests run with the restricted login, after the admin password is cleared.
& (Join-Path $PSScriptRoot 'run-v5-staging-runtime-keyvault.ps1') -TestSubject $TestSubject
