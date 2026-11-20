param(
    [Parameter(Mandatory=$true)][string]$InputApk,
    [Parameter(Mandatory=$true)][string]$OutputApk,
    [string]$ToolsRoot = "$env:USERPROFILE/.codex/packing-station-tools",
    [string]$SigningRoot = "$env:USERPROFILE/.codex/packing-station-signing"
)
$ErrorActionPreference = 'Stop'
$javaDirectory = Get-ChildItem -LiteralPath ($ToolsRoot+'/jdk') -Directory | Select-Object -First 1
$javaExecutable = Join-Path $javaDirectory.FullName 'bin/java.exe'
$keytoolExecutable = Join-Path $javaDirectory.FullName 'bin/keytool.exe'
$signer = Get-ChildItem -Path ($ToolsRoot+'/android-build-tools/*/lib/apksigner.jar') | Select-Object -First 1
$aligner = Join-Path $signer.Directory.Parent.FullName 'zipalign.exe'
foreach ($toolPath in @($javaExecutable,$keytoolExecutable,$signer.FullName,$aligner)) {
    if (!(Test-Path -LiteralPath $toolPath)) { throw 'Install the verified Java and Android build tools first.' }
}
New-Item -ItemType Directory -Force -Path $SigningRoot | Out-Null
$keyFile = Join-Path $SigningRoot 'packing-station-release.p12'
$passwordFile = Join-Path $SigningRoot 'password.dpapi'
$aligned = [System.IO.Path]::GetFullPath($OutputApk)+'.aligned.apk'
try {
    if (Test-Path -LiteralPath $keyFile) {
        if (!(Test-Path -LiteralPath $passwordFile)) { throw 'Restore the existing signing password; do not generate a replacement key.' }
        $securePassword = Get-Content -LiteralPath $passwordFile -Raw | ConvertTo-SecureString
        $env:MP_PACKING_SIGNING_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
    } else {
        if (Test-Path -LiteralPath $passwordFile) { throw 'The signing key is missing. Restore it before building another release.' }
        $env:MP_PACKING_SIGNING_PASSWORD = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
        & $keytoolExecutable -genkeypair -keystore $keyFile -storetype PKCS12 -storepass:env MP_PACKING_SIGNING_PASSWORD -keypass:env MP_PACKING_SIGNING_PASSWORD -alias packing-station -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=MP Packing Station, O=Meaningful Plushies, C=MY'
        if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed.' }
        ConvertTo-SecureString $env:MP_PACKING_SIGNING_PASSWORD -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
    }
    & $aligner -f -P 16 4 ([System.IO.Path]::GetFullPath($InputApk)) $aligned
    if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
    & $javaExecutable -jar $signer.FullName sign --ks $keyFile --ks-key-alias packing-station --ks-pass env:MP_PACKING_SIGNING_PASSWORD --key-pass env:MP_PACKING_SIGNING_PASSWORD --out ([System.IO.Path]::GetFullPath($OutputApk)) $aligned
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
    & $javaExecutable -jar $signer.FullName verify --verbose --print-certs ([System.IO.Path]::GetFullPath($OutputApk))
    if ($LASTEXITCODE -ne 0) { throw 'The signed APK did not verify.' }
    & $aligner -c -P 16 -v 4 ([System.IO.Path]::GetFullPath($OutputApk)) | Select-Object -Last 1
    if ($LASTEXITCODE -ne 0) { throw 'The signed APK alignment did not verify.' }
    Get-FileHash -LiteralPath $OutputApk -Algorithm SHA256
} finally {
    Remove-Item Env:MP_PACKING_SIGNING_PASSWORD -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $aligned) { Remove-Item -LiteralPath $aligned }
}
