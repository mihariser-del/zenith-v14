#!/usr/bin/env bash
# Builds Zelpophai-<version>.apk.  Usage:
#   ANDROID_HOME=/opt/android-sdk KEYSTORE=path.jks KEYSTORE_PASS=... ./build.sh 1.0.0 1
set -euo pipefail
VERSION="${1:-1.0.0}"
CODE="${2:-1}"
cd "$(dirname "$0")"
npm install --no-audit --no-fund
sed "s/__VERSION__/${VERSION}/" capacitor.config.json > capacitor.config.json.tmp && mv capacitor.config.json.tmp capacitor.config.json.build
cp capacitor.config.json capacitor.config.json.src
cp capacitor.config.json.build capacitor.config.json
[ -d android ] || npx cap add android
npx --yes @capacitor/assets@3.0.5 generate --android --iconBackgroundColor '#2563eb' --splashBackgroundColor '#070a17' >/dev/null || echo "icon generation skipped"
npx cap sync android
cp native/MainActivity.java android/app/src/main/java/com/zelpophai/app/MainActivity.java
python3 patch_android.py "$VERSION" "$CODE"
mv capacitor.config.json.src capacitor.config.json; rm -f capacitor.config.json.build
cd android && ./gradlew --no-daemon -q assembleRelease && cd ..
BT="$ANDROID_HOME/build-tools/34.0.0"
"$BT/zipalign" -f -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk out-aligned.apk
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --out "Zelpophai-${VERSION}.apk" out-aligned.apk
rm -f out-aligned.apk
"$BT/apksigner" verify "Zelpophai-${VERSION}.apk" && echo "Built Zelpophai-${VERSION}.apk"
