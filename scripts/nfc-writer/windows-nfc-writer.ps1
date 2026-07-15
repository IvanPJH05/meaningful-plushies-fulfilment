$ErrorActionPreference = "Stop"

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
  $ndef.AddRange($urlBytes)
  return $ndef.ToArray()
}

function ConvertTo-Type2TagBytes {
  param([Parameter(Mandatory = $true)][string]$Url)
  $ndef = ConvertTo-NdefUrlBytes -Url $Url
  $message = New-Object System.Collections.Generic.List[byte]
  $message.Add(0x03)
  $message.Add([byte]$ndef.Length)
  $message.AddRange($ndef)
  $message.Add(0xFE)
  while (($message.Count % 4) -ne 0) { $message.Add(0x00) }
  return $message.ToArray()
}

function Test-SuccessResponse {
  param([byte[]]$Response)
  if ($Response.Length -lt 2) { return $false }
  return ($Response[$Response.Length - 2] -eq 0x90 -and $Response[$Response.Length - 1] -eq 0x00)
}

function Write-NfcUrl {
  param([Parameter(Mandatory = $true)][string]$Url, [int]$TimeoutSeconds = 30)
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
      Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    if ($card -eq [IntPtr]::Zero) { throw "Timed out. Tap the NFC card on the reader within $TimeoutSeconds seconds." }
    try {
      $bytes = ConvertTo-Type2TagBytes -Url $Url
      for ($offset = 0; $offset -lt $bytes.Length; $offset += 4) {
        $page = 4 + [int]($offset / 4)
        $command = [byte[]]@(0xFF, 0xD6, 0x00, [byte]$page, 0x04, $bytes[$offset], $bytes[$offset + 1], $bytes[$offset + 2], $bytes[$offset + 3])
        $response = [PcscNative]::Transmit($card, $protocol, $command)
        if (-not (Test-SuccessResponse -Response $response)) {
          throw "The NFC card rejected page $page. It may be locked, unsupported, or not an NTAG/Type 2 card."
        }
      }
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
    $stream = $client.GetStream()
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
    if ($firstLine -notmatch '^POST /write ') {
      Send-HttpResponse -Stream $stream -StatusCode 404 -Payload @{ ok = $false; error = "Not found." }
      continue
    }
    $parts = $requestText -split "`r`n`r`n", 2
    $body = if ($parts.Count -gt 1) { $parts[1] } else { "" }
    $payload = $body | ConvertFrom-Json
    $url = [string]$payload.url
    $label = [string]$payload.label
    if ([string]::IsNullOrWhiteSpace($url)) {
      Send-HttpResponse -Stream $stream -StatusCode 400 -Payload @{ ok = $false; error = "Missing URL to write." }
      continue
    }
    Write-Host "Ready to write $label -> $url"
    Write-NfcUrl -Url $url
    Send-HttpResponse -Stream $stream -StatusCode 200 -Payload @{ ok = $true }
    Write-Host "Card written successfully."
  } catch {
    Send-HttpResponse -Stream $stream -StatusCode 500 -Payload @{ ok = $false; error = $_.Exception.Message }
    Write-Host "Write failed: $($_.Exception.Message)"
  } finally {
    $client.Close()
  }
}
