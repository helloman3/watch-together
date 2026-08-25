import React from 'react';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { useDeviceMode } from '../../utils/useDeviceMode';
import { Mic, MicOff, Volume2, VolumeX, Users, Radio } from 'lucide-react';

export const MobileVoiceBar = () => {
  const { room, latency, soundEnabled, toggleSound } = useSocket();
  const { isMicOn, toggleMic } = useWebRTC();
  const { triggerHaptic } = useDeviceMode();

  const handleToggleMic = () => {
    triggerHaptic(20);
    toggleMic();
  };

  const handleToggleSound = () => {
    triggerHaptic(10);
    toggleSound();
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#0c0e18] border-b border-white/[0.08] text-xs">
      {/* Left: Latency & Online Peers */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.06] text-[11px] font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-emerald-glow" />
          <span className="text-white font-bold">{room?.users?.length || 1} online</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.06] text-[10px] font-mono text-slate-300">
          <Radio className="w-3 h-3 text-indigo-400" />
          <span>{latency}ms</span>
        </div>
      </div>

      {/* Right: Mic & Sound Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleSound}
          className={`p-2 rounded-xl border transition-all active:scale-95 ${
            soundEnabled 
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
              : 'bg-white/[0.05] text-slate-400 border-white/[0.08]'
          }`}
          title="Chime Audio FX"
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={handleToggleMic}
          className={`px-3 py-1.5 rounded-xl font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shadow-md ${
            isMicOn 
              ? 'bg-emerald-500 text-black shadow-emerald-glow animate-pulse' 
              : 'bg-white/[0.08] text-white border border-white/10'
          }`}
        >
          {isMicOn ? <Mic className="w-3.5 h-3.5 text-black" /> : <MicOff className="w-3.5 h-3.5 text-slate-400" />}
          <span className="text-[11px]">{isMicOn ? 'Mic ON' : 'Mic OFF'}</span>
        </button>
      </div>
    </div>
  );
};
