# Watch Together - Workspace Memory & Agent Guidelines

## 🌟 Project Identity
- **Project Name**: Watch Together (Private Cinema)
- **Repo**: `https://github.com/helloman3/watch-together`
- **Cloud Backend (Render)**: `https://watch-together-8wj2.onrender.com`
- **Latest Release**: `v1.2.0-stable`
- **Supported Platforms**:
  - 🌐 Web: React 18, Vite 5, TailwindCSS
  - 📱 Mobile: Android APK via Capacitor 7 (`WatchTogether.apk`)
  - 💻 Desktop: Windows Standalone Portable Executable via Electron (`WatchTogether-Desktop.exe` & `WatchTogether-Windows-x64.zip`)

---

## 🔒 Critical Invariants (DO NOT BREAK)

### 1. YouTube Player Synchronization & Loop Prevention
- **Invariant**: **Never** reintroduce periodic guest-side drift seek intervals (`setInterval` with `seekTo`) on YouTube playback.
- **Reason**: Aggressive drift intervals trigger infinite YouTube buffering loops and reset videos to the beginning.
- **Rule**: Guests only synchronize upon explicit host `seekTo`, `play_media`, `pause_media`, or `change_media` socket broadcasts. Small latency drift (<2s) must be tolerated without seeking.

### 2. Canvas JPEG Relay for Long-Distance & Mobile Fallback
- **Invariant**: The Canvas JPEG frame relay (`screen_relay_frame`) in `WebRTCContext.jsx` and `server.js` must always remain active.
- **Reason**: WebRTC P2P direct connections often fail over long distances, NAT firewalls, and Cloudflare tunnels. Canvas JPEG frames stream reliably across all network topologies.
- **Mobile Rule**: Mobile WebViews use the Canvas JPEG relay directly (`canPlayWebmRelay()` returns `false` on mobile).

### 3. Build & Path Resolution Rules
- **Vite Config Invariant**: Always keep `base: './'` in `client/vite.config.js`.
- **Reason**: Desktop Electron apps load `dist/index.html` via `file://`. Absolute paths (`/assets/...`) cause blank screens; relative paths (`./assets/...`) work seamlessly across Web, Electron, and Android Capacitor.

### 4. Android Screen Share Policy
- `navigator.mediaDevices.getDisplayMedia` is restricted on mobile OSes (Android/iOS).
- Mobile users host using **Local Video** (streams files from device storage via `<video>.captureStream()`) or **YouTube / URL** synchronization.

---

## 🎨 Branding & Assets
- **Vector Logo**: `client/public/logo.svg` & `client/src/assets/logo.svg`
- **Windows Executable Icons**: `favicon.ico`, `client/electron/icon.ico`, `client/electron/icon.png`
- **Android Launcher Icons**: `client/android/app/src/main/res/mipmap-*/` (hdpi, mdpi, xhdpi, xxhdpi, xxxhdpi adaptive icons)
- **Generator Script**: `scripts/generate_all_icons.cjs` (uses `@resvg/resvg-js`)

---

## 🛠️ Build Commands Quick Reference
- **Web Client**: `cd client && npm run build`
- **Windows Standalone App**: `cd client && npx electron-builder --win portable --win dir`
- **Android APK**: `cd client && $env:JAVA_HOME = "C:\Program Files\Android\Android Studio1\jbr"; npx cap sync android; cd android; .\gradlew.bat assembleDebug`
- **Launcher Recompile**: `csc.exe /target:winexe /win32icon:favicon.ico /out:WatchTogether.exe scripts\Launcher.cs`
- **Integration Tests**: `node tests/integration.test.mjs`

---

## 🎯 Current Roadmap & Upcoming Work
- **UI / UX Overhaul**: Modernizing lobby screens, cinematic floating player controls, refined responsive drawer layouts for mobile, glassmorphic menus, and sound feedback.
