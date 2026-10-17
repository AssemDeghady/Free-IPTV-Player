<#
.SYNOPSIS
    Automated build, version bump, package, install, and launch script for LG Smart TV (webOS).

.DESCRIPTION
    1. Detects connected LG webOS TV / Emulator target via ares-setup-device / CLI
    2. Increments patch version in appinfo.json (and synchronizes with config.xml)
    3. Packages the webOS application (.ipk) using ares-package with clean exclusion filters
    4. Installs the .ipk on the LG Smart TV / Emulator via ares-install
    5. Launches org.freeiptvplayer.app via ares-launch

.EXAMPLE
    # Default: bumps version, packages, and deploys to default webOS device/emulator:
    .\deploy-webos.ps1

    # Deploy to a specific named device (e.g., "lg-tv" configured in ares-setup-device):
    .\deploy-webos.ps1 -Device "lg-tv"

    # Package and deploy without incrementing version:
    .\deploy-webos.ps1 -SkipBump

    # Perform a clean reinstall (removes existing package first):
    .\deploy-webos.ps1 -ClearData

    # Only package without installing to device:
    .\deploy-webos.ps1 -PackageOnly
#>

[CmdletBinding()]
param(
    [string]$Device = "",
    [string]$AppId = "org.freeiptvplayer.app",
    [switch]$SkipBump,
    [switch]$ClearData,
    [switch]$PackageOnly
)

$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot
if (-not $ProjectDir) { $ProjectDir = Get-Location }

function Write-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host " [OK] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host " [!] $msg" -ForegroundColor Yellow
}

# 1. Verify ares tools are installed
Write-Step "Checking webOS CLI tools (ares-package)..."
try {
    $aresVersion = (ares-package -V 2>&1) -join " "
    Write-Success "Found webOS CLI: $aresVersion"
} catch {
    throw "webOS CLI tools (ares-package) not found in PATH. Install with: npm install -g @webos-tools/cli"
}

# 2. Detect Connected webOS Device
if (-not $PackageOnly) {
    Write-Step "Checking webOS devices..."
    $deviceListRaw = (ares-setup-device --list 2>&1) -join "`n"
    if (-not $Device) {
        if ($deviceListRaw -match "^(\S+)\s+\S+@\S+:\d+\s+ssh" -or $deviceListRaw -match "\n(\S+)\s+\S+@\S+:\d+\s+ssh") {
            $Device = $Matches[1]
            Write-Success "Auto-detected webOS target device: $Device"
        } else {
            $Device = "emulator"
            Write-Warn "Could not auto-detect target device. Defaulting to 'emulator'."
        }
    } else {
        Write-Success "Using specified target device: $Device"
    }
}

# 3. Synchronized Version Bump in appinfo.json and config.xml
$appinfoPath = Join-Path $ProjectDir "appinfo.json"
$configPath = Join-Path $ProjectDir "config.xml"
$currentVersion = "1.0.9"

if (Test-Path $appinfoPath) {
    $appinfoRaw = Get-Content $appinfoPath -Raw
    if ($appinfoRaw -match '"version":\s*"(\d+)\.(\d+)\.(\d+)"') {
        $major = $Matches[1]
        $minor = $Matches[2]
        $patch = [int]$Matches[3]
        if (-not $SkipBump) {
            $patch++
            Write-Step "Bumping patch version in appinfo.json..."
            $newVersion = "$major.$minor.$patch"
            $appinfoRaw = $appinfoRaw -replace '"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$newVersion`""
            Set-Content -Path $appinfoPath -Value $appinfoRaw -Encoding UTF8 -NoNewline
            Write-Success "appinfo.json bumped to v$newVersion"
            $currentVersion = $newVersion

            # Synchronize with config.xml
            if (Test-Path $configPath) {
                $configRaw = Get-Content $configPath -Raw
                $configRaw = $configRaw -replace 'version="\d+\.\d+\.\d+"', "version=`"$newVersion`""
                Set-Content -Path $configPath -Value $configRaw -Encoding UTF8 -NoNewline
                Write-Success "config.xml synchronized to v$newVersion"
            }
        } else {
            $currentVersion = "$major.$minor.$patch"
            Write-Step "Keeping version at v$currentVersion (-SkipBump specified)"
        }
    }
}

# 4. Package webOS Application (.ipk)
Write-Step "Packaging webOS application (.ipk)..."
$releaseDir = Join-Path $ProjectDir "Release"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

$excludeArgs = @(
    "-o", "Release",
    "-e", "tests",
    "-e", ".git",
    "-e", ".buildResult",
    "-e", "node_modules",
    "-e", "*.ps1",
    "-e", "*.md",
    "-e", "Release",
    "-e", "config.xml",
    "-e", ".tproject",
    "-e", "docs",
    "."
)

$pkgOut = ares-package @excludeArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($pkgOut -join "`n")
    throw "ares-package failed with code $LASTEXITCODE"
}

$ipkName = "${AppId}_${currentVersion}_all.ipk"
$ipkPath = Join-Path $releaseDir $ipkName
if (-not (Test-Path $ipkPath)) {
    # Find any matching generated IPK
    $foundIpk = Get-ChildItem -Path $releaseDir -Filter "${AppId}*.ipk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($foundIpk) {
        $ipkPath = $foundIpk.FullName
        $ipkName = $foundIpk.Name
    }
}

Write-Success "Package created: $ipkName ($ipkPath)"

if ($PackageOnly) {
    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host " PACKAGE GENERATION COMPLETED SUCCESSFULLY! " -ForegroundColor Green
    Write-Host " Output: $ipkPath" -ForegroundColor Green
    Write-Host "============================================================`n" -ForegroundColor Green
    exit 0
}

# 5. Clean Install / Remove previous version if requested
if ($ClearData) {
    Write-Step "Uninstalling previous version of $AppId from $Device (-ClearData active)..."
    try {
        ares-install -d $Device -r $AppId 2>&1 | Out-Null
        Write-Success "Previous version uninstalled"
    } catch {
        Write-Warn "Uninstallation notice: $_"
    }
}

# 6. Install IPK to Target Device
Write-Step "Installing $ipkName on $Device..."
$installOut = ares-install -d $Device "$ipkPath" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($installOut -join "`n")
    throw "ares-install failed with code $LASTEXITCODE"
}
Write-Success "Application successfully installed on $Device"

# 7. Launch App on Target Device
Write-Step "Launching $AppId on $Device..."
$launchOut = ares-launch -d $Device $AppId 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ($launchOut -join "`n")
    throw "ares-launch failed with code $LASTEXITCODE"
}
Write-Success "Application launched!"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " DEPLOYMENT TO LG WEBOS TV COMPLETED SUCCESSFULLY! " -ForegroundColor Green
Write-Host " Target: $Device | App: $AppId | Version: v$currentVersion" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green
