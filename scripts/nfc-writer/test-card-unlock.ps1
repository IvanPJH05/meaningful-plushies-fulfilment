$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-nfc-writer.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Writer syntax error' }
$definition = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Remove-NtagPasswordProtection'}, $true)
Invoke-Expression $definition.Extent.Text
$layout = @{Auth0Page=131;AccessPage=132}
$password = [byte[]]@(65,49,66,50)
function Reset-TestCard([byte]$Auth0) {
  $script:pages = @{131=[byte[]]@(0,0,0,$Auth0);132=[byte[]]@(0,0,0,0)}
  $script:authCalls=0; $script:writes=0; $script:rejectAuth=$false; $script:interruptAccess=$false; $script:hideConfig=$false
}
function Read-CardPage($Card,$Protocol,$Page) {
  if ($script:hideConfig -and $script:authCalls -eq 0) { throw 'Read protected' }
  return $script:pages[$Page].Clone()
}
function Try-AuthenticateNtag($Card,$Protocol,$Password) {
  $script:authCalls++
  if ($script:rejectAuth) { throw 'Authentication rejected' }
  return $true
}
function Write-CardPage($Card,$Protocol,$Page,$Data) {
  $script:writes++
  if ($script:interruptAccess -and $Page -eq 132) { throw 'Card removed' }
  $script:pages[$Page]=$Data.Clone()
}
function Unlock-TestCard { Remove-NtagPasswordProtection -Card ([IntPtr]::Zero) -Protocol 0 -Layout $layout -Password $password }

Reset-TestCard 0xFF
$script:rejectAuth=$true
Unlock-TestCard
if ($script:authCalls -or $script:writes) { throw 'Already-unlocked card must not authenticate or write' }
Write-Output 'PASS: already-unlocked card succeeds without authentication or writes'

Reset-TestCard 4
Unlock-TestCard
if ($script:authCalls -ne 1 -or $script:writes -ne 2 -or $script:pages[131][3] -ne 0xFF) { throw 'Normal unlock failed' }
Write-Output 'PASS: protected card authenticates and confirms protection removal'

Reset-TestCard 4
$script:hideConfig=$true
Unlock-TestCard
if ($script:authCalls -ne 1 -or $script:pages[131][3] -ne 0xFF) { throw 'Read-protected card must still authenticate' }
Write-Output 'PASS: unreadable configuration retains the authenticated unlock path'

Reset-TestCard 4
$script:interruptAccess=$true
$failed=$false
try { Unlock-TestCard } catch { $failed=$true }
if (-not $failed -or $script:pages[131][3] -ne 0xFF) { throw 'Interrupted unlock fixture failed' }
$script:rejectAuth=$true; $script:authCalls=0; $script:writes=0
Unlock-TestCard
if ($script:authCalls -or $script:writes) { throw 'Retry after protection removal should need no authentication or writes' }
Write-Output 'PASS: interrupted unlock recovers without another password attempt'

Reset-TestCard 4
$script:rejectAuth=$true
$failed=$false
try { Unlock-TestCard } catch { $failed=$true }
if (-not $failed -or $script:writes) { throw 'Authentication failure must never write configuration' }
Write-Output 'PASS: authentication failure leaves the protected card untouched'
