$ErrorActionPreference = 'Stop'
$startupLog = Join-Path $PSScriptRoot 'startup.log'
function Test-Helper {
  try {
    $health = Invoke-RestMethod 'http://127.0.0.1:17654/health' -TimeoutSec 2
    return ($health.ok -and $health.helper -eq 'windows-nfc-writer')
  } catch { return $false }
}
$launchLock = [System.Threading.Mutex]::new($false, 'Local\MeaningfulPlushiesNfcLaunch')
try {
  if (-not $launchLock.WaitOne(0)) { exit 0 }
  if (Test-Helper) { exit 0 }
  "$(Get-Date -Format o) Starting NFC helper" | Set-Content -LiteralPath $startupLog
  $helperScript = Join-Path $PSScriptRoot 'windows-nfc-writer.ps1'
  if (-not (Test-Path -LiteralPath $helperScript)) { throw "The NFC helper files are missing. Run the installer again." }
  $powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $process = Start-Process -FilePath $powershellPath -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-File', ('"' + $helperScript + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'helper.log') -RedirectStandardError (Join-Path $PSScriptRoot 'helper-error.log') -PassThru
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-Helper) {
      "$(Get-Date -Format o) Ready (process $($process.Id))" | Add-Content -LiteralPath $startupLog
      exit 0
    }
    if ($process.HasExited) { throw "NFC helper stopped during startup (exit $($process.ExitCode)). See helper-error.log in $PSScriptRoot." }
  }
  throw "NFC helper did not respond on port 17654. See helper-error.log in $PSScriptRoot."
} catch {
  $message = $_.Exception.Message
  "$(Get-Date -Format o) $message" | Add-Content -LiteralPath $startupLog
  try { (New-Object -ComObject WScript.Shell).Popup($message, 0, 'NFC helper could not start', 16) | Out-Null } catch { }
  exit 1
} finally {
  try { $launchLock.ReleaseMutex() } catch { }
  $launchLock.Dispose()
}
