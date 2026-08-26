import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';

const WebRTCContext = createContext(null);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
        'turn:standard.relay.metered.ca:80',
        'turn:standard.relay.metered.ca:443',
        'turn:standard.relay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10
};

let globalAudioContext = null;
function getGlobalAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!globalAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      globalAudioContext = new AudioContextClass();
    }
  }
  return globalAudioContext;
}

// Clean, safe SDP enhancer for stereo tab audio without corrupting mobile WebRTC parsers
function boostSdpQuality(sdp, videoBitrateKbps = 6000, audioBitrateKbps = 320) {
  if (!sdp) return sdp;
  let modified = sdp;

  // Enhance Opus codec parameters safely
  const opusMatch = modified.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (opusMatch && opusMatch[1]) {
    const opusPt = opusMatch[1];
    const fmtpRegex = new RegExp(`a=fmtp:${opusPt} ([^\\r\\n]+)`, 'g');
    if (fmtpRegex.test(modified)) {
      modified = modified.replace(fmtpRegex, (match, existingParams) => {
        let p = existingParams;
        if (!p.includes('stereo=')) p += ';stereo=1';
        if (!p.includes('sprop-stereo=')) p += ';sprop-stereo=1';
        return `a=fmtp:${opusPt} ${p}`;
      });
    }
  }

  return modified;
}

function applySenderQualityParams(pc) {
  try {
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track && sender.track.kind === 'video') {
        const params = sender.getParameters();
        if (params) {
          // 'maintain-resolution' ensures WebRTC preserves sharp resolution without dropping frames
          params.degradationPreference = 'maintain-resolution';
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 6000000; // 6 Mbps for smooth 1080p 60fps
          params.encodings[0].minBitrate = 500000; // 500 kbps floor so WAN/4G never stalls
          params.encodings[0].maxFramerate = 60;
          params.encodings[0].scaleResolutionDownBy = 1.0;
          sender.setParameters(params).catch(() => {});
        }
      } else if (sender.track && sender.track.kind === 'audio') {
        const params = sender.getParameters();
        if (params) {
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 320000; // 320 kbps studio audio
          sender.setParameters(params).catch(() => {});
        }
      }
    }
  } catch (e) {}
}

// ===== Relay Fallback capabilities =====
const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

// ===== WebM relay tuning =====
// Tweak these to trade quality / latency / bandwidth.
const RELAY_CONFIG = {
  SEGMENT_MS: 600,          // MediaRecorder timeslice; smaller = lower latency
  START_BITRATE: 3000000,   // initial video bitrate (3 Mbps)
  MIN_BITRATE: 500000,      // congestion ladder floor
  BITRATE_DROP: 0.65,       // multiply bitrate by this on sustained congestion
  AUDIO_BITRATE: 128000,    // Opus audio bitrate
  MAX_INFLIGHT: 5,          // max unacked chunks before we start dropping
  CONGEST_LEVEL: 4,         // inflight level counted as "congested" by watchdog
  CONGEST_STRIKES: 2,       // consecutive congested watchdog ticks before stepping down
  WATCHDOG_MS: 4000,        // congestion watchdog cadence
  RESTART_DELAY: 40,        // ms between recorder stop & start on session recycle
  MAX_WIDTH_DIRECT: 1920,   // sources wider than this get canvas-downscaled
  DOWNSCALE_WIDTH: 1600,
  DOWNSCALE_FPS: 30,
  JOIN_EDGE_S: 0.5,         // seconds behind live edge when a viewer first plays
  DRIFT_CHASE_S: 4,         // fall behind this much -> snap back toward live edge
  CHASE_TARGET_S: 0.7,      // where the snap lands (seconds behind live edge)
  TRIM_BEHIND_S: 25,        // proactively trim buffer older than N s behind playhead
  KEEP_BEHIND_S: 15,        // ...down to this much retained history
  STALL_NUDGE_MS: 6000      // no chunks for this long -> ask sharer to recycle session
};

function pickWebmRecordMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of WEBM_MIME_CANDIDATES) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
  }
  return null;
}

function canPlayWebmRelay() {
  if (typeof window === 'undefined' || typeof window.MediaSource !== 'function') return false;
  // Mobile / Capacitor / Safari devices use the hardware-accelerated Canvas JPEG relay for 100% reliability
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  if (isMobile) return false;
  try {
    return MediaSource.isTypeSupported('video/webm; codecs="vp8,opus"') ||
           MediaSource.isTypeSupported('video/webm; codecs="vp9,opus"');
  } catch (e) {
    return false;
  }
}

export const WebRTCProvider = ({ children }) => {
  const { socket, room } = useSocket();

  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isStreamingLocalVideo, setIsStreamingLocalVideo] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [localVideoStream, setLocalVideoStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [activeSpeakers, setActiveSpeakers] = useState(new Set());
  // Diagnostics: did getDisplayMedia actually capture tab/window audio, and is it live?
  const [screenShareHasAudio, setScreenShareHasAudio] = useState(false);
  const [screenAudioMuted, setScreenAudioMuted] = useState(false);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const localAudioStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localVideoStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // targetSocketId -> RTCPeerConnection
  const audioElementsRef = useRef(new Map()); // targetSocketId -> HTMLAudioElement
  const pendingCandidatesRef = useRef(new Map()); // targetSocketId -> RTCIceCandidateInit[]
  const remoteScreenStreamRef = useRef(null); // mirrors remoteScreenStream state synchronously
  const roomUsersRef = useRef([]);
  roomUsersRef.current = room?.users || [];

  // ===== Relay Fallback state (works through tunnels where P2P cannot) =====
  const [isRemoteRelayActive, setIsRemoteRelayActive] = useState(false);
  const relaySubscribedRef = useRef(false);
  const relayActiveModeRef = useRef(null); // 'webm' | 'jpeg' - what the viewer is currently rendering

  // JPEG fallback (universal)
  const relayCanvasRef = useRef(null); // viewer: persistent canvas we draw frames onto
  const relayPumpRef = useRef(null); // sharer: capture interval id
  const relayVideoElRef = useRef(null); // sharer: hidden <video> feeding the canvas
  const relayBoundTrackRef = useRef(null);
  const relayInflightRef = useRef(0); // sharer: unacked frames (congestion control)
  const relayQualityRef = useRef(0.55);
  const relayWidthRef = useRef(1280);
  const relaySizeStatsRef = useRef({ totalBytes: 0, frames: 0, congested: 0 });

  // WebM/VP9+Opus relay (real video codec + audio)
  const webmRecorderRef = useRef(null); // sharer: MediaRecorder instance
  const webmSessionIdRef = useRef(0); // sharer: increments per recorder session (init segment marker)
  const webmWatchdogRef = useRef(null); // sharer: congestion watchdog interval
  const webmInflightRef = useRef(0); // sharer: unacked chunks (congestion control)
  const webmBitrateRef = useRef(2500000); // sharer: current video bitrate tier
  const webmCongestionStrikesRef = useRef(0);

  const viewerSidRef = useRef(-1); // viewer: current webm session id being played
  const viewerMimeRef = useRef(''); // viewer: mime of the active pipeline
  const viewerMsRef = useRef(null); // viewer: MediaSource
  const viewerSbRef = useRef(null); // viewer: SourceBuffer
  const viewerQueueRef = useRef([]); // viewer: pending chunk queue
  const viewerUrlRef = useRef(null); // viewer: object URL for MediaSource
  const webmLastChunkAtRef = useRef(0); // viewer: stall detection timestamp
  const webmCaptureCleanupRef = useRef(null); // sharer: teardown for downscale capture chain

  const getRelayCanvas = useCallback(() => {
    if (!relayCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 1280;
      c.height = 720;
      c.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000;';
      relayCanvasRef.current = c;
    }
    return relayCanvasRef.current;
  }, []);

  const ensureViewerWebmEl = useCallback(() => {
    if (!relayVideoElRef.current) {
      const v = document.createElement('video');
      v.muted = true; // start muted for autoplay safety; unlockAudioEngine unmutes on gesture
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute('playsinline', 'true');
      v.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000;';
      relayVideoElRef.current = v;
    }
    return relayVideoElRef.current;
  }, []);

  // The element VideoPlayer mounts for the relay feed (video for WebM, canvas for JPEG)
  const getRelayElement = useCallback(() => {
    if (relayActiveModeRef.current === 'webm' && canPlayWebmRelay()) {
      return ensureViewerWebmEl();
    }
    return getRelayCanvas();
  }, [ensureViewerWebmEl, getRelayCanvas]);

  // ----- Sharer: JPEG frame pump over socket.io (universal fallback) -----
  const jpegCaptureVideoRef = useRef(null);

  const stopRelayPump = useCallback(() => {
    if (relayPumpRef.current) {
      clearInterval(relayPumpRef.current);
      relayPumpRef.current = null;
    }
    if (jpegCaptureVideoRef.current) {
      try {
        jpegCaptureVideoRef.current.srcObject = null;
      } catch (e) {}
      jpegCaptureVideoRef.current = null;
    }
    relayBoundTrackRef.current = null;
    relayInflightRef.current = 0;
    relayQualityRef.current = 0.55;
    relayWidthRef.current = 1280;
    relaySizeStatsRef.current = { totalBytes: 0, frames: 0, congested: 0 };
  }, []);

  const startRelayPump = useCallback(() => {
    if (relayPumpRef.current || !socket) return;
    console.log('[Relay] Starting JPEG fallback stream');

    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    jpegCaptureVideoRef.current = vid;

    let lastSendAt = 0;
    const MIN_FRAME_INTERVAL = 66; // ~15 fps ceiling
    const MAX_INFLIGHT = 4;

    const bindTrack = (track) => {
      try {
        vid.srcObject = new MediaStream([track]);
        vid.play().catch(() => {});
        relayBoundTrackRef.current = track;
      } catch (e) {}
    };

    relayPumpRef.current = setInterval(() => {
      const srcStream = screenStreamRef.current || localVideoStreamRef.current;
      const track = srcStream ? srcStream.getVideoTracks()[0] : null;
      if (!track) {
        stopRelayPump();
        return;
      }
      if (relayBoundTrackRef.current !== track) bindTrack(track);
      if (!vid.videoWidth || !vid.videoHeight) return;

      // Congestion control: never queue more than MAX_INFLIGHT unacked frames.
      // This naturally throttles fps to match the available upload bandwidth.
      if (relayInflightRef.current >= MAX_INFLIGHT) {
        relaySizeStatsRef.current.congested++;
        return;
      }

      const now = performance.now();
      if (now - lastSendAt < MIN_FRAME_INTERVAL) return;

      // Adaptive downscale + JPEG quality based on observed frame size
      const scale = Math.min(1, relayWidthRef.current / vid.videoWidth);
      const w = Math.round(vid.videoWidth * scale / 2) * 2;
      const h = Math.round(vid.videoHeight * scale / 2) * 2;

      let canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(vid, 0, 0, w, h);

      lastSendAt = now;
      canvas.toBlob((blob) => {
        if (!blob || !socket) return;
        blob.arrayBuffer().then((buf) => {
          // Adapt quality every ~30 sampled frames
          const stats = relaySizeStatsRef.current;
          stats.totalBytes += buf.byteLength;
          stats.frames++;
          if (stats.frames >= 30) {
            const avgKb = stats.totalBytes / stats.frames / 1024;
            if (avgKb > 200 || stats.congested > 20) {
              relayQualityRef.current = Math.max(0.35, relayQualityRef.current - 0.07);
              if (relayQualityRef.current <= 0.36 && relayWidthRef.current > 896) {
                relayWidthRef.current = Math.round(relayWidthRef.current * 0.75);
              }
            } else if (avgKb < 90 && stats.congested === 0 && relayQualityRef.current < 0.62) {
              relayQualityRef.current = Math.min(0.62, relayQualityRef.current + 0.04);
            }
            relaySizeStatsRef.current = { totalBytes: 0, frames: 0, congested: 0 };
          }

          relayInflightRef.current++;
          socket.timeout(6000).emit(
            'screen_relay_frame',
            { w, h, jpeg: new Uint8Array(buf) },
            () => { relayInflightRef.current = Math.max(0, relayInflightRef.current - 1); }
          );
        }).catch(() => {});
      }, 'image/jpeg', relayQualityRef.current);
    }, 66);
  }, [socket, stopRelayPump]);

  // ----- Sharer: WebM/VP9+Opus recorder over socket.io (real codec + audio) -----
  const stopWebmRelay = useCallback((flushTail = false) => {
    const rec = webmRecorderRef.current;
    if (rec) {
      webmRecorderRef.current = null;
      try {
        if (!flushTail) rec.ondataavailable = null; // drop pending tail
        if (rec.state !== 'inactive') rec.stop();   // flush path emits the final segment
      } catch (e) {}
    }
    if (webmWatchdogRef.current) {
      clearInterval(webmWatchdogRef.current);
      webmWatchdogRef.current = null;
    }
    if (webmCaptureCleanupRef.current) {
      try { webmCaptureCleanupRef.current(); } catch (e) {}
      webmCaptureCleanupRef.current = null;
    }
    webmInflightRef.current = 0;
    webmCongestionStrikesRef.current = 0;
  }, []);

  const startWebmRelay = useCallback(() => {
    if (webmRecorderRef.current || !socket) return;
    const srcStream = screenStreamRef.current || localVideoStreamRef.current;
    if (!srcStream || srcStream.getVideoTracks().length === 0) return;

    const mime = pickWebmRecordMime();
    if (!mime) {
      console.warn('[Relay] MediaRecorder cannot produce WebM - staying on JPEG fallback');
      return;
    }

    // Sources wider than MAX_WIDTH_DIRECT (e.g. 4K displays) are composited
    // through a canvas at DOWNSCALE_WIDTH so the encoder spends its bitrate on
    // quality instead of spreading it across millions of pixels.
    let recordStream = null;
    const vt = srcStream.getVideoTracks()[0];
    const s = (vt && vt.getSettings) ? vt.getSettings() : {};
    if ((s.width || 0) > RELAY_CONFIG.MAX_WIDTH_DIRECT) {
      try {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.srcObject = new MediaStream([vt]);
        v.play().catch(() => {});

        const scale = RELAY_CONFIG.DOWNSCALE_WIDTH / s.width;
        const cv = document.createElement('canvas');
        cv.width = Math.round((s.width * scale) / 2) * 2;
        cv.height = Math.round(((s.height || 720) * scale) / 2) * 2;
        const c2d = cv.getContext('2d');
        const draw = () => { try { c2d.drawImage(v, 0, 0, cv.width, cv.height); } catch (e) {} };
        draw();
        const cap = cv.captureStream(RELAY_CONFIG.DOWNSCALE_FPS);
        const drawTimer = setInterval(draw, Math.round(1000 / RELAY_CONFIG.DOWNSCALE_FPS));
        webmCaptureCleanupRef.current = () => {
          clearInterval(drawTimer);
          try { v.srcObject = null; } catch (e) {}
        };

        recordStream = new MediaStream([
          ...cap.getVideoTracks(),
          ...srcStream.getAudioTracks()
        ]);
        console.log(`[Relay] ${s.width}x${s.height} source -> downscaled to ${cv.width}x${cv.height} @${RELAY_CONFIG.DOWNSCALE_FPS}fps`);
      } catch (e) {
        console.warn('[Relay] Downscale setup failed, recording source directly:', e);
        recordStream = null;
      }
    }
    if (!recordStream) {
      recordStream = new MediaStream([
        ...srcStream.getVideoTracks(),
        ...srcStream.getAudioTracks()
      ]);
    }

    let rec;
    try {
      rec = new MediaRecorder(recordStream, {
        mimeType: mime,
        videoBitsPerSecond: webmBitrateRef.current,
        audioBitsPerSecond: RELAY_CONFIG.AUDIO_BITRATE
      });
    } catch (e) {
      console.warn('[Relay] MediaRecorder construction failed:', e);
      if (webmCaptureCleanupRef.current) {
        webmCaptureCleanupRef.current();
        webmCaptureCleanupRef.current = null;
      }
      return;
    }

    webmRecorderRef.current = rec;
    webmSessionIdRef.current += 1;
    const sid = webmSessionIdRef.current;
    console.log(`[Relay] Starting WebM relay session ${sid} (${mime} @ ${Math.round(webmBitrateRef.current / 1000)}kbps)`);

    rec.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0 || !socket) return;
      // Drop chunks when badly backed up; watchdog will step bitrate down
      if (webmInflightRef.current >= RELAY_CONFIG.MAX_INFLIGHT) {
        webmCongestionStrikesRef.current += 1;
        return;
      }
      ev.data.arrayBuffer().then((buf) => {
        if (webmSessionIdRef.current !== sid) return; // stale session tail - never send
        webmInflightRef.current += 1;
        socket.timeout(8000).emit(
          'screen_relay_webm',
          { sid, mime, data: new Uint8Array(buf) },
          () => { webmInflightRef.current = Math.max(0, webmInflightRef.current - 1); }
        );
      }).catch(() => {});
    };

    try {
      rec.start(RELAY_CONFIG.SEGMENT_MS);
    } catch (e) {
      console.warn('[Relay] MediaRecorder start failed:', e);
      webmRecorderRef.current = null;
      if (webmCaptureCleanupRef.current) {
        webmCaptureCleanupRef.current();
        webmCaptureCleanupRef.current = null;
      }
      return;
    }

    // Watchdog: congestion -> step bitrate down & restart encoder; dead source -> stop
    if (webmWatchdogRef.current) clearInterval(webmWatchdogRef.current);
    webmWatchdogRef.current = setInterval(() => {
      const nowStream = screenStreamRef.current || localVideoStreamRef.current;
      if (!nowStream || nowStream.getVideoTracks().length === 0 || nowStream.getVideoTracks()[0].readyState === 'ended') {
        stopWebmRelay(true);
        return;
      }
      if (webmInflightRef.current >= RELAY_CONFIG.CONGEST_LEVEL) {
        webmCongestionStrikesRef.current += 1;
      } else if (webmCongestionStrikesRef.current > 0 && webmInflightRef.current === 0) {
        webmCongestionStrikesRef.current -= 1;
      }
      if (webmCongestionStrikesRef.current >= RELAY_CONFIG.CONGEST_STRIKES && webmBitrateRef.current > RELAY_CONFIG.MIN_BITRATE) {
        webmBitrateRef.current = Math.max(
          RELAY_CONFIG.MIN_BITRATE,
          Math.round(webmBitrateRef.current * RELAY_CONFIG.BITRATE_DROP)
        );
        webmCongestionStrikesRef.current = 0;
        console.log(`[Relay] Congested - restarting WebM at ${Math.round(webmBitrateRef.current / 1000)}kbps`);
        stopWebmRelay(false);
        setTimeout(() => startWebmRelay(), RELAY_CONFIG.RESTART_DELAY);
      }
    }, RELAY_CONFIG.WATCHDOG_MS);
  }, [socket, stopWebmRelay]);

  // Restart the encoder so a newly joined viewer receives a fresh init segment
  const restartWebmRelayForNewcomer = useCallback((flushTail = true) => {
    if (!webmRecorderRef.current) return;
    stopWebmRelay(flushTail);
    setTimeout(() => startWebmRelay(), RELAY_CONFIG.RESTART_DELAY);
  }, [stopWebmRelay, startWebmRelay]);

  // Sharer: start/stop pumps as relay viewers come and go
  useEffect(() => {
    if (!socket) return;
    let prevCount = 0;
    const handleRelayViewers = ({ count, hasWebm, hasJpeg }) => {
      const grew = count > prevCount;
      prevCount = count;

      if (!count || count <= 0) {
        stopRelayPump();
        stopWebmRelay(true);
        return;
      }

      if (hasJpeg || count > 0) {
        startRelayPump();
      } else {
        stopRelayPump();
      }

      if (hasWebm) {
        if (!webmRecorderRef.current) {
          startWebmRelay();
        } else if (grew) {
          restartWebmRelayForNewcomer(true);
        }
      } else {
        stopWebmRelay(true);
      }
    };

    // Viewer reports a stalled feed -> recycle the encoder so it gets a fresh init
    const handleRelayNudge = () => {
      if (webmRecorderRef.current) {
        console.log('[Relay] Viewer reported a stall - recycling WebM session');
        restartWebmRelayForNewcomer(false);
      }
    };

    socket.on('screen_relay_viewers', handleRelayViewers);
    socket.on('screen_relay_nudge', handleRelayNudge);
    return () => {
      socket.off('screen_relay_viewers', handleRelayViewers);
      socket.off('screen_relay_nudge', handleRelayNudge);
    };
  }, [socket, startRelayPump, stopRelayPump, startWebmRelay, stopWebmRelay, restartWebmRelayForNewcomer]);

  // ----- Viewer: tear down the WebM playback pipeline -----
  const teardownViewerWebm = useCallback(() => {
    const v = relayVideoElRef.current;
    if (v) {
      try { v.pause(); } catch (e) {}
      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
      }
      try { v.removeAttribute('src'); v.load(); } catch (e) {}
    }
    const ms = viewerMsRef.current;
    const sb = viewerSbRef.current;
    if (ms && sb) {
      try { ms.removeSourceBuffer(sb); } catch (e) {}
    }
    viewerMsRef.current = null;
    viewerSbRef.current = null;
    viewerQueueRef.current = [];
  }, []);

  // ----- Viewer: subscribe/unsubscribe to relay feed -----
  const enableRelayFallback = useCallback((enabled) => {
    if (!socket) return;
    if (enabled && !relaySubscribedRef.current) {
      relaySubscribedRef.current = true;
      setIsRemoteRelayActive(true);
      webmLastChunkAtRef.current = Date.now();
      const mode = canPlayWebmRelay() ? 'webm' : 'jpeg';
      console.log(`[Relay] P2P not connected - requesting ${mode} relay fallback`);
      socket.emit('screen_relay_subscribe', { mode });
    } else if (!enabled && relaySubscribedRef.current) {
      relaySubscribedRef.current = false;
      socket.emit('screen_relay_unsubscribe');
      teardownViewerWebm();
      viewerSidRef.current = -1;
      relayActiveModeRef.current = null;
      setIsRemoteRelayActive(false);
    }
  }, [socket, teardownViewerWebm]);

  // Viewer: receive WebM segments & play via MediaSource (VP9/VP8 + Opus audio).
  // Each recorder session's FIRST segment contains the init header - detected by
  // a new session id, at which point we rebuild the pipeline seamlessly.
  useEffect(() => {
    if (!socket || !canPlayWebmRelay()) return;

    const appendNextChunk = () => {
      const sb = viewerSbRef.current;
      if (!sb || sb.updating || viewerQueueRef.current.length === 0) return;
      const next = viewerQueueRef.current.shift();
      try {
        sb.appendBuffer(next);
      } catch (e) {
        // QuotaExceeded or transient error: trim old buffer and retry shortly
        try {
          const v = relayVideoElRef.current;
          if (v && v.buffered.length > 0) {
            const s0 = v.buffered.start(0);
            sb.remove(s0, Math.max(s0, v.currentTime - 4));
          }
        } catch (e2) {}
        setTimeout(appendNextChunk, 250);
      }
    };

    const onWebmSegment = ({ sid, mime, data }) => {
      if (!data || !data.byteLength) return;
      webmLastChunkAtRef.current = Date.now();
      relayActiveModeRef.current = 'webm';

      // Session id changed -> this segment starts a fresh recording (init header)
      if (sid !== viewerSidRef.current) {
        viewerSidRef.current = sid;
        viewerMimeRef.current = mime || 'video/webm; codecs="vp8,opus"';
        teardownViewerWebm();

        const ms = new MediaSource();
        viewerMsRef.current = ms;
        const v = ensureViewerWebmEl();
        viewerUrlRef.current = URL.createObjectURL(ms);
        v.src = viewerUrlRef.current;

        let primed = false;
        ms.addEventListener('sourceopen', () => {
          let sb;
          try {
            sb = ms.addSourceBuffer(viewerMimeRef.current);
          } catch (e) {
            console.warn('[Relay] SourceBuffer rejected mime:', viewerMimeRef.current);
            return;
          }
          viewerSbRef.current = sb;

          sb.addEventListener('updateend', () => {
            const vv = relayVideoElRef.current;
            if (vv && vv.buffered.length > 0) {
              const end = vv.buffered.end(vv.buffered.length - 1);
              const s0 = vv.buffered.start(0);
              if (!primed) {
                primed = true;
                vv.muted = false; // playback running -> enable relay audio
                vv.currentTime = Math.max(0, end - RELAY_CONFIG.JOIN_EDGE_S); // join near the live edge
              } else if (vv.currentTime < end - RELAY_CONFIG.DRIFT_CHASE_S) {
                vv.currentTime = end - RELAY_CONFIG.CHASE_TARGET_S; // fell too far behind - chase live edge
              }
              // Proactively trim old history so QuotaExceeded never happens
              if (vv.currentTime - s0 > RELAY_CONFIG.TRIM_BEHIND_S && !sb.updating) {
                try { sb.remove(s0, vv.currentTime - RELAY_CONFIG.KEEP_BEHIND_S); } catch (e) {}
              }
              if (vv.paused) vv.play().catch(() => {});
            }
            setIsRemoteRelayActive(true);
            appendNextChunk();
          });

          appendNextChunk();
        });
      }

      if (!viewerSbRef.current) return;
      if (viewerQueueRef.current.length > 24) viewerQueueRef.current.shift(); // bound memory
      viewerQueueRef.current.push(data);
      appendNextChunk();
    };

    socket.on('screen_relay_webm', onWebmSegment);
    return () => {
      socket.off('screen_relay_webm', onWebmSegment);
    };
  }, [socket, ensureViewerWebmEl, teardownViewerWebm]);

  // Viewer: if subscribed but no chunks arriving at all (dead session / missed init),
  // ask the sharer to recycle its encoder so we get a fresh init segment.
  useEffect(() => {
    if (!socket) return;
    const iv = setInterval(() => {
      if (
        relaySubscribedRef.current &&
        relayActiveModeRef.current === 'webm' &&
        webmLastChunkAtRef.current > 0 &&
        Date.now() - webmLastChunkAtRef.current > RELAY_CONFIG.STALL_NUDGE_MS
      ) {
        console.log('[Relay] Feed stalled - nudging sharer to recycle the session');
        webmLastChunkAtRef.current = Date.now(); // wait a full window before nudging again
        socket.emit('screen_relay_nudge');
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [socket]);

  // Viewer: receive & render relay frames onto the shared canvas.
  // Only used when the browser cannot play WebM (e.g. iOS Safari) - otherwise
  // the WebM pipeline below handles everything at far higher quality.
  useEffect(() => {
    if (!socket) return;
    const drawFrame = ({ jpeg, w, h }) => {
      if (!jpeg) return;
      const canvas = getRelayCanvas();
      const ctx = canvas.getContext('2d');
      relayActiveModeRef.current = 'jpeg';
      const blob = new Blob([jpeg], { type: 'image/jpeg' });

      const paint = (image, width, height) => {
        const targetW = width || image.width || image.naturalWidth || 1280;
        const targetH = height || image.height || image.naturalHeight || 720;
        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;
        try { ctx.drawImage(image, 0, 0, targetW, targetH); } catch (e) {}
        setIsRemoteRelayActive(true);
        if (image.close) image.close();
      };

      if (typeof window.createImageBitmap === 'function') {
        window.createImageBitmap(blob)
          .then((bmp) => paint(bmp, w, h))
          .catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          paint(img, w, h);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    };
    socket.on('screen_relay_frame', drawFrame);
    return () => {
      socket.off('screen_relay_frame', drawFrame);
    };
  }, [socket, getRelayCanvas]);

  // Helper to add active tracks to a peer connection
  const attachTracksToPeer = useCallback((pc) => {
    const currentSenders = pc.getSenders();
    const currentTrackIds = new Set(currentSenders.map((s) => s.track?.id).filter(Boolean));

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((track) => {
        if (!currentTrackIds.has(track.id)) {
          try { pc.addTrack(track, localAudioStreamRef.current); } catch (e) {}
        }
      });
    }

    const videoStream = screenStreamRef.current || localVideoStreamRef.current;
    if (videoStream) {
      videoStream.getTracks().forEach((track) => {
        if ('contentHint' in track) {
          track.contentHint = 'detail'; // 'detail' preserves crisp native resolution!
        }
        if (!currentTrackIds.has(track.id)) {
          try {
            pc.addTrack(track, videoStream);
          } catch (e) {}
        }
      });
      applySenderQualityParams(pc);
    }
  }, []);

  // Create PeerConnection helper with candidate buffering
  const createPeerConnection = useCallback((targetId) => {
    let pc = peerConnectionsRef.current.get(targetId);
    if (pc && pc.connectionState !== 'closed' && pc.connectionState !== 'failed') {
      attachTracksToPeer(pc);
      return pc;
    }

    if (pc) {
      try { pc.close(); } catch (e) {}
    }

    pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc_signal', {
          targetId,
          signal: event.candidate,
          signalType: 'candidate'
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track: kind=${event.track.kind}, id=${event.track.id}`);
      let stream = (event.streams && event.streams[0]) ? event.streams[0] : null;
      if (!stream) {
        stream = new MediaStream([event.track]);
      }
      
      if (event.track.kind === 'video') {
        remoteScreenStreamRef.current = stream;
        setRemoteScreenStream(stream);
      } else if (event.track.kind === 'audio') {
        // ALL remote audio (tab-share audio + mic) plays through a dedicated hidden
        // <audio> element per peer. The <video> element rendering the shared screen
        // is always muted, so this is guaranteed to be the single audio path -
        // it cannot be silenced by video autoplay policies and cannot echo.
        let audioEl = audioElementsRef.current.get(targetId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioEl.setAttribute('playsinline', 'true');
          audioEl.setAttribute('webkit-playsinline', 'true');
          audioEl.style.position = 'fixed';
          audioEl.style.pointerEvents = 'none';
          audioEl.style.opacity = '0';
          audioEl.style.width = '0px';
          audioEl.style.height = '0px';
          audioEl.style.bottom = '0px';
          audioEl.style.right = '0px';
          document.body.appendChild(audioEl);
          audioElementsRef.current.set(targetId, audioEl);
        }

        // Direct stream assignment with track
        let audioStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        audioEl.srcObject = audioStream;
        audioEl.volume = 1.0;
        audioEl.muted = false;

        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsAudioBlocked(false);
          }).catch((err) => {
            console.warn('[WebRTC] Audio element autoplay pending gesture:', err.message);
            setIsAudioBlocked(true);
          });
        }

        event.track.onended = () => {
          try {
            if (audioEl.srcObject && audioEl.srcObject instanceof MediaStream) {
              audioEl.srcObject.removeTrack(event.track);
            }
          } catch (e) {}
        };
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${targetId} connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Connection failed with ${targetId}, triggering ICE recovery`);
        peerConnectionsRef.current.delete(targetId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state (${targetId}): ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
        } catch (e) {}
      }
    };

    attachTracksToPeer(pc);
    return pc;
  }, [socket, attachTracksToPeer]);

  // Offer negotiation helper
  const negotiateWithPeer = useCallback(async (targetId, iceRestart = false) => {
    if (!socket || targetId === socket.id) return;
    try {
      let pc = peerConnectionsRef.current.get(targetId);
      if (pc && pc.connectionState === 'failed' && !iceRestart) {
        try { pc.close(); } catch (e) {}
        pc = null;
      }
      if (pc && pc.signalingState === 'have-local-offer' && !iceRestart) {
        // An offer is already in flight - do NOT tear it down.
        return;
      }
      if (pc && pc.signalingState === 'have-remote-offer' && !iceRestart) {
        // Glare: remote side is making an offer; let their offer win, we answer it
        return;
      }
      if (!pc || pc.connectionState === 'closed') {
        try { if (pc) pc.close(); } catch (e) {}
        pc = createPeerConnection(targetId);
      }

      attachTracksToPeer(pc);
      const rawOffer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: !!iceRestart
      });
      const boostedOffer = new RTCSessionDescription({
        type: rawOffer.type,
        sdp: boostSdpQuality(rawOffer.sdp, 8000)
      });
      await pc.setLocalDescription(boostedOffer);
      applySenderQualityParams(pc);

      socket.emit('webrtc_signal', {
        targetId,
        signal: boostedOffer,
        signalType: 'offer'
      });
    } catch (err) {
      console.warn(`[WebRTC] Negotiation offer error with ${targetId}:`, err);
    }
  }, [socket, createPeerConnection, attachTracksToPeer]);

  // Broadcast current active streams to all room peers
  const broadcastActiveStreams = useCallback(() => {
    if (!socket) return;
    const users = roomUsersRef.current;
    users.forEach((u) => {
      if (u.id !== socket.id) {
        negotiateWithPeer(u.id);
      }
    });
  }, [socket, negotiateWithPeer]);

  // Cleanup all connections
  const cleanupConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try { pc.close(); } catch (e) {}
    });
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      localAudioStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }

    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach((track) => track.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);
    }

    stopRelayPump();
    stopWebmRelay(true);
    teardownViewerWebm();
    if (relaySubscribedRef.current) {
      relaySubscribedRef.current = false;
      viewerSidRef.current = -1;
      relayActiveModeRef.current = null;
      setIsRemoteRelayActive(false);
    }

    setIsMicOn(false);
    setIsScreenSharing(false);
    setIsStreamingLocalVideo(false);
    remoteScreenStreamRef.current = null;
    setRemoteScreenStream(null);
  }, []);

  // Clean up when leaving room
  useEffect(() => {
    if (!room) {
      cleanupConnections();
    }
  }, [room, cleanupConnections]);

  // Unlock Audio Engine: resumes Web Audio context & plays all remote audio streams
  const unlockAudioEngine = useCallback(() => {
    const audioCtx = getGlobalAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    audioElementsRef.current.forEach((el) => {
      if (el.srcObject) {
        el.muted = false;
        el.volume = 1.0;
        if (el.paused) {
          el.play().then(() => {
            setIsAudioBlocked(false);
          }).catch(() => {});
        }
      }
    });

    // Relay video element (WebM fallback stream carries its own audio track)
    const relayV = relayVideoElRef.current;
    if (relayV && !relayV.paused) {
      relayV.muted = false;
    }

    setIsAudioBlocked(false);
  }, []);

  // Autoplay insurance: browsers (especially mobile & Chromium) may block audio
  // until a user gesture happens. Resume any blocked streams on first touch/click/key.
  useEffect(() => {
    window.addEventListener('touchstart', unlockAudioEngine, { passive: true });
    window.addEventListener('pointerdown', unlockAudioEngine, { passive: true });
    window.addEventListener('click', unlockAudioEngine, { passive: true });
    window.addEventListener('keydown', unlockAudioEngine, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlockAudioEngine);
      window.removeEventListener('pointerdown', unlockAudioEngine);
      window.removeEventListener('click', unlockAudioEngine);
      window.removeEventListener('keydown', unlockAudioEngine);
    };
  }, [unlockAudioEngine]);

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async ({ senderId, signal, signalType }) => {
      let pc = peerConnectionsRef.current.get(senderId);

      if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        pc = createPeerConnection(senderId);
      }

      try {
        if (signalType === 'offer') {
          if (pc.signalingState !== 'stable') {
            try {
              await pc.setLocalDescription({ type: 'rollback' });
            } catch (e) {
              try { pc.close(); } catch (err) {}
              pc = createPeerConnection(senderId);
            }
          }

          attachTracksToPeer(pc);
          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          // Flush queued candidates
          const queued = pendingCandidatesRef.current.get(senderId) || [];
          for (const cand of queued) {
            if (cand && cand.candidate) {
              try { await pc.addIceCandidate(cand); } catch (e) {}
            }
          }
          pendingCandidatesRef.current.delete(senderId);

          const rawAnswer = await pc.createAnswer();
          const boostedAnswer = new RTCSessionDescription({
            type: rawAnswer.type,
            sdp: boostSdpQuality(rawAnswer.sdp, 8000)
          });
          await pc.setLocalDescription(boostedAnswer);
          applySenderQualityParams(pc);

          socket.emit('webrtc_signal', {
            targetId: senderId,
            signal: boostedAnswer,
            signalType: 'answer'
          });
        } else if (signalType === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          // Flush queued candidates
          const queued = pendingCandidatesRef.current.get(senderId) || [];
          for (const cand of queued) {
            if (cand && cand.candidate) {
              try { await pc.addIceCandidate(cand); } catch (e) {}
            }
          }
          pendingCandidatesRef.current.delete(senderId);
        } else if (signalType === 'candidate' && signal && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try { await pc.addIceCandidate(signal); } catch (e) {}
          } else {
            // Buffer candidate until remote description is applied
            if (!pendingCandidatesRef.current.has(senderId)) {
              pendingCandidatesRef.current.set(senderId, []);
            }
            pendingCandidatesRef.current.get(senderId).push(signal);
          }
        }
      } catch (err) {
        console.warn(`[WebRTC] Signal handling error with ${senderId}:`, err);
      }
    };

    const handleScreenShareStatus = ({ isSharing, sharerId }) => {
      if (!isSharing && !isStreamingLocalVideo) {
        remoteScreenStreamRef.current = null;
        setRemoteScreenStream(null);
      } else if (isSharing && sharerId && sharerId !== socket.id) {
        console.log(`[WebRTC] Remote stream active from ${sharerId}`);
      }
    };

    // When a new user joins, if we have an active stream or mic, negotiate with them!
    const handleUserJoined = ({ user }) => {
      if (user && user.id !== socket.id) {
        if (isMicOn || isScreenSharing || isStreamingLocalVideo || screenStreamRef.current || localVideoStreamRef.current) {
          setTimeout(() => {
            negotiateWithPeer(user.id);
          }, 600);
        }
      }
    };

    const handleUserLeft = ({ userId }) => {
      const pc = peerConnectionsRef.current.get(userId);
      if (pc) {
        try { pc.close(); } catch (e) {}
        peerConnectionsRef.current.delete(userId);
      }
      pendingCandidatesRef.current.delete(userId);
      const audioEl = audioElementsRef.current.get(userId);
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.remove();
        audioElementsRef.current.delete(userId);
      }
    };

    const handleRenegotiateRequest = ({ requesterId }) => {
      console.log(`[WebRTC] Host received stream renegotiation request from ${requesterId}`);
      if (requesterId && (screenStreamRef.current || localVideoStreamRef.current || isScreenSharing || isStreamingLocalVideo)) {
        negotiateWithPeer(requesterId);
      }
    };

    socket.on('webrtc_signal', handleSignal);
    socket.on('screen_share_status', handleScreenShareStatus);
    socket.on('renegotiate_stream_with_peer', handleRenegotiateRequest);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);

    return () => {
      socket.off('webrtc_signal', handleSignal);
      socket.off('screen_share_status', handleScreenShareStatus);
      socket.off('renegotiate_stream_with_peer', handleRenegotiateRequest);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
    };
  }, [socket, createPeerConnection, attachTracksToPeer, negotiateWithPeer, isMicOn, isScreenSharing, isStreamingLocalVideo]);

  // Toggle Microphone
  const toggleMic = async () => {
    if (isMicOn) {
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach((t) => t.stop());
        localAudioStreamRef.current = null;
      }
      setIsMicOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localAudioStreamRef.current = stream;
        setIsMicOn(true);
        broadcastActiveStreams();
      } catch (err) {
        console.error('Microphone access denied:', err);
        alert('Could not access microphone. Please check permissions.');
      }
    }
  };

  // Start Screen Share
  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      if (isMobile) {
        alert('Live Screen Broadcasting is designed for Desktop (PC / Mac / Laptop).\n\n📱 On Mobile: You can host by selecting "Local Video" from your storage or pasting any YouTube/Web stream link!');
      } else {
        alert('Screen sharing is not supported on this browser. Please use Chrome, Edge, or Firefox on Desktop over HTTPS.');
      }
      return null;
    }

    try {
      let stream;
      try {
        // High quality 60fps display media. Audio requested RAW (no echo-cancel /
        // noise-suppression / AGC) - processing tab audio can mangle or silence it.
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'browser',
            width: { ideal: 1920, max: 3840 },
            height: { ideal: 1080, max: 2160 },
            frameRate: { ideal: 60, max: 60 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48000,
            sampleSize: 16,
            googEchoCancellation: false,
            googAutoGainControl: false,
            googNoiseSuppression: false,
            googHighpassFilter: false,
            googTypingNoiseDetection: false,
            googAudioMirroring: false
          },
          systemAudio: 'include',
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include'
        });
      } catch (err) {
        // Fallback for mobile / browsers that reject advanced constraints
        console.warn('Advanced display media constraints failed, falling back to basic:', err);
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
      }

      if (!stream) return null;

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      console.log(`[ScreenShare] Captured ${videoTracks.length} video track(s) and ${audioTracks.length} audio track(s)`);

      // Diagnostics for the "no sound on other devices" problem:
      // Chrome only includes an audio track if the user ticked the share-audio box.
      setScreenShareHasAudio(audioTracks.length > 0);
      setScreenAudioMuted(false);
      if (audioTracks.length === 0) {
        console.warn('[ScreenShare] NO audio track captured - user likely did not tick "Also share tab audio"');
      } else {
        audioTracks.forEach((t) => {
          t.onmute = () => {
            console.warn('[ScreenShare] Audio track muted (tab not producing sound?)');
            setScreenAudioMuted(true);
          };
          t.onunmute = () => setScreenAudioMuted(false);
          t.onended = () => setScreenAudioMuted(false);
        });
      }

      stream.getVideoTracks().forEach((track) => {
        if ('contentHint' in track) {
          track.contentHint = 'detail';
        }
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      const videoTrack = videoTracks[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      if (socket) {
        socket.emit('screen_share_status', { isSharing: true });
      }

      broadcastActiveStreams();
      startRelayPump();
      setTimeout(() => {
        broadcastActiveStreams();
      }, 500);
      return stream;
    } catch (err) {
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        console.error('Screen share error:', err);
        alert(`Screen share could not start: ${err.message || err.name}`);
      } else {
        console.log('User dismissed screen share prompt.');
      }
      return null;
    }
  }, [socket, broadcastActiveStreams, startRelayPump]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }
    setIsScreenSharing(false);
    setScreenShareHasAudio(false);
    setScreenAudioMuted(false);
    stopRelayPump();
    stopWebmRelay(true);
    if (socket) {
      socket.emit('screen_share_status', { isSharing: false });
    }
  }, [socket, stopRelayPump, stopWebmRelay]);

  // Start P2P Local Video Streaming from an HTML5 Video Element
  const startLocalVideoStream = useCallback((videoElement) => {
    if (!videoElement) return null;
    try {
      let stream = null;
      if (typeof videoElement.captureStream === 'function') {
        stream = videoElement.captureStream(60); // 60 FPS hardware capture
      } else if (typeof videoElement.mozCaptureStream === 'function') {
        stream = videoElement.mozCaptureStream(60);
      }

      if (!stream) {
        console.warn('captureStream is not supported by this browser');
        return null;
      }

      stream.getVideoTracks().forEach((track) => {
        if ('contentHint' in track) {
          track.contentHint = 'detail';
        }
      });

      localVideoStreamRef.current = stream;
      setLocalVideoStream(stream);
      setIsStreamingLocalVideo(true);

      if (socket) {
        socket.emit('screen_share_status', { isSharing: true });
      }

      broadcastActiveStreams();
      startRelayPump();
      return stream;
    } catch (err) {
      console.warn('Failed to start local video stream capture:', err);
      return null;
    }
  }, [socket, broadcastActiveStreams, startRelayPump]);

  const stopLocalVideoStream = useCallback(() => {
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach((track) => track.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);
    }
    setIsStreamingLocalVideo(false);
    stopRelayPump();
    stopWebmRelay(true);
    if (socket) {
      socket.emit('screen_share_status', { isSharing: false });
    }
  }, [socket, stopRelayPump, stopWebmRelay]);

  const requestStreamRenegotiation = useCallback(() => {
    if (socket) {
      socket.emit('request_stream_renegotiation');
    }
  }, [socket]);

  const setWebRtcVolume = useCallback((val) => {
    audioElementsRef.current.forEach((el) => {
      el.volume = Math.max(0, Math.min(1, val));
    });
  }, []);

  const setWebRtcMuted = useCallback((muted) => {
    audioElementsRef.current.forEach((el) => {
      el.muted = !!muted;
    });
  }, []);

  return (
    <WebRTCContext.Provider
      value={{
        isMicOn,
        toggleMic,
        isScreenSharing,
        startScreenShare,
        stopScreenShare,
        isStreamingLocalVideo,
        startLocalVideoStream,
        stopLocalVideoStream,
        screenStream,
        localVideoStream,
        remoteScreenStream,
        isRemoteRelayActive,
        getRelayElement,
        enableRelayFallback,
        activeSpeakers,
        screenShareHasAudio,
        screenAudioMuted,
        isAudioBlocked,
        unlockAudioEngine,
        setWebRtcVolume,
        setWebRtcMuted,
        broadcastActiveStreams,
        requestStreamRenegotiation
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};
