const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
let localtunnel = null;
try {
  localtunnel = require('localtunnel');
} catch (e) {
  // optional
}

const app = express();
app.use(cors());
app.use(express.json());

// Set headers for smooth tunnel & cache handling
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Serve static client files if built
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

const PORT = process.env.PORT || 3001;

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 of interfaces[k]) {
      if (k2.family === 'IPv4' && !k2.internal) {
        addresses.push(k2.address);
      }
    }
  }
  return addresses;
}

// Summarize which relay encodings are currently requested by viewers in a room
function relayModesSummary(room) {
  let hasWebm = false;
  let hasJpeg = false;
  for (const [, v] of room.relayViewers) {
    const mode = v && typeof v === 'object' ? v.mode : 'jpeg';
    if (mode === 'webm') hasWebm = true;
    else hasJpeg = true;
  }
  return { hasWebm, hasJpeg };
}

// In-memory Room State
const rooms = new Map();

// Rate limiters per socket ID
const socketReactions = new Map();
const socketChats = new Map();

// Tunnel state
let activeTunnel = null;
let tunnelUrl = null;
let tunnelPassword = null;

async function getPublicTunnelIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.ip || null;
  } catch (e) {
    return null;
  }
}

// REST Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: rooms.size,
    localIps: getLocalIpAddresses(),
    port: PORT,
    tunnelUrl: tunnelUrl,
    tunnelPassword: tunnelPassword
  });
});

app.get('/api/network-info', (req, res) => {
  const ips = getLocalIpAddresses();
  res.json({
    port: PORT,
    localIps: ips,
    localUrls: ips.map(ip => `http://${ip}:${PORT}`),
    tunnelUrl: tunnelUrl,
    tunnelPassword: tunnelPassword
  });
});

const { spawn, execFile } = require('child_process');
const fs = require('fs');

let cloudflareProcess = null;

function startCloudflareTunnel(port) {
  return new Promise((resolve, reject) => {
    const cfPath = path.join(__dirname, 'cloudflared.exe');
    if (!fs.existsSync(cfPath)) {
      return reject(new Error('cloudflared binary not found'));
    }

    const proc = spawn(cfPath, ['tunnel', '--url', `http://localhost:${port}`], {
      windowsHide: true
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc.kill(); } catch (e) {}
        reject(new Error('Cloudflare tunnel timeout'));
      }
    }, 15000);

    const onData = (data) => {
      const text = data.toString();
      const match = text.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/i);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        cloudflareProcess = proc;
        proc.on('close', () => {
          if (cloudflareProcess === proc) {
            cloudflareProcess = null;
            tunnelUrl = null;
          }
        });
        resolve(match[1]);
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

app.post('/api/tunnel/start', async (req, res) => {
  const shouldRefresh = req.body && req.body.refresh;
  if (tunnelUrl && !shouldRefresh) {
    if (!tunnelPassword) tunnelPassword = await getPublicTunnelIp();
    return res.json({ success: true, url: tunnelUrl, password: tunnelPassword });
  }

  if (cloudflareProcess) {
    try { cloudflareProcess.kill(); } catch (e) {}
    cloudflareProcess = null;
  }
  if (activeTunnel) {
    try { activeTunnel.close(); } catch (e) {}
    activeTunnel = null;
  }
  tunnelUrl = null;

  // 1. Try high-performance Cloudflare Quick Tunnel first
  try {
    const cfUrl = await startCloudflareTunnel(Number(PORT));
    tunnelUrl = cfUrl;
    tunnelPassword = null;
    console.log(`🌐 Cloudflare Quick Tunnel Online: ${tunnelUrl}`);
    return res.json({ success: true, url: tunnelUrl, provider: 'cloudflare' });
  } catch (cfErr) {
    console.warn('Cloudflare tunnel fallback to localtunnel:', cfErr.message);
  }

  // 2. Fallback to Localtunnel
  try {
    if (!localtunnel) localtunnel = require('localtunnel');
    const port = Number(PORT);
    const randomSub = 'wt-' + Math.random().toString(36).substring(2, 8) + Math.floor(Math.random() * 100);
    activeTunnel = await localtunnel({ port: port, subdomain: randomSub });
    tunnelUrl = activeTunnel.url;
    tunnelPassword = await getPublicTunnelIp();

    activeTunnel.on('close', () => {
      tunnelUrl = null;
      tunnelPassword = null;
      activeTunnel = null;
      console.log('Public tunnel closed');
    });

    console.log(`🌐 Public Tunnel Online: ${tunnelUrl} (Password: ${tunnelPassword})`);
    res.json({ success: true, url: tunnelUrl, password: tunnelPassword, provider: 'localtunnel' });
  } catch (err) {
    console.error('Failed to create tunnel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tunnel/stop', (req, res) => {
  if (cloudflareProcess) {
    try { cloudflareProcess.kill(); } catch (e) {}
    cloudflareProcess = null;
  }
  if (activeTunnel) {
    activeTunnel.close();
    activeTunnel = null;
  }
  tunnelUrl = null;
  res.json({ success: true });
});

async function resolveMediaStream(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return null;

  // 1. Direct stream / video extensions
  if (url.match(/\.(mp4|m3u8|webm|ogg|mov|mkv)(\?.*)?$/i)) {
    const filename = url.split('/').pop().split('?')[0] || 'Direct Stream';
    return {
      type: 'video_url',
      url: url,
      title: decodeURIComponent(filename)
    };
  }

  // 2. YouTube
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) {
    return {
      type: 'youtube',
      url: url,
      title: 'YouTube Video'
    };
  }

  // 3. Extract with yt-dlp
  try {
    const streamData = await new Promise((resolve, reject) => {
      execFile('python', ['-m', 'yt_dlp', '--dump-json', '--no-playlist', '--format', 'best[ext=mp4]/best', url], { timeout: 10000 }, (err, stdout) => {
        if (err) return reject(err);
        try {
          const info = JSON.parse(stdout);
          resolve(info);
        } catch (e) {
          reject(e);
        }
      });
    });

    if (streamData && streamData.url) {
      return {
        type: 'video_url',
        url: streamData.url,
        title: streamData.title || streamData.fulltitle || 'Extracted Stream'
      };
    }
  } catch (err) {
    // Non-fatal, fallback to HTML parsing
  }

  // 4. HTML scraping for embedded .m3u8 / .mp4 / <video> tags
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000)
    });
    const html = await response.text();

    const m3u8Match = html.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
    if (m3u8Match) {
      return {
        type: 'video_url',
        url: m3u8Match[1],
        title: 'Extracted HLS Stream'
      };
    }

    const mp4Match = html.match(/(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i);
    if (mp4Match) {
      return {
        type: 'video_url',
        url: mp4Match[1],
        title: 'Extracted MP4 Video'
      };
    }

    const videoTagMatch = html.match(/<(?:video|source)[^>]+src=["']([^"']+)["']/i);
    if (videoTagMatch) {
      let resolvedSrc = videoTagMatch[1];
      if (resolvedSrc.startsWith('//')) resolvedSrc = 'https:' + resolvedSrc;
      else if (resolvedSrc.startsWith('/')) {
        const u = new URL(url);
        resolvedSrc = u.origin + resolvedSrc;
      }
      return {
        type: 'video_url',
        url: resolvedSrc,
        title: 'Extracted Video Stream'
      };
    }
  } catch (err) {
    // Fallback failed
  }

  return null;
}

app.post('/api/resolve-media', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

  try {
    const result = await resolveMediaStream(url);
    if (result) {
      return res.json({ success: true, ...result });
    }
    return res.json({
      success: false,
      requiresTabShare: true,
      message: 'This streaming page uses encrypted or protected video embeds. Click Live Tab Share to stream it in sync directly from your browser tab!'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// All other routes serve React frontend
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) {
      res.status(200).send(`
        <html>
          <head><title>Watch Together Server</title></head>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
            <h1>🎬 Watch Together Server is Running!</h1>
            <p>Port: <strong>${PORT}</strong></p>
          </body>
        </html>
      `);
    }
  });
});

// WebSocket Handler
io.on('connection', (socket) => {
  let currentRoomId = null;
  let userName = 'Anonymous';

  // Latency & Ping calculation
  socket.on('ping_check', (data) => {
    socket.emit('pong_check', {
      clientTime: data?.clientTime || 0,
      serverTime: Date.now()
    });
  });

  // Helper for leaving room cleanly
  const handleUserLeave = (roomId, isExplicit = false) => {
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    room.users.delete(socket.id);
    room.bufferStates.delete(socket.id);

    // Relay fallback: remove this user as a relay viewer and inform the sharer
    if (room.relayViewers) {
      const wasRelayViewer = room.relayViewers.delete(socket.id);
      if (wasRelayViewer && room.screenSharerId && room.screenSharerId !== socket.id) {
        io.to(room.screenSharerId).emit('screen_relay_viewers', {
          count: room.relayViewers.size,
          ...relayModesSummary(room)
        });
      }
    }

    if (room.screenSharerId === socket.id) {
      room.screenSharerId = null;
      io.to(roomId).emit('screen_share_status', { isSharing: false, sharerId: null });
      if (room.media.type === 'screen_share') {
        room.media = {
          type: 'none',
          url: '',
          title: '',
          currentTime: 0,
          isPlaying: false,
          playbackRate: 1.0,
          lastUpdated: Date.now()
        };
        io.to(roomId).emit('media_changed', { media: room.media, changedBy: 'System' });
      }
    }

    if (room.hostId === socket.id && room.media.type === 'local_file') {
      room.media = {
        type: 'none',
        url: '',
        title: '',
        currentTime: 0,
        isPlaying: false,
        playbackRate: 1.0,
        lastUpdated: Date.now()
      };
      io.to(roomId).emit('media_changed', { media: room.media, changedBy: 'System' });
    }

    if (room.users.size === 0) {
      const roomInstanceId = room.instanceId;
      room.cleanupTimeout = setTimeout(() => {
        const currentR = rooms.get(roomId);
        if (currentR && currentR.instanceId === roomInstanceId && currentR.users.size === 0) {
          console.log(`[Room Cleaned] Room ${roomId} empty after grace period, removed`);
          rooms.delete(roomId);
        }
      }, 25000);
    } else {
      // Reassign host ONLY if the leaving user was the host
      if (room.hostId === socket.id) {
        const nextHostId = room.users.keys().next().value;
        room.hostId = nextHostId;
        const nextHost = room.users.get(nextHostId);
        if (nextHost) nextHost.isHost = true;
        console.log(`[New Host] Room ${roomId}: ${nextHost?.name} is now host`);
      }

      // Synchronize exact single host flag across all users
      for (const [, u] of room.users) {
        u.isHost = (u.id === room.hostId);
      }

      io.to(roomId).emit('user_left', {
        userId: socket.id,
        userName: userName,
        newHostId: room.hostId,
        users: getSanitizedUsers(room)
      });
    }

    socket.leave(roomId);
    if (isExplicit) {
      currentRoomId = null;
    }
  };

  // Create Room (Strict 1-Host enforcement & Duplicate Prevention)
  socket.on('create_room', ({ name, roomCode, hostOnlyControl = false }, callback) => {
    let roomId;
    if (roomCode && typeof roomCode === 'string' && roomCode.trim()) {
      roomId = roomCode.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().substring(0, 10);
    } else {
      // Auto-generate a unique 6-character room code
      do {
        roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      } while (rooms.has(roomId) && rooms.get(roomId).users.size > 0);
    }

    if (!roomId) roomId = 'ROOM1';
    userName = (name || 'Host').trim().substring(0, 25);

    let room = rooms.get(roomId);

    if (room) {
      // If room has active users and the caller is not already the single host connected on this socket
      if (room.users.size > 0 && room.hostId !== socket.id) {
        if (typeof callback === 'function') {
          callback({ success: false, error: `Room code "${roomId}" is already active with another host. Please choose a different code or join it.` });
        }
        return;
      }

      // If room has 0 users (in grace period) or same socket host re-creating, reclaim/reset room cleanly
      if (room.cleanupTimeout) {
        clearTimeout(room.cleanupTimeout);
        room.cleanupTimeout = null;
      }

      room.instanceId = Math.random().toString(36).substring(2, 9);
      room.hostId = socket.id;
      room.hostOnlyControl = !!hostOnlyControl;
      room.createdAt = Date.now();
      room.media = {
        type: 'none',
        url: '',
        title: '',
        currentTime: 0,
        isPlaying: false,
        playbackRate: 1.0,
        lastUpdated: Date.now()
      };
      room.users.clear();
      room.bufferStates.clear();
      room.relayViewers.clear();
      room.screenSharerId = null;

      room.users.set(socket.id, {
        id: socket.id,
        name: userName,
        isHost: true,
        isBuffering: false,
        joinedAt: Date.now()
      });
      room.bufferStates.set(socket.id, false);
      currentRoomId = roomId;
      socket.join(roomId);

      console.log(`[Room Reset/Reclaimed] ${roomId} by ${userName} (${socket.id})`);

      const roomData = getSanitizedRoom(room);
      if (typeof callback === 'function') callback({ success: true, room: roomData, isHost: true });
      socket.emit('room_joined', { room: roomData, isHost: true });
      return;
    }

    room = {
      id: roomId,
      instanceId: Math.random().toString(36).substring(2, 9),
      hostId: socket.id,
      hostOnlyControl: !!hostOnlyControl,
      createdAt: Date.now(),
      cleanupTimeout: null,
      media: {
        type: 'none',
        url: '',
        title: '',
        currentTime: 0,
        isPlaying: false,
        playbackRate: 1.0,
        lastUpdated: Date.now()
      },
      users: new Map(),
      bufferStates: new Map(),
      relayViewers: new Map(),
      screenSharerId: null
    };

    room.users.set(socket.id, {
      id: socket.id,
      name: userName,
      isHost: true,
      isBuffering: false,
      joinedAt: Date.now()
    });
    room.bufferStates.set(socket.id, false);

    rooms.set(roomId, room);
    currentRoomId = roomId;
    socket.join(roomId);

    console.log(`[Room Created] ${roomId} by ${userName} (${socket.id})`);

    const roomData = getSanitizedRoom(room);
    if (typeof callback === 'function') {
      callback({ success: true, room: roomData, isHost: true });
    }
    socket.emit('room_joined', { room: roomData, isHost: true });
  });

  // Join Room (Strict 1-Host enforcement)
  socket.on('join_room', ({ roomId, name }, callback) => {
    const code = (roomId || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found. Check the code!' });
      return;
    }

    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
      room.cleanupTimeout = null;
    }

    userName = (name || `Guest-${Math.floor(Math.random() * 1000)}`).trim().substring(0, 25);
    currentRoomId = code;
    socket.join(code);

    // Only host if room has 0 users or already hostId
    const isHost = room.users.size === 0 || room.hostId === socket.id;
    if (isHost) room.hostId = socket.id;

    room.users.set(socket.id, {
      id: socket.id,
      name: userName,
      isHost: isHost,
      isBuffering: false,
      joinedAt: Date.now()
    });
    room.bufferStates.set(socket.id, false);

    // Re-verify single host flag across all users
    for (const [, u] of room.users) {
      u.isHost = (u.id === room.hostId);
    }

    console.log(`[User Joined] ${userName} (${socket.id}) joined room ${code}`);

    if (room.media.isPlaying) {
      const elapsed = (Date.now() - room.media.lastUpdated) / 1000;
      room.media.currentTime += elapsed * room.media.playbackRate;
      room.media.lastUpdated = Date.now();
    }

    const roomData = getSanitizedRoom(room);
    if (typeof callback === 'function') {
      callback({ success: true, room: roomData, isHost: isHost });
    }

    socket.emit('room_joined', { room: roomData, isHost: isHost });

    socket.to(code).emit('user_joined', {
      user: { id: socket.id, name: userName, isHost: isHost },
      users: getSanitizedUsers(room)
    });

    const otherUserIds = Array.from(room.users.keys()).filter(id => id !== socket.id);
    socket.emit('webrtc_peers_list', { peers: otherUserIds });
  });

  // Explicit Leave Room
  socket.on('leave_room', (callback) => {
    if (currentRoomId) {
      handleUserLeave(currentRoomId, true);
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  // Media Source Change
  socket.on('change_media', ({ type, url, title }, callback) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (room.hostOnlyControl && room.hostId !== socket.id) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only the host can change media' });
      return;
    }

    room.media = {
      type: type || 'video_url',
      url: url || '',
      title: title || '',
      currentTime: 0,
      isPlaying: true,
      playbackRate: 1.0,
      lastUpdated: Date.now()
    };

    // Clear all buffering locks when media switches!
    for (const [uid] of room.bufferStates) {
      room.bufferStates.set(uid, false);
    }
    for (const [, u] of room.users) {
      u.isBuffering = false;
    }

    console.log(`[Media Change] Room ${currentRoomId}: ${type} -> ${url}`);
    io.to(currentRoomId).emit('media_changed', {
      media: room.media,
      changedBy: userName
    });

    // Clear any stuck buffering overlay across all clients
    io.to(currentRoomId).emit('buffer_sync_ready', {
      resumeInMs: 0,
      targetTime: 0
    });

    if (typeof callback === 'function') callback({ success: true });
  });

  // Play Event
  socket.on('media_play', ({ currentTime }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.hostOnlyControl && room.hostId !== socket.id) return;

    room.media.isPlaying = true;
    if (typeof currentTime === 'number' && !isNaN(currentTime) && currentTime >= 0) {
      room.media.currentTime = currentTime;
    }
    room.media.lastUpdated = Date.now();

    io.to(currentRoomId).emit('media_play', {
      currentTime: room.media.currentTime,
      timestamp: room.media.lastUpdated,
      senderId: socket.id,
      senderName: userName
    });
  });

  // Pause Event
  socket.on('media_pause', ({ currentTime }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.hostOnlyControl && room.hostId !== socket.id) return;

    if (room.media.isPlaying) {
      const elapsed = (Date.now() - room.media.lastUpdated) / 1000;
      room.media.currentTime += elapsed * room.media.playbackRate;
    }
    room.media.isPlaying = false;

    if (typeof currentTime === 'number' && !isNaN(currentTime) && currentTime >= 0) {
      room.media.currentTime = currentTime;
    }
    room.media.lastUpdated = Date.now();

    io.to(currentRoomId).emit('media_pause', {
      currentTime: room.media.currentTime,
      timestamp: room.media.lastUpdated,
      senderId: socket.id,
      senderName: userName
    });
  });

  // Seek Event
  socket.on('media_seek', ({ currentTime, autoPlay }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.hostOnlyControl && room.hostId !== socket.id) return;

    if (typeof currentTime === 'number' && !isNaN(currentTime) && currentTime >= 0) {
      room.media.currentTime = Math.max(0, currentTime);
    }
    if (typeof autoPlay === 'boolean') {
      room.media.isPlaying = autoPlay;
    }
    room.media.lastUpdated = Date.now();

    io.to(currentRoomId).emit('media_seek', {
      currentTime: room.media.currentTime,
      isPlaying: room.media.isPlaying,
      timestamp: room.media.lastUpdated,
      senderId: socket.id,
      senderName: userName
    });
  });

  // Playback Rate Change
  socket.on('media_rate', ({ playbackRate }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.hostOnlyControl && room.hostId !== socket.id) return;

    const rate = typeof playbackRate === 'number' && !isNaN(playbackRate) && playbackRate > 0 && playbackRate <= 4 ? playbackRate : 1.0;
    room.media.playbackRate = rate;
    room.media.lastUpdated = Date.now();

    io.to(currentRoomId).emit('media_rate', {
      playbackRate: room.media.playbackRate,
      senderName: userName
    });
  });

  // Buffering Lockstep Algorithm (Ignores YouTube, ScreenShare and remote local files)
  socket.on('buffer_state', ({ isBuffering, currentTime }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // Always update the user's buffer state in map
    room.bufferStates.set(socket.id, !!isBuffering);
    const userObj = room.users.get(socket.id);
    if (userObj) {
      userObj.isBuffering = !!isBuffering;
    }

    // YouTube and ScreenShare manage their own adaptive buffering; ignore blocking pause
    if (room.media.type === 'youtube' || room.media.type === 'screen_share') {
      room.bufferStates.set(socket.id, false);
      if (userObj) userObj.isBuffering = false;
      return;
    }

    // For local files without P2P / direct stream, non-hosts who are buffering don't block host
    if (room.media.type === 'local_file' && socket.id !== room.hostId && isBuffering) {
      room.bufferStates.set(socket.id, false);
      if (userObj) userObj.isBuffering = false;
    }

    let anyBuffering = false;
    let bufferingUserNames = [];

    for (const [uid, buf] of room.bufferStates) {
      if (buf && room.users.has(uid)) {
        anyBuffering = true;
        const u = room.users.get(uid);
        if (u) bufferingUserNames.push(u.name);
      }
    }

    if (anyBuffering) {
      if (room.bufferTimeout) clearTimeout(room.bufferTimeout);
      io.to(currentRoomId).emit('buffer_sync_pause', {
        bufferingUsers: bufferingUserNames,
        reason: `${bufferingUserNames.join(', ')} is buffering...`
      });

      // Failsafe auto-resume after 4 seconds so playback is never frozen permanently
      const bufferedRoomId = currentRoomId;
      room.bufferTimeout = setTimeout(() => {
        const curRoom = rooms.get(bufferedRoomId);
        if (!curRoom) return;
        for (const [uid] of curRoom.bufferStates) {
          curRoom.bufferStates.set(uid, false);
        }
        for (const [, u] of curRoom.users) {
          u.isBuffering = false;
        }
        curRoom.bufferTimeout = null;
        io.to(bufferedRoomId).emit('buffer_sync_ready', {
          resumeInMs: 200,
          targetTime: curRoom.media.currentTime
        });
      }, 4000);
    } else {
      if (room.bufferTimeout) {
        clearTimeout(room.bufferTimeout);
        room.bufferTimeout = null;
      }
      io.to(currentRoomId).emit('buffer_sync_ready', {
        resumeInMs: 300,
        targetTime: typeof currentTime === 'number' && !isNaN(currentTime) ? currentTime : room.media.currentTime
      });
    }
  });

  // Synchronized Laser Pointer
  socket.on('cursor_move', ({ x, y, isPointerDown }) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('cursor_update', {
      userId: socket.id,
      userName: userName,
      x: typeof x === 'number' ? x : 0,
      y: typeof y === 'number' ? y : 0,
      isPointerDown: !!isPointerDown
    });
  });

  // Room Settings
  socket.on('update_room_settings', ({ hostOnlyControl }) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.hostId !== socket.id) return;

    room.hostOnlyControl = !!hostOnlyControl;
    io.to(currentRoomId).emit('room_settings_updated', {
      hostOnlyControl: room.hostOnlyControl
    });
  });

  // Chat Message
  socket.on('chat_message', ({ text }) => {
    if (!currentRoomId || !text || typeof text !== 'string') return;
    const sanitizedText = text.trim().substring(0, 500);
    if (!sanitizedText) return;

    const now = Date.now();
    let chatLimiter = socketChats.get(socket.id);
    if (!chatLimiter) {
      chatLimiter = { count: 0, lastReset: now, cooldownUntil: 0 };
      socketChats.set(socket.id, chatLimiter);
    }

    if (now < chatLimiter.cooldownUntil) return;

    if (now - chatLimiter.lastReset > 10000) {
      chatLimiter.count = 0;
      chatLimiter.lastReset = now;
    }

    chatLimiter.count += 1;
    if (chatLimiter.count > 15) {
      chatLimiter.cooldownUntil = now + 8000;
      return;
    }

    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      userId: socket.id,
      userName: userName,
      text: sanitizedText,
      timestamp: Date.now()
    };
    io.to(currentRoomId).emit('chat_message', msg);
  });

  // Floating Emoji Reaction
  socket.on('reaction', ({ emoji }) => {
    if (!currentRoomId || !emoji || typeof emoji !== 'string') return;

    const allowedEmojis = ['❤️', '😂', '🔥', '🍿', '😱', '👏', '🎉', '👀'];
    if (!allowedEmojis.includes(emoji)) return;

    const now = Date.now();
    let limiter = socketReactions.get(socket.id);
    if (!limiter) {
      limiter = { count: 0, lastReset: now, cooldownUntil: 0 };
      socketReactions.set(socket.id, limiter);
    }

    if (now < limiter.cooldownUntil) return;

    if (now - limiter.lastReset > 5000) {
      limiter.count = 0;
      limiter.lastReset = now;
    }

    limiter.count += 1;
    if (limiter.count >= 5) {
      limiter.cooldownUntil = now + 10000;
      limiter.count = 0;
    }

    io.to(currentRoomId).emit('reaction', {
      id: Math.random().toString(36).substring(2, 9),
      emoji: emoji,
      userName: userName,
      timestamp: Date.now()
    });
  });

  // WebRTC Signaling
  socket.on('webrtc_signal', ({ targetId, signal, signalType }) => {
    if (!currentRoomId || !targetId) return;
    io.to(targetId).emit('webrtc_signal', {
      senderId: socket.id,
      signal: signal,
      signalType: signalType
    });
  });

  // ===== Screen Relay Fallback =====
  // If WebRTC P2P cannot traverse NATs (long distance / tunnel), the sharer
  // streams JPEG frames over this WebSocket path instead. This uses exactly
  // the same connection as chat/signaling, so it works through any tunnel.
  socket.on('screen_relay_frame', (payload, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room || !payload || !payload.jpeg) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    // Only the active sharer may broadcast relay frames
    if (room.screenSharerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    socket.to(currentRoomId).emit('screen_relay_frame', payload);
    if (typeof ack === 'function') ack({ ok: true });
  });

  // WebM segments from the sharer's MediaRecorder (VP9/VP8 + Opus, ~1s each)
  socket.on('screen_relay_webm', (payload, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room || !payload || !payload.data) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    if (room.screenSharerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    socket.to(currentRoomId).emit('screen_relay_webm', payload);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('screen_relay_subscribe', (data, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    if (!room.relayViewers) room.relayViewers = new Map();
    const mode = data && data.mode === 'webm' ? 'webm' : 'jpeg';
    room.relayViewers.set(socket.id, { mode, at: Date.now() });
    if (room.screenSharerId && room.screenSharerId !== socket.id) {
      io.to(room.screenSharerId).emit('screen_relay_viewers', {
        count: room.relayViewers.size,
        ...relayModesSummary(room)
      });
    }
    if (typeof ack === 'function') ack({ ok: true, count: room.relayViewers.size });
  });

  socket.on('screen_relay_unsubscribe', () => {
    const room = rooms.get(currentRoomId);
    if (!room || !room.relayViewers) return;
    room.relayViewers.delete(socket.id);
    if (room.screenSharerId && room.screenSharerId !== socket.id) {
      io.to(room.screenSharerId).emit('screen_relay_viewers', {
        count: room.relayViewers.size,
        ...relayModesSummary(room)
      });
    }
  });

  // Viewer's feed stalled -> ask the sharer to recycle its encoder session
  socket.on('screen_relay_nudge', () => {
    const room = rooms.get(currentRoomId);
    if (!room || !room.screenSharerId || room.screenSharerId === socket.id) return;
    io.to(room.screenSharerId).emit('screen_relay_nudge');
  });

  socket.on('screen_share_status', ({ isSharing }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;

    if (room.screenSharerId && room.screenSharerId !== socket.id && isSharing) return;

    const wasSharerMissing = !room.screenSharerId;
    room.screenSharerId = isSharing ? socket.id : null;

    // If we just became the sharer while relay viewers were already waiting
    // (they subscribed during the gap), introduce ourselves so pumping starts.
    if (
      isSharing &&
      wasSharerMissing &&
      room.relayViewers &&
      room.relayViewers.size > 0
    ) {
      io.to(room.screenSharerId).emit('screen_relay_viewers', {
        count: room.relayViewers.size,
        ...relayModesSummary(room)
      });
    }

    io.to(currentRoomId).emit('screen_share_status', {
      isSharing: !!isSharing,
      sharerId: isSharing ? socket.id : null,
      sharerName: userName
    });

    if (!isSharing && room.media.type === 'screen_share') {
      room.media = {
        type: 'none',
        url: '',
        title: '',
        currentTime: 0,
        isPlaying: false,
        playbackRate: 1.0,
        lastUpdated: Date.now()
      };
      io.to(currentRoomId).emit('media_changed', { media: room.media, changedBy: userName });
    }
  });

  socket.on('request_stream_renegotiation', () => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const targetSharerId = room.screenSharerId || room.hostId;
    if (targetSharerId && targetSharerId !== socket.id) {
      io.to(targetSharerId).emit('renegotiate_stream_with_peer', { requesterId: socket.id });
    }
  });

  // Disconnect & cleanup
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ${userName} (${socket.id})`);
    socketReactions.delete(socket.id);
    socketChats.delete(socket.id);

    if (currentRoomId) {
      handleUserLeave(currentRoomId, false);
    }
  });
});

function getSanitizedUsers(room) {
  return Array.from(room.users.values()).map(u => ({
    id: u.id,
    name: u.name,
    isHost: (u.id === room.hostId),
    isBuffering: !!u.isBuffering,
    joinedAt: u.joinedAt
  }));
}

function getSanitizedRoom(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    hostOnlyControl: room.hostOnlyControl,
    createdAt: room.createdAt,
    media: room.media,
    users: getSanitizedUsers(room),
    screenSharerId: room.screenSharerId
  };
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('\n==================================================');
  console.log(`🎬 WATCH TOGETHER SERVER IS LIVE ON PORT ${PORT}`);
  console.log('==================================================');
  console.log(`📍 Local (This PC):    http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 Same Wi-Fi (Phone): http://${ip}:${PORT}`);
  });
  console.log('==================================================\n');
});

// 24/7 Keep-Alive Heartbeat for Free Cloud Hosts (e.g. Render)
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
if (RENDER_EXTERNAL_URL) {
  console.log(`[Heartbeat] Active for ${RENDER_EXTERNAL_URL} (24/7 keep-alive)`);
  setInterval(() => {
    fetch(`${RENDER_EXTERNAL_URL}/api/status`)
      .then(() => console.log('[Heartbeat] 24/7 keep-alive ping sent'))
      .catch(() => {});
  }, 8 * 60 * 1000); // every 8 minutes
}

// Graceful Shutdown
const cleanupAndExit = () => {
  if (activeTunnel) {
    try { activeTunnel.close(); } catch (e) {}
    activeTunnel = null;
  }
  process.exit(0);
};

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);



