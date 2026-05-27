# Android APK Setup

This project is now prepared for an Android app shell using Capacitor.

## How it works

- The Android app loads the live deployed web app URL.
- Your backend must already be deployed and reachable over HTTPS.
- Set `CAPACITOR_LIVE_URL` to the public app URL before syncing Android.

## Required env value

```env
CAPACITOR_LIVE_URL=https://your-live-ticket-app.onrender.com
```

You can also fall back to `APP_URL`, but `CAPACITOR_LIVE_URL` is preferred for Android packaging.

## Commands

```bash
npm run android:sync
npm run android:open
```

## Build APK

1. Deploy the web app first.
2. Set `CAPACITOR_LIVE_URL` to the deployed URL.
3. Run `npm run android:sync`.
4. Run `npm run android:open`.
5. In Android Studio:
   - wait for Gradle sync
   - choose `Build > Build Bundle(s) / APK(s) > Build APK(s)`
   - or generate a signed APK from `Build > Generate Signed Bundle / APK`

## Notes

- If the live app URL changes, update `CAPACITOR_LIVE_URL` and run `npm run android:sync` again.
- If you later want a fully offline/native-backed app, the API layer will need a different architecture than the current hosted Express backend.
