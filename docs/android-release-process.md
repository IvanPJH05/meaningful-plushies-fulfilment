# Permanent Android releases

The signing key and passwords are encrypted GitHub Actions secrets. A protected local recovery copy is stored outside the repository under Documents/Meaningful Fulfilment Release Keys. Back up that folder securely. Never regenerate this key for an ordinary update.

The Publish signed Android update workflow restores signing and Firebase configuration temporarily, builds with Java 21, verifies the certificate fingerprint and app version, and uploads the verified APK before publishing a GitHub Release. The app Updates screen reads GitHub's latest release automatically.

For future releases, increment Android versionCode/versionName, update the workflow tag/title/verification and release notes, then run the workflow on the reviewed source. Never overwrite a published version tag. Do not commit signing material or google-services.json.
