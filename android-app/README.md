# Zelpophai AI for Android

Capacitor 6 shell around https://zelpophai.up.railway.app/app. `native/MainActivity.java`
adds file downloads (with the login cookie) and hands `.apk` updates to the system.
The site shows an "update available" prompt when `/api/app/latest` has a newer
version than the `ZelpophaiAndroid/<version>` in the app's user agent.

## Release a new version
`ANDROID_HOME=… KEYSTORE=zelpophai-release.jks KEYSTORE_PASS=… ./build.sh <version> <versionCode>`
then upload `Zelpophai-<version>.apk` as `Zelpophai.apk`, and an `android.json`
(`{"version": "x.y.z", "versionCode": n, "notes": "…"}`) to
`POST /api/app/upload?platform=android&name=…`.
**The same keystore must sign every update** — keep it safe (the Owner has a copy).
