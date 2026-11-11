$demoOrigin = 'http://127.0.0.1:4183'
$decoderFiles = @{
  '/decoder.js' = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.0.5/dist/iife/ponyfill.min.js'
  '/zxing_reader.wasm' = 'https://cdn.jsdelivr.net/npm/zxing-wasm@2.2.0/dist/reader/zxing_reader.wasm'
}
$demoAssets = @{}
foreach ($asset in $decoderFiles.GetEnumerator()) {
  $assetFile = Join-Path ([IO.Path]::GetTempPath()) ('mp-nfc-demo-v1-' + $asset.Key.TrimStart('/'))
  if (!(Test-Path -LiteralPath $assetFile)) {
    Invoke-WebRequest -UseBasicParsing -Uri $asset.Value -OutFile $assetFile
  }
  $demoAssets[$asset.Key] = [IO.File]::ReadAllBytes($assetFile)
}
$demoAssets['/'] = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'index.html'))

function Send-DemoResponse($Stream, [string]$Status, [string]$Type, [byte[]]$Body) {
  $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $Status`r`nContent-Type: $Type`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
  $Stream.Write($header, 0, $header.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 4183)
$listener.Start()
Write-Host "NFC webcam test station: $demoOrigin"
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 2500
      $client.SendTimeout = 2500
      $stream = $client.GetStream()
      $stream.ReadTimeout = 2500
      $stream.WriteTimeout = 2500
      $http = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII)
      $request = $http.ReadLine()
      if (!$request) { continue }
      $headers = @{}
      while ($line = $http.ReadLine()) {
        $name, $value = $line -split ':', 2
        if ($value) { $headers[$name] = $value.Trim() }
      }
      if ($headers['Host'] -cne '127.0.0.1:4183') { throw 'Open the station at its local address.' }
      $method, $path = $request -split ' ', 3
      $path = ($path -split '\?', 2)[0]
      $reply = $null
      if ($method -ceq 'GET' -and $demoAssets.ContainsKey($path)) {
        $type = switch ($path) {
          '/' { 'text/html; charset=utf-8' }
          '/decoder.js' { 'text/javascript' }
          default { 'application/wasm' }
        }
        Send-DemoResponse $stream '200 OK' $type $demoAssets[$path]
        continue
      }
      if ($method -ceq 'GET' -and $path -ceq '/card') {
        $reply = @{ uid = (Get-PresentCard) }
      } elseif ($method -ceq 'POST' -and $path -ceq '/write') {
        if ($headers['Origin'] -cne $demoOrigin -or $headers['Content-Type'] -cne 'application/json') { throw 'Write requests must come from the local station.' }
        $length = 0
        if (![int]::TryParse($headers['Content-Length'], [ref]$length) -or $length -lt 1 -or $length -gt 512) { throw 'Invalid write request.' }
        $characters = New-Object char[] $length
        if ($http.ReadBlock($characters, 0, $length) -ne $length) { throw 'Incomplete write request.' }
        $payload = (-join $characters) | ConvertFrom-Json
        if ($payload.code -cnotmatch '^NFC-\d{6,12}$' -or $payload.uid -cnotmatch '^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$') { throw 'Invalid barcode or card ID.' }
        $url = [string]$payload.url
        if ($url -cnotmatch '^https://meaningful-plushies-fulfilment\.vercel\.app/n/[a-f0-9]{32}$') {
          throw 'Import a permanent NFC link exported from the fulfilment app.'
        }
        $previousDemoUrl = "$demoOrigin/?card=$($payload.code)"
        Write-NfcUrl -Url $url -VerifyPackaging -ExpectedUid $payload.uid -PreviousDemoUrl $previousDemoUrl
        $reply = @{ verified = $true; url = $url }
      } else {
        Send-DemoResponse $stream '404 Not Found' 'text/plain' ([byte[]]@())
        continue
      }
      Send-DemoResponse $stream '200 OK' 'application/json' ([Text.Encoding]::UTF8.GetBytes(($reply | ConvertTo-Json -Compress)))
    } catch {
      $errorJson = @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
      try { Send-DemoResponse $stream '409 Conflict' 'application/json' ([Text.Encoding]::UTF8.GetBytes($errorJson)) } catch {}
    } finally { $client.Close() }
  }
} finally { $listener.Stop() }
