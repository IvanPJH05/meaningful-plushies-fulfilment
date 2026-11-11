param([switch]$WebcamDemo)

$ErrorActionPreference = "Stop"

# Keep one writer per Windows session, including repeated app-button clicks.
$newHelperInstance = $false
$mutexName = if ($WebcamDemo) { 'Local\MeaningfulPlushiesNfcWebcamDemo' } else { 'Local\MeaningfulPlushiesNfcWriter' }
$helperInstanceMutex = [System.Threading.Mutex]::new($true, $mutexName, [ref]$newHelperInstance)
if (-not $newHelperInstance) {
  $helperInstanceMutex.Dispose()
  exit 0
}

$source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PcscNative {
  public const uint SCARD_SCOPE_USER = 0;
  public const uint SCARD_SHARE_SHARED = 2;
  public const uint SCARD_PROTOCOL_T0 = 1;
  public const uint SCARD_PROTOCOL_T1 = 2;
  public const uint SCARD_LEAVE_CARD = 0;

  [StructLayout(LayoutKind.Sequential)]
  public struct SCARD_IO_REQUEST {
    public uint dwProtocol;
    public uint cbPciLength;
  }

  [DllImport("winscard.dll")]
  public static extern int SCardEstablishContext(uint dwScope, IntPtr pvReserved1, IntPtr pvReserved2, out IntPtr phContext);

  [DllImport("winscard.dll")]
  public static extern int SCardReleaseContext(IntPtr phContext);

  [DllImport("winscard.dll", CharSet = CharSet.Auto)]
  public static extern int SCardListReaders(IntPtr hContext, string mszGroups, byte[] mszReaders, ref uint pcchReaders);

  [DllImport("winscard.dll", CharSet = CharSet.Auto)]
  public static extern int SCardConnect(IntPtr hContext, string szReader, uint dwShareMode, uint dwPreferredProtocols, out IntPtr phCard, out uint pdwActiveProtocol);

  [DllImport("winscard.dll")]
  public static extern int SCardDisconnect(IntPtr hCard, uint dwDisposition);

  [DllImport("winscard.dll")]
  public static extern int SCardTransmit(IntPtr hCard, ref SCARD_IO_REQUEST pioSendPci, byte[] pbSendBuffer, int cbSendLength, IntPtr pioRecvPci, byte[] pbRecvBuffer, ref int pcbRecvLength);

  public static string[] ListReaders(IntPtr context) {
    uint readerLength = 0;
    int result = SCardListReaders(context, null, null, ref readerLength);
    if (result != 0 || readerLength == 0) return Array.Empty<string>();
    byte[] buffer = new byte[readerLength * 2];
    result = SCardListReaders(context, null, buffer, ref readerLength);
    if (result != 0) return Array.Empty<string>();
    string multi = Encoding.Unicode.GetString(buffer).TrimEnd('\0');
    if (String.IsNullOrWhiteSpace(multi)) return Array.Empty<string>();
    return multi.Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
  }

  public static byte[] Transmit(IntPtr card, uint protocol, byte[] command) {
    var io = new SCARD_IO_REQUEST { dwProtocol = protocol, cbPciLength = (uint)Marshal.SizeOf(typeof(SCARD_IO_REQUEST)) };
    byte[] response = new byte[258];
    int responseLength = response.Length;
    int result = SCardTransmit(card, ref io, command, command.Length, IntPtr.Zero, response, ref responseLength);
    if (result != 0) throw new Exception("Card command failed: 0x" + result.ToString("X8"));
    byte[] exact = new byte[responseLength];
    Array.Copy(response, exact, responseLength);
    return exact;
  }
}
"@

Add-Type -TypeDefinition $source

function Add-ByteRange {
  param(
    [Parameter(Mandatory = $true)][System.Collections.Generic.List[byte]]$List,
    [Parameter(Mandatory = $true)][byte[]]$Bytes
  )
  foreach ($byteValue in $Bytes) {
    $List.Add([byte]$byteValue)
  }
}

function ConvertTo-NdefUrlBytes {
  param([Parameter(Mandatory = $true)][string]$Url)
  $cleanUrl = $Url.Trim()
  if ($cleanUrl -notmatch '^https?://') { throw "Only http or https URLs can be written." }
  $prefixCode = 0
  $body = $cleanUrl
  $prefixes = @(
    @{ Prefix = "https://www."; Code = 0x02 },
    @{ Prefix = "http://www."; Code = 0x01 },
    @{ Prefix = "https://"; Code = 0x04 },
    @{ Prefix = "http://"; Code = 0x03 }
  )
  foreach ($item in $prefixes) {
    if ($cleanUrl.ToLowerInvariant().StartsWith($item.Prefix)) {
      $prefixCode = [byte]$item.Code
      $body = $cleanUrl.Substring($item.Prefix.Length)
      break
    }
  }
  $urlBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $payloadLength = 1 + $urlBytes.Length
  if ($payloadLength -gt 250) { throw "The certificate URL is too long for this NFC card writer." }
  $ndef = New-Object System.Collections.Generic.List[byte]
  $ndef.Add(0xD1)
  $ndef.Add(0x01)
  $ndef.Add([byte]$payloadLength)
  $ndef.Add(0x55)
  $ndef.Add([byte]$prefixCode)
  Add-ByteRange -List $ndef -Bytes $urlBytes
  return $ndef.ToArray()
}

function ConvertTo-Type2TagBytes {
  param([Parameter(Mandatory = $true)][string]$Url)
  $ndef = ConvertTo-NdefUrlBytes -Url $Url
  $message = New-Object System.Collections.Generic.List[byte]
  $message.Add(0x03)
  $message.Add([byte]$ndef.Length)
  Add-ByteRange -List $message -Bytes $ndef
  $message.Add(0xFE)
  while (($message.Count % 4) -ne 0) { $message.Add(0x00) }
  return $message.ToArray()
}

function Test-SuccessResponse {
  param([byte[]]$Response)
  if ($Response.Length -lt 2) { return $false }
  return ($Response[$Response.Length - 2] -eq 0x90 -and $Response[$Response.Length - 1] -eq 0x00)
}

function New-ByteArray {
  param([Parameter(Mandatory = $true)][object[]]$Values)
  $bytes = New-Object byte[] $Values.Count
  for ($index = 0; $index -lt $Values.Count; $index += 1) {
    $bytes[$index] = [byte]$Values[$index]
  }
  return $bytes
}

function Get-ResponseData {
  param([byte[]]$Response, [int]$Length)
  if (-not (Test-SuccessResponse -Response $Response)) { return $null }
  if ($Response.Length -lt ($Length + 2)) { return $null }
  $data = New-Object byte[] $Length
  [Array]::Copy($Response, 0, $data, 0, $Length)
  return $data
}

function Read-CardPage {
  param([IntPtr]$Card, [uint32]$Protocol, [int]$Page)
  $command = New-ByteArray @(0xFF, 0xB0, 0x00, [byte]$Page, 0x04)
  $response = Send-CardCommand -Card $Card -Protocol $Protocol -Command $command
  $data = Get-ResponseData -Response $response -Length 4
  if ($data) { return $data }

  # Some readers reject the storage APDU for configuration pages. Native
  # Type 2 READ returns four pages; only the requested first page is needed.
  $nativeData = Invoke-NativeNfcCommand -Card $Card -Protocol $Protocol -NativeCommand (New-ByteArray @(0x30, [byte]$Page))
  if ($nativeData -and $nativeData.Length -ge 16) {
    $pageData = New-Object byte[] 4
    [Array]::Copy([byte[]]$nativeData, 0, $pageData, 0, 4)
    return $pageData
  }
  throw "Could not read NFC card page $Page. Keep the card on the reader and check that its tag type was detected correctly."
}

function Write-CardPage {
  param([IntPtr]$Card, [uint32]$Protocol, [int]$Page, [byte[]]$Data)
  if ($Data.Length -ne 4) { throw "NFC page writes must contain exactly 4 bytes." }
  $command = New-ByteArray @(0xFF, 0xD6, 0x00, [byte]$Page, 0x04, $Data[0], $Data[1], $Data[2], $Data[3])
  $response = [PcscNative]::Transmit($Card, $Protocol, $command)
  if (Test-SuccessResponse -Response $response) { return }

  $nativeWrite = New-ByteArray @(0xA2, [byte]$Page, $Data[0], $Data[1], $Data[2], $Data[3])
  $nativeResponse = Invoke-NativeNfcCommand -Card $Card -Protocol $Protocol -NativeCommand $nativeWrite
  if ($nativeResponse) { return }

  throw "The NFC card rejected page $Page. It may be locked, unsupported, or not an NTAG/Type 2 card."
}

function Remove-NtagPasswordProtection {
  param([IntPtr]$Card, [uint32]$Protocol, [hashtable]$Layout, [byte[]]$Password)
  if (-not (Try-AuthenticateNtag -Card $Card -Protocol $Protocol -Password $Password)) {
    throw "The NFC card did not accept that password."
  }
  $auth0 = Read-CardPage -Card $Card -Protocol $Protocol -Page $Layout.Auth0Page
  $auth0[3] = 0xFF
  Write-CardPage -Card $Card -Protocol $Protocol -Page $Layout.Auth0Page -Data $auth0

  $access = Read-CardPage -Card $Card -Protocol $Protocol -Page $Layout.AccessPage
  $access[0] = [byte]($access[0] -band 0x7F)
  Write-CardPage -Card $Card -Protocol $Protocol -Page $Layout.AccessPage -Data $access
}

function Send-CardCommand {
  param([IntPtr]$Card, [uint32]$Protocol, [byte[]]$Command)
  $response = [PcscNative]::Transmit($Card, $Protocol, $Command)
  if ($response.Length -ge 2 -and $response[$response.Length - 2] -eq 0x61) {
    $getResponse = New-ByteArray @(0xFF, 0xC0, 0x00, 0x00, $response[$response.Length - 1])
    return [PcscNative]::Transmit($Card, $Protocol, $getResponse)
  }
  return $response
}

function Invoke-NativeNfcCommand {
  param([IntPtr]$Card, [uint32]$Protocol, [byte[]]$NativeCommand, [string]$FailureContext = '')
  $command = New-Object System.Collections.Generic.List[byte]
  foreach ($value in @(0xFF, 0x00, 0x00, 0x00, [byte](2 + $NativeCommand.Length), 0xD4, 0x42)) {
    $command.Add([byte]$value)
  }
  Add-ByteRange -List $command -Bytes $NativeCommand
  $response = Send-CardCommand -Card $Card -Protocol $Protocol -Command $command.ToArray()
  if (-not (Test-SuccessResponse -Response $response)) {
    if ($FailureContext) {
      $status = if ($response.Length -ge 2) { '{0:X2}{1:X2}' -f $response[$response.Length - 2], $response[$response.Length - 1] } else { 'no response' }
      throw "$FailureContext failed at the reader (APDU status $status). This does not establish that the password is wrong."
    }
    return $null
  }
  if ($response.Length -ge 5 -and $response[0] -eq 0xD5 -and $response[1] -eq 0x43 -and $response[2] -eq 0x00) {
    $length = $response.Length - 5
    $data = New-Object byte[] $length
    if ($length -gt 0) { [Array]::Copy($response, 3, $data, 0, $length) }
    return $data
  }
  if ($FailureContext) {
    $status = if ($response.Length -ge 5 -and $response[0] -eq 0xD5 -and $response[1] -eq 0x43) { 'PN532 status 0x{0:X2}' -f $response[2] } else { 'unexpected reader response format' }
    throw "$FailureContext failed ($status). Remove the card, place it back on the reader, and report this error if it repeats. The password has not been verified."
  }
  return $null
}

function Get-NfcPasswordBytes {
  param([Parameter(Mandatory = $true)][string]$PasswordSource)
  $clean = ($PasswordSource.ToUpperInvariant() -replace '[^A-Z0-9]', '')
  if ([string]::IsNullOrWhiteSpace($clean)) { throw "Missing order number password for NFC card lock." }
  if ($clean.Length -gt 4) { $clean = $clean.Substring($clean.Length - 4) }
  while ($clean.Length -lt 4) { $clean = "0$clean" }
  return [System.Text.Encoding]::ASCII.GetBytes($clean)
}

function Get-NtagLayout {
  param([IntPtr]$Card, [uint32]$Protocol)
  $version = Invoke-NativeNfcCommand -Card $Card -Protocol $Protocol -NativeCommand (New-ByteArray @(0x60))
  if ($version -and $version.Length -ge 7) {
    $storage = $version[6]
    if ($storage -eq 0x0F) { return @{ Name = "NTAG213"; UserEndPage = 39; Auth0Page = 41; AccessPage = 42; PasswordPage = 43; PackPage = 44 } }
    if ($storage -eq 0x11) { return @{ Name = "NTAG215"; UserEndPage = 129; Auth0Page = 131; AccessPage = 132; PasswordPage = 133; PackPage = 134 } }
    if ($storage -eq 0x13) { return @{ Name = "NTAG216"; UserEndPage = 225; Auth0Page = 227; AccessPage = 228; PasswordPage = 229; PackPage = 230 } }
  }
  Write-Host "Could not detect exact NTAG type. Assuming NTAG213 layout."
  return @{ Name = "NTAG213"; UserEndPage = 39; Auth0Page = 41; AccessPage = 42; PasswordPage = 43; PackPage = 44 }
}

function Try-AuthenticateNtag {
  param([IntPtr]$Card, [uint32]$Protocol, [byte[]]$Password)
  $auth = New-ByteArray @(0x1B, $Password[0], $Password[1], $Password[2], $Password[3])
  $response = Invoke-NativeNfcCommand -Card $Card -Protocol $Protocol -NativeCommand $auth -FailureContext 'Card authentication'
  if ($null -eq $response -or $response.Length -ne 2) {
    throw 'Card authentication did not return the required two-byte acknowledgement. This may be a card rejection or a reader communication problem; it does not confirm an incorrect password.'
  }
  return $true
}

function Set-NtagPasswordProtection {
  param([IntPtr]$Card, [uint32]$Protocol, [hashtable]$Layout, [byte[]]$Password)
  Write-CardPage -Card $Card -Protocol $Protocol -Page $Layout.PasswordPage -Data $Password
  Write-CardPage -Card $Card -Protocol $Protocol -Page $Layout.PackPage -Data (New-ByteArray @(0x4D, 0x50, 0x00, 0x00))

  $access = Read-CardPage -Card $Card -Protocol $Protocol -Page $Layout.AccessPage
  $access[0] = [byte]($access[0] -band 0x7F)
  Write-CardPage -Card $Card -Protocol $Protocol -Page $Layout.AccessPage -Data $access

  $auth0 = Read-CardPage -Card $Card -Protocol $Protocol -Page $Layout.Auth0Page
  $auth0[3] = 0x04
  Write-CardPage -Card $Card -Protocol $Protocol -Page $Layout.Auth0Page -Data $auth0
}

function Get-CardUid {
  param([IntPtr]$Card, [uint32]$Protocol)
  $command = [byte[]]@(0xFF, 0xCA, 0, 0, 0)
  $response = [PcscNative]::Transmit($Card, $Protocol, $command)
  if (!(Test-SuccessResponse $response) -or $response.Length -notin @(6, 9, 12)) {
    throw "The reader could not identify the NFC card. Try a supported reader and tag."
  }
  return [BitConverter]::ToString($response, 0, $response.Length - 2).Replace('-', '')
}

function Get-PresentCard {
  $context = [IntPtr]::Zero
  $result = [PcscNative]::SCardEstablishContext([PcscNative]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
  if ($result -ne 0) { throw "Could not open Windows NFC service. Connect the USB NFC reader." }
  try {
    $readers = [PcscNative]::ListReaders($context)
    if (!$readers) { throw "No USB NFC reader detected by Windows." }
    $card = [IntPtr]::Zero
    $protocol = 0
    $result = [PcscNative]::SCardConnect($context, $readers[0], [PcscNative]::SCARD_SHARE_SHARED, 3, [ref]$card, [ref]$protocol)
    if ($result -eq -2146434967 -or $result -eq -2146435060) { return $null }
    if ($result -ne 0) { throw "Could not connect to the NFC reader (0x$($result.ToString('X8')))." }
    try { return Get-CardUid -Card $card -Protocol $protocol }
    finally { [void][PcscNative]::SCardDisconnect($card, [PcscNative]::SCARD_LEAVE_CARD) }
  } finally { [void][PcscNative]::SCardReleaseContext($context) }
}

function Get-NfcMessageStart {
  param([byte[]]$Header)
  $offset = 0
  $controlEnd = 0
  while ($offset -lt $Header.Length) {
    $type = $Header[$offset]
    if ($type -eq 0) { $offset++; continue }
    if ($type -eq 0xFE) { return @{ Offset = $controlEnd; Empty = $true } }
    if ($offset + 1 -ge $Header.Length) { break }
    $length = $Header[$offset + 1]
    if ($type -eq 3) {
      $empty = $length -eq 0 -and ($offset + 2 -ge $Header.Length -or $Header[$offset + 2] -in @(0, 0xFE))
      $start = if ($empty) { $controlEnd } else { $offset }
      return @{ Offset = $start; Empty = $empty }
    }
    if ($type -notin @(1, 2) -or $length -ne 3 -or $offset + 5 -gt $Header.Length) { break }
    $offset += 5
    $controlEnd = $offset
  }
  return @{ Offset = $controlEnd; Empty = ($offset -eq $Header.Length) }
}

function Test-NfcPageContents {
  param([IntPtr]$Card, [uint32]$Protocol, [byte[]]$Bytes)
  for ($offset = 0; $offset -lt $Bytes.Length; $offset += 4) {
    $page = 4 + [int]($offset / 4)
    if (((Read-CardPage -Card $Card -Protocol $Protocol -Page $page) -join ',') -ne ($Bytes[$offset..($offset+3)] -join ',')) {
      return $false
    }
  }
  return $true
}

function Write-NfcUrl {
  param([Parameter(Mandatory = $true)][string]$Url, [string]$PasswordSource = "", [int]$TimeoutSeconds = 30, [switch]$VerifyPackaging, [string]$ExpectedUid = "", [string]$PreviousDemoUrl = "")
  $context = [IntPtr]::Zero
  $result = [PcscNative]::SCardEstablishContext([PcscNative]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
  if ($result -ne 0) { throw "Could not open Windows NFC service: 0x$($result.ToString('X8'))" }
  try {
    $readers = [PcscNative]::ListReaders($context)
    if (-not $readers -or $readers.Count -eq 0) { throw "No USB NFC reader detected by Windows." }
    $reader = $readers[0]
    Write-Host "Using NFC reader: $reader"
    Write-Host "Tap an NFC card on the reader..."
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $card = [IntPtr]::Zero
    $protocol = 0
    do {
      $connectResult = [PcscNative]::SCardConnect($context, $reader, [PcscNative]::SCARD_SHARE_SHARED, ([PcscNative]::SCARD_PROTOCOL_T0 -bor [PcscNative]::SCARD_PROTOCOL_T1), [ref]$card, [ref]$protocol)
      if ($connectResult -eq 0) { break }
      if ($ExpectedUid) { throw "The card was removed before writing. Place it back and try again." }
      Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    if ($card -eq [IntPtr]::Zero) { throw "Timed out. Tap the NFC card on the reader within $TimeoutSeconds seconds." }
    try {
      if ($ExpectedUid -and (Get-CardUid -Card $card -Protocol $protocol) -cne $ExpectedUid) {
        throw "The card changed before writing. Remove it and start again."
      }
      $bytes = ConvertTo-Type2TagBytes -Url $Url
      $layout = Get-NtagLayout -Card $card -Protocol $protocol
      $prefix = [byte[]]@()
      if ($VerifyPackaging) {
        $header = [byte[]]@(4..7 | ForEach-Object { Read-CardPage -Card $card -Protocol $protocol -Page $_ })
        $tag = Get-NfcMessageStart -Header $header
        if ($tag.Offset -gt 0) {
          # Preserve factory lock and memory descriptors before the NDEF message.
          $prefix = [byte[]]$header[0..($tag.Offset - 1)]
          $bytes = [byte[]]($prefix + $bytes)
          while ($bytes.Length % 4) { $bytes += [byte]0 }
        }
      }
      $endPage = 4 + [int][Math]::Ceiling($bytes.Length / 4) - 1
      if ($endPage -gt $layout.UserEndPage) { throw "The certificate URL is too long for this $($layout.Name) NFC card." }
      $password = if ([string]::IsNullOrWhiteSpace($PasswordSource)) { $null } else { Get-NfcPasswordBytes -PasswordSource $PasswordSource }
      if ($VerifyPackaging -and !$tag.Empty -and !(Test-NfcPageContents -Card $card -Protocol $protocol -Bytes $bytes)) {
        $matchesDemo = $false
        if ($PreviousDemoUrl) {
          $demoBytes = [byte[]]($prefix + (ConvertTo-Type2TagBytes -Url $PreviousDemoUrl))
          while ($demoBytes.Length % 4) { $demoBytes += [byte]0 }
          $matchesDemo = Test-NfcPageContents -Card $card -Protocol $protocol -Bytes $demoBytes
        }
        if (!$matchesDemo) {
          throw "This card holds a different link or unrecognized data. Use a blank card or the test card originally written for this sticker."
        }
      }
      for ($offset = 0; $offset -lt $bytes.Length; $offset += 4) {
        $page = 4 + [int]($offset / 4)
        $pageData = New-ByteArray @($bytes[$offset], $bytes[$offset + 1], $bytes[$offset + 2], $bytes[$offset + 3])
        try {
          Write-CardPage -Card $card -Protocol $protocol -Page $page -Data $pageData
        } catch {
          if (-not $password) { throw }
          Write-Host "Write was rejected on page $page. Trying the order password again..."
          if (-not (Try-AuthenticateNtag -Card $card -Protocol $protocol -Password $password)) { throw }
          Write-CardPage -Card $card -Protocol $protocol -Page $page -Data $pageData
        }
      }
      if ($password) {
        Set-NtagPasswordProtection -Card $card -Protocol $protocol -Layout $layout -Password $password
        Write-Host "Card write-protected with order password."
      }
      if ($VerifyPackaging -and !(Test-NfcPageContents -Card $card -Protocol $protocol -Bytes $bytes)) {
        throw "The link read back from the NFC card did not match. Inspect the card before retrying."
      }
      if ($ExpectedUid -and (Get-CardUid -Card $card -Protocol $protocol) -cne $ExpectedUid) {
        throw "The card changed during verification."
      }
    } finally {
      [void][PcscNative]::SCardDisconnect($card, [PcscNative]::SCARD_LEAVE_CARD)
    }
  } finally {
    if ($context -ne [IntPtr]::Zero) { [void][PcscNative]::SCardReleaseContext($context) }
  }
}

function Unlock-NfcCard {
  param([Parameter(Mandatory = $true)][string]$PasswordSource, [int]$TimeoutSeconds = 30)
  $context = [IntPtr]::Zero
  $result = [PcscNative]::SCardEstablishContext([PcscNative]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
  if ($result -ne 0) { throw "Could not open Windows NFC service: 0x$($result.ToString('X8'))" }
  try {
    $readers = [PcscNative]::ListReaders($context)
    if (-not $readers -or $readers.Count -eq 0) { throw "No USB NFC reader detected by Windows." }
    $reader = $readers[0]
    Write-Host "Using NFC reader: $reader"
    Write-Host "Tap the locked NFC card on the reader..."
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $card = [IntPtr]::Zero
    $protocol = 0
    do {
      $connectResult = [PcscNative]::SCardConnect($context, $reader, [PcscNative]::SCARD_SHARE_SHARED, ([PcscNative]::SCARD_PROTOCOL_T0 -bor [PcscNative]::SCARD_PROTOCOL_T1), [ref]$card, [ref]$protocol)
      if ($connectResult -eq 0) { break }
      Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    if ($card -eq [IntPtr]::Zero) { throw "Timed out. Tap the NFC card on the reader within $TimeoutSeconds seconds." }
    try {
      $layout = Get-NtagLayout -Card $card -Protocol $protocol
      $password = Get-NfcPasswordBytes -PasswordSource $PasswordSource
      Remove-NtagPasswordProtection -Card $card -Protocol $protocol -Layout $layout -Password $password
      Write-Host "Card password protection removed."
    } finally {
      [void][PcscNative]::SCardDisconnect($card, [PcscNative]::SCARD_LEAVE_CARD)
    }
  } finally {
    if ($context -ne [IntPtr]::Zero) { [void][PcscNative]::SCardReleaseContext($context) }
  }
}

function Send-HttpResponse {
  param([System.Net.Sockets.NetworkStream]$Stream, [int]$StatusCode, [hashtable]$Payload)
  $statusText = if ($StatusCode -eq 200) { "OK" } elseif ($StatusCode -eq 404) { "Not Found" } else { "Error" }
  $json = $Payload | ConvertTo-Json -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  $headers = "HTTP/1.1 $StatusCode $statusText`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Private-Network: true`r`nContent-Type: application/json`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($body, 0, $body.Length)
}

function Read-HttpRequest {
  param([System.Net.Sockets.NetworkStream]$Stream)
  $buffer = New-Object byte[] 65536
  $bytesRead = $Stream.Read($buffer, 0, $buffer.Length)
  if ($bytesRead -le 0) { return $null }
  return [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
}

if ($WebcamDemo) {
  . (Join-Path $PSScriptRoot 'webcam-demo/server.ps1')
  return
}

$port = 17654
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
$listener.Start()
Write-Host ""
Write-Host "Meaningful Plushies Windows NFC writer is running."
Write-Host "Leave this window open, then click Write in the fulfilment app."
Write-Host "Local address: http://127.0.0.1:$port"
Write-Host ""

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 2500
    $client.SendTimeout = 2500
    $stream = $client.GetStream()
    $stream.ReadTimeout = 2500
    $stream.WriteTimeout = 2500
    $requestText = Read-HttpRequest -Stream $stream
    if (-not $requestText) { continue }
    $firstLine = ($requestText -split "`r?`n", 2)[0]
    if ($firstLine -match '^OPTIONS ') {
      Send-HttpResponse -Stream $stream -StatusCode 200 -Payload @{ ok = $true }
      continue
    }
    if ($firstLine -match '^GET /health ') {
      Send-HttpResponse -Stream $stream -StatusCode 200 -Payload @{ ok = $true; helper = "windows-nfc-writer" }
      continue
    }
    $cameraWrite = $firstLine -match '^POST /write-camera '
    $cameraRead = $firstLine -match '^GET /card-present '
    if ($cameraWrite -or $cameraRead) {
      $requestHeaders = ($requestText -split "`r`n`r`n", 2)[0]
      if ($requestHeaders -notmatch '(?m)^Origin: https://meaningful-plushies-fulfilment\.vercel\.app\r?$') {
        throw "Open the camera station from the live fulfilment app."
      }
    }
    if ($cameraRead) {
      Send-HttpResponse -Stream $stream -StatusCode 200 -Payload @{ ok = $true; uid = (Get-PresentCard) }
      continue
    }
    if ($firstLine -notmatch '^POST /(write|write-packaging|write-camera|unlock) ') {
      Send-HttpResponse -Stream $stream -StatusCode 404 -Payload @{ ok = $false; error = "Not found." }
      continue
    }
    $parts = $requestText -split "`r`n`r`n", 2
    $body = if ($parts.Count -gt 1) { $parts[1] } else { "" }
    $payload = $body | ConvertFrom-Json
    $url = [string]$payload.url
    $label = [string]$payload.label
    $password = [string]$payload.password
    if ($firstLine -match '^POST /unlock ') {
      if ([string]::IsNullOrWhiteSpace($password)) {
        Send-HttpResponse -Stream $stream -StatusCode 400 -Payload @{ ok = $false; error = "Enter the NFC card password." }
        continue
      }
      Write-Host "Ready to unlock NFC card."
      Unlock-NfcCard -PasswordSource $password
      Send-HttpResponse -Stream $stream -StatusCode 200 -Payload @{ ok = $true }
      continue
    }
    if ([string]::IsNullOrWhiteSpace($url)) {
      Send-HttpResponse -Stream $stream -StatusCode 400 -Payload @{ ok = $false; error = "Missing URL to write." }
      continue
    }
    Write-Host "Ready to write $label -> $url"
    $expectedUid = ""
    if ($cameraWrite) {
      $expectedUid = [string]$payload.uid
      if ($expectedUid -cnotmatch '^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$' -or
          $url -cnotmatch '^https://meaningful-plushies-fulfilment\.vercel\.app/n/[a-f0-9]{32}$' -or
          $label -cnotmatch '^NFC-\d{6,12}$' -or !$password) {
        throw "The camera write needs a detected card, a permanent NFC link and writer settings."
      }
    }
    $verifyPackaging = $cameraWrite -or $firstLine -match '^POST /write-packaging '
    $timeout = if ($verifyPackaging) { 1 } else { 30 }
    Write-NfcUrl -Url $url -PasswordSource $password -TimeoutSeconds $timeout -VerifyPackaging:$verifyPackaging -ExpectedUid $expectedUid
    Send-HttpResponse -Stream $stream -StatusCode 200 -Payload @{ ok = $true; verified = $verifyPackaging }
    Write-Host "Card written successfully."
  } catch {
    try { Send-HttpResponse -Stream $stream -StatusCode 500 -Payload @{ ok = $false; error = $_.Exception.Message } } catch { }
    Write-Host "Write failed: $($_.Exception.Message)"
  } finally {
    $client.Close()
  }
}
