import React, { useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { copyToClipboard } from '../../utils/clipboard';
import { 
  Copy, 
  Check, 
  Users, 
  Mic, 
  MicOff, 
  Monitor, 
  MonitorOff, 
  LogOut, 
  Crown, 
  Settings,
  Share2,
  Volume2,
  VolumeX,
  Radio,
  Globe,
  Film,
  Sparkles
} from 'lucide-react';

export const DesktopHeader = ({ onOpenSettings, onOpenTunnel }) => {
  const { room, isHost, latency, leaveRoom, soundEnabled, toggleSound, changeMedia, userName, serverUrl } = useSocket();
  const { isMicOn, toggleMic, isScreenSharing, startScreenShare, stopScreenShare } = useWebRTC();
  const [copied, setCopied] = useState(false);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      if (room?.media?.type === 'screen_share') {
        changeMedia('none', '', '');
      }
    } else {
      const stream = await startScreenShare();
      if (stream) {
        changeMedia('screen_share', 'Screen Share Stream', `${userName || 'Host'}'s Screen Share`);
      }
    }
  };

  const handleCopyCode = async () => {
    if (!room) return;
    const ok = await copyToClipboard(room.id);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareInvite = async () => {
    if (!room) return;
    const base = (serverUrl && !serverUrl.includes('localhost') && !serverUrl.startsWith('file:')) 
      ? serverUrl 
      : window.location.origin;
    const shareUrl = `${base}?room=${room.id}`;
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="h-16 px-6 glass-panel border-b border-white/[0.08] flex items-center justify-between z-30 select-none transition-all">
      {/* Left: Brand Logo & Room Badge */}
      <div className="flex items-center gap-5">
        {/* Brand Icon & Name */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white font-extrabold flex items-center justify-center text-xs shadow-glass-glow border border-white/20">
            <Film className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-white text-sm tracking-tight flex items-center gap-1.5">
              Watch<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Together</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                PRO PC
              </span>
            </span>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="h-5 w-[1px] bg-white/10" />

        {/* Room Code Badge */}
        <div className="flex items-center glass-panel-subtle rounded-xl px-3 py-1.5 gap-2.5 border border-white/10 shadow-sm">
          <span className="text-[10px] text-muted-light font-mono font-bold uppercase tracking-wider">ROOM:</span>
          <span className="font-mono font-black text-sm text-white tracking-widest bg-white/[0.06] px-2 py-0.5 rounded-md border border-white/10">
            {room?.id}
          </span>
          <button
            onClick={handleCopyCode}
            className="px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/20 text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
            title="Copy Room Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
            <span className="text-[11px] font-bold">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Share Invite Button */}
        <button
          onClick={handleShareInvite}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl btn-cinema-primary cursor-pointer"
          title="Share Invite Link"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Invite Friends</span>
        </button>

        {/* Internet Tunnel Launcher */}
        {onOpenTunnel && (
          <button
            onClick={onOpenTunnel}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl glass-card-interactive text-slate-200 cursor-pointer"
            title="Public Internet Tunnel & Wi-Fi Link"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>Network Tunnel</span>
          </button>
        )}
      </div>

      {/* Right: Room Controls, Mic, Screen Share, Peers & Settings */}
      <div className="flex items-center gap-3">
        {/* Sound FX Toggle */}
        <button
          onClick={toggleSound}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            soundEnabled 
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-emerald-glow' 
              : 'bg-white/[0.04] text-muted border-white/[0.08] hover:text-white'
          }`}
          title={soundEnabled ? 'Chime Sound FX: ON' : 'Chime Sound FX: MUTED'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Role Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel-subtle text-xs font-bold border border-white/[0.08]">
          {isHost ? (
            <>
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300">Host Room</span>
            </>
          ) : (
            <>
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-300">Viewer</span>
            </>
          )}
        </div>

        {/* Online Count */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-subtle text-xs font-bold text-white border border-white/[0.08]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-emerald-glow" />
          <span>{room?.users?.length || 1} online</span>
        </div>

        {/* Latency Metric */}
        <div 
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel-subtle text-[11px] font-mono font-bold text-slate-300 border border-white/[0.08]"
          title={`Ping to sync server: ${latency}ms`}
        >
          <Radio className={`w-3.5 h-3.5 ${latency < 60 ? 'text-emerald-400' : latency < 120 ? 'text-amber-400' : 'text-red-400'}`} />
          <span>{latency}ms</span>
        </div>

        {/* Microphone Voice Toggle */}
        <button
          onClick={toggleMic}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            isMicOn 
              ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-glow animate-pulse font-extrabold' 
              : 'glass-card-interactive text-slate-200 border-white/10'
          }`}
          title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicOn ? <Mic className="w-4 h-4 text-black" /> : <MicOff className="w-4 h-4 text-slate-400" />}
          <span>{isMicOn ? 'Voice Active' : 'Voice Muted'}</span>
        </button>

        {/* Screen / Tab Share Button */}
        <button
          onClick={handleToggleScreenShare}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            isScreenSharing 
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-glow' 
              : 'glass-card-interactive text-slate-200 border-white/10'
          }`}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen / Browser Tab'}
        >
          {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4 text-purple-400" />}
          <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>

        {/* Settings Modal */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl glass-card-interactive text-slate-300 hover:text-white cursor-pointer"
            title="Room & Voice Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* Leave Room Button */}
        <button
          onClick={leaveRoom}
          className="px-3.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 hover:border-red-500/50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          title="Exit Room"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave</span>
        </button>
      </div>
    </header>
  );
};
