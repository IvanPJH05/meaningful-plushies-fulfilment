# Windows NFC Writer

The fulfilment app writes certificate links to NFC cards from Chrome on Windows by talking to a small local helper.

Desktop Chrome cannot directly control most USB NFC reader/writers. The web app stays in the browser, and the helper talks to the USB reader through Windows.

## Daily use

1. Plug in the USB NFC reader/writer.
2. Open this folder:

```text
scripts\nfc-writer
```

3. Double-click:

```text
start-windows-nfc-writer.bat
```

4. Leave the black helper window open.
5. Open the Vercel fulfilment app in Chrome.
6. Click **Write** beside the certificate link.
7. Tap a blank NFC card on the reader within 30 seconds.

The helper listens only on your own computer at:

```text
http://127.0.0.1:17654
```

## Supported cards and readers

This helper writes a normal URL NDEF record to NFC Forum Type 2 cards such as NTAG213, NTAG215, and NTAG216.

It uses the Windows smart-card / PCSC driver. Common ACR122U-style USB NFC readers should work if Windows recognizes them as a smart card reader.

If the app says no USB NFC reader is detected, check that Windows recognizes the reader, then restart the helper.
