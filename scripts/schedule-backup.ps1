# Registers (or with -Remove, deletes) the Windows task that runs daily-backup.ps1 every day.
# The task stops the server briefly, so choose a time when the shop is closed.
param(
  [string]$At = "23:30",
  [int]$Port = 3000,
  [string]$HostName = "127.0.0.1",
  [string]$CopyTo = "",
  [string]$TaskName = "CARVED daily backup",
  [switch]$Remove
)
$ErrorActionPreference = "Stop"
if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'."
  exit 0
}
$script = Join-Path $PSScriptRoot "daily-backup.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Port $Port -HostName $HostName"
if ($CopyTo) { $arguments += " -CopyTo `"$CopyTo`"" }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# Deliberately no catch-up run: a missed backup must not stop the server during shop hours.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Scheduled '$TaskName' daily at $At. This Windows user must be signed in at that time."
Write-Host "Results are written to backups\backup.log."
