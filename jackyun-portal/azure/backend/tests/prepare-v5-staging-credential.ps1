$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$credentialPath = Join-Path $repoRoot '.migration-private\stage-runtime-password.dpapi'
$credentialDirectory = Split-Path -Parent $credentialPath
New-Item -ItemType Directory -Path $credentialDirectory -Force | Out-Null

$secure = Read-Host 'Staging database password (hidden; never paste it into chat)' -AsSecureString
try {
  $cipher = ConvertFrom-SecureString -SecureString $secure -ErrorAction Stop
  [IO.File]::WriteAllText($credentialPath, $cipher)
  Write-Output 'Current-user DPAPI credential saved. The password was not displayed.'
} finally {
  if ($null -ne $secure) { $secure.Dispose() }
  Remove-Variable cipher, secure -ErrorAction SilentlyContinue
}
