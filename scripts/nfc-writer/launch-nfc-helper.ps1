$ErrorActionPreference = 'Stop'
$launchLock = [System.Threading.Mutex]::new($false, 'Local\MeaningfulPlushiesNfcLaunch')
try {
  if (-not $launchLock.WaitOne(0)) { exit 0 }
  try {
    $health = Invoke-RestMethod 'http://127.0.0.1:17654/health' -TimeoutSec 4
    if ($health.ok -and $health.helper -eq 'windows-nfc-writer') { exit 0 }
  } catch { }
  $helperScript = Join-Path $PSScriptRoot 'windows-nfc-writer.ps1'
  $powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  Start-Process -FilePath $powershellPath -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-File', ('"' + $helperScript + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'helper.log') -RedirectStandardError (Join-Path $PSScriptRoot 'helper-error.log')
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod 'http://127.0.0.1:17654/health' -TimeoutSec 4
      if ($health.ok) { break }
    } catch { }
  }
} finally {
  try { $launchLock.ReleaseMutex() } catch { }
  $launchLock.Dispose()
}
