@echo off
echo Setting up Windows Task Scheduler for GovScan AI...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-task-scheduler.ps1"
pause
