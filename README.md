# 🎬 Watch Together - Private Cinema & Web Sync

A private, real-time **Watch Together** application built for you and your friends to watch movies, anime, streams, and browse the web together in perfect sync with zero delay.

---

## ✨ Features

- ⚡ **Zero-Delay Playback Lockstep**: Synchronized Play, Pause, and Seek timestamps with automatic round-trip ping compensation.
- 🛑 **Smart Buffering Sync (Auto-Pause)**: If one person's internet lags or buffers, playback automatically pauses for everyone until all participants are ready—preventing spoilers and out-of-sync audio.
- 🌐 **Multiple Video Sources**:
  - **Direct Stream / HLS (`.m3u8`)**: Works with modern anime streaming sites and online video links.
  - **YouTube Sync**: Synced YouTube player integration.
  - **Local Video Files**: Both people pick their own local file (e.g. 4K / 1080p Blu-ray `.mp4` or `.mkv`) on their device. Zero upload bandwidth needed!
  - **Discord-style Screen & Tab Share (WebRTC)**: Host can stream any browser tab or desktop window with audio directly with near-zero latency.
- 🔴 **Synchronized Laser Pointer**: Move your mouse over the video to point at things; your friends see a glowing laser pointer in real-time.
- 💬 **Live Chat & Floating Reactions**: Chat sidebar with instant animated floating emoji reactions (❤️, 😂, 🔥, 🍿, 😱).
- 🎙️ **P2P Voice Chat**: Built-in voice chat using WebRTC so you don't even need Discord open.
- 🔒 **Host-Only or Collaborative Control**: Host can lock controls to prevent accidental skips, or share controls with everyone.
- 🌍 **Built-in Internet Tunneling**: Host the server on your PC and click **"Get Public Link"** to connect long-distance friends without router port forwarding.

---

## 🚀 Quick Start (Running on your PC)

### Method 1: 1-Click Launch (Easiest)
Simply double-click:
- **`start-all.bat`** *(Starts the server and opens the app!)*

### Method 2: Command Line
1. **Start the Backend Server**:
   ```bash
   cd server
   node server.js
   ```
   *The server is now live on `http://localhost:3001`!*

2. **Access the App**:
   - Open **`http://localhost:3001`** in any browser (served directly by the server).
   - Or run the frontend dev server:
     ```bash
     cd client
     npm run dev
     ```
     *(Opens on `http://localhost:3000`)*

---

## 📱 How to Connect Your Friend (2 Options)

### Option 1: Long-Distance Friend (Over the Internet)
1. Launch the app and click the **⚙️ Settings** icon on the lobby.
2. Under **"Long-Distance Friend Tunnel"**, click **"Get Public Link"**.
3. Copy the secure HTTPS link (e.g. `https://your-tunnel.loca.lt`) and send it to your friend!
4. Your friend opens the link on their phone or PC, enters your Room Code, and joins instantly.

### Option 2: Phone on the Same Home Wi-Fi
1. Open the lobby on your PC and click **⚙️ Settings**.
2. Look at **"Phone on same Wi-Fi link"** (e.g. `http://192.168.1.50:3001`).
3. Open that link in the Chrome/Safari browser on your phone!

---

## 📦 Building Standalone Desktop (`.exe`) & Android (`.apk`)

### 🖥️ Windows `.exe`
```bash
cd client
npm run build
npx electron-builder --win
```

### 📱 Android `.apk`
```bash
cd client
npm run build
npx cap add android
npx cap open android
```
*(Builds the debug `.apk` inside Android Studio or via Gradle).*

---

## 🛠️ Project Structure

```
d:/Watch together app/
├── server/
│   ├── server.js              # Express + Socket.io + Tunnel Server + Lockstep sync
│   └── package.json           # Server dependencies (ws, express, localtunnel, cors)
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Lobby.jsx      # Host & Join room lobby, network detection, tunnel launcher
│   │   │   ├── Room.jsx       # Main room layout
│   │   │   ├── Header.jsx     # Room code, WebRTC mic, screen share, invite
│   │   │   ├── VideoPlayer.jsx# HTML5, HLS m3u8, YouTube, local file player
│   │   │   ├── BrowserTabShare.jsx # Media URL input, quick samples, tab share
│   │   │   ├── LaserPointer.jsx   # Synced mouse cursor / laser pointer
│   │   │   ├── ChatPanel.jsx  # Real-time chat & animated emoji reactions
│   │   │   ├── LocalFilePicker.jsx # Zero-bandwidth local video file picker
│   │   │   └── SettingsModal.jsx  # Host lock & microphone preferences
│   │   ├── context/
│   │   │   ├── SocketContext.jsx  # Real-time socket state, actions & lockstep logic
│   │   │   └── WebRTCContext.jsx  # P2P voice call & screen share mesh
│   │   ├── App.jsx
│   │   └── index.css          # Tailwind CSS + Glassmorphism movie-night theme
│   ├── electron/
│   │   └── main.js            # Desktop Windows wrapper
│   ├── vite.config.js
│   └── package.json
├── start-all.bat              # 1-click batch launcher for Windows
├── start-server.bat           # Server batch launcher
├── start-client.bat           # Client batch launcher
└── README.md
```
