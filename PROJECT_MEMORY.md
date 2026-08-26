# Watch Together - Project Memory & Architecture Context

## 1. Project Overview & Cloud Infrastructure
- **Cloud Backend (24/7)**: `https://watch-together-8wj2.onrender.com`
- **GitHub Repository**: `https://github.com/helloman3/watch-together`
- **Active Release**: `v1.2.0-stable`
- **Supported Platforms**:
  - Web: React + Vite + TailwindCSS
  - Mobile: Android APK via Capacitor 7 (`WatchTogether.apk`)
  - Desktop: Windows Standalone Portable App via Electron (`WatchTogether-Desktop.exe` / `WatchTogether-Windows-x64.zip`)

---

## 2. Critical Architecture Decisions & Solved Bug Fixes

### A. YouTube Player Lockstep & Loop Prevention
- **Issue**: YouTube player was auto-resetting or skipping to start/end in 3-4s intervals on guest devices.
- **Fix**: Removed guest drift timer interval (`setInterval(..., 3500)`) in `VideoPlayer.jsx`. Guests only sync on explicit host `seekTo` and `changeMedia` events.
- **Rule**: Never re-introduce periodic guest `seekTo` intervals for YouTube if difference is small (<2s).

### B. Long-Distance & Firewall Screen / Video Streaming
- **Issue**: Direct WebRTC P2P failed through NAT firewalls and Cloudflare tunnels.
- **Fix**: Universal hardware-accelerated Canvas JPEG Frame Relay pump in `WebRTCContext.jsx` and `server.js`.
- **Behavior**: Fallback relay engages automatically when P2P is slow or blocked, sending JPEG frames over Socket.IO.

### C. Android Mobile Hosting vs Screen Share
- **Constraint**: `navigator.mediaDevices.getDisplayMedia` is restricted on mobile OSes (Android/iOS) for security.
- **Solution**: Mobile users host using "Local Video" (device storage streaming via `<video>.captureStream()`) or "YouTube / URL" sync.
- **Desktop**: Full Screen and Tab sharing is supported on Windows/Mac/Linux.

### D. Electron & Capacitor Asset Path Resolution
- **Rule**: `base: './'` is mandatory in `client/vite.config.js` so built assets use relative paths (`./assets/...`), allowing seamless loading under both `file://` (Electron desktop) and `http://` (Web/Capacitor).

---

## 3. Brand Identity & Vector Assets
- **Main Vector Logo**: `client/public/logo.svg` & `client/src/assets/logo.svg`
- **Windows Executable Icons**: `favicon.ico`, `client/electron/icon.ico`, `client/electron/icon.png`
- **Android Mipmaps**: `client/android/app/src/main/res/mipmap-*/` (Adaptive & Round launcher icons)
- **Generator Script**: `scripts/generate_all_icons.cjs` (uses `@resvg/resvg-js` for crisp multi-resolution rendering)

---

## 4. Upcoming Roadmap & Next Goals
- **UI Rework**: Complete design overhaul of player controls, lobby layouts, glassmorphic themes, responsive mobile drawer views, and unified dark cinematic aesthetic.
