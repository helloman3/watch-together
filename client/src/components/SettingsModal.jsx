import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useDeviceMode } from '../utils/useDeviceMode';
import { 
  Settings, 
  X, 
  Mic, 
  ShieldCheck, 
  Volume2, 
  VolumeX, 
  Monitor, 
  Smartphone,
  Sparkles,
  Check, 
  ChevronDown 
} from 'lucide-react';

export const SettingsModal = ({ isOpen, onClose }) => {
  const { room, isHost, updateRoomSettings, soundEnabled, toggleSound } = useSocket();
  const { uiModeOverride, setUiModeOverride, isMobile, triggerHaptic } = useDeviceMode();

  const [hostOnly, setHostOnly] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [showMicDropdown, setShowMicDropdown] = useState(false);

  useEffect(() => {
    if (room) {
      setHostOnly(!!room.hostOnlyControl);
    }
  }, [room]);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedDevice(audioInputs[0].deviceId);
        }
      }).catch(() => {});
    }
  }, []);

  if (!isOpen) return null;

  const handleToggleHostControl = () => {
    if (!isHost) return;
    triggerHaptic(15);
    const next = !hostOnly;
    setHostOnly(next);
    updateRoomSettings(next);
  };

  const selectedDeviceObj = audioDevices.find(d => d.deviceId === selectedDevice);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="w-full max-w-md glass-panel border border-white/[0.12] rounded-3xl p-6 shadow-glass-card relative text-xs">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h3 className="font-extrabold text-white text-sm sm:text-base">Settings & Preferences</h3>
          </div>
          <button
            onClick={() => { triggerHaptic(10); onClose(); }}
            className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* UI Layout Mode Switcher */}
          <div className="p-4 rounded-2xl glass-panel-subtle border border-white/[0.06] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Interface Experience</span>
              </span>
              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full border border-indigo-500/30">
                {isMobile ? 'Mobile Touch Active' : 'PC Studio Active'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => { triggerHaptic(10); setUiModeOverride('auto'); }}
                className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  uiModeOverride === 'auto'
                    ? 'btn-cinema-primary shadow-glass-glow'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:text-white'
                }`}
              >
                <span>Auto Detect</span>
              </button>

              <button
                type="button"
                onClick={() => { triggerHaptic(10); setUiModeOverride('desktop'); }}
                className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  uiModeOverride === 'desktop'
                    ? 'btn-cinema-primary shadow-glass-glow'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Monitor className="w-3.5 h-3.5" />
                  <span>PC Widescreen</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { triggerHaptic(10); setUiModeOverride('mobile'); }}
                className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  uiModeOverride === 'mobile'
                    ? 'btn-cinema-primary shadow-glass-glow'
                    : 'bg-white/[0.04] text-slate-400 border-white/[0.06] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile Phone</span>
                </div>
              </button>
            </div>
          </div>

          {/* Host Control Mode */}
          <div className="p-4 rounded-2xl glass-panel-subtle border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Playback Authorization</span>
              </span>
              {isHost ? (
                <button
                  type="button"
                  onClick={handleToggleHostControl}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-sm ${
                    hostOnly
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'btn-cinema-primary'
                  }`}
                >
                  {hostOnly ? 'Host Locked' : 'Collaborative'}
                </button>
              ) : (
                <span className="text-slate-400 font-bold">
                  {room?.hostOnlyControl ? 'Host Locked' : 'Collaborative'}
                </span>
              )}
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              {hostOnly 
                ? 'Only the room host can play, pause, seek, or change streams.'
                : 'All connected peers can freely control playback and seek.'}
            </p>
          </div>

          {/* Sound FX Toggle */}
          <div className="p-4 rounded-2xl glass-panel-subtle border border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              <div>
                <div className="text-xs font-bold text-white">Chime Sound Effects</div>
                <div className="text-[11px] text-slate-400">Audio cues for joins, chat messages & reactions</div>
              </div>
            </div>

            <button
              onClick={() => { triggerHaptic(10); toggleSound(); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                soundEnabled 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-emerald-glow' 
                  : 'bg-white/[0.06] text-slate-400 border border-white/10'
              }`}
            >
              {soundEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          {/* Microphone Device Picker */}
          <div className="p-4 rounded-2xl glass-panel-subtle border border-white/[0.06] space-y-2 relative">
            <label className="font-bold text-white flex items-center gap-1.5 text-xs">
              <Mic className="w-4 h-4 text-emerald-400" />
              <span>Microphone Input Device</span>
            </label>

            <button
              type="button"
              onClick={() => setShowMicDropdown(!showMicDropdown)}
              className="w-full glass-input rounded-xl p-3 text-white flex items-center justify-between text-xs font-medium cursor-pointer"
            >
              <span className="truncate">
                {selectedDeviceObj ? selectedDeviceObj.label || `Microphone (${selectedDevice.substring(0, 8)})` : 'Default System Microphone'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
            </button>

            {/* Custom Dropdown Popover */}
            {showMicDropdown && (
              <>
                <div 
                  onClick={() => setShowMicDropdown(false)}
                  className="fixed inset-0 z-40"
                />
                <div className="absolute left-4 right-4 bottom-full mb-1 bg-[#101322] border border-white/15 rounded-2xl shadow-2xl p-1 z-50 animate-fade-in max-h-48 overflow-y-auto no-scrollbar">
                  {audioDevices.length === 0 ? (
                    <div className="p-2 text-slate-400 text-center text-xs">
                      Default System Microphone
                    </div>
                  ) : (
                    audioDevices.map((d) => (
                      <button
                        key={d.deviceId}
                        onClick={() => {
                          setSelectedDevice(d.deviceId);
                          setShowMicDropdown(false);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          selectedDevice === d.deviceId 
                            ? 'btn-cinema-primary' 
                            : 'text-white hover:bg-white/[0.08]'
                        }`}
                      >
                        <span className="truncate">{d.label || `Device ${d.deviceId.substring(0, 8)}`}</span>
                        {selectedDevice === d.deviceId && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => { triggerHaptic(10); onClose(); }}
            className="px-6 py-2.5 btn-cinema-primary text-xs rounded-xl cursor-pointer shadow-glass-glow"
          >
            Save & Exit
          </button>
        </div>
      </div>
    </div>
  );
};
