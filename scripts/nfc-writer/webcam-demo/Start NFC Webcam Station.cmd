@echo off
echo Open http://127.0.0.1:4183/ when the station is ready.
echo Keep this window open while using the station.
powershell.exe -NoProfile -File "%~dp0..\windows-nfc-writer.ps1" -WebcamDemo
if errorlevel 1 pause
