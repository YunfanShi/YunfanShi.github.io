param([string]$TestSubject = '',[ValidateSet('full','writing')][string]$Focus = 'full')

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$azCommand = Get-Command az -ErrorAction SilentlyContinue
if ($azCommand) {
  $azExecutable = $azCommand.Source
} else {
  $azExecutable = @(
    (Join-Path $env:ProgramFiles 'Microsoft SDKs\Azure\CLI2\wbin'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft SDKs\Azure\CLI2\wbin'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Azure CLI\bin')
  ) | ForEach-Object { if ($_ -and (Test-Path (Join-Path $_ 'az.cmd'))) { Join-Path $_ 'az.cmd' } } | Select-Object -First 1
}
if (-not $azExecutable) {
  throw 'Azure CLI was not found in PATH or its standard Windows install locations.'
}
if ([string]::IsNullOrWhiteSpace($TestSubject)) {
  $TestSubject = Read-Host 'Website test account User ID from Supabase Auth (not the Azure Object ID or a password)'
}
if ($testSubject -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') {
  throw 'The account ID must be a UUID. No database connection was opened.'
}

$secret = $null
$pushed = $false
$previous = @{
  PGHOST = $env:PGHOST
  PGDATABASE = $env:PGDATABASE
  PGUSER = $env:PGUSER
  PGPASSWORD = $env:PGPASSWORD
  V5_STAGING_TEST_SUBJECT = $env:V5_STAGING_TEST_SUBJECT
  V5_STAGING_TEST_FOCUS = $env:V5_STAGING_TEST_FOCUS
}
try {
  [string]$secret = & $azExecutable keyvault secret show --vault-name 'jackyun-kv-9d26b2cc' --name 'jackyun-sync-db-password' --query value -o tsv --only-show-errors
  $azExit = $LASTEXITCODE
  if ($azExit -ne 0 -or [string]::IsNullOrWhiteSpace($secret)) {
    throw 'Could not read the authorized staging database secret. No database test was started.'
  }

  $env:PGHOST = 'jackyunasia.postgres.database.azure.com'
  $env:PGDATABASE = 'jackyun_v5_stage_20261026'
  $env:PGUSER = 'jackyun_sync_login'
  $env:PGPASSWORD = $secret
  $env:V5_STAGING_TEST_SUBJECT = $testSubject
  $env:V5_STAGING_TEST_FOCUS = $Focus
  Push-Location $repoRoot
  $pushed = $true
  & node azure/backend/tests/v5-staging-runtime.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Staging v5 runtime verification failed; the test transaction rolls back.' }
} finally {
  if ($pushed) { Pop-Location }
  foreach ($name in $previous.Keys) {
    if ($null -eq $previous[$name]) { Remove-Item "Env:\$name" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:\$name" $previous[$name] }
  }
  $secret = $null
  Remove-Variable secret,testSubject,previous,azCommand,azExecutable -ErrorAction SilentlyContinue
}
