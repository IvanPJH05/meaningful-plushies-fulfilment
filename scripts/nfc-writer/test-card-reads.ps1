$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$writerPath = Join-Path $PSScriptRoot 'windows-nfc-writer.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($writerPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Writer syntax error' }
$functionNames = @('Read-CardPage','Get-ResponseData','Test-SuccessResponse','New-ByteArray','Invoke-NativeNfcCommand','Add-ByteRange')
foreach ($functionName in $functionNames) {
 $definition = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName}, $true)
 Invoke-Expression $definition.Extent.Text
}
$script:apdu = [byte[]]@(1,2,3,4,0x90,0)
function Send-CardCommand { return $script:apdu }
$data = Read-CardPage -Card ([IntPtr]::Zero) -Protocol 0 -Page 41
if (($data -join ',') -ne '1,2,3,4') { throw 'Standard read failed' }
$script:apdu = [byte[]]@(0xD5,0x43,0,9,8,7,6,0,0,0,0,0,0,0,0,0,0,0,0,0x90,0)
$script:calls = 0
function Send-CardCommand { $script:calls++; if ($script:calls -eq 1) { return [byte[]]@(0x63,0) }; return $script:apdu }
$data = Read-CardPage -Card ([IntPtr]::Zero) -Protocol 0 -Page 41
if (($data -join ',') -ne '9,8,7,6' -or $script:calls -ne 2) { throw 'Native configuration page fallback failed' }
function Send-CardCommand { return [byte[]]@(0xD5,0x43,1,0x90,0) }
$native = Invoke-NativeNfcCommand -Card ([IntPtr]::Zero) -Protocol 0 -NativeCommand ([byte[]]@(0x1B,1,2,3,4))
if ($null -ne $native) { throw 'Reader error incorrectly accepted as authentication success' }
$rejected = $false
try { Read-CardPage -Card ([IntPtr]::Zero) -Protocol 0 -Page 41 | Out-Null } catch { $rejected = $_.Exception.Message -like 'Could not read NFC card page 41*' }
if (-not $rejected) { throw 'Failed reads must be rejected' }
Write-Output 'PASS: standard read, native configuration fallback, authentication error rejection, failed read rejection'
