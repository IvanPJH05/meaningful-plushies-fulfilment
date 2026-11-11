$ErrorActionPreference = "Stop"

$helperRoot = Join-Path $env:LOCALAPPDATA 'MeaningfulPlushies\NfcHelper'
New-Item -ItemType Directory -Path $helperRoot -Force | Out-Null
foreach ($fileName in @('windows-nfc-writer.ps1', 'start-windows-nfc-writer.bat', 'install-windows-nfc-protocol.ps1', 'install-windows-nfc-protocol.bat')) {
  $source = Join-Path $PSScriptRoot $fileName
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing helper file: $fileName" }
  $destination = Join-Path $helperRoot $fileName
  if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($destination)) {
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}
$helperBat = Join-Path $helperRoot 'start-windows-nfc-writer.bat'

$protocolRoot = "HKCU:\Software\Classes\meaningful-nfc-helper"
$commandKey = Join-Path $protocolRoot "shell\open\command"

New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value "URL:Meaningful Plushies NFC Helper"
New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path $commandKey -Force | Out-Null

# Explicitly invoke cmd.exe: a batch file is not a Windows executable.
# No URL arguments are needed or passed to the command interpreter.
$cmdPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
$command = '"' + $cmdPath + '" /d /s /c ""' + $helperBat + '""'
Set-Item -Path $commandKey -Value $command
$startupKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $startupKey -Force | Out-Null
New-ItemProperty -LiteralPath $startupKey -Name 'MeaningfulPlushiesNfcHelper' -PropertyType String -Value $command -Force | Out-Null

Write-Host ""
Write-Host "Meaningful Plushies NFC helper launcher installed."
Write-Host "You can now click Start NFC Helper inside the fulfilment app."
Write-Host "The helper will also start when you sign in to Windows. Keep its window open."
Write-Host ""
