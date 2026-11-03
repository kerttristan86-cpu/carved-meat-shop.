# Safely stops the server, backs up its database, proves the backup restores, and restarts the server.
# It never touches a database owned by a process it cannot verify, and never deletes backups.
param(
  [int]$Port = 3000,
  [string]$HostName = "127.0.0.1",
  [string]$CopyTo = ""
)
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
New-Item -ItemType Directory -Force -Path "backups" | Out-Null
$logFile = Join-Path $project "backups\backup.log"
$nodeExe = (Get-Command node).Source

function Log($message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

# Start-Process does not quote arguments, so paths with spaces are quoted by the caller.
function Run-Node([string[]]$arguments) {
  $out = [IO.Path]::GetTempFileName()
  $err = [IO.Path]::GetTempFileName()
  try {
    $p = Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    return [pscustomobject]@{
      Code = $p.ExitCode
      Out  = (Get-Content -LiteralPath $out -Raw)
      Err  = (Get-Content -LiteralPath $err -Raw)
    }
  } finally {
    Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue
  }
}

function Process-Gone($processId) {
  $check = Run-Node @("-e", "`"try{process.kill($processId,0);console.log('ALIVE')}catch(e){console.log(e.code)}`"")
  return ($check.Out -and $check.Out.Trim() -eq "ESRCH")
}

function Remove-StaleLock($lock) {
  if (-not (Test-Path -LiteralPath $lock)) { return }
  $owner = (Get-Content -LiteralPath $lock -Raw).Trim()
  if ($owner -notmatch "^\d+$") { throw "Database lock is incomplete; verify manually." }
  if (-not (Process-Gone $owner)) { throw "Database lock is held by running process $owner; not touching it." }
  Remove-Item -LiteralPath $lock -Force
  Log "Removed stale database lock left by ended process $owner."
}

function Get-Listener { Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 }

$directory = "./data/production"
foreach ($line in Get-Content -LiteralPath ".env.local") {
  if ($line -match "^DATABASE_DIR=(.+)$") { $directory = $Matches[1].Trim() }
}
$lock = [IO.Path]::GetFullPath([IO.Path]::Combine($project, $directory)).TrimEnd("\", "/") + ".process-lock"

$failed = $false
$wasRunning = $false
Log "Backup started."
try {
  $listener = Get-Listener
  if ($listener) {
    $serverId = $listener.OwningProcess
    # The server opens its database, and takes the lock, only on its first request.
    if (-not (Test-Path -LiteralPath $lock)) {
      try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 "http://${HostName}:$Port/api/health" | Out-Null } catch {}
    }
    $lockOwner = if (Test-Path -LiteralPath $lock) { (Get-Content -LiteralPath $lock -Raw).Trim() } else { "" }
    if ("$serverId" -ne $lockOwner) { throw "Port $Port is process $serverId but the database lock says '$lockOwner'. Nothing was stopped." }
    $wasRunning = $true
    Stop-Process -Id $serverId -Force
    Wait-Process -Id $serverId -Timeout 30 -ErrorAction SilentlyContinue
    Log "Server process $serverId stopped."
  }
  Remove-StaleLock $lock

  $backup = Run-Node @("--import", "tsx", "scripts/backup.ts")
  if ($backup.Code -ne 0) { throw "Backup failed: $($backup.Err)" }
  $file = ($backup.Out -split "`r?`n" | Where-Object { $_ -match "\.carved-backup\.json$" } | Select-Object -Last 1)
  if (-not $file -or -not (Test-Path -LiteralPath $file)) { throw "Backup finished but its file was not found." }

  $check = Join-Path ([IO.Path]::GetTempPath()) ("carved-restore-check-" + [guid]::NewGuid().ToString("N"))
  try {
    $restore = Run-Node @("--import", "tsx", "scripts/restore.ts", $file, "`"$check`"")
    if ($restore.Code -ne 0) { throw "Backup did not restore: $($restore.Err)" }
    $documents = if ($restore.Out -match "count:\s*(\d+)") { $Matches[1] } else { "unknown" }
  } finally {
    if (Test-Path -LiteralPath $check) { Remove-Item -LiteralPath $check -Recurse -Force }
  }
  Log "Backup OK and restorable: $file ($((Get-Item -LiteralPath $file).Length) bytes, $documents documents)."

  if ($CopyTo) {
    if (-not (Test-Path -LiteralPath $CopyTo)) { throw "Copy location $CopyTo is not available; the backup stays in backups/." }
    Copy-Item -LiteralPath $file -Destination $CopyTo
    Log "Copied to $CopyTo."
  }
} catch {
  $failed = $true
  Log "FAILED: $($_.Exception.Message)"
} finally {
  if ($wasRunning) {
    try {
      Remove-StaleLock $lock
      New-Item -ItemType Directory -Force -Path "data" | Out-Null
      Start-Process -FilePath $nodeExe -ArgumentList @("node_modules/next/dist/bin/next", "start", "--hostname", $HostName, "--port", "$Port") -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput "data/server.stdout.log" -RedirectStandardError "data/server.stderr.log" | Out-Null
      $ready = $false
      for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
        Start-Sleep -Seconds 2
        try {
          $ready = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://${HostName}:$Port/api/health").Content -match '"ready":true'
        } catch {}
      }
      if (-not $ready) { throw "Server did not report ready within 2 minutes." }
      Log "Server restarted and healthy."
    } catch {
      $failed = $true
      Log "FAILED TO RESTART SERVER: $($_.Exception.Message)"
    }
  }
}
if ($failed) { exit 1 }
Log "Backup finished."
