import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { playJoinChime, playChatChime, playReactionChime } from '../utils/audioChimes';

const SocketContext = createContext(null);

export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((resolve, reject) => {
      try {
        const successful = document.execCommand('copy');
        textArea.remove();
        successful ? resolve() : reject(new Error('Copy failed'));
      } catch (err) {
        textArea.remove();
        reject(err);
      }
    });
  }
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('wt_username') || '');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('wt_sound') !== 'false');
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Session Rejoining state: ONLY active if the URL contains a ?room= parameter!
  const [isRejoining, setIsRejoining] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');
        // If navigating to a clean URL with no ?room=, clear any previous session & stay on Lobby
        if (!urlRoom) {
          sessionStorage.removeItem('wt_session');
          return false;
        }
        return true;
      } catch (e) {}
    }
    return false;
  });

  const [recentUrls, setRecentUrls] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('wt_recent_urls') || '[]');
      const valid = Array.isArray(stored)
        ? stored.filter((item) => item && item.url && item.type !== 'screen_share' && !item.url.startsWith('blob:'))
        : [];
      return valid;
    } catch (e) {
      return [];
    }
  });

  const clearRecentUrls = useCallback(() => {
    try {
      localStorage.removeItem('wt_recent_urls');
      setRecentUrls([]);
    } catch (e) {}
  }, []);

  const [serverUrl, setServerUrlState] = useState(() => {
    try {
      const saved = localStorage.getItem('wt_server_url');
      if (saved) return saved;
    } catch (e) {}

    if (typeof window !== 'undefined') {
      if (window.location.port === '3000') {
        return `http://${window.location.hostname}:3001`;
      }
      if (window.location.protocol !== 'file:' && !window.location.origin.includes('localhost')) {
        return window.location.origin;
      }
    }
    return 'http://localhost:3001';
  });

  const updateServerUrl = useCallback((newUrl) => {
    let clean = (newUrl || '').trim();
    if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    if (clean) {
      try {
        localStorage.setItem('wt_server_url', clean);
      } catch (e) {}
      setServerUrlState(clean);
    }
  }, []);

  // Capacitor Deep Linking listener for Android
  useEffect(() => {
    let cleanup = null;
    const initDeepLinks = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const listener = await CapApp.addListener('appUrlOpen', (data) => {
          console.log('[DeepLink] App opened with URL:', data.url);
          try {
            const parsedUrl = new URL(data.url);
            let targetHost = parsedUrl.origin;
            let targetRoom = parsedUrl.searchParams.get('room') || parsedUrl.searchParams.get('r');

            // If custom scheme: watchtogether://open?url=...&room=...
            if (data.url.startsWith('watchtogether://')) {
              const fullUrl = parsedUrl.searchParams.get('url');
              if (fullUrl) {
                const embedded = new URL(fullUrl);
                targetHost = embedded.origin;
                targetRoom = targetRoom || embedded.searchParams.get('room');
              }
            }

            if (targetHost && !targetHost.startsWith('watchtogether:') && !targetHost.includes('localhost')) {
              updateServerUrl(targetHost);
            }

            if (targetRoom) {
              const url = new URL(window.location);
              url.searchParams.set('room', targetRoom.toUpperCase());
              window.history.replaceState({}, '', url);
              setIsRejoining(true);
            }
          } catch (err) {
            console.warn('[DeepLink] Failed to parse deep link URL:', err);
          }
        });
        cleanup = () => listener.remove();
      } catch (e) {
        // Not in capacitor or plugin unavailable
      }
    };
    initDeepLinks();
    return () => {
      if (cleanup) cleanup();
    };
  }, [updateServerUrl]);

  const [latency, setLatency] = useState(0);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [bufferingState, setBufferingState] = useState({ isBuffering: false, text: '' });
  const [peers, setPeers] = useState([]);

  const socketRef = useRef(null);
  const pingIntervalRef = useRef(null);

  // Safety timeout: if rejoining takes > 4s, reveal lobby
  useEffect(() => {
    if (isRejoining && !room) {
      const timer = setTimeout(() => {
        setIsRejoining(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isRejoining, room]);

  // Initialize or re-connect socket
  const connectSocket = useCallback((urlToConnect) => {
    const targetUrl = urlToConnect || serverUrl;
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    console.log(`[Socket] Connecting to ${targetUrl}`);
    const newSocket = io(targetUrl, {
      transports: ['websocket', 'polling'],
      extraHeaders: {
        'Bypass-Tunnel-Reminder': 'true',
        'ngrok-skip-browser-warning': 'true'
      },
      reconnectionAttempts: 10,
      timeout: 10000
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected!', newSocket.id);
      setConnected(true);

      // Auto-rejoin room ONLY if ?room= query param is explicitly in the current URL
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');

        if (urlRoom) {
          const savedSessionStr = sessionStorage.getItem('wt_session');
          const session = savedSessionStr ? JSON.parse(savedSessionStr) : null;
          const nameToUse = (session && session.name) || localStorage.getItem('wt_username') || 'Alex';
          const wasHost = (session && session.roomId === urlRoom) ? !!session.isHost : false;

          console.log(`[Auto-Rejoin] Rejoining room ${urlRoom} as ${nameToUse} (wasHost: ${wasHost})`);
          
          if (wasHost) {
            newSocket.emit('create_room', { roomCode: urlRoom, name: nameToUse, hostOnlyControl: false }, (createRes) => {
              if (!createRes?.success) {
                // If room already active with another host, try joining as guest
                newSocket.emit('join_room', { roomId: urlRoom, name: nameToUse }, (joinRes) => {
                  if (!joinRes?.success) {
                    console.warn('[Auto-Rejoin] Join failed:', joinRes?.error);
                    sessionStorage.removeItem('wt_session');
                    setIsRejoining(false);
                  }
                });
              }
            });
          } else {
            newSocket.emit('join_room', { roomId: urlRoom, name: nameToUse }, (res) => {
              if (!res?.success) {
                console.warn('[Auto-Rejoin] Guest join failed:', res?.error);
                sessionStorage.removeItem('wt_session');
                setIsRejoining(false);
              }
            });
          }
        } else {
          // Clean URL -> Clear old session so we stay cleanly on Lobby
          sessionStorage.removeItem('wt_session');
          setIsRejoining(false);
        }
      } catch (err) {
        console.warn('Auto-rejoin error:', err);
        setIsRejoining(false);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.warn('[Socket] Connection Error:', err.message);
      setIsRejoining(false);
    });

    // Room events
    newSocket.on('room_joined', ({ room: joinedRoom, isHost: hostFlag }) => {
      setRoom(joinedRoom);
      setIsHost(hostFlag);
      setIsRejoining(false);

      try {
        sessionStorage.setItem('wt_session', JSON.stringify({
          roomId: joinedRoom.id,
          name: newSocket.userName || localStorage.getItem('wt_username') || 'User',
          isHost: hostFlag
        }));
        const url = new URL(window.location);
        url.searchParams.set('room', joinedRoom.id);
        window.history.replaceState({}, '', url);
      } catch (e) {}

      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Date.now(),
          type: 'system',
          text: `Joined room "${joinedRoom.id}". You are ${hostFlag ? '👑 Host' : '👤 Viewer'}.`,
          timestamp: Date.now()
        }
      ]);
    });

    newSocket.on('user_joined', ({ user, users }) => {
      setRoom((prev) => (prev ? { ...prev, users } : prev));
      if (soundEnabledRef.current) playJoinChime();

      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Date.now(),
          type: 'system',
          text: `👋 ${user.name} joined the room`,
          timestamp: Date.now()
        }
      ]);
    });

    newSocket.on('user_left', ({ userName: leftUser, newHostId, users }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          hostId: newHostId,
          users
        };
      });
      if (newSocket.id === newHostId) {
        setIsHost(true);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Date.now(),
          type: 'system',
          text: `🚪 ${leftUser} left the room`,
          timestamp: Date.now()
        }
      ]);
    });

    newSocket.on('room_settings_updated', ({ hostOnlyControl }) => {
      setRoom((prev) => (prev ? { ...prev, hostOnlyControl } : prev));
    });

    // Authoritative Sync Mirroring into room.media
    newSocket.on('media_changed', ({ media: newMedia, changedBy }) => {
      setRoom((prev) => {
        if (!prev) return null;
        return { ...prev, media: newMedia };
      });
      // Clear buffering overlay immediately
      setBufferingState({ isBuffering: false, text: '' });

      if (newMedia.url && newMedia.type !== 'screen_share' && !newMedia.url.startsWith('blob:')) {
        setRecentUrls((prev) => {
          const filtered = prev.filter(u => u.url !== newMedia.url);
          const updated = [{ url: newMedia.url, type: newMedia.type, title: newMedia.title || newMedia.url, date: Date.now() }, ...filtered].slice(0, 8);
          localStorage.setItem('wt_recent_urls', JSON.stringify(updated));
          return updated;
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: 'sys_' + Date.now(),
          type: 'system',
          text: `🎬 ${changedBy} loaded: ${newMedia.title || newMedia.url}`,
          timestamp: Date.now()
        }
      ]);
    });

    newSocket.on('media_play', ({ currentTime, timestamp }) => {
      setRoom((prev) => {
        if (!prev || !prev.media) return prev;
        return {
          ...prev,
          media: {
            ...prev.media,
            isPlaying: true,
            currentTime: typeof currentTime === 'number' ? currentTime : prev.media.currentTime,
            lastUpdated: timestamp || Date.now()
          }
        };
      });
    });

    newSocket.on('media_pause', ({ currentTime, timestamp }) => {
      setRoom((prev) => {
        if (!prev || !prev.media) return prev;
        return {
          ...prev,
          media: {
            ...prev.media,
            isPlaying: false,
            currentTime: typeof currentTime === 'number' ? currentTime : prev.media.currentTime,
            lastUpdated: timestamp || Date.now()
          }
        };
      });
    });

    newSocket.on('media_seek', ({ currentTime, isPlaying: autoPlay, timestamp }) => {
      setRoom((prev) => {
        if (!prev || !prev.media) return prev;
        return {
          ...prev,
          media: {
            ...prev.media,
            currentTime: typeof currentTime === 'number' ? currentTime : prev.media.currentTime,
            isPlaying: typeof autoPlay === 'boolean' ? autoPlay : prev.media.isPlaying,
            lastUpdated: timestamp || Date.now()
          }
        };
      });
    });

    newSocket.on('media_rate', ({ playbackRate }) => {
      setRoom((prev) => {
        if (!prev || !prev.media) return prev;
        return {
          ...prev,
          media: {
            ...prev.media,
            playbackRate: playbackRate || 1.0,
            lastUpdated: Date.now()
          }
        };
      });
    });

    // Chat and reactions
    newSocket.on('chat_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (soundEnabledRef.current && msg.userId !== newSocket.id) {
        playChatChime();
      }
    });

    newSocket.on('reaction', (reaction) => {
      setReactions((prev) => [...prev, reaction]);
      if (soundEnabledRef.current) playReactionChime();
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 3000);
    });

    // Buffer lockstep notifications
    newSocket.on('buffer_sync_pause', ({ reason }) => {
      setBufferingState({ isBuffering: true, text: reason });
    });

    newSocket.on('buffer_sync_ready', () => {
      setBufferingState({ isBuffering: false, text: '' });
    });

    newSocket.on('webrtc_peers_list', ({ peers: pList }) => {
      setPeers(pList);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('pong_check', ({ clientTime }) => {
      const rtt = Date.now() - clientTime;
      setLatency(Math.max(1, Math.round(rtt / 2)));
    });

    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('ping_check', { clientTime: Date.now() });
      }
    }, 5000);

    return newSocket;
  }, [serverUrl]);

  useEffect(() => {
    const s = connectSocket();
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (s) s.disconnect();
    };
  }, [connectSocket]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('wt_sound', next ? 'true' : 'false');
  };

  // Actions
  const createRoom = (code, name, hostOnly = false) => {
    return new Promise((resolve) => {
      const s = socketRef.current || socket;
      if (!s) return resolve({ success: false, error: 'Not connected to server. Check server is running!' });
      
      setUserName(name);
      localStorage.setItem('wt_username', name);
      s.userName = name;

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Room creation timed out. Make sure PC host server is active!' });
        }
      }, 7000);

      const doEmit = () => {
        s.emit('create_room', { roomCode: code, name, hostOnlyControl: hostOnly }, (res) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(res || { success: false, error: 'Empty response from host' });
          }
        });
      };

      if (s.connected) {
        doEmit();
      } else {
        s.once('connect', () => {
          if (!resolved) doEmit();
        });
        s.connect();
      }
    });
  };

  const joinRoom = (roomId, name) => {
    return new Promise((resolve) => {
      const s = socketRef.current || socket;
      if (!s) return resolve({ success: false, error: 'Not connected to server' });
      
      setUserName(name);
      localStorage.setItem('wt_username', name);
      s.userName = name;

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Connection timed out. Check Host Link or Wi-Fi!' });
        }
      }, 7000);

      const doEmit = () => {
        s.emit('join_room', { roomId, name }, (res) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(res || { success: false, error: 'Empty response from host' });
          }
        });
      };

      if (s.connected) {
        doEmit();
      } else {
        s.once('connect', () => {
          if (!resolved) doEmit();
        });
        s.connect();
      }
    });
  };

  const leaveRoom = () => {
    try {
      sessionStorage.removeItem('wt_session');
      const url = new URL(window.location);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.pathname);
    } catch (e) {}

    setIsRejoining(false);
    if (socket) {
      socket.emit('leave_room', () => {});
    }
    setRoom(null);
    setIsHost(false);
    setMessages([]);
  };

  const changeMedia = (type, url, title) => {
    if (!socket || !room) return;
    socket.emit('change_media', { type, url, title });
  };

  const playMedia = (currentTime) => {
    if (!socket || !room) return;
    socket.emit('media_play', { currentTime });
  };

  const pauseMedia = (currentTime) => {
    if (!socket || !room) return;
    socket.emit('media_pause', { currentTime });
  };

  const seekMedia = (currentTime, autoPlay = true) => {
    if (!socket || !room) return;
    socket.emit('media_seek', { currentTime, autoPlay });
  };

  const changePlaybackRate = (rate) => {
    if (!socket || !room) return;
    socket.emit('media_rate', { playbackRate: rate });
  };

  const reportBufferState = (isBuffering, currentTime) => {
    if (!socket || !room) return;
    socket.emit('buffer_state', { isBuffering, currentTime });
  };

  const sendChatMessage = (text) => {
    if (!socket || !room || !text.trim()) return;
    socket.emit('chat_message', { text });
  };

  const sendReaction = (emoji) => {
    if (!socket || !room) return;
    socket.emit('reaction', { emoji });
  };

  const sendCursorMove = (x, y, isPointerDown = false) => {
    if (!socket || !room) return;
    socket.emit('cursor_move', { x, y, isPointerDown });
  };

  const updateRoomSettings = (hostOnlyControl) => {
    if (!socket || !room || !isHost) return;
    socket.emit('update_room_settings', { hostOnlyControl });
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        room,
        isHost,
        userName,
        serverUrl,
        setServerUrl: updateServerUrl,
        updateServerUrl,
        connectSocket,
        latency,
        messages,
        reactions,
        bufferingState,
        peers,
        soundEnabled,
        toggleSound,
        recentUrls,
        clearRecentUrls,
        isRejoining,
        createRoom,
        joinRoom,
        leaveRoom,
        changeMedia,
        playMedia,
        pauseMedia,
        seekMedia,
        changePlaybackRate,
        reportBufferState,
        sendChatMessage,
        sendReaction,
        sendCursorMove,
        updateRoomSettings
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
