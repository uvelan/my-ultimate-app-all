param(
    [switch]$Offline,
    [switch]$ReuseVerifiedNativeOutputs
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$priorCi = $env:CI
Push-Location (Join-Path $projectRoot 'android')
try {
    $env:CI = '1'
    $buildArguments = @(':app:assembleRelease', '--console=plain', '--max-workers=2', '-PreactNativeArchitectures=arm64-v8a', '-Pexpo.useLegacyPackaging=true')
    if ($Offline) { $buildArguments += '--offline' }
    # Use only when the unchanged native sources already have verified ARM64 outputs.
    # Normal builds compile all required native code without this opt-in.
    if ($ReuseVerifiedNativeOutputs) {
        $cacheInit = Join-Path $projectRoot 'dist/reuse-native.init.gradle'
        if (!(Test-Path -LiteralPath $cacheInit)) { throw 'No verified native-output reuse configuration exists.' }
        $buildArguments += @('-I', $cacheInit)
    }
    & ./gradlew.bat @buildArguments
    if ($LASTEXITCODE) { throw "ARM64 build failed ($LASTEXITCODE)." }
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'app.json') -Raw | ConvertFrom-Json).expo.version
    $destination = Join-Path $projectRoot "dist/UltimateApp-$version-arm64-compact.apk"
    New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Destination $destination
    Get-Item -LiteralPath $destination | Select-Object FullName, Length
} finally {
    Pop-Location
    $env:CI = $priorCi
}
