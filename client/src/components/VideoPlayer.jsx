import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { useSocket } from '../context/SocketContext';
import { useWebRTC } from '../context/WebRTCContext';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  RotateCw, 
  Loader2, 
  FolderOpen, 
  Tv, 
  Sparkles, 
  Monitor, 
  CheckCircle2,
  RefreshCw,
  Gauge,
  Check,
  ChevronDown,
  Scaling,
  HardDrive,
  Radio,
  X,
  Youtube,
  Link2
} from 'lucide-react';

import { extractYoutubeId } from '../utils/youtube';

// Debug: append ?forcerelay=1 to the URL to force Relay Mode even when P2P works.
// Lets you verify the relay pipeline locally (note: audio may double during this test).
const FORCE_RELAY = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('forcerelay') === '1';

export const VideoPlayer = ({ onSelectLocalFile, guestLocalBlobUrl }) => {
  const { 
    room, 
    socket, 
    isHost, 
    userName,
    changeMedia,
    playMedia, 
    pauseMedia, 
    seekMedia, 
    changePlaybackRate, 
    reportBufferState,
    bufferingState 
  } = useSocket();

  const webRTC = useWebRTC() || {};
  const { 
    isScreenSharing = false, 
    startScreenShare = () => {},
    stopScreenShare = () => {},
    screenStream = null, 
    remoteScreenStream = null,
    isRemoteRelayActive = false,
    getRelayElement = null,
    enableRelayFallback = () => {},
    isStreamingLocalVideo = false,
    startLocalVideoStream = () => {},
    stopLocalVideoStream = () => {},
    screenShareHasAudio = false,
    screenAudioMuted = false,
    isAudioBlocked = false,
    unlockAudioEngine = () => {},
    setWebRtcVolume = () => {},
    setWebRtcMuted = () => {}
  } = webRTC;

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytContainerRef = useRef(null);
  const isInternalUpdateRef = useRef(false);
  const isDraggingSeekRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [fitMode, setFitMode] = useState('contain'); // 'contain' | 'cover'
  const [tapFeedback, setTapFeedback] = useState(null);
  const [isYtApiLoaded, setIsYtApiLoaded] = useState(false);
  const [emptyStateUrl, setEmptyStateUrl] = useState('');
  const [rewindPressed, setRewindPressed] = useState(false);
  const [forwardPressed, setForwardPressed] = useState(false);
  const rewindTimerRef = useRef(null);
  const forwardTimerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0 });

  const handleEmptyStateLoad = (e) => {
    e?.preventDefault();
    if (!emptyStateUrl.trim()) return;
    const trimmed = emptyStateUrl.trim();
    const ytId = extractYoutubeId(trimmed);
    if (ytId || trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      changeMedia('youtube', trimmed, trimmed);
    } else {
      const title = trimmed.split('/').pop().split('?')[0] || 'Direct Stream';
      changeMedia('video_url', trimmed, decodeURIComponent(title));
    }
    setEmptyStateUrl('');
  };

  const media = room?.media || { type: 'none', url: '' };
  const ytVideoId = media.type === 'youtube' ? extractYoutubeId(media.url) : '';

  // Refs mirroring latest room state for use inside effects without re-triggering them
  const mediaIsPlayingRef = useRef(false);
  const prevMediaTypeRef = useRef(media.type);
  mediaIsPlayingRef.current = !!room?.media?.isPlaying;

  // Whether we are displaying a live WebRTC screen or P2P local stream
  const isScreenShareActive = media.type === 'screen_share';
  const isGuestReceivingLocalP2P = !isHost && media.type === 'local_file' && !guestLocalBlobUrl;
  const isDisplayingWebRtcStream = (isScreenShareActive && (isScreenSharing || !!remoteScreenStream)) || (isGuestReceivingLocalP2P && !!remoteScreenStream);
  const isLiveStreamActive = isScreenShareActive || isGuestReceivingLocalP2P;

  // Relay fallback view: P2P never connected, but server-relayed frames are flowing
  const isRelayViewing =
    !isScreenSharing && (FORCE_RELAY || !remoteScreenStream) && isRemoteRelayActive &&
    (isScreenShareActive || isGuestReceivingLocalP2P);

  // Auto-stop our screen share only when room media TRANSITIONS away from screen_share.
  // (Must not fire during the startup window where sharing already began locally but the
  // server has not yet confirmed media.type === 'screen_share' - that race killed Share Tab instantly.)
  useEffect(() => {
    const prevType = prevMediaTypeRef.current;
    prevMediaTypeRef.current = media.type;
    if (isScreenSharing && prevType === 'screen_share' && media.type !== 'screen_share') {
      stopScreenShare();
    }
  }, [media.type, isScreenSharing, stopScreenShare]);

  // For local files: Host uses media.url (or local blob); Guest uses matching guestLocalBlobUrl if chosen
  const effectiveVideoSrc = media.type === 'local_file'
    ? (isHost ? media.url : (guestLocalBlobUrl || ''))
    : media.url;

  const isMissingGuestLocalFile = media.type === 'local_file' && !isHost && !guestLocalBlobUrl && !remoteScreenStream;

  const speedOptions = [
    { label: '0.5x', value: 0.5 },
    { label: '0.75x', value: 0.75 },
    { label: '1.0x (Normal)', value: 1.0 },
    { label: '1.25x', value: 1.25 },
    { label: '1.5x', value: 1.5 },
    { label: '1.75x', value: 1.75 },
    { label: '2.0x', value: 2.0 },
  ];

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fullscreen state listener (cross-browser)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(
        document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Clear local buffer flag when media URL changes
  useEffect(() => {
    setIsBuffering(false);
  }, [media.url]);

  // 1. YouTube IFrame API Script Loader with active polling guarantee
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsYtApiLoaded(true);
      return;
    }

    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }

    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousOnReady) previousOnReady();
      setIsYtApiLoaded(true);
    };

    const pollYt = setInterval(() => {
      if (window.YT && typeof window.YT.Player === 'function') {
        setIsYtApiLoaded(true);
        clearInterval(pollYt);
      }
    }, 150);

    return () => clearInterval(pollYt);
  }, []);

  // 2. Bind YouTube Player API to the rendered <iframe>
  useEffect(() => {
    if (media.type !== 'youtube' || !ytVideoId || !isYtApiLoaded || isDisplayingWebRtcStream) {
      ytPlayerRef.current = null;
      return;
    }

    let isMounted = true;

    try {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (e) {}
        ytPlayerRef.current = null;
      }

      ytPlayerRef.current = new window.YT.Player('yt-player-iframe', {
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            try {
              if (typeof room?.media?.currentTime === 'number' && room.media.currentTime > 0) {
                event.target.seekTo(room.media.currentTime, true);
              }
              if (room?.media?.isPlaying) {
                event.target.playVideo();
                setIsPlaying(true);
              } else {
                event.target.pauseVideo();
                setIsPlaying(false);
              }
              setDuration(event.target.getDuration() || 0);
            } catch (e) {}
          },
          onError: (event) => {
            console.warn('[YouTube Player Error]:', event.data);
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            const state = event.data;
            const player = ytPlayerRef.current;
            if (!player) return;

            if (state === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setIsBuffering(false);
            } else if (state === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (state === window.YT.PlayerState.BUFFERING) {
              setIsBuffering(true);
            } else if (state === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              setIsBuffering(false);
            }
          }
        }
      });
    } catch (err) {
      console.warn('Failed to bind YT player to iframe:', err);
    }

    return () => {
      isMounted = false;
      ytPlayerRef.current = null;
    };
  }, [media.type, ytVideoId, isYtApiLoaded, isDisplayingWebRtcStream]);

  // YouTube Poll current time & duration
  useEffect(() => {
    if (media.type !== 'youtube' || !ytPlayerRef.current || isDraggingSeekRef.current) return;

    const interval = setInterval(() => {
      const player = ytPlayerRef.current;
      if (player && typeof player.getCurrentTime === 'function') {
        try {
          const cur = player.getCurrentTime();
          const dur = player.getDuration();
          if (typeof cur === 'number') setCurrentTime(cur);
          if (typeof dur === 'number' && dur > 0) setDuration(dur);
        } catch (e) {}
      }
    }, 500);

    return () => clearInterval(interval);
  }, [media.type, isPlaying]);

  // 3. Setup HLS or direct HTML5 Video Source
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isDisplayingWebRtcStream || media.type === 'youtube' || !effectiveVideoSrc) return;

    if (media.type === 'video_url' || media.type === 'local_file') {
      // Clear any prior WebRTC stream object so browser loads src
      if (video.srcObject) {
        video.srcObject = null;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const isHls = effectiveVideoSrc.includes('.m3u8');
      if (isHls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hls.loadSource(effectiveVideoSrc);
        hls.attachMedia(video);
        hlsRef.current = hls;

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
        });
      } else {
        video.src = effectiveVideoSrc;
        try { video.load(); } catch (e) {}
      }

      video.playbackRate = media.playbackRate || 1.0;
      setPlaybackRate(media.playbackRate || 1.0);

      // Read play state via ref: having it as a dependency re-ran this whole effect
      // (HLS destroy + video.load()) on every single play/pause, resetting position.
      if (mediaIsPlayingRef.current) {
        video.play().catch(() => {});
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [media.type, effectiveVideoSrc, isDisplayingWebRtcStream]);

  // 4. Host Local Video P2P Stream Capture
  useEffect(() => {
    if (isHost && media.type === 'local_file' && videoRef.current) {
      const handleCanPlay = () => {
        startLocalVideoStream(videoRef.current);
      };
      const v = videoRef.current;
      v.addEventListener('canplay', handleCanPlay);
      if (v.readyState >= 2) {
        startLocalVideoStream(v);
      }
      return () => {
        v.removeEventListener('canplay', handleCanPlay);
      };
    } else if (isStreamingLocalVideo && media.type !== 'local_file') {
      stopLocalVideoStream();
    }
  }, [isHost, media.type, isStreamingLocalVideo]);

  // 5. Handle Live Stream (Screen Share & P2P Local Video) binding to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isScreenShareActive && isScreenSharing && screenStream) {
      if (video.src) video.removeAttribute('src');
      const videoOnlyLocal = new MediaStream(screenStream.getVideoTracks());
      video.srcObject = videoOnlyLocal;
      video.muted = true;
      video.volume = 0;
      video.play().catch(() => {});
    } else if (isDisplayingWebRtcStream && remoteScreenStream) {
      if (video.src) video.removeAttribute('src');
      const vTracks = remoteScreenStream.getVideoTracks();
      if (vTracks.length > 0) {
        const videoOnlyStream = new MediaStream(vTracks);
        video.srcObject = videoOnlyStream;
        video.muted = true;
        video.volume = 0;
        video.play().catch(() => {});

        // Wake up video element on first network frame Arrival
        vTracks.forEach(t => {
          t.onunmute = () => {
            if (videoRef.current) videoRef.current.play().catch(() => {});
          };
        });
      }
    } else if (!isDisplayingWebRtcStream) {
      if (video.srcObject) {
        video.srcObject = null;
      }
    }
  }, [isScreenShareActive, isScreenSharing, screenStream, remoteScreenStream, isDisplayingWebRtcStream]);

  // 5b. Auto-request stream renegotiation if screen share is active but remote stream not received yet
  useEffect(() => {
    if (isScreenShareActive && !isScreenSharing && !remoteScreenStream && socket) {
      const timer1 = setTimeout(() => {
        if (!remoteScreenStream && socket) {
          socket.emit('request_stream_renegotiation');
        }
      }, 1000);

      const interval = setInterval(() => {
        if (!remoteScreenStream && socket) {
          socket.emit('request_stream_renegotiation');
        }
      }, 3500);

      return () => {
        clearTimeout(timer1);
        clearInterval(interval);
      };
    }
  }, [isScreenShareActive, isScreenSharing, remoteScreenStream, socket]);

  // 5c. Relay Fallback: when a live stream (screen share / host local video) is
  // active but WebRTC P2P never connects (long-distance through tunnels with
  // strict NATs), switch to server-relayed JPEG frames over the same WebSocket
  // path used for chat/signaling - which always works.
  useEffect(() => {
    // Debug mode: always ride the relay regardless of P2P state
    if (FORCE_RELAY) {
      enableRelayFallback(true);
      return undefined;
    }

    const wantsLiveFeed = (isScreenShareActive && !isScreenSharing) ||
      (media.type === 'local_file' && !isHost && !guestLocalBlobUrl);
    const needsFallback = wantsLiveFeed && !remoteScreenStream;

    if (!needsFallback) {
      enableRelayFallback(false);
      return undefined;
    }
    // Give P2P a fair window to connect before falling back
    const t = setTimeout(() => enableRelayFallback(true), 2000);
    return () => clearTimeout(t);
  }, [isScreenShareActive, isScreenSharing, media.type, isHost, guestLocalBlobUrl, remoteScreenStream, enableRelayFallback]);

  // 6. Socket events for Play/Pause/Seek sync
  useEffect(() => {
    if (!socket) return;

    const handlePlay = ({ currentTime: serverTime }) => {
      isInternalUpdateRef.current = true;

      // Handle YouTube Player
      if (media.type === 'youtube' && ytPlayerRef.current) {
        try {
          const player = ytPlayerRef.current;
          if (typeof serverTime === 'number' && serverTime > 0 && Math.abs(player.getCurrentTime() - serverTime) > 2.5) {
            player.seekTo(serverTime, true);
          }
          player.playVideo();
          setIsPlaying(true);
        } catch (e) {}
      }

      // Handle HTML5 Video
      const video = videoRef.current;
      if (video && media.type !== 'youtube') {
        if (typeof serverTime === 'number' && serverTime > 0 && Math.abs(video.currentTime - serverTime) > 2.0) {
          video.currentTime = serverTime;
        }
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {});
      }

      setTimeout(() => { isInternalUpdateRef.current = false; }, 1200);
    };

    const handlePause = ({ currentTime: serverTime }) => {
      isInternalUpdateRef.current = true;

      // Handle YouTube Player
      if (media.type === 'youtube' && ytPlayerRef.current) {
        try {
          const player = ytPlayerRef.current;
          player.pauseVideo();
          if (typeof serverTime === 'number' && serverTime > 0 && Math.abs(player.getCurrentTime() - serverTime) > 1.5) {
            player.seekTo(serverTime, true);
          }
          setIsPlaying(false);
        } catch (e) {}
      }

      // Handle HTML5 Video
      const video = videoRef.current;
      if (video && media.type !== 'youtube') {
        video.pause();
        setIsPlaying(false);
        if (typeof serverTime === 'number' && serverTime > 0 && Math.abs(video.currentTime - serverTime) > 1.5) {
          video.currentTime = serverTime;
        }
      }

      setTimeout(() => { isInternalUpdateRef.current = false; }, 1200);
    };

    const handleSeek = ({ currentTime: serverTime, isPlaying: autoPlay }) => {
      isInternalUpdateRef.current = true;

      // Handle YouTube Player
      if (media.type === 'youtube' && ytPlayerRef.current) {
        try {
          const player = ytPlayerRef.current;
          if (typeof serverTime === 'number' && !isNaN(serverTime)) {
            player.seekTo(serverTime, true);
            setCurrentTime(serverTime);
          }
          if (autoPlay) {
            player.playVideo();
            setIsPlaying(true);
          } else {
            player.pauseVideo();
            setIsPlaying(false);
          }
        } catch (e) {}
      }

      // Handle HTML5 Video
      const video = videoRef.current;
      if (video && media.type !== 'youtube') {
        if (typeof serverTime === 'number' && !isNaN(serverTime)) {
          video.currentTime = serverTime;
          setCurrentTime(serverTime);
        }
        if (autoPlay) {
          video.play().then(() => {
            setIsPlaying(true);
          }).catch(() => {});
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }

      setTimeout(() => { isInternalUpdateRef.current = false; }, 1200);
    };

    const handleRate = ({ playbackRate: newRate }) => {
      if (media.type === 'youtube' && ytPlayerRef.current) {
        try { ytPlayerRef.current.setPlaybackRate(newRate); } catch (e) {}
      }
      const video = videoRef.current;
      if (video) {
        video.playbackRate = newRate;
      }
      setPlaybackRate(newRate);
    };

    const handleBufferPause = () => {
      if (media.type === 'youtube' && ytPlayerRef.current) {
        try { ytPlayerRef.current.pauseVideo(); } catch (e) {}
      }
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
      setIsPlaying(false);
    };

    const handleBufferReady = ({ resumeInMs, targetTime }) => {
      if (typeof targetTime === 'number') {
        if (media.type === 'youtube' && ytPlayerRef.current) {
          try {
            if (Math.abs(ytPlayerRef.current.getCurrentTime() - targetTime) > 1.5) {
              ytPlayerRef.current.seekTo(targetTime, true);
            }
          } catch (e) {}
        }
        const video = videoRef.current;
        if (video && Math.abs(video.currentTime - targetTime) > 1.5) {
          video.currentTime = targetTime;
        }
      }

      setTimeout(() => {
        if (room?.media?.isPlaying) {
          if (media.type === 'youtube' && ytPlayerRef.current) {
            try { ytPlayerRef.current.playVideo(); } catch (e) {}
          }
          const video = videoRef.current;
          if (video) {
            video.play().catch(() => {});
          }
          setIsPlaying(true);
        }
      }, resumeInMs || 0);
    };

    socket.on('media_play', handlePlay);
    socket.on('media_pause', handlePause);
    socket.on('media_seek', handleSeek);
    socket.on('media_rate', handleRate);
    socket.on('buffer_sync_pause', handleBufferPause);
    socket.on('buffer_sync_ready', handleBufferReady);

    return () => {
      socket.off('media_play', handlePlay);
      socket.off('media_pause', handlePause);
      socket.off('media_seek', handleSeek);
      socket.off('media_rate', handleRate);
      socket.off('buffer_sync_pause', handleBufferPause);
      socket.off('buffer_sync_ready', handleBufferReady);
    };
  }, [socket, room?.media?.isPlaying, media.type, isDisplayingWebRtcStream]);

  // Authoritative drift check for Guests (HTML5 + YouTube)
  useEffect(() => {
    if (isHost || !room?.media?.isPlaying || isDisplayingWebRtcStream || isDraggingSeekRef.current) return;

    const interval = setInterval(() => {
      if (!room?.media || !room.media.lastUpdated) return;

      const elapsed = (Date.now() - room.media.lastUpdated) / 1000;
      const expectedTime = room.media.currentTime + elapsed * (room.media.playbackRate || 1.0);

      // Check YouTube drift
      if (media.type === 'youtube' && ytPlayerRef.current) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime();
          if (typeof cur === 'number' && Math.abs(cur - expectedTime) > 1.8) {
            ytPlayerRef.current.seekTo(expectedTime, true);
          }
        } catch (e) {}
        return;
      }

      // Check HTML5 Video drift
      const video = videoRef.current;
      if (video && media.type !== 'youtube' && effectiveVideoSrc) {
        const drift = Math.abs(video.currentTime - expectedTime);
        if (drift > 1.8) {
          video.currentTime = expectedTime;
        }
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isHost, room?.media, media.type, isDisplayingWebRtcStream, effectiveVideoSrc]);

  // Cross-browser Fullscreen Helpers
  const enterFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    } else if (videoRef.current?.webkitEnterFullscreen) {
      videoRef.current.webkitEnterFullscreen();
    }

    try {
      if (screen.orientation && screen.orientation.lock && window.innerWidth < 1024) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }

    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (e) {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    const isFull = !!(
      document.fullscreenElement || 
      document.webkitFullscreenElement || 
      document.mozFullScreenElement || 
      document.msFullscreenElement
    );
    if (!isFull) {
      enterFullscreen();
    } else {
      exitFullscreen();
    }
  }, [enterFullscreen, exitFullscreen]);

  // Double-press button helpers to prevent accidental skips on mobile / desktop
  const handleRewindButton = (e) => {
    e?.stopPropagation();
    if (unlockAudioEngine) unlockAudioEngine();
    if (rewindPressed) {
      if (rewindTimerRef.current) clearTimeout(rewindTimerRef.current);
      setRewindPressed(false);
      handleSkip(-10);
      setTapFeedback({ type: 'rewind' });
      setTimeout(() => setTapFeedback(null), 750);
    } else {
      setRewindPressed(true);
      if (forwardPressed) {
        setForwardPressed(false);
        if (forwardTimerRef.current) clearTimeout(forwardTimerRef.current);
      }
      if (rewindTimerRef.current) clearTimeout(rewindTimerRef.current);
      rewindTimerRef.current = setTimeout(() => {
        setRewindPressed(false);
      }, 1500);
    }
  };

  const handleForwardButton = (e) => {
    e?.stopPropagation();
    if (unlockAudioEngine) unlockAudioEngine();
    if (forwardPressed) {
      if (forwardTimerRef.current) clearTimeout(forwardTimerRef.current);
      setForwardPressed(false);
      handleSkip(10);
      setTapFeedback({ type: 'forward' });
      setTimeout(() => setTapFeedback(null), 750);
    } else {
      setForwardPressed(true);
      if (rewindPressed) {
        setRewindPressed(false);
        if (rewindTimerRef.current) clearTimeout(rewindTimerRef.current);
      }
      if (forwardTimerRef.current) clearTimeout(forwardTimerRef.current);
      forwardTimerRef.current = setTimeout(() => {
        setForwardPressed(false);
      }, 1500);
    }
  };

  // Touch Double Tap on Mobile (Requires 2 distinct taps to skip; single tap ONLY toggles controls)
  const handleTouchEnd = (e) => {
    if (unlockAudioEngine) unlockAudioEngine();

    // Ignore taps that originated on controls (buttons/sliders) - they used to bubble up
    // here, hiding the control bar and registering false double-tap skips
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('button, input, a, select, textarea, label')) {
      return;
    }

    const now = Date.now();
    const touch = e.changedTouches[0];
    if (!touch || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const width = rect.width;

    if (now - lastTapRef.current.time < 350 && Math.abs(touchX - lastTapRef.current.x) < 80) {
      // Double Tap detected!
      if (touchX < width * 0.35) {
        // Double tap left -> Rewind
        handleSkip(-10);
        setTapFeedback({ type: 'rewind' });
        setTimeout(() => setTapFeedback(null), 750);
      } else if (touchX > width * 0.65) {
        // Double tap right -> Fast Forward
        handleSkip(10);
        setTapFeedback({ type: 'forward' });
        setTimeout(() => setTapFeedback(null), 750);
      } else {
        // Double tap center -> Fullscreen Toggle (Enter or Exit)
        const willBeFull = !isFullscreen;
        toggleFullscreen();
        setTapFeedback({ type: willBeFull ? 'fullscreen' : 'exit_fullscreen' });
        setTimeout(() => setTapFeedback(null), 750);
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // Single Tap -> strictly toggles controls visibility; NEVER skips!
      lastTapRef.current = { time: now, x: touchX };
      setShowControls(prev => !prev);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying && !showSpeedMenu) setShowControls(false);
      }, 4000);
    }
  };

  const handleDoubleClick = (e) => {
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('button, input, a, select, textarea, label')) {
      return;
    }
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (clickX < width * 0.35) {
      handleSkip(-10);
      setTapFeedback({ type: 'rewind' });
      setTimeout(() => setTapFeedback(null), 750);
    } else if (clickX > width * 0.65) {
      handleSkip(10);
      setTapFeedback({ type: 'forward' });
      setTimeout(() => setTapFeedback(null), 750);
    } else {
      toggleFullscreen();
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          handleSkip(-10);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          handleSkip(10);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isFullscreen, isMuted, duration, isHost, room?.hostOnlyControl, media.type, toggleFullscreen]);

  const handleForceResync = () => {
    if (!room?.media || isHost) return;
    const elapsed = (Date.now() - room.media.lastUpdated) / 1000;
    const expectedTime = room.media.currentTime + elapsed * (room.media.playbackRate || 1.0);

    if (media.type === 'youtube' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.seekTo(expectedTime, true);
        if (room.media.isPlaying) ytPlayerRef.current.playVideo();
      } catch (e) {}
      return;
    }

    const video = videoRef.current;
    if (video) {
      video.currentTime = expectedTime;
      if (room.media.isPlaying) video.play().catch(() => {});
    }
  };

  const handleTogglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (e) {}
  };

  const handleTimeUpdate = () => {
    if (isLiveStreamActive || isDisplayingWebRtcStream || isDraggingSeekRef.current || media.type === 'youtube') return;
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
    }
  };

  const handleNativePlay = () => {
    setIsPlaying(true);
    if (!isInternalUpdateRef.current && !isLiveStreamActive && !isDisplayingWebRtcStream && media.type !== 'youtube') {
      if (!isHost && room?.hostOnlyControl) return;
      const video = videoRef.current;
      if (video) {
        playMedia(video.currentTime);
      }
    }
  };

  const handleNativePause = () => {
    setIsPlaying(false);
    if (!isInternalUpdateRef.current && !isLiveStreamActive && !isDisplayingWebRtcStream && media.type !== 'youtube') {
      if (!isHost && room?.hostOnlyControl) return;
      const video = videoRef.current;
      if (video) {
        pauseMedia(video.currentTime);
      }
    }
  };

  const handleEnded = () => {
    if (isLiveStreamActive || (!isHost && room?.hostOnlyControl)) return;
    setIsPlaying(false);
    const video = videoRef.current;
    pauseMedia(video ? video.currentTime : duration);
  };

  const handleWaiting = () => {
    if (isLiveStreamActive || isDisplayingWebRtcStream || media.type === 'screen_share' || media.type === 'youtube') return;
    setIsBuffering(true);
    const video = videoRef.current;
    reportBufferState(true, video ? video.currentTime : 0);
  };

  const handlePlaying = () => {
    if (isLiveStreamActive || isDisplayingWebRtcStream || media.type === 'screen_share' || media.type === 'youtube') return;
    setIsBuffering(false);
    const video = videoRef.current;
    reportBufferState(false, video ? video.currentTime : 0);
  };

  const togglePlayPause = () => {
    if (isDisplayingWebRtcStream) return;
    if (!isHost && room?.hostOnlyControl) return;

    if (media.type === 'youtube') {
      const player = ytPlayerRef.current;
      isInternalUpdateRef.current = true;
      setTimeout(() => { isInternalUpdateRef.current = false; }, 800);

      if (isPlaying) {
        if (player && typeof player.pauseVideo === 'function') {
          try { player.pauseVideo(); } catch (e) {}
        }
        const t = (player && typeof player.getCurrentTime === 'function') ? player.getCurrentTime() : currentTime;
        pauseMedia(t);
        setIsPlaying(false);
      } else {
        if (player && typeof player.playVideo === 'function') {
          try { player.playVideo(); } catch (e) {}
        }
        const t = (player && typeof player.getCurrentTime === 'function') ? player.getCurrentTime() : currentTime;
        playMedia(t);
        setIsPlaying(true);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Suppress the native play/pause event handlers, otherwise each click here
    // emits the sync event twice (once explicitly + once via handleNativePlay/Pause)
    isInternalUpdateRef.current = true;
    setTimeout(() => { isInternalUpdateRef.current = false; }, 400);

    if (isPlaying) {
      video.pause();
      pauseMedia(video.currentTime);
    } else {
      video.play().catch(() => {});
      playMedia(video.currentTime);
    }
  };

  const handleSeekChange = (e) => {
    if (isDisplayingWebRtcStream) return;
    isDraggingSeekRef.current = true;
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
  };

  const handleSeekCommit = () => {
    if (isDisplayingWebRtcStream) return;
    isDraggingSeekRef.current = false;
    if (!isHost && room?.hostOnlyControl) return;

    if (media.type === 'youtube' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.seekTo(currentTime, true);
        seekMedia(currentTime, isPlaying);
      } catch (e) {}
      return;
    }

    const video = videoRef.current;
    if (video) {
      video.currentTime = currentTime;
      seekMedia(currentTime, isPlaying);
    }
  };

  const handleSkip = (seconds) => {
    if (isDisplayingWebRtcStream) return;
    if (!isHost && room?.hostOnlyControl) return;

    if (media.type === 'youtube' && ytPlayerRef.current) {
      try {
        const cur = ytPlayerRef.current.getCurrentTime() || 0;
        const target = Math.min(Math.max(0, cur + seconds), duration || 10000);
        ytPlayerRef.current.seekTo(target, true);
        seekMedia(target, isPlaying);
      } catch (e) {}
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(Math.max(0, video.currentTime + seconds), duration || 10000);
    video.currentTime = target;
    seekMedia(target, isPlaying);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);

    if (isDisplayingWebRtcStream) {
      if (setWebRtcVolume) setWebRtcVolume(val);
      if (setWebRtcMuted) setWebRtcMuted(val === 0);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.volume = 0;
      }
      return;
    }

    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = (val === 0);
    }
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      ytPlayerRef.current.setVolume(val * 100);
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);

    if (isDisplayingWebRtcStream) {
      if (setWebRtcMuted) setWebRtcMuted(nextMute);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.volume = 0;
      }
      return;
    }

    if (videoRef.current) {
      videoRef.current.muted = nextMute;
    }
    if (ytPlayerRef.current) {
      if (nextMute) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
    }
  };

  const handleRateSelect = (rate) => {
    if (!isHost && room?.hostOnlyControl) return;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);

    if (media.type === 'youtube' && ytPlayerRef.current) {
      try { ytPlayerRef.current.setPlaybackRate(rate); } catch (e) {}
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    changePlaybackRate(rate);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSpeedMenu) setShowControls(false);
    }, 3500);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      onClick={() => {
        if (unlockAudioEngine) unlockAudioEngine();
      }}
      onMouseLeave={() => isPlaying && !showSpeedMenu && setShowControls(false)}
      className={`relative w-full h-full bg-[#050507] flex items-center justify-center overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : ''
      }`}
    >
      {/* Tap to Unmute / Unlock Audio on Mobile Banner */}
      {isAudioBlocked && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (unlockAudioEngine) unlockAudioEngine();
          }}
          className="absolute top-4 inset-x-4 sm:inset-x-auto sm:right-4 z-50 flex items-center justify-center animate-bounce cursor-pointer"
        >
          <div className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded-2xl font-extrabold text-xs flex items-center gap-2 shadow-2xl border-2 border-amber-300">
            <Volume2 className="w-4 h-4 animate-pulse fill-black" />
            <span>Tap here to enable stream audio 🔊</span>
          </div>
        </div>
      )}
      {/* HTML5 Video, Local File, Live Tab Share & Remote P2P Stream */}
      {(media.type === 'video_url' || (media.type === 'local_file' && (!isMissingGuestLocalFile || isDisplayingWebRtcStream)) || isDisplayingWebRtcStream) && (
        <video
          ref={videoRef}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handleNativePlay}
          onPause={handleNativePause}
          onEnded={handleEnded}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onLoadedMetadata={() => {
            if (videoRef.current && isDisplayingWebRtcStream) {
              videoRef.current.muted = true;
              videoRef.current.play().catch(() => {});
            }
          }}
          onClick={togglePlayPause}
          autoPlay
          playsInline
          muted={isDisplayingWebRtcStream ? true : isMuted}
          webkit-playsinline="true"
          x5-playsinline="true"
          className={`w-full h-full cursor-pointer transition-all ${
            fitMode === 'cover' ? 'object-cover' : 'object-contain'
          }`}
        />
      )}

      {/* Server-Relayed Screen (automatic fallback when P2P cannot connect, e.g. long-distance over tunnel) */}
      {isRelayViewing && (
        <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
          <div
            ref={(node) => {
              if (node && getRelayElement && node.childElementCount === 0) {
                node.appendChild(getRelayElement());
              }
            }}
            className="w-full h-full"
          />
          {!isFullscreen && (
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-cyan-950/85 border border-cyan-500/50 text-cyan-200 text-[11px] font-bold flex items-center gap-2 shadow-lg backdrop-blur-md transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}>
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>
                Relay Mode • {isGuestReceivingLocalP2P ? 'Movie Stream' : 'Screen'} via Server
                <span className="ml-1.5 font-normal text-cyan-300/80">(direct P2P unavailable — ~2s delay, tap for audio)</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Guest Local File Selection & P2P Stream Connecting Card */}
      {isMissingGuestLocalFile && !isDisplayingWebRtcStream && !isRelayViewing && (
        <div className="text-center p-6 sm:p-8 max-w-md z-10 rounded-2xl border-2 border-emerald-500/40 bg-[#121215] shadow-2xl mx-4 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <HardDrive className="w-7 h-7" />
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white mb-2">Host Is Playing Local Video</h2>
          <p className="text-xs text-indigo-300 font-mono font-bold break-all mb-3 bg-[#18181b] p-2 rounded-lg border border-[#27272a]">
            {media.title || 'Local Movie File'}
          </p>

          <div className="p-3 bg-[#18181b] border border-[#27272a] rounded-xl mb-4 flex items-center gap-2.5 text-left">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            <div className="text-[11px] text-slate-300">
              <span className="font-bold text-white block">Connecting to Host's Live Stream...</span>
              <span>Host's video will stream directly to you automatically.</span>
            </div>
          </div>

          <p className="text-[#71717a] text-[11px] mb-4 leading-relaxed">
            Have this exact movie file on your device? Select it to watch in full 4K quality with 0 internet data usage.
          </p>

          <button
            onClick={onSelectLocalFile}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#e4e4e7] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-black" />
            <span>Select Matching File (Optional 4K)</span>
          </button>
        </div>
      )}

      {/* Synchronized YouTube IFrame Player Slot */}
      {media.type === 'youtube' && !isDisplayingWebRtcStream && (
        <div className="w-full h-full flex items-center justify-center bg-black relative overflow-hidden">
          <iframe
            id="yt-player-iframe"
            key={ytVideoId}
            src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?enablejsapi=1&autoplay=1&controls=1&rel=0&playsinline=1`}
            title="YouTube Video Player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0 absolute inset-0 pointer-events-auto"
          />
        </div>
      )}

      {/* Double Tap Feedback Overlay */}
      {tapFeedback && (
        <div className={`absolute inset-y-0 flex items-center justify-center pointer-events-none z-40 animate-ping ${
          tapFeedback.type === 'rewind' ? 'left-8 text-white' : tapFeedback.type === 'forward' ? 'right-8 text-white' : 'inset-x-0 text-white'
        }`}>
          <div className="bg-black/85 border border-white/30 px-5 py-2.5 rounded-full font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-2xl backdrop-blur-md">
            {tapFeedback.type === 'rewind' && <RotateCcw className="w-4 h-4 text-indigo-400" />}
            {tapFeedback.type === 'forward' && <RotateCw className="w-4 h-4 text-indigo-400" />}
            {tapFeedback.type === 'fullscreen' && <Maximize2 className="w-4 h-4 text-emerald-400" />}
            {tapFeedback.type === 'exit_fullscreen' && <Minimize2 className="w-4 h-4 text-amber-400" />}
            <span>
              {tapFeedback.type === 'rewind' 
                ? '-10s' 
                : tapFeedback.type === 'forward' 
                ? '+10s' 
                : tapFeedback.type === 'fullscreen' 
                ? 'Entered Fullscreen' 
                : 'Exited Fullscreen'}
            </span>
          </div>
        </div>
      )}

      {/* Screen Sharing / P2P Stream Active Badge (Hidden in Fullscreen for clean view) */}
      {isDisplayingWebRtcStream && !isFullscreen && (
        <div className={`absolute top-4 left-4 z-30 transition-opacity duration-300 flex flex-col gap-2 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <div className="px-3 py-1 rounded-lg bg-purple-950/85 border border-purple-500/50 text-purple-200 text-xs font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
            {isGuestReceivingLocalP2P ? (
              <>
                <HardDrive className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>P2P Stream: {media.title || 'Host Local Video'}</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span>
                  Live Screen Share ({isScreenSharing ? 'Broadcasting' : 'Viewing'})
                  {isScreenSharing && (
                    <span className={`ml-1.5 font-normal ${screenShareHasAudio ? 'text-emerald-300' : 'text-amber-300 font-bold'}`}>
                      • {screenShareHasAudio ? (screenAudioMuted ? 'Tab Audio Muted' : 'Tab Audio Live 🔊') : 'No Tab Audio ⚠️'}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Host Warning if Sharing without Tab Audio */}
          {isScreenSharing && !screenShareHasAudio && (
            <button
              onClick={async () => {
                const stream = await startScreenShare();
                if (stream) {
                  changeMedia('screen_share', 'Screen Share Stream', `${userName || 'Host'}'s Screen Share`);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-950/90 hover:bg-amber-900 border-2 border-amber-500/70 text-amber-200 text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all cursor-pointer pointer-events-auto"
              title="Click to re-share tab and make sure 'Also share tab audio' is checked"
            >
              <span>⚠️ No Tab Audio Detected</span>
              <span className="bg-amber-400 hover:bg-amber-300 text-black px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase shadow">
                Re-Share with Audio
              </span>
            </button>
          )}
        </div>
      )}

      {/* Optional Matching File Switcher for Guest when Watching P2P Stream (Hidden in Fullscreen) */}
      {isGuestReceivingLocalP2P && onSelectLocalFile && !isFullscreen && (
        <div className={`absolute top-4 right-4 z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <button
            onClick={onSelectLocalFile}
            className="px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/90 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all cursor-pointer"
            title="Have this exact movie file on your device? Load it to watch in full 4K quality with 0 bandwidth"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Match Local File (4K 0-Lag)</span>
            <span className="sm:hidden">Match File</span>
          </button>
        </div>
      )}

      {/* Sync Status Badge for Guests (Hidden in Fullscreen) */}
      {!isHost && media.type !== 'none' && !isDisplayingWebRtcStream && !isFullscreen && (
        <div className={`absolute top-3.5 right-3.5 z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <button
            onClick={handleForceResync}
            title="Click to force re-sync with Host"
            className="px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/90 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all cursor-pointer group"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400 group-hover:hidden" />
            <RefreshCw className="w-3 h-3 text-emerald-400 hidden group-hover:block group-hover:animate-spin" />
            <span>Synced to Host</span>
          </button>
        </div>
      )}

      {/* Screen Share Standby / Waiting State Card */}
      {isScreenShareActive && !isScreenSharing && !remoteScreenStream && !isRelayViewing && (
        <div className="text-center p-6 sm:p-8 max-w-lg z-10 rounded-2xl border-2 border-purple-500/40 bg-[#121215] shadow-2xl mx-4 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-7 h-7 animate-pulse text-purple-400" />
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white mb-2">Live Screen Share</h2>
          <p className="text-[#a1a1aa] text-xs sm:text-sm mb-4 leading-relaxed">
            {isHost
              ? 'Click below to choose a browser tab, window, or desktop to share.'
              : "Connecting to friend's live screen feed..."}
          </p>

          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={async () => {
                  const stream = await startScreenShare();
                  if (stream) {
                    changeMedia('screen_share', 'Screen Share Stream', `${userName || 'Host'}'s Screen Share`);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow transition-all cursor-pointer transform active:scale-95"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Start Sharing Screen / Tab Now</span>
              </button>
              <button
                onClick={() => changeMedia('none', '', '')}
                className="px-3.5 py-2 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-[#52525b] transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (socket) socket.emit('request_stream_renegotiation');
              }}
              className="px-4 py-2 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-bold flex items-center gap-2 mx-auto shadow transition-all cursor-pointer transform active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Tap to Connect / Refresh Stream</span>
            </button>
          )}
        </div>
      )}

      {/* Empty State / Standby Screen */}
      {media.type === 'none' && !isDisplayingWebRtcStream && (
        <div className="text-center p-6 sm:p-8 max-w-lg z-10 rounded-3xl glass-panel border border-white/[0.12] shadow-glass-card mx-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 shadow-glass-glow">
            <Tv className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mb-2 font-display">No Video Stream Active</h2>
          <p className="text-slate-400 text-xs sm:text-sm mb-6 leading-relaxed">
            {isHost 
              ? 'Paste a YouTube or video link above, broadcast a browser tab, or load a local movie file.' 
              : 'Waiting for the host to select a movie or anime stream...'}
          </p>

          {/* Direct YouTube / Stream URL Paste Input in Center Card */}
          {(isHost || !room?.hostOnlyControl) && (
            <form onSubmit={handleEmptyStateLoad} className="w-full max-w-md mx-auto mb-5 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-red-400">
                    <Youtube className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={emptyStateUrl}
                    onChange={(e) => setEmptyStateUrl(e.target.value)}
                    placeholder="Paste YouTube Link or Video Stream URL..."
                    style={{ fontSize: '14px' }}
                    className="w-full pl-10 pr-3 py-2.5 glass-input rounded-xl text-xs text-white placeholder-slate-500 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!emptyStateUrl.trim()}
                  className="px-4 py-2.5 btn-cinema-primary text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-glass-glow disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Play</span>
                </button>
              </div>
            </form>
          )}

          {(isHost || !room?.hostOnlyControl) && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1 border-t border-white/[0.06]">
              <button
                onClick={async () => {
                  const stream = await startScreenShare();
                  if (stream) {
                    changeMedia('screen_share', 'Screen Share Stream', `${userName || 'Host'}'s Screen Share`);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-bold flex items-center gap-2 shadow-purple-glow transition-all cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Live Tab Share</span>
              </button>

              {onSelectLocalFile && (
                <button
                  onClick={onSelectLocalFile}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-2 shadow-emerald-glow transition-all cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Local Video File</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Buffering Lockstep Banner */}
      {(isBuffering || bufferingState.isBuffering) && !isDisplayingWebRtcStream && media.type !== 'youtube' && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-30 pointer-events-none p-4 text-center">
          <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-indigo-400 animate-spin mb-3" />
          <div className="px-5 py-2.5 rounded-2xl glass-panel border border-amber-500/50 text-white font-bold text-xs sm:text-sm shadow-2xl flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>{bufferingState.text || 'Syncing buffer with friends...'}</span>
          </div>
        </div>
      )}

      {/* Big Center Play / Resume Button Overlay when Paused */}
      {!isPlaying && media.type !== 'none' && !isDisplayingWebRtcStream && !isMissingGuestLocalFile && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            togglePlayPause();
          }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 hover:bg-black/30 transition-all cursor-pointer group pointer-events-auto select-none"
        >
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/50 group-hover:scale-110 group-active:scale-95 transition-all border border-white/30 backdrop-blur-md mb-3">
            <Play className="w-9 h-9 sm:w-10 sm:h-10 fill-white ml-1.5" />
          </div>
          <span className="px-4 py-1.5 rounded-full bg-black/70 text-white text-xs font-bold border border-white/20 shadow-lg backdrop-blur-md">
            Click to Start Video ▶
          </span>
        </div>
      )}

      {/* High-Visibility Custom Playback Controls Overlay (Available for YouTube, local movies, and streams) */}
      {media.type !== 'none' && !isDisplayingWebRtcStream && !isMissingGuestLocalFile && (
        <div 
          className={`absolute bottom-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 z-20 ${
            showControls || showSpeedMenu ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Floating Glass Control Deck */}
          <div className="glass-dock rounded-2xl p-3 sm:p-4 border border-white/[0.12] shadow-deck-glow">
            {/* Timeline Bar with Drag Commit */}
            <div className="relative mb-3 flex items-center group/seek">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeekChange}
                onMouseUp={handleSeekCommit}
                onTouchEnd={handleSeekCommit}
                onKeyUp={handleSeekCommit}
                className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer focus:outline-none cinema-range hover:h-2.5 transition-all"
              />
            </div>

            {/* Controls Bottom Row */}
            <div className="flex items-center justify-between">
              {/* Left: Play/Pause, Skip, Volume, Time Display */}
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={togglePlayPause}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl btn-cinema-primary flex items-center justify-center font-bold shadow-glass-glow transition-transform active:scale-95 cursor-pointer"
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-white" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white ml-0.5" />}
                </button>

                <button
                  onClick={handleRewindButton}
                  className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1 ${
                    rewindPressed 
                      ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow-lg scale-105 animate-pulse' 
                      : 'glass-panel-subtle hover:bg-white/10 text-slate-200 border-white/10'
                  }`}
                  title={rewindPressed ? 'Press again to rewind 10s' : 'Double press to rewind 10s'}
                >
                  <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {rewindPressed && <span className="text-[10px] font-extrabold px-1">-10s</span>}
                </button>

                <button
                  onClick={handleForwardButton}
                  className={`p-1.5 sm:p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1 ${
                    forwardPressed 
                      ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow-lg scale-105 animate-pulse' 
                      : 'glass-panel-subtle hover:bg-white/10 text-slate-200 border-white/10'
                  }`}
                  title={forwardPressed ? 'Press again to forward 10s' : 'Double press to forward 10s'}
                >
                  <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {forwardPressed && <span className="text-[10px] font-extrabold px-1">+10s</span>}
                </button>

                {/* Volume */}
                <div className="hidden md:flex items-center gap-2 glass-panel-subtle border border-white/10 px-3 py-1.5 rounded-xl">
                  <button onClick={toggleMute} className="text-white hover:text-indigo-300 transition-colors cursor-pointer">
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400 cinema-range"
                  />
                </div>

                {/* Timecode */}
                <div className="text-[11px] sm:text-xs font-mono font-bold text-white glass-panel-subtle border border-white/10 px-3 py-1.5 rounded-xl">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-slate-500 mx-1">/</span>
                  <span className="text-slate-400">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Right: PiP, Fit Mode, Speed Menu, Fullscreen */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Picture-in-Picture */}
                {media.type !== 'youtube' && (
                  <button
                    onClick={handleTogglePiP}
                    className="hidden sm:flex p-2 rounded-xl glass-panel-subtle hover:bg-white/10 text-white border border-white/10 transition-all cursor-pointer"
                    title="Picture-in-Picture Mode"
                  >
                    <Tv className="w-4 h-4 text-slate-300" />
                  </button>
                )}

                {/* Fit Mode Toggle */}
                {media.type !== 'youtube' && (
                  <button
                    onClick={() => setFitMode(m => m === 'contain' ? 'cover' : 'contain')}
                    className="hidden sm:flex p-2 rounded-xl glass-panel-subtle hover:bg-white/10 text-white border border-white/10 transition-all cursor-pointer"
                    title={fitMode === 'contain' ? 'Fit to Screen (Contain)' : 'Fill Screen (Cover)'}
                  >
                    <Scaling className="w-4 h-4 text-slate-300" />
                  </button>
                )}

                {/* Custom Dark Speed Popover Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                    className="px-3 py-1.5 rounded-xl glass-panel-subtle hover:bg-white/10 text-white border border-white/10 text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                    title="Playback Speed"
                  >
                    <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{playbackRate}x</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {/* Popover Speed Menu */}
                  {showSpeedMenu && (
                    <>
                      <div 
                        onClick={() => setShowSpeedMenu(false)}
                        className="fixed inset-0 z-40"
                      />
                      <div className="absolute bottom-full right-0 mb-2 w-36 glass-panel border border-white/15 rounded-2xl shadow-2xl p-1.5 z-50 animate-fade-in font-mono text-xs">
                        <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider border-b border-white/[0.08] mb-1">
                          Speed
                        </div>
                        {speedOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleRateSelect(opt.value)}
                            className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs font-bold transition-colors cursor-pointer ${
                              playbackRate === opt.value
                                ? 'btn-cinema-primary'
                                : 'text-white hover:bg-white/[0.08]'
                            }`}
                          >
                            <span>{opt.label}</span>
                            {playbackRate === opt.value && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 sm:p-2 rounded-xl glass-panel-subtle hover:bg-white/10 text-white border border-white/10 transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Fullscreen (F / Double Tap)"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

