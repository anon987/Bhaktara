# Run Bhaktara on an Android phone

Verified on **2026-10-04** with Samsung SM_E076B (ARM64), JDK 17, and the Expo development client. This is a debug build that requires Metro; it is not a standalone release APK.

## Build

On the current workstation, from the project root:

```sh
export ANDROID_HOME=/home/techappdev/Android/Sdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
cd android
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain
cd ..
```

Adjust SDK/JDK paths on another machine. The successful initial build took 16m 45s. Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Native dependency changes require rebuilding; ordinary JavaScript/TypeScript changes are served by Metro.

## Start Metro

From the project root in a terminal that stays open:

```sh
npm start -- --localhost --port 8081
```

Check an existing server before starting another one:

```sh
curl --max-time 5 http://127.0.0.1:8081/status
```

The expected response is `packager-status:running`. Verify that any existing server belongs to this project. The first Android bundle took about 56 seconds during the verified launch.

## Install and launch

Connect the phone through USB or authorized wireless debugging. Run `adb devices -l` and replace `YOUR_DEVICE_SERIAL` with the current connected device serial; the wireless address may change.

```sh
adb devices -l
export BHAKTARA_DEVICE='YOUR_DEVICE_SERIAL'
adb -s "$BHAKTARA_DEVICE" install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s "$BHAKTARA_DEVICE" reverse tcp:8081 tcp:8081
adb -s "$BHAKTARA_DEVICE" shell am start -a android.intent.action.VIEW -d 'bhaktara://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.bhaktara.app
```

Installation with `-r` retains app data when signatures are compatible. Do not uninstall or clear storage to fix a connection problem. Reapply ADB reverse after reconnecting the phone. Keep Metro and the ADB connection available while testing.

## Verified behavior and known warnings

ADB reported installation success; `com.bhaktara.app` became the foreground activity; Metro bundled successfully and the native log reported `Running "main"`. The Explore screen and all five navigation tabs visibly rendered. Full native interaction coverage is still pending.

The first launch temporarily showed a blank screen while startup/bundling completed. Check Metro output before treating this as a permanent failure. During this session, desktop React Native DevTools failed because its Chrome sandbox helper was misconfigured; Metro and phone launch still worked. Native startup logs also contained development-client splash-screen/appearance warnings, but the app rendered successfully. These warnings have not been repaired.

The old `docs/verification/android-build.log` records an earlier unsuccessful build. Use [RESULTS.md](verification/RESULTS.md) for the latest verified status.
