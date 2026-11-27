# Zelpophai AI for Android

Capacitor 6 shell around https://zelpophai.com/app. `native/MainActivity.java`
adds file downloads (with the login cookie) and hands `.apk` updates to the system.
The site shows an "update available" prompt when `/api/app/latest` has a newer
version than the `ZelpophaiAndroid/<version>` in the app's user agent.

## Release a new version
`ANDROID_HOME=… KEYSTORE=zelpophai-release.jks KEYSTORE_PASS=… ./build.sh <version> <versionCode>`
then upload `Zelpophai-<version>.apk` as `Zelpophai.apk`, and an `android.json`
(`{"version": "x.y.z", "versionCode": n, "notes": "…"}`) to
`POST /api/app/upload?platform=android&name=…`.
**The same keystore must sign every update** — keep it safe (the Owner has a copy).

## The phone assistant (1.1+)
`native/ZpAssistActivity.java` handles `ACTION_ASSIST`, so Zelpophai can be picked under
Settings → Default apps → Digital assistant app; it shows `/mini?android=1` with the `ZPAndroid`
bridge (`static/js/mini-android.js`). `native/ZpAccess.java` is the optional Accessibility service
(screen reading, screenshots on Android 11+, taps and typing during a task). `ZpTile.java` is the
Quick Settings tile. `patch_android.py` copies these and `native/res/` into the generated project
and adds them to the manifest.
