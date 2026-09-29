# ============================================================
# Piano Academy - start it on this computer
# Windows / PowerShell
#
# Finds PHP (8.2 or newer, with pdo_pgsql and openssl), builds the
# app once (again only after an update - that needs Node.js),
# brings the database up to date, starts PHP's web server with the
# backend serving the app, and opens the browser. Ctrl+C stops it.
#
# The first time it opens the setup page instead: it asks for your
# PostgreSQL connection, switches sign-in off (this computer only,
# no login) and brings in your old progress from server/data/.
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectName = "Piano Academy"

# Where the app answers: http://127.0.0.1:8300 (PIANO_PORT changes the port).
$Port = if ($env:PIANO_PORT) { [int]$env:PIANO_PORT } else { 8300 }
$AppUrl = "http://127.0.0.1:$Port"

# How long to wait for the server to start.
$ServerStartupTimeoutSeconds = 30

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-WarningMessage {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-ErrorMessage {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Stop-Script {
    param([string]$Message)

    Write-Host ""
    Write-ErrorMessage "ERROR: $Message"
    Write-Host ""

    # Started by a double-click, the window would close before this could be read.
    Read-Host "Press Enter to close" | Out-Null
    exit 1
}

# A native command's output, whatever it writes to stderr.
function Get-Output {
    param([string]$Exe, [string[]]$Arguments)

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        return (& $Exe @Arguments 2>$null | Out-String)
    }
    catch {
        return ""
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

# "" when this PHP can run the app, else the reason it can't.
function Test-Php {
    param([string]$Php)

    $version = Get-Output $Php @("-v")
    if ($version -notmatch '(?m)^PHP (\d+)\.(\d+)\.(\S+)') {
        return "does not run"
    }
    $found = "PHP $($Matches[1]).$($Matches[2]).$($Matches[3])"
    if ([int]$Matches[1] -lt 8 -or ([int]$Matches[1] -eq 8 -and [int]$Matches[2] -lt 2)) {
        return "$found is too old"
    }

    $modules = Get-Output $Php @("-m")
    $missing = @("pdo_pgsql", "openssl") | Where-Object { $modules -notmatch "(?mi)^$_\s*$" }
    if ($missing) {
        return "$found lacks $($missing -join ', ')"
    }
    return ""
}

# Every php.exe worth trying: PIANO_PHP, PATH, the usual install folders.
function Get-PhpCandidates {
    $list = New-Object System.Collections.Generic.List[string]

    if ($env:PIANO_PHP) {
        $list.Add($env:PIANO_PHP)
    }

    Get-Command php.exe -All -CommandType Application -ErrorAction SilentlyContinue |
        ForEach-Object { $list.Add($_.Source) }

    $folders = @("C:\php", "C:\xampp\php",
        "$env:USERPROFILE\scoop\apps\php\current",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links")
    foreach ($parent in @("C:\", "C:\tools", "C:\laragon\bin\php", "$env:LOCALAPPDATA\Microsoft\WinGet\Packages")) {
        Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^(php|PHP\.PHP)' } |
            Sort-Object Name -Descending |
            ForEach-Object { $folders += $_.FullName }
    }
    foreach ($folder in $folders) {
        $exe = Join-Path $folder "php.exe"
        if (Test-Path -LiteralPath $exe -PathType Leaf) {
            $list.Add($exe)
        }
    }

    return $list | Select-Object -Unique
}

# The newest change among the app's sources: the build is stale when older.
function Get-SourcesChanged {
    param([string]$Frontend)

    $newest = [datetime]::MinValue
    $items = @()
    foreach ($folder in @("src", "public")) {
        $path = Join-Path $Frontend $folder
        if (Test-Path -LiteralPath $path) {
            $items += Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue
        }
    }
    foreach ($file in @("package.json", "package-lock.json", "angular.json")) {
        $path = Join-Path $Frontend $file
        if (Test-Path -LiteralPath $path) {
            $items += Get-Item -LiteralPath $path
        }
    }
    foreach ($item in $items) {
        if ($item.LastWriteTimeUtc -gt $newest) {
            $newest = $item.LastWriteTimeUtc
        }
    }
    return $newest
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

Clear-Host

Write-Host ""
Write-Host "==============================================" -ForegroundColor White
Write-Host "  $ProjectName" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------
# 1. The project folder
# ------------------------------------------------------------

# The folder of this script, wherever it was started from.
Set-Location -LiteralPath $PSScriptRoot

$Backend = Join-Path $PSScriptRoot "backend"
$Frontend = Join-Path $PSScriptRoot "frontend"

if (-not (Test-Path (Join-Path $Backend "router.php") -PathType Leaf) -or -not (Test-Path (Join-Path $Frontend "package.json") -PathType Leaf)) {
    Stop-Script "backend/ or frontend/ is missing. This script belongs in the $ProjectName folder."
}

# ------------------------------------------------------------
# 2. PHP
# ------------------------------------------------------------

Write-Info "Looking for PHP 8.2+ with pdo_pgsql and openssl..."

$Php = $null
$tried = @()

foreach ($candidate in Get-PhpCandidates) {
    $problem = Test-Php $candidate
    if (-not $problem) {
        $Php = $candidate
        break
    }
    $tried += "    $candidate  ($problem)"
}

if (-not $Php) {
    $triedText = if ($tried) { "Tried:`n" + ($tried -join "`n") + "`n`n" } else { "" }
    Stop-Script @"
No PHP 8.2 or newer with the extensions pdo_pgsql and openssl was found.

$triedText
To install it:
  1. Download PHP 8 for Windows (the x64 Thread Safe zip) from
     https://windows.php.net/download
  2. Unzip it, e.g. to C:\php, and add that folder to PATH.
  3. In that folder, copy php.ini-production to php.ini and turn these on
     (remove the ; in front of each line):
         extension_dir = "ext"
         extension=curl
         extension=openssl
         extension=pdo_pgsql

Or set PIANO_PHP to the php.exe to use. Then run this script again.
"@
}

Write-Success "PHP: $Php"
Write-Host ""

# ------------------------------------------------------------
# 3. The app (built once; again after an update)
# ------------------------------------------------------------

$BuiltIndex = Join-Path $Frontend "dist\piano-academy\browser\index.html"
$built = Test-Path -LiteralPath $BuiltIndex -PathType Leaf
$stale = $built -and ((Get-SourcesChanged $Frontend) -gt (Get-Item -LiteralPath $BuiltIndex).LastWriteTimeUtc)

if (-not $built -or $stale) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $npm) {
        if ($built) {
            Write-WarningMessage "The app has changed since it was built, and Node.js is not installed to build it again."
            Write-WarningMessage "Starting the build you have. (Install Node.js 22 from https://nodejs.org to update it.)"
            Write-Host ""
        }
        else {
            Stop-Script @"
The app has not been built yet, and building it needs Node.js.

Install Node.js 22 (LTS) from https://nodejs.org, then run this script
again. It builds the app once; after that it starts without Node.js.
"@
        }
    }
    else {
        Push-Location -LiteralPath $Frontend
        try {
            if (-not (Test-Path -LiteralPath (Join-Path $Frontend "node_modules"))) {
                Write-Info "Downloading what the app is built with (npm ci, once)..."
                & $npm.Source ci --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) {
                    Stop-Script "npm ci did not finish: the messages above say why."
                }
            }
            Write-Info "Building the app (a minute at most)..."
            & $npm.Source run build
            if ($LASTEXITCODE -ne 0) {
                Stop-Script "The app did not build: the messages above say why."
            }
        }
        finally {
            Pop-Location
        }
        Write-Success "The app is built."
        Write-Host ""
    }
}

# ------------------------------------------------------------
# 4. The database (once it is set up)
# ------------------------------------------------------------

$setUp = (Test-Path (Join-Path $Backend "config\database.local.php")) -and (Test-Path (Join-Path $Backend "config\auth.local.php"))

if ($setUp) {
    Write-Info "Bringing the database up to date..."
    Push-Location -LiteralPath $Backend
    try {
        & $Php migration.php
        $migrated = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($migrated -ne 0) {
        Stop-Script @"
The database could not be brought up to date: the message above says why.

PostgreSQL must be installed and running
(https://www.postgresql.org/download/windows/). The connection is in
backend\config\database.local.php - to enter it again, open
$AppUrl/setup.php while the app runs.
"@
    }
    Write-Host ""
}

# ------------------------------------------------------------
# 5. Start
# ------------------------------------------------------------

try {
    $health = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 2
    if ($health.StatusCode -eq 200) {
        Write-Success "$ProjectName is already running."
        Start-Process $AppUrl
        exit 0
    }
}
catch {
    # Running already, but not set up (503): its setup page.
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 503) {
        Write-Success "$ProjectName is already running, and not set up yet."
        Start-Process "$AppUrl/setup.php"
        exit 0
    }
    # Otherwise it is not running yet.
}

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($busy) {
    $owner = Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue
    Stop-Script @"
Port $Port is taken by $($owner.ProcessName) (process $($busy.OwningProcess)).

If that is an older copy of this app, close its window, or stop it with:
    Stop-Process -Id $($busy.OwningProcess)
Or start on another port: set PIANO_PORT, e.g. `$env:PIANO_PORT = 8310
"@
}

Write-Info "Starting $ProjectName..."

# The server shares this window's console, so Ctrl+C or closing the window
# stops it too; its output goes to files.
$TempDirectory = Join-Path $env:TEMP "PianoAcademy"
$StdOutFile = Join-Path $TempDirectory "server.stdout.log"
$StdErrFile = Join-Path $TempDirectory "server.stderr.log"

if (-not (Test-Path $TempDirectory)) {
    New-Item -ItemType Directory -Path $TempDirectory -Force | Out-Null
}

Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue

# 127.0.0.1 only: without a login, nobody but this computer may reach the app.
$serverProcess = Start-Process `
    -FilePath $Php `
    -ArgumentList "-d", "display_errors=stderr", "-S", "127.0.0.1:$Port", "router.php" `
    -WorkingDirectory $Backend `
    -NoNewWindow `
    -RedirectStandardOutput $StdOutFile `
    -RedirectStandardError $StdErrFile `
    -PassThru

try {
    Write-Info "Waiting for $AppUrl..."

    $status = 0
    $startTime = Get-Date

    while (((Get-Date) - $startTime).TotalSeconds -lt $ServerStartupTimeoutSeconds) {

        Start-Sleep -Milliseconds 500

        if ($serverProcess.HasExited) {
            break
        }

        try {
            $response = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 2
            $status = [int]$response.StatusCode
        }
        catch {
            # A 503 is an answer too: not set up yet.
            if ($_.Exception.Response) {
                $status = [int]$_.Exception.Response.StatusCode
            }
        }
        if ($status -eq 200 -or $status -eq 503) {
            break
        }
    }

    if ($status -ne 200 -and $status -ne 503) {
        Write-ErrorMessage "The server did not start."
        Write-Host ""
        if (Test-Path $StdErrFile) { Get-Content $StdErrFile -Encoding UTF8 | Select-Object -Last 20 }
        Write-Host ""
        Read-Host "Press Enter to close" | Out-Null
        exit 1
    }

    Write-Success "Server is ready."
    Write-Host ""

    if ($status -eq 503) {
        Write-WarningMessage "$ProjectName is not set up yet: the setup page opens in your browser."
        Write-WarningMessage "When it says Saved, press 'Open Piano Academy'."
        Start-Process "$AppUrl/setup.php"
    }
    else {
        Write-Info "Opening $AppUrl..."
        Start-Process $AppUrl
    }

    Write-Host ""
    Write-Success "$ProjectName is running at $AppUrl"
    Write-Host ""
    Write-Host "Press Ctrl+C (or close this window) to stop it."
    Write-Host ""

    while (-not $serverProcess.HasExited) {
        Start-Sleep -Milliseconds 500
    }
}
finally {
    # Ctrl+C lands here too. Stop the whole process tree, or the next start
    # finds the port taken.
    if (-not $serverProcess.HasExited) {
        # It may exit in the meantime; taskkill's complaint must not stop the cleanup.
        try {
            & taskkill.exe /PID $serverProcess.Id /T /F 2>$null | Out-Null
        }
        catch {
            # already stopped
        }
    }
    Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue
}

exit 0
