# Meaningful Fulfilment Android app

`npm run mobile:sync` rebuilds the mobile interface and copies it into the Android project.

Open `android` in Android Studio to run it on a device or create a debug APK. The app uses the existing Vercel backend only through `/api/mobile` endpoints; it does not contain a Supabase service-role key.

Before publishing, deploy the branch so the protected mobile endpoints are available at the configured app URL, then test sign-in, Code 128 scanning, QR scanning, and a simultaneous update from two devices.
