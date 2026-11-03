# Sets up this folder as a NEW, independent CARVED install with its own empty database.
# It refuses to run over an existing configuration or database, so it cannot replace live data.
param(
  [Parameter(Mandatory = $true)][string]$DatabaseDir,
  [string]$AppUrl = "http://localhost:3000"
)
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project

function Fail($message) { Write-Host "STOPPED: $message" -ForegroundColor Red; exit 1 }
function Run-Native($file, [string[]]$arguments) {
  & $file @arguments
  if ($LASTEXITCODE -ne 0) { Fail "$file $($arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { Fail "Node.js is not installed. Install Node.js 22.18 or later first." }
$nodeVersion = [version]((& node --version).TrimStart("v"))
if ($nodeVersion -lt [version]"22.18.0") { Fail "Node.js $nodeVersion is too old. Install 22.18 or later." }

if ($env:DATABASE_DIR) { Fail "DATABASE_DIR is set in this terminal and would override .env.local. Open a new terminal." }
if (Test-Path -LiteralPath ".env.local") { Fail ".env.local already exists. This folder is already configured." }
if (-not [IO.Path]::IsPathRooted($DatabaseDir)) { Fail "DatabaseDir must be a full path, for example C:\CarvedData\branch-2" }
$DatabaseDir = [IO.Path]::GetFullPath($DatabaseDir)
if ($DatabaseDir -match "OneDrive|Dropbox|Google Drive") { Fail "DatabaseDir is in a synced folder. Use a local disk folder." }
if (Test-Path -LiteralPath $DatabaseDir) { Fail "$DatabaseDir already exists. A new branch needs a new, empty location." }
if (Test-Path -LiteralPath "$DatabaseDir.process-lock") { Fail "A database lock already exists beside $DatabaseDir." }
if ($AppUrl -notmatch "^https?://[^/\s]+$") { Fail "AppUrl must be an origin only, for example https://branch2.shop.lan" }

$email = $env:OWNER_EMAIL
if (-not $email) { $email = Read-Host "Owner email for this branch" }
$password = $env:OWNER_PASSWORD
if (-not $password) {
  $secure = Read-Host "Owner password for this branch (12+ characters)" -AsSecureString
  $password = [System.Net.NetworkCredential]::new("", $secure).Password
}
if ($password.Length -lt 12) { Fail "The owner password must have at least 12 characters." }

Write-Host "Installing dependencies..."
Run-Native "npm.cmd" @("ci")
Write-Host "Building the application..."
Run-Native "npm.cmd" @("run", "build")

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
$config = "DATABASE_DIR=$DatabaseDir`nBETTER_AUTH_SECRET=$secret`nBETTER_AUTH_URL=$AppUrl`n"
[IO.File]::WriteAllText((Join-Path $project ".env.local"), $config, (New-Object Text.UTF8Encoding($false)))
$secret = $null

Write-Host "Creating the empty database and owner account..."
$env:OWNER_EMAIL = $email
$env:OWNER_PASSWORD = $password
try {
  Run-Native "npm.cmd" @("run", "owner")
} finally {
  Remove-Item Env:OWNER_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:OWNER_EMAIL -ErrorAction SilentlyContinue
  $password = $null
}

Write-Host ""
Write-Host "Branch install is ready." -ForegroundColor Green
Write-Host "Database: $DatabaseDir"
Write-Host "Next: run 'npm start', sign in, then follow docs/NEW-BRANCH-SETUP.md."
Write-Host "Keep a protected copy of .env.local. Backups do not include it."
