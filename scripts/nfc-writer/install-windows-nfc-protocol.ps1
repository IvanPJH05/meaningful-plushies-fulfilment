$ErrorActionPreference = "Stop"

$helperBat = Join-Path $PSScriptRoot "start-windows-nfc-writer.bat"
if (-not (Test-Path -LiteralPath $helperBat)) {
  throw "Could not find start-windows-nfc-writer.bat beside this installer."
}

$protocolRoot = "HKCU:\Software\Classes\meaningful-nfc-helper"
$commandKey = Join-Path $protocolRoot "shell\open\command"

New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value "URL:Meaningful Plushies NFC Helper"
New-ItemProperty -Path $protocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path $commandKey -Force | Out-Null

$command = "`"$helperBat`" `"%1`""
Set-Item -Path $commandKey -Value $command

Write-Host ""
Write-Host "Meaningful Plushies NFC helper launcher installed."
Write-Host "You can now click Start NFC Helper inside the fulfilment app."
Write-Host ""
