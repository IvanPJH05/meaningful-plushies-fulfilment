@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows-nfc-protocol.ps1"
echo.
pause
