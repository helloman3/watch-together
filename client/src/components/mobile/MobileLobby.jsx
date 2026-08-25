import React, { useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { useDeviceMode } from '../../utils/useDeviceMode';
import { TunnelModal } from '../TunnelModal';
import { 
  Film, 
  Globe, 
  Sparkles, 
  Users, 
  ArrowRight, 
  Lock, 
  Unlock,
  Radio,
  Server,
  ExternalLink,
  Smartphone,
  Loader2
} from 'lucide-react';

export const MobileLobby = () => {
  const { 
    connected, 
    createRoom, 
    joinRoom, 
    latency,
    serverUrl,
    updateServerUrl,
    connectSocket
  } = useSocket();
  const { unlockAudioEngine } = useWebRTC();
  const { triggerHaptic, isCapacitor } = useDeviceMode();

  const [mode, setMode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('room') ? 'join' : 'host';
    } catch {
      return 'host';
    }
  });
  const [userName, setUserName] = useState(() => localStorage.getItem('wt_username') || '');
  const [roomCode, setRoomCode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return (urlParams.get('room') || '').toUpperCase();
    } catch {
      return '';
    }
  });
  const [hostOnlyControl, setHostOnlyControl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTunnelModal, setShowTunnelModal] = useState(false);
  const [showServerInput, setShowServerInput] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(serverUrl || '');

  const handleCreate = async (e) => {
    e?.preventDefault();
    triggerHaptic(20);
    if (unlockAudioEngine) unlockAudioEngine();
    if (!userName.trim()) {
      setError('Please enter your nickname');
      return;
    }
    setLoading(true);
    setError('');

    const codeToUse = roomCode.trim() || Math.random().toString(36).substring(2, 8).toUpperCase();
    const res = await createRoom(codeToUse, userName.trim(), hostOnlyControl);

    if (!res.success) {
      setError(res.error || 'Failed to create room. Make sure server is running!');
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e?.preventDefault();
    triggerHaptic(20);
    if (unlockAudioEngine) unlockAudioEngine();
    if (!userName.trim()) {
      setError('Please enter your nickname');
      return;
    }
    const input = roomCode.trim();
    if (!input) {
      setError('Please enter the Room Code or paste Host Link');
      return;
    }
    setLoading(true);
    setError('');

    let finalRoomCode = input;
    let targetHost = null;

    // Smart Link Detection: handles https://fifty-schools-laugh.loca.lt?room=1234 or IP links
    if (input.includes('http://') || input.includes('https://') || input.includes('.loca.lt') || input.includes('.trycloudflare.com') || input.includes(':3001')) {
      try {
        let fullUrlStr = input;
        if (!fullUrlStr.startsWith('http://') && !fullUrlStr.startsWith('https://')) {
          fullUrlStr = 'https://' + fullUrlStr;
        }
        const parsed = new URL(fullUrlStr);
        targetHost = parsed.origin;
        const qRoom = parsed.searchParams.get('room') || parsed.searchParams.get('r');
        if (qRoom) {
          finalRoomCode = qRoom.toUpperCase();
        } else {
          const pathSegments = parsed.pathname.split('/').filter(Boolean);
          if (pathSegments.length > 0) finalRoomCode = pathSegments[pathSegments.length - 1].toUpperCase();
        }
      } catch (err) {}
    }

    if (targetHost && targetHost !== serverUrl) {
      updateServerUrl(targetHost);
      // Connect to the new host
      connectSocket(targetHost);
      await new Promise(r => setTimeout(r, 800));
    }

    const res = await joinRoom(finalRoomCode, userName.trim());
    if (!res.success) {
      setError(res.error || 'Room not found. Make sure host PC is online and room code is correct!');
      setLoading(false);
    }
  };

  const handleSaveServerUrl = (e) => {
    e?.preventDefault();
    if (!customServerUrl.trim()) return;
    triggerHaptic(15);
    updateServerUrl(customServerUrl.trim());
    connectSocket(customServerUrl.trim());
    setShowServerInput(false);
  };

  const currentWebUrl = typeof window !== 'undefined' ? window.location.href : '';
  const appDeepLink = `watchtogether://open?url=${encodeURIComponent(currentWebUrl)}`;

  return (
    <div className="min-h-screen bg-[#07080d] text-slate-100 flex flex-col justify-between pt-safe pb-safe selection:bg-indigo-500 selection:text-white ambient-mesh">
      {/* 1. Smart In-Browser Banner (Only on Mobile Web) */}
      {!isCapacitor && (
        <a
          href={appDeepLink}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-md active:opacity-90"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            <span>Have the Watch Together App? Open in App</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}

      {/* 2. Top Navbar */}
      <header className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.08] glass-panel">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-extrabold flex items-center justify-center text-xs shadow-glass-glow">
            <Film className="w-3.5 h-3.5" />
          </div>
          <span className="font-extrabold text-sm text-white tracking-tight">
            Watch<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Together</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.06] text-[10px] font-mono">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-slate-300">{connected ? `${latency}ms` : 'Offline'}</span>
          </div>
          <button
            onClick={() => { triggerHaptic(10); setShowTunnelModal(true); }}
            className="p-1.5 rounded-lg bg-white/[0.06] text-slate-300 border border-white/[0.08] active:scale-95"
            title="Tunnel / Wi-Fi Links"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
          </button>
        </div>
      </header>

      {/* 3. Main Form Content */}
      <main className="flex-1 flex flex-col justify-center px-5 py-6 max-w-md mx-auto w-full">
        {/* Title */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-black text-white tracking-tight mb-1 font-display">
            Watch Together <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Cinema</span>
          </h1>
          <p className="text-xs text-slate-400">
            Real-time lockstep sync with zero delay
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-3xl p-5 shadow-glass-card border border-white/[0.08]">
          {/* Segmented Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-black/50 rounded-xl border border-white/[0.06] mb-5">
            <button
              onClick={() => { triggerHaptic(10); setMode('host'); setError(''); }}
              className={`py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                mode === 'host'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-glass-glow'
                  : 'text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Host Room</span>
            </button>

            <button
              onClick={() => { triggerHaptic(10); setMode('join'); setError(''); }}
              className={`py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                mode === 'join'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-glass-glow'
                  : 'text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Join Room</span>
            </button>
          </div>

          <form onSubmit={mode === 'host' ? handleCreate : handleJoin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 text-xs font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Your Nickname *
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={20}
                required
                style={{ fontSize: '16px' }}
                className="w-full glass-input px-3.5 py-3 rounded-xl text-white font-medium placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                {mode === 'host' ? 'Custom Room Code (Optional)' : 'Room Code or Paste Invite Link *'}
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setRoomCode(val.includes('://') || val.includes('.') ? val.trim() : val.toUpperCase());
                }}
                placeholder={mode === 'host' ? 'e.g. MOVIE1 (or auto)' : 'e.g. 1234 or paste Host Link'}
                maxLength={500}
                required={mode === 'join'}
                style={{ fontSize: '15px' }}
                className="w-full glass-input px-3.5 py-3 rounded-xl font-mono font-bold text-white placeholder-slate-500"
              />
            </div>

            {/* Server / Host Link Switcher on Mobile */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowServerInput(!showServerInput)}
                className="text-[11px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Server className="w-3 h-3" />
                <span>{showServerInput ? 'Hide Host Server Address' : 'Change Host Server / Tunnel Link'}</span>
              </button>

              {showServerInput && (
                <div className="mt-2 p-3 rounded-2xl bg-black/40 border border-white/[0.08] space-y-2 animate-fade-in">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">
                    Host Server URL (e.g. https://xxxx.loca.lt or http://192.168.0.101:3001)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customServerUrl}
                      onChange={(e) => setCustomServerUrl(e.target.value)}
                      placeholder="Paste Tunnel URL or IP"
                      style={{ fontSize: '14px' }}
                      className="flex-1 glass-input rounded-xl px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleSaveServerUrl}
                      className="px-3 py-2 btn-cinema-primary text-xs font-bold rounded-xl active:scale-95"
                    >
                      Connect
                    </button>
                  </div>
                </div>
              )}
            </div>

            {mode === 'host' && (
              <div className="p-3 rounded-xl glass-panel-subtle border border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {hostOnlyControl ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                  <div>
                    <div className="text-xs font-bold text-white">
                      {hostOnlyControl ? 'Host Only' : 'Collaborative'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {hostOnlyControl ? 'Only you control playback' : 'All peers can control'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { triggerHaptic(10); setHostOnlyControl(!hostOnlyControl); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                    hostOnlyControl 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                      : 'bg-white/[0.08] text-white border-white/10'
                  }`}
                >
                  {hostOnlyControl ? 'Locked' : 'Shared'}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-5 rounded-xl btn-cinema-primary text-sm font-extrabold shadow-glass-glow flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to Host...</span>
                </>
              ) : mode === 'host' ? (
                <>
                  <span>Create Room</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Join Room</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Internet Tunnel Modal */}
      <TunnelModal 
        isOpen={showTunnelModal}
        onClose={() => setShowTunnelModal(false)}
      />

      {/* Footer */}
      <footer className="py-3 text-center text-[10px] text-slate-500 font-mono">
        Lockstep Sync Engine • Watch Together Mobile
      </footer>
    </div>
  );
};
