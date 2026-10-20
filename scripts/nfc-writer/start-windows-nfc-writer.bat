@echo off
setlocal
set "helperLauncher=%LOCALAPPDATA%\MeaningfulPlushies\NfcHelper\launch-nfc-helper.ps1"
if not exist "%helperLauncher%" set "helperLauncher=%~dp0launch-nfc-helper.ps1"
if not exist "%helperLauncher%" (
  echo NFC Helper is not installed. Run install-windows-nfc-protocol.bat from the complete NFC Helper folder.
  pause
  exit /b 1
)
powershell.exe -NoProfile -File "%helperLauncher%" -ShowWindow
if errorlevel 1 pause
