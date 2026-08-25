import React, { useState, useEffect } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { useSocket } from '../context/SocketContext';
import { useDeviceMode } from '../utils/useDeviceMode';
import { 
  Globe, 
  Wifi, 
  Copy, 
  Check, 
  X, 
  Sparkles, 
  ShieldCheck,
  Server,
  Info,
  Key,
  RefreshCw
} from 'lucide-react';

export const TunnelModal = ({ isOpen, onClose }) => {
  const { serverUrl, room } = useSocket();
  const { triggerHaptic, isMobile } = useDeviceMode();
  const [networkInfo, setNetworkInfo] = useState(null);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [tunnelPassword, setTunnelPassword] = useState('');
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const apiBase = serverUrl && !serverUrl.startsWith('file:') && !serverUrl.includes('capacitor://')
    ? serverUrl
    : '';

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${apiBase}/api/network-info`)
      .then(res => res.json())
      .then(data => {
        setNetworkInfo(data);
        if (data.tunnelUrl) setTunnelUrl(data.tunnelUrl);
        if (data.tunnelPassword) setTunnelPassword(data.tunnelPassword);
      })
      .catch(() => {});
  }, [isOpen, apiBase]);

  if (!isOpen) return null;

  const handleStartTunnel = async (forceRefresh = false) => {
    triggerHaptic(15);
    setTunnelLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/tunnel/start`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: forceRefresh })
      });
      const data = await res.json();
      if (data.success) {
        setTunnelUrl(data.url);
        if (data.password) setTunnelPassword(data.password);
      } else {
        alert('Tunnel Error: ' + (data.error || 'Could not start tunnel'));
      }
    } catch (e) {
      alert('The Tunnel must be generated from your PC Host application (WatchTogether.exe). On this phone, simply join using the Host\'s link or Wi-Fi IP!');
    } finally {
      setTunnelLoading(false);
    }
  };

  const shareableUrl = tunnelUrl 
    ? (room?.id ? `${tunnelUrl}?room=${room.id}` : tunnelUrl)
    : '';

  const handleCopyLink = async () => {
    triggerHaptic(15);
    const ok = await copyToClipboard(shareableUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyPass = async () => {
    triggerHaptic(15);
    const ok = await copyToClipboard(tunnelPassword);
    if (ok) {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="w-full max-w-lg glass-panel border border-white/[0.12] rounded-3xl p-6 shadow-glass-card relative text-xs">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h3 className="font-extrabold text-white text-base">Network & Remote Friends Access</h3>
          </div>
          <button
            onClick={() => { triggerHaptic(10); onClose(); }}
            className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Info Notice */}
        {isMobile && (
          <div className="mb-4 p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-start gap-2.5 text-indigo-200 text-xs">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-white">Host vs Phone Connection:</span>
              <span>The sync server runs on the Host PC (`WatchTogether.exe`). Generate the link on your PC, then paste it on this phone!</span>
            </div>
          </div>
        )}

        {/* Option 1: Internet Tunnel */}
        <div className="mb-4 p-4 rounded-2xl glass-panel-subtle border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>1. Long-Distance Friends (Over Internet)</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Global link with automatic room connection
              </div>
            </div>

            {!tunnelUrl && (
              <button
                onClick={handleStartTunnel}
                disabled={tunnelLoading}
                className="px-4 py-2 btn-cinema-primary text-xs rounded-xl disabled:opacity-50 cursor-pointer shadow-glass-glow"
              >
                {tunnelLoading ? 'Generating...' : 'Get Public Link'}
              </button>
            )}
          </div>

          {tunnelUrl ? (
            <div className="space-y-2">
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-emerald-200">
                <span className="font-mono font-bold truncate select-all">{shareableUrl}</span>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-emerald-glow shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={() => handleStartTunnel(true)}
                    disabled={tunnelLoading}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white rounded-lg flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-all disabled:opacity-50"
                    title="Generate a brand new active tunnel link"
                  >
                    <RefreshCw className={`w-3 h-3 ${tunnelLoading ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>{tunnelLoading ? 'Generating...' : 'Refresh'}</span>
                  </button>
                </div>
              </div>

              {tunnelPassword && (
                <div className="p-2.5 bg-black/40 border border-white/[0.08] rounded-xl flex items-center justify-between text-[11px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Browser IP Password: <strong className="text-white font-mono">{tunnelPassword}</strong></span>
                  </div>
                  <button
                    onClick={handleCopyPass}
                    className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold"
                  >
                    {copiedPass ? 'Copied' : 'Copy IP'}
                  </button>
                </div>
              )}

              <p className="text-[10px] text-slate-400 leading-relaxed">
                💡 <strong>Tip for Mobile App:</strong> Paste this link directly into the <strong>Watch Together App</strong> on Android to connect instantly and skip the browser password screen entirely!
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              Click "Get Public Link" on your PC to create a shareable URL that works anywhere in the world.
            </p>
          )}
        </div>

        {/* Option 2: Same Home Wi-Fi */}
        <div className="p-4 rounded-2xl glass-panel-subtle border border-white/[0.06] space-y-2">
          <div className="font-bold text-white text-xs flex items-center gap-1.5">
            <Wifi className="w-4 h-4 text-indigo-400" />
            <span>2. Same Home Wi-Fi (Phone / Tablet)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Open this URL on your phone's browser or APK while on the same Wi-Fi:
          </p>
          {networkInfo?.localUrls && networkInfo.localUrls.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-black/50 border border-white/[0.08] rounded-xl font-mono font-bold text-indigo-300 text-xs">
              <span className="truncate select-all">
                {room?.id ? `${networkInfo.localUrls[0]}?room=${room.id}` : networkInfo.localUrls[0]}
              </span>
              <button
                onClick={() => handleCopyLink(room?.id ? `${networkInfo.localUrls[0]}?room=${room.id}` : networkInfo.localUrls[0])}
                className="ml-2 p-1.5 text-slate-300 hover:text-white rounded-lg bg-white/[0.08] border border-white/10 cursor-pointer"
                title="Copy Wi-Fi URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => { triggerHaptic(10); onClose(); }}
            className="px-6 py-2 btn-cinema-primary text-xs rounded-xl cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
