$ErrorActionPreference = 'Stop'
$helperRoot = Join-Path $env:LOCALAPPDATA 'MeaningfulPlushies\NfcHelper'
New-Item -ItemType Directory -Path $helperRoot -Force | Out-Null
foreach ($name in @('windows-nfc-writer.ps1', 'launch-nfc-helper.ps1')) {
  $source = Join-Path $PSScriptRoot $name
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing helper file: $name" }
  $destination = Join-Path $helperRoot $name
  if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($destination)) { Copy-Item -LiteralPath $source -Destination $destination -Force }
}
$protocolRoot = 'HKCU:\Software\Classes\meaningful-nfc-helper'
$commandKey = Join-Path $protocolRoot 'shell\open\command'
New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -LiteralPath $protocolRoot -Value 'URL:Meaningful Plushies NFC Helper'
New-ItemProperty -LiteralPath $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path $commandKey -Force | Out-Null
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launcherPath = Join-Path $helperRoot 'launch-nfc-helper.ps1'
Set-Item -LiteralPath $commandKey -Value ('"' + $powershellPath + '" -NoProfile -WindowStyle Hidden -File "' + $launcherPath + '"')
$startupKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $startupKey -Force | Out-Null
New-ItemProperty -LiteralPath $startupKey -Name 'MeaningfulPlushiesNfcHelper' -PropertyType String -Value ((Get-Item -LiteralPath $commandKey).GetValue('')) -Force | Out-Null
Write-Host 'NFC helper installed. Click Start NFC Helper in the fulfilment app.'
