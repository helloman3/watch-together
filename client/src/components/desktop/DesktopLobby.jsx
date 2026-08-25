import React, { useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { TunnelModal } from '../TunnelModal';
import { 
  Tv, 
  Globe, 
  ArrowRight, 
  Users, 
  Sparkles, 
  Lock, 
  Unlock,
  Film,
  Zap,
  ShieldCheck,
  Radio,
  Monitor,
  CheckCircle2
} from 'lucide-react';

export const DesktopLobby = ({ onOpenSettings }) => {
  const { 
    connected, 
    createRoom, 
    joinRoom, 
    latency,
    serverUrl,
    updateServerUrl 
  } = useSocket();
  const { unlockAudioEngine } = useWebRTC();

  const [mode, setMode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('room') ? 'join' : 'host';
    } catch (e) {
      return 'host';
    }
  });
  const [userName, setUserName] = useState(() => localStorage.getItem('wt_username') || '');
  const [roomCode, setRoomCode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return (urlParams.get('room') || '').toUpperCase();
    } catch (e) {
      return '';
    }
  });
  const [hostOnlyControl, setHostOnlyControl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTunnelModal, setShowTunnelModal] = useState(false);

  const handleCreate = async (e) => {
    e?.preventDefault();
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
      setError(res.error || 'Failed to create room');
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e?.preventDefault();
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
      await new Promise(r => setTimeout(r, 600));
    }

    const res = await joinRoom(finalRoomCode, userName.trim());
    if (!res.success) {
      setError(res.error || 'Room not found. Make sure host is online!');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen ambient-mesh text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* 1. Top Navbar */}
      <header className="border-b border-white/[0.08] glass-panel px-8 lg:px-16 py-4 flex items-center justify-between z-20">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white font-extrabold flex items-center justify-center text-xs shadow-glass-glow border border-white/20">
            <Film className="w-5 h-5" />
          </div>
          <div className="flex items-center tracking-tight font-black text-xl text-white">
            <span>Watch<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Together</span></span>
            <span className="ml-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
              Desktop Cinema
            </span>
          </div>
        </div>

        {/* Server & Network Tunnel Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl glass-panel-subtle text-xs font-mono border border-white/[0.08]">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse shadow-emerald-glow' : 'bg-red-400'}`} />
            <span className="text-slate-300">{connected ? `Sync Engine Online (${latency}ms)` : 'Connecting to Server...'}</span>
          </div>

          <button
            onClick={() => setShowTunnelModal(true)}
            className="px-4 py-2 text-xs font-bold rounded-xl glass-card-interactive text-white border border-white/10 flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>Internet Tunnel</span>
          </button>
        </div>
      </header>

      {/* 2. Main Hero & Card */}
      <main className="max-w-4xl mx-auto w-full px-8 py-12 flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel-subtle text-xs text-indigo-300 mb-6 self-start border border-indigo-500/30 shadow-glass-glow">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold">True Zero-Delay Lockstep Sync Architecture</span>
        </div>

        <h1 className="text-4xl lg:text-6xl font-black tracking-tight text-white mb-4 leading-tight font-display">
          Synchronized Cinema for <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-purple-400">
            Movies, Anime & Streams.
          </span>
        </h1>

        <p className="text-slate-400 text-base mb-8 max-w-2xl leading-relaxed">
          Watch together in perfect lockstep synchronization. If one peer buffers, playback pauses for everyone automatically so nobody gets left behind or spoiled.
        </p>

        {/* Main Card */}
        <div className="glass-panel rounded-3xl p-8 shadow-glass-card border border-white/[0.08] relative overflow-hidden">
          {/* Subtle top glow line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1.5 bg-black/40 rounded-2xl border border-white/[0.06] mb-8">
            <button
              onClick={() => { setMode('host'); setError(''); }}
              className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'host'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-glass-glow'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Host a Room</span>
            </button>

            <button
              onClick={() => { setMode('join'); setError(''); }}
              className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'join'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-glass-glow'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Join with Code</span>
            </button>
          </div>

          <form onSubmit={mode === 'host' ? handleCreate : handleJoin} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-2xl text-red-200 text-xs font-medium flex items-center gap-2.5">
                <span className="text-base">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  Your Nickname <span className="text-indigo-400">*</span>
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Alex"
                  maxLength={20}
                  required
                  className="w-full glass-input px-4 py-3.5 rounded-2xl text-sm text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  {mode === 'host' ? 'Custom Room Code (Optional)' : 'Room Code or Paste Invite Link *'}
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRoomCode(val.includes('://') || val.includes('.') ? val.trim() : val.toUpperCase());
                  }}
                  placeholder={mode === 'host' ? 'e.g. CINEMA1 (or auto)' : 'e.g. 1234 or paste Host Link'}
                  maxLength={500}
                  required={mode === 'join'}
                  className="w-full glass-input px-4 py-3.5 rounded-2xl text-sm font-mono font-bold text-white placeholder-slate-500"
                />
              </div>
            </div>

            {mode === 'host' && (
              <div className="p-4 rounded-2xl glass-panel-subtle border border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className={`p-2.5 rounded-xl ${hostOnlyControl ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {hostOnlyControl ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {hostOnlyControl ? 'Host-Only Control Mode' : 'Collaborative Control Mode'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {hostOnlyControl ? 'Only you can play, pause, seek, and switch video streams' : 'Everyone in the room can play, pause, and seek video'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHostOnlyControl(!hostOnlyControl)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    hostOnlyControl 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm' 
                      : 'glass-card-interactive text-white border-white/10'
                  }`}
                >
                  {hostOnlyControl ? 'Locked to Host' : 'Shared with All'}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-8 rounded-2xl btn-cinema-primary text-base font-extrabold shadow-glass-glow flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Connecting to room...</span>
              ) : mode === 'host' ? (
                <>
                  <span>Launch Cinema Room</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  <span>Enter Room</span>
                  <ArrowRight className="w-5 h-5" />
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
      <footer className="border-t border-white/[0.08] glass-panel px-8 lg:px-16 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-2 text-white font-medium">
          <Film className="w-3.5 h-3.5 text-indigo-400" />
          <span>Watch Together Private Cinema</span>
          <span>•</span>
          <span className="text-slate-400 font-normal">PC Studio & Android Edition</span>
        </div>
        <div className="text-emerald-400 font-medium flex items-center gap-2 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-emerald-glow" />
          <span>Lockstep Sync Engine Active</span>
        </div>
      </footer>
    </div>
  );
};
