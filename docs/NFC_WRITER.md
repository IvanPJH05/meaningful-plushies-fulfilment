# Windows NFC Writer

The fulfilment app writes certificate links to NFC cards from Chrome on Windows by talking to a small local helper.

Desktop Chrome cannot directly control most USB NFC reader/writers. The web app stays in the browser, and the helper talks to the USB reader through Windows.

## Daily use

1. Plug in the USB NFC reader/writer.
2. Open the Vercel fulfilment app in Chrome.
3. Go to **Fulfilment**.
4. Click **Start NFC Helper**.
5. If Chrome asks whether to open the helper, allow it.
6. Leave the black helper window open.
7. Click **Write** beside the certificate link.
8. Tap a blank NFC card on the reader within 30 seconds.

After writing, the helper password-protects the card using the order number. The certificate link remains readable by phones, but rewriting the card requires the same order number password.

If a card needs to be unlocked manually, open **Fulfilment > NFC Card**, enter the 4-character password, click **Unlock card**, then tap the card on the USB reader. For order passwords longer than 4 characters, use the last 4 letters or numbers.

## One-time setup for the Start button

Before the browser can open the helper, Windows needs to know what `meaningful-nfc-helper://start` means.

Run this once:

```text
scripts\nfc-writer
```

Then double-click:

```text
install-windows-nfc-protocol.bat
```

After that, the **Start NFC Helper** button in the app can open the helper.

You can still start it manually by double-clicking:

```text
start-windows-nfc-writer.bat
```

The helper listens only on your own computer at:

```text
http://127.0.0.1:17654
```

## Supported cards and readers

This helper writes a normal URL NDEF record to NFC Forum Type 2 cards such as NTAG213, NTAG215, and NTAG216.

It uses the Windows smart-card / PCSC driver. Common ACR122U-style USB NFC readers should work if Windows recognizes them as a smart card reader.

Password locking uses NTAG password protection. If you rewrite a card from the fulfilment app, the helper tries the order number automatically before writing. If the card was locked with a different password, it cannot be rewritten unless you know that password.

If the app says no USB NFC reader is detected, check that Windows recognizes the reader, then restart the helper.
