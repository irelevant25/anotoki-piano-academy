# ============================================================
# Personal Piano Learning - Project Launcher
# Windows / PowerShell
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectName = "PersonalPianoLearning"

# Official NVM for Windows installer.
$NvmInstallerUrl = "https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe"

# How long to wait for the Node server to start.
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

    exit 1
}

function Ask-YesNo {
    param([string]$Question)

    while ($true) {
        $answer = Read-Host "$Question [Y/n]"

        if ([string]::IsNullOrWhiteSpace($answer)) {
            return $true
        }

        switch ($answer.ToLowerInvariant()) {
            "y"     { return $true }
            "yes"   { return $true }
            "n"     { return $false }
            "no"    { return $false }
            default {
                Write-Host "Please answer Y or N."
            }
        }
    }
}

function Refresh-Path {

    $machinePath = [Environment]::GetEnvironmentVariable(
        "Path",
        [EnvironmentVariableTarget]::Machine
    )

    $userPath = [Environment]::GetEnvironmentVariable(
        "Path",
        [EnvironmentVariableTarget]::User
    )

    $paths = @()

    if ($machinePath) {
        $paths += $machinePath
    }

    if ($userPath) {
        $paths += $userPath
    }

    $env:Path = $paths -join ";"
}

function Get-NvmPath {

    $nvmCommand = Get-Command nvm.exe -ErrorAction SilentlyContinue

    if ($nvmCommand) {
        return $nvmCommand.Source
    }

    $possiblePaths = @(
        "$env:NVM_HOME\nvm.exe",
        "$env:APPDATA\nvm\nvm.exe",
        "$env:ProgramFiles\nvm\nvm.exe"
    )

    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    return $null
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

Clear-Host

Write-Host ""
Write-Host "==============================================" -ForegroundColor White
Write-Host "  $ProjectName" -ForegroundColor White
Write-Host "  Project Launcher" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------
# 1. Check project directory
# ------------------------------------------------------------

Write-Info "Checking project directory..."

if (-not (Test-Path ".nvmrc" -PathType Leaf)) {
    Stop-Script @"
Could not find .nvmrc.

Please run this script from the root of the $ProjectName project.
"@
}

if (-not (Test-Path "package.json" -PathType Leaf)) {
    Stop-Script @"
Could not find package.json.

Please run this script from the root of the $ProjectName project.
"@
}

Write-Success "Project directory OK."
Write-Host ""

# ------------------------------------------------------------
# 2. Read package.json
# ------------------------------------------------------------

Write-Info "Reading project configuration..."

try {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
}
catch {
    Stop-Script "package.json is not valid JSON."
}

# ------------------------------------------------------------
# 3. Determine required Node version
# ------------------------------------------------------------

$RequiredNodeVersion = $null

if ($packageJson.engines -and $packageJson.engines.node) {
    $RequiredNodeVersion = $packageJson.engines.node.ToString().Trim()
}

if ([string]::IsNullOrWhiteSpace($RequiredNodeVersion)) {
    $RequiredNodeVersion = (Get-Content ".nvmrc" -Raw).Trim()
}

if ([string]::IsNullOrWhiteSpace($RequiredNodeVersion)) {
    Stop-Script "Could not determine the required Node.js version."
}

$RequiredNodeVersion = $RequiredNodeVersion.TrimStart("v")

if ($RequiredNodeVersion -notmatch '^\d+\.\d+\.\d+$') {
    Stop-Script @"
The project specifies an unsupported Node.js version:

    $RequiredNodeVersion

This launcher expects an exact version such as:

    22.15.0
"@
}

Write-Success "Required Node.js version: v$RequiredNodeVersion"
Write-Host ""

# ------------------------------------------------------------
# 4. Determine application host and port
# ------------------------------------------------------------

$AppHost = "127.0.0.1"
$AppPort = 3000

if ($packageJson.config) {

    if ($packageJson.config.host) {
        $AppHost = $packageJson.config.host.ToString().Trim()
    }

    if ($packageJson.config.port) {
        try {
            $AppPort = [int]$packageJson.config.port
        }
        catch {
            Stop-Script "The port in package.json is not a valid number."
        }
    }
}

if ([string]::IsNullOrWhiteSpace($AppHost)) {
    Stop-Script "The host in package.json is empty."
}

if ($AppPort -lt 1 -or $AppPort -gt 65535) {
    Stop-Script "Invalid application port: $AppPort"
}

$AppUrl = "http://${AppHost}:${AppPort}"

Write-Success "Application host: $AppHost"
Write-Success "Application port: $AppPort"
Write-Success "Application URL:  $AppUrl"
Write-Host ""

# ------------------------------------------------------------
# 5. Check NVM
# ------------------------------------------------------------

Write-Info "Checking NVM..."

$nvmPath = Get-NvmPath

if (-not $nvmPath) {

    Write-WarningMessage "NVM for Windows was not found."

    Write-Host ""
    Write-Host "NVM for Windows is required to manage the Node.js version"
    Write-Host "used by this project."
    Write-Host ""

    if (-not (Ask-YesNo "Install NVM for Windows now?")) {
        Stop-Script "NVM for Windows is required."
    }

    Write-Host ""
    Write-Info "Downloading NVM for Windows..."
    Write-Host ""

    $tempDirectory = Join-Path $env:TEMP "PersonalPianoLearning-NVM"
    $installerPath = Join-Path $tempDirectory "nvm-setup.exe"

    if (Test-Path $tempDirectory) {
        Remove-Item $tempDirectory -Recurse -Force
    }

    New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null

    try {
        Invoke-WebRequest `
            -Uri $NvmInstallerUrl `
            -OutFile $installerPath `
            -UseBasicParsing
    }
    catch {
        Stop-Script "Could not download NVM for Windows.`n`n$($_.Exception.Message)"
    }

    if (-not (Test-Path $installerPath)) {
        Stop-Script "NVM installer was not downloaded."
    }

    Write-Success "NVM installer downloaded."
    Write-Host ""

    Write-WarningMessage "The NVM installer requires administrator privileges."

    Write-Host ""
    Write-Host "The NVM installer will now open."
    Write-Host "Please complete the installation."
    Write-Host ""

    try {
        $process = Start-Process `
            -FilePath $installerPath `
            -Verb RunAs `
            -Wait `
            -PassThru
    }
    catch {
        Stop-Script "NVM installation was cancelled or failed.`n`n$($_.Exception.Message)"
    }

    if ($process.ExitCode -ne 0) {
        Stop-Script "NVM installer exited with code $($process.ExitCode)."
    }

    Remove-Item $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue

    Refresh-Path

    $nvmPath = Get-NvmPath

    if (-not $nvmPath) {
        Stop-Script @"
NVM was installed, but this PowerShell process cannot find it.

Please close this terminal, open a new PowerShell window,
and run the launcher again.
"@
    }

    Write-Success "NVM for Windows installed successfully."

}
else {
    Write-Success "NVM for Windows found."
}

Write-Host ""

# ------------------------------------------------------------
# 6. Show NVM version
# ------------------------------------------------------------

try {
    $nvmVersionOutput = (& $nvmPath version 2>&1).ToString().Trim()
}
catch {
    Stop-Script "NVM was found but could not be executed."
}

Write-Info "NVM: $nvmVersionOutput"
Write-Host ""

# ------------------------------------------------------------
# 7. Check Node version
# ------------------------------------------------------------

Write-Info "Checking Node.js v$RequiredNodeVersion..."

try {
    $nvmListOutput = (& $nvmPath list 2>&1 | Out-String)
}
catch {
    Stop-Script "Could not execute 'nvm list'."
}

$escapedVersion = [regex]::Escape($RequiredNodeVersion)

$nodeVersionInstalled =
    $nvmListOutput -match "(?m)^\s*\*?\s*v?$escapedVersion(?:\s|$)"

if (-not $nodeVersionInstalled) {

    Write-WarningMessage "Node.js v$RequiredNodeVersion is not installed."

    Write-Host ""

    if (-not (Ask-YesNo "Install Node.js v$RequiredNodeVersion now?")) {
        Stop-Script "The required Node.js version is not installed."
    }

    Write-Host ""
    Write-Info "Installing Node.js v$RequiredNodeVersion..."
    Write-Host ""

    & $nvmPath install $RequiredNodeVersion

    if ($LASTEXITCODE -ne 0) {
        Stop-Script "NVM failed to install Node.js v$RequiredNodeVersion."
    }

    Write-Success "Node.js v$RequiredNodeVersion installed."

}
else {
    Write-Success "Node.js v$RequiredNodeVersion is installed."
}

Write-Host ""

# ------------------------------------------------------------
# 8. Activate Node version
# ------------------------------------------------------------

Write-Info "Activating Node.js v$RequiredNodeVersion..."

& $nvmPath use $RequiredNodeVersion

if ($LASTEXITCODE -ne 0) {
    Stop-Script "Could not activate Node.js v$RequiredNodeVersion."
}

Refresh-Path

# ------------------------------------------------------------
# 9. Verify Node
# ------------------------------------------------------------

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
    Stop-Script @"
Node.js could not be found after running:

    nvm use $RequiredNodeVersion
"@
}

$CurrentNodeVersion = (& node --version).Trim()
$ExpectedNodeVersion = "v$RequiredNodeVersion"

if ($CurrentNodeVersion -ne $ExpectedNodeVersion) {
    Stop-Script @"
The wrong Node.js version is active.

Expected:
    $ExpectedNodeVersion

Found:
    $CurrentNodeVersion
"@
}

Write-Success "Node.js $CurrentNodeVersion is active."
Write-Host ""

# ------------------------------------------------------------
# 10. Verify npm
# ------------------------------------------------------------

Write-Info "Checking npm..."

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $npmCommand) {
    $npmCommand = Get-Command npm.exe -ErrorAction SilentlyContinue
}

if (-not $npmCommand) {
    Stop-Script "npm was not found."
}

$NpmVersion = (& npm --version).Trim()

Write-Success "npm v$NpmVersion found."
Write-Host ""

# ------------------------------------------------------------
# 11. Install dependencies
# ------------------------------------------------------------

Write-Info "Checking project dependencies..."

if (Test-Path "package-lock.json" -PathType Leaf) {

    if (-not (Test-Path "node_modules" -PathType Container)) {

        Write-Host ""
        Write-Info "Installing project dependencies with npm ci..."
        Write-Host ""

        & npm ci

        if ($LASTEXITCODE -ne 0) {
            Stop-Script "npm ci failed."
        }

        Write-Success "Dependencies installed."

    }
    else {
        Write-Success "Dependencies already installed."
    }

}
else {

    Write-WarningMessage "package-lock.json was not found."

    Write-Host ""
    Write-Host "A package-lock.json is recommended for reproducible installs."
    Write-Host "Running npm install instead."
    Write-Host ""

    & npm install

    if ($LASTEXITCODE -ne 0) {
        Stop-Script "npm install failed."
    }

    Write-Success "Dependencies installed."
}

Write-Host ""

# ------------------------------------------------------------
# 12. Check start script
# ------------------------------------------------------------

Write-Info "Checking project start command..."

if (-not $packageJson.scripts -or -not $packageJson.scripts.start) {
    Stop-Script @"
package.json does not contain a "start" script.

Expected something like:

    "scripts": {
        "start": "node server/index.js"
    }
"@
}

Write-Success "Start command found."
Write-Host ""

# ------------------------------------------------------------
# 13. Environment ready
# ------------------------------------------------------------

Write-Host "==============================================" -ForegroundColor White
Write-Host "  Environment ready" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""

Write-Host "Node.js: $CurrentNodeVersion"
Write-Host "npm:     v$NpmVersion"
Write-Host "URL:     $AppUrl"
Write-Host ""

# ------------------------------------------------------------
# 14. Ask whether to start
# ------------------------------------------------------------

if (-not (Ask-YesNo "Start $ProjectName now?")) {

    Write-Host ""
    Write-Success "Setup complete."
    Write-Host ""

    exit 0
}

# ------------------------------------------------------------
# 15. Start server
# ------------------------------------------------------------

Write-Host ""
Write-Info "Starting $ProjectName..."
Write-Host ""

# Create temporary files for server stdout/stderr.
# This allows the launcher to monitor the process without
# creating another console window.

$TempDirectory = Join-Path $env:TEMP "PersonalPianoLearning"
$StdOutFile = Join-Path $TempDirectory "server.stdout.log"
$StdErrFile = Join-Path $TempDirectory "server.stderr.log"

if (-not (Test-Path $TempDirectory)) {
    New-Item -ItemType Directory -Path $TempDirectory -Force | Out-Null
}

Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue

# Start npm.cmd without creating a new console window.
$serverProcess = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList "start" `
    -WorkingDirectory (Get-Location).Path `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdOutFile `
    -RedirectStandardError $StdErrFile `
    -PassThru

Write-Info "Waiting for server at $AppUrl..."

$serverReady = $false
$startTime = Get-Date

while (((Get-Date) - $startTime).TotalSeconds -lt $ServerStartupTimeoutSeconds) {

    Start-Sleep -Milliseconds 500

    # Check whether the server process has already exited.
    if ($serverProcess.HasExited) {
        break
    }

    try {
        $response = Invoke-WebRequest `
            -Uri $AppUrl `
            -UseBasicParsing `
            -TimeoutSec 2

        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            $serverReady = $true
            break
        }
    }
    catch {
        # Server isn't ready yet.
    }
}

# The server runs hidden, without a console, so Ctrl+C never reaches it.
# The finally block below stops it (npm -> node, the whole tree) when this
# launcher ends for any reason - otherwise node keeps the port and the next
# start fails.
try {

if ($serverReady) {

    Write-Success "Server is ready."
    Write-Host ""

    Write-Info "Opening $AppUrl..."
    Start-Process $AppUrl

    Write-Host ""
    Write-Success "Application is running."
    Write-Host ""
    Write-Host "URL: $AppUrl"
    Write-Host ""
    Write-Host "Server output:"
    Write-Host ""

    # Show the server's current output.
    if (Test-Path $StdOutFile) {
        Get-Content $StdOutFile
    }

    if (Test-Path $StdErrFile) {
        Get-Content $StdErrFile
    }

    Write-Host ""
    Write-Host "Press Ctrl+C to stop the application."
    Write-Host ""

    # Keep the launcher alive while the server is running.
    while (-not $serverProcess.HasExited) {

        Start-Sleep -Milliseconds 500

        # Display newly written server output.
        if (Test-Path $StdOutFile) {
            $newOutput = Get-Content $StdOutFile
            if ($newOutput) {
                # Deliberately not displaying repeatedly here because
                # Get-Content would print the entire file each time.
            }
        }
    }

}
else {

    if ($serverProcess.HasExited) {

        Write-ErrorMessage "The server stopped before becoming ready."
        Write-Host ""

        if (Test-Path $StdOutFile) {
            Write-Host "Server output:"
            Get-Content $StdOutFile
        }

        if (Test-Path $StdErrFile) {
            Write-Host ""
            Write-Host "Server errors:"
            Get-Content $StdErrFile
        }

        Write-Host ""

        exit $serverProcess.ExitCode

    }
    else {

        Write-WarningMessage "The server did not respond within $ServerStartupTimeoutSeconds seconds."

        Write-Host ""
        Write-Host "The server process is still running."
        Write-Host "Opening $AppUrl anyway..."
        Write-Host ""

        Start-Process $AppUrl

        while (-not $serverProcess.HasExited) {
            Start-Sleep -Milliseconds 500
        }
    }
}

}
finally {

    # ------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------

    if (-not $serverProcess.HasExited) {
        & taskkill.exe /PID $serverProcess.Id /T /F 2>&1 | Out-Null
    }

    Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue
}

exit 0

