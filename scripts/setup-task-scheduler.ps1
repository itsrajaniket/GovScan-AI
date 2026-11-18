# scripts/setup-task-scheduler.ps1
# Registers a daily scheduled task in Windows Task Scheduler for GovScan AI.

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$NodePath = (Get-Command node).Source

if (-not $NodePath) {
    Write-Error "node.exe not found on PATH. Please ensure Node.js is installed."
    exit 1
}

$TaskName = "GovScanAI_DailyRun"
$DailyTime = "08:30AM"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " GovScan AI — Windows Task Scheduler Setup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Project Directory: $ProjectDir"
Write-Host "Node Executable:   $NodePath"
Write-Host "Schedule Time:     Daily at $DailyTime"
Write-Host ""

# Unregister existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "⚠️ Removing existing task: $TaskName..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Define task components
$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument "src/cli/daily-run.js" `
    -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At $DailyTime

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Register the task under the current user account
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "GovScan AI: Daily job discovery, eligibility checking via Gemini, and Telegram alerts." | Out-Null

Write-Host "✅ Scheduled Task '$TaskName' registered successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Helpful Commands:"
Write-Host "  • Test run task now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  • View task status:  Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "  • Remove task:       Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host "==========================================================" -ForegroundColor Cyan
