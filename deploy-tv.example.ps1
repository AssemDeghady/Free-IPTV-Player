<#
.SYNOPSIS
    Automated build, version bump, package, install, and launch script template for Samsung Smart TV (Tizen).

.DESCRIPTION
    1. Connects to Samsung Smart TV over local network via SDB
    2. Automatically bumps patch version in config.xml (optional)
    3. Pushes developer permit device certificate (if configured)
    4. Compiles and signs the Tizen Web widget (.wgt)
    5. Installs the application package on the TV
    6. Launches the application on the TV screen

.EXAMPLE
    # Deploy to default configured TV target with version bump:
    .\deploy-tv.example.ps1

    # Deploy to a specific TV IP and port:
    .\deploy-tv.example.ps1 -Target "192.168.1.100:26101"

    # Deploy without incrementing version in config.xml:
    .\deploy-tv.example.ps1 -SkipBump

    # Deploy and update in-place without deleting app storage / playlist credentials:
    .\deploy-tv.example.ps1 -KeepData
#>

[CmdletBinding()]
param(
    # Set your TV IP and SDB port (default port is usually 26101)
    [string]$Target = "192.168.1.100:26101",

    # Name of the signing profile configured in Tizen Certificate Manager
    [string]$Profile = "MySamsungProfile",

    # Application ID as declared in config.xml (<tizen:application id="...">)
    [string]$AppId = "fiptv00001.FreeIPTVPlayer",

    # Package ID as declared in config.xml (<tizen:application package="...">)
    [string]$PkgId = "fiptv00001",

    # Skip automatic version bump in config.xml
    [switch]$SkipBump,

    # Keep cached application data (localStorage / IndexedDB) across deploys
    [switch]$KeepData
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

# 1. Connect & Verify Connected Device
Write-Step "Checking connected Tizen TV devices..."
$sdbDevices = (sdb devices 2>&1) -join "`n"
$matchedDevice = $null

if ($sdbDevices -match "([0-9\.]+:[0-9]+)\s+device") {
    $matchedDevice = $Matches[1]
}

if ($matchedDevice) {
    $Target = $matchedDevice
    Write-Success "Found connected device at target: $Target"
} else {
    Write-Warn "Device not detected. Attempting to connect to target: $Target..."
    $tvIp = ($Target -split ":")[0]
    sdb connect $tvIp 2>&1 | Out-Null
    $sdbDevices = (sdb devices 2>&1) -join "`n"
    if ($sdbDevices -match "([0-9\.]+:[0-9]+)\s+device") {
        $Target = $Matches[1]
        Write-Success "Connected to target: $Target"
    } else {
        Write-Warn "Could not connect automatically. Proceeding with target: $Target"
    }
}

# 2. Version Bump in config.xml
$configPath = Join-Path $ProjectDir "config.xml"
if (-not $SkipBump -and (Test-Path $configPath)) {
    Write-Step "Bumping patch version in config.xml..."
    $content = Get-Content $configPath -Raw
    if ($content -match 'version="(\d+)\.(\d+)\.(\d+)"') {
        $major = $Matches[1]
        $minor = $Matches[2]
        $patch = [int]$Matches[3] + 1
        $newVersion = "$major.$minor.$patch"
        $newContent = $content -replace 'version="\d+\.\d+\.\d+"', "version=`"$newVersion`""
        Set-Content -Path $configPath -Value $newContent -Encoding UTF8 -NoNewline
        Write-Success "Version bumped to v$newVersion"
    } else {
        Write-Warn "Could not locate version attribute in config.xml. Skipping bump."
    }
}

# 3. Push Permit Certificate (Optional / Device-specific)
# Set path to device-profile.xml if required by your Samsung Developer certificate
$certPermitPath = "$HOME\SamsungCertificate\$Profile\device-profile.xml"
if (Test-Path $certPermitPath) {
    Write-Step "Pushing device permit certificate..."
    sdb -s $Target push $certPermitPath /home/owner/share/tmp/sdk_tools/tmp/device-profile.xml 2>&1 | Out-Null
    Write-Success "Device profile pushed to TV"
}

# 4. Build Web Application
Write-Step "Building Tizen web application..."
$buildOut = tizen build-web -- "$ProjectDir" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $buildOut
    throw "tizen build-web failed with code $LASTEXITCODE"
}
Write-Success "Build completed (.buildResult)"

# 5. Package and Sign WGT
Write-Step "Packaging and signing WGT with profile '$Profile'..."
$releaseDir = Join-Path $ProjectDir "Release"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

$buildResultDir = Join-Path $ProjectDir ".buildResult"
$pkgOut = tizen package --type wgt --sign $Profile -o "$releaseDir" -- "$buildResultDir" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $pkgOut
    throw "tizen package failed with code $LASTEXITCODE"
}

# Normalize filename to avoid spaces in SDB/Tizen installation paths
$spacedWgt = Join-Path $releaseDir "Free IPTV Player.wgt"
$cleanWgt = Join-Path $releaseDir "FreeIPTVPlayer.wgt"
if (Test-Path $spacedWgt) {
    Copy-Item $spacedWgt $cleanWgt -Force
}
Write-Success "Package created: FreeIPTVPlayer.wgt"

# 6. Uninstall Previous Version (Clean install if not preserving data)
if (-not $KeepData) {
    Write-Step "Uninstalling previous version from TV ($PkgId / $AppId)..."
    $uninstallOut = tizen uninstall -s $Target -p $PkgId 2>&1
    if ($uninstallOut -match "Fail") {
        # Fallback using SDB app_launcher
        sdb -s $Target shell 0 app_launcher -u $AppId 2>&1 | Out-Null
        $uninstallOut = tizen uninstall -s $Target -p $AppId 2>&1
    }
    Write-Host "Uninstallation status: $uninstallOut"
} else {
    Write-Step "Skipping uninstall to preserve application data (localStorage/IndexedDB)..."
}

# 7. Install New Package on TV
Write-Step "Installing FreeIPTVPlayer.wgt on TV ($Target)..."
$installOut = tizen install -s $Target -n "FreeIPTVPlayer.wgt" -- "$releaseDir" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $installOut
    throw "tizen install failed with code $LASTEXITCODE"
}
Write-Success "Application successfully installed on TV"

# 8. Launch Application on TV
Write-Step "Launching $AppId on TV..."
sdb -s $Target shell 0 app_launcher -s $AppId 2>&1 | Out-Null
Write-Success "Application launched!"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " DEPLOYMENT TO SAMSUNG TV COMPLETED SUCCESSFULLY! " -ForegroundColor Green
Write-Host " Target: $Target | App: $AppId" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green
