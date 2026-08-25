import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { useDeviceMode } from '../../utils/useDeviceMode';
import { copyToClipboard } from '../../utils/clipboard';
import { VideoPlayer } from '../VideoPlayer';
import { LaserPointer } from '../LaserPointer';
import { ReactionOverlay } from '../ReactionOverlay';
import { LocalFilePicker } from '../LocalFilePicker';
import { SettingsModal } from '../SettingsModal';
import { TunnelModal } from '../TunnelModal';
import { MobileVoiceBar } from './MobileVoiceBar';
import { MobileChatSheet } from './MobileChatSheet';
import { 
  MessageSquare, 
  Users, 
  Film, 
  Globe, 
  Settings, 
  LogOut, 
  Copy, 
  Check, 
  Share2, 
  Lock, 
  Unlock, 
  Maximize2, 
  Eye, 
  EyeOff, 
  Crown,
  Sparkles,
  Link2,
  FolderOpen,
  Youtube,
  RotateCcw
} from 'lucide-react';
import { extractYoutubeId } from '../../utils/youtube';

export const MobileRoom = () => {
  const { 
    room, 
    isHost, 
    leaveRoom, 
    changeMedia, 
    userName, 
    messages,
    sendReaction 
  } = useSocket();
  const { isScreenSharing, startScreenShare, stopScreenShare } = useWebRTC();
  const { isLandscape, triggerHaptic } = useDeviceMode();

  const media = room?.media || { type: 'none', url: '' };
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'peers' | 'media'
  const [copied, setCopied] = useState(false);
  const [isLocalFileOpen, setIsLocalFileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTunnelOpen, setIsTunnelOpen] = useState(false);
  const [guestLocalBlobUrl, setGuestLocalBlobUrl] = useState(null);

  // Landscape Cinema Overlay state
  const [isOverlayChatVisible, setIsOverlayChatVisible] = useState(true);
  const [isTouchLocked, setIsTouchLocked] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  const videoPlayerContainerRef = useRef(null);

  // Clear guest local blob when host changes media
  useEffect(() => {
    if (room?.media?.type !== 'local_file') {
      setGuestLocalBlobUrl(null);
    }
  }, [room?.media?.url, room?.media?.type]);

  if (!room) return null;

  const handleCopyCode = async () => {
    triggerHaptic(15);
    const ok = await copyToClipboard(room.id);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareInvite = async () => {
    triggerHaptic(15);
    const shareUrl = `${window.location.origin}?room=${room.id}`;
    const shareText = `Join my Watch Together room!\nRoom Code: ${room.id}\nLink: ${shareUrl}`;
    if (navigator.share) {
      navigator.share({
        title: 'Watch Together Room',
        text: shareText,
        url: shareUrl
      }).catch(() => {});
    } else {
      const ok = await copyToClipboard(shareUrl);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleLoadUrl = (e) => {
    e?.preventDefault();
    if (!inputUrl.trim()) return;
    triggerHaptic(15);
    const trimmed = inputUrl.trim();

    const ytId = extractYoutubeId(trimmed);
    if (ytId || trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      changeMedia('youtube', trimmed, trimmed);
      setInputUrl('');
      setActiveTab('chat');
      return;
    }

    const title = trimmed.split('/').pop().split('?')[0] || 'Web Stream';
    changeMedia('video_url', trimmed, decodeURIComponent(title));
    setInputUrl('');
    setActiveTab('chat');
  };

  const recentMessages = messages.slice(-4);

  // -------------------------------------------------------------
  // LANDSCAPE CINEMA MODE (100% Immersive Fullscreen Mobile View)
  // -------------------------------------------------------------
  if (isLandscape) {
    return (
      <div className="h-screen w-screen bg-black text-white relative overflow-hidden select-none">
        {/* Fullscreen Video Canvas */}
        <div ref={videoPlayerContainerRef} className="relative w-full h-full flex items-center justify-center">
          <VideoPlayer 
            onSelectLocalFile={() => setIsLocalFileOpen(true)} 
            guestLocalBlobUrl={guestLocalBlobUrl}
          />
          <LaserPointer containerRef={videoPlayerContainerRef} />
          <ReactionOverlay />

          {/* Top-Left Floating Header in Landscape */}
          {!isTouchLocked && (
            <div className="absolute top-3 left-4 z-40 flex items-center gap-2 animate-fade-in">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono font-bold text-white shadow-lg">
                <span className="text-slate-400 text-[10px]">ROOM:</span>
                <span>{room.id}</span>
                <button
                  onClick={handleCopyCode}
                  className="p-1 text-slate-300 hover:text-white"
                  title="Copy Room Code"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              {/* Change Video / Return to Empty Stage button */}
              {media.type !== 'none' && (isHost || !room?.hostOnlyControl) && (
                <button
                  onClick={() => {
                    triggerHaptic(15);
                    changeMedia('none', '', '');
                  }}
                  className="px-3 py-1.5 rounded-full bg-amber-500/90 hover:bg-amber-500 active:scale-95 text-black font-extrabold flex items-center gap-1.5 shadow-lg backdrop-blur-md text-xs cursor-pointer"
                  title="Stop Video & Choose New Media"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Change Video</span>
                </button>
              )}

              <button
                onClick={handleShareInvite}
                className="p-2 rounded-full bg-indigo-600/80 hover:bg-indigo-600 active:scale-95 text-white shadow-lg backdrop-blur-md"
                title="Share Invite Link"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => { triggerHaptic(10); setIsTunnelOpen(true); }}
                className="p-2 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-indigo-400 active:scale-95 shadow-lg backdrop-blur-md"
                title="Network Tunnel"
              >
                <Globe className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => { triggerHaptic(10); setIsSettingsOpen(true); }}
                className="p-2 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 text-slate-300 active:scale-95 shadow-lg backdrop-blur-md"
                title="Settings & UI Mode"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => { triggerHaptic(15); leaveRoom(); }}
                className="p-2 rounded-full bg-red-950/60 hover:bg-red-900/80 border border-red-500/30 text-red-300 active:scale-95 shadow-lg backdrop-blur-md"
                title="Leave Room"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Floating Touch-Lock Button */}
          <button
            onClick={() => {
              triggerHaptic(20);
              setIsTouchLocked(!isTouchLocked);
            }}
            className={`absolute top-3 right-3 z-40 p-2.5 rounded-full backdrop-blur-md border transition-all ${
              isTouchLocked 
                ? 'bg-amber-500/30 text-amber-300 border-amber-500/50' 
                : 'bg-black/40 text-white/70 border-white/10 hover:text-white'
            }`}
            title={isTouchLocked ? 'Screen Locked' : 'Lock Screen Touches'}
          >
            {isTouchLocked ? <Lock className="w-4 h-4 text-amber-300" /> : <Unlock className="w-4 h-4" />}
          </button>

          {/* Landscape Floating Semi-Transparent Chat Stream Overlay */}
          {!isTouchLocked && isOverlayChatVisible && (
            <div className="absolute bottom-14 left-4 z-30 max-w-[280px] pointer-events-none flex flex-col gap-1.5 animate-fade-in">
              {recentMessages.map((msg) => {
                if (msg.type === 'system') return null;
                return (
                  <div 
                    key={msg.id}
                    className="px-2.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-xs text-white shadow-lg animate-slide-up"
                  >
                    <span className="font-bold text-indigo-300 mr-1.5">{msg.userName}:</span>
                    <span className="text-slate-100">{msg.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Overlay Chat Toggle Button in Landscape */}
          {!isTouchLocked && (
            <button
              onClick={() => {
                triggerHaptic(10);
                setIsOverlayChatVisible(!isOverlayChatVisible);
              }}
              className="absolute top-3 right-14 z-40 p-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/70 active:scale-95"
              title="Toggle Floating Chat"
            >
              {isOverlayChatVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}

          {/* Floating Emoji Reaction Bar in Landscape */}
          {!isTouchLocked && (
            <div className="absolute bottom-3 right-4 z-30 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
              {['❤️', '😂', '🔥', '🍿', '🎉'].map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    triggerHaptic(15);
                    sendReaction(emoji);
                  }}
                  className="text-lg active:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modals in Landscape */}
        <LocalFilePicker 
          isOpen={isLocalFileOpen} 
          onClose={() => setIsLocalFileOpen(false)}
          onLocalBlobSelected={(blobUrl) => setGuestLocalBlobUrl(blobUrl)}
        />
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
        />
        <TunnelModal 
          isOpen={isTunnelOpen}
          onClose={() => setIsTunnelOpen(false)}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // PORTRAIT MODE (Sticky 16:9 Player at Top + Bottom Tabs)
  // -------------------------------------------------------------
  return (
    <div className="h-screen w-screen flex flex-col bg-[#07080d] text-slate-100 overflow-hidden select-none pt-safe pb-safe">
      {/* 1. Mobile Top Header */}
      <header className="h-12 px-3.5 bg-[#090b14] border-b border-white/[0.08] flex items-center justify-between z-20">
        {/* Room Code Badge */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 active:scale-95 text-xs font-mono font-bold text-white"
          >
            <span>{room.id}</span>
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
          </button>

          <button
            onClick={handleShareInvite}
            className="p-1.5 rounded-lg bg-indigo-600 active:scale-95 text-white shadow"
            title="Share Room"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2">
          {/* Tunnel Modal */}
          <button
            onClick={() => { triggerHaptic(10); setIsTunnelOpen(true); }}
            className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-slate-300 active:scale-95"
            title="Tunnel Links"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
          </button>

          {/* Settings Modal */}
          <button
            onClick={() => { triggerHaptic(10); setIsSettingsOpen(true); }}
            className="p-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-slate-300 active:scale-95"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Leave Button */}
          <button
            onClick={() => { triggerHaptic(15); leaveRoom(); }}
            className="p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 active:scale-95"
            title="Leave Room"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. Top Sticky 16:9 Video Canvas */}
      <div className="w-full aspect-video bg-black relative shrink-0">
        <div ref={videoPlayerContainerRef} className="relative w-full h-full flex items-center justify-center">
          <VideoPlayer 
            onSelectLocalFile={() => setIsLocalFileOpen(true)} 
            guestLocalBlobUrl={guestLocalBlobUrl}
          />
          <LaserPointer containerRef={videoPlayerContainerRef} />
          <ReactionOverlay />
        </div>
      </div>

      {/* 3. Mobile Voice & Latency Bar */}
      <MobileVoiceBar />

      {/* 4. Segmented Bottom Tabs (Chat, Peers, Media) */}
      <div className="grid grid-cols-3 bg-[#0a0c16] border-b border-white/[0.08] text-xs p-1">
        <button
          onClick={() => { triggerHaptic(10); setActiveTab('chat'); }}
          className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'chat'
              ? 'bg-white/[0.1] text-white shadow-sm'
              : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => { triggerHaptic(10); setActiveTab('peers'); }}
          className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'peers'
              ? 'bg-white/[0.1] text-white shadow-sm'
              : 'text-slate-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Peers ({room?.users?.length || 1})</span>
        </button>

        <button
          onClick={() => { triggerHaptic(10); setActiveTab('media'); }}
          className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'media'
              ? 'bg-white/[0.1] text-white shadow-sm'
              : 'text-slate-400'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Source</span>
        </button>
      </div>

      {/* 5. Dynamic Tab View Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#07080d]">
        {activeTab === 'chat' && <MobileChatSheet />}

        {activeTab === 'peers' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs touch-scroll">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              <span>Friends in Room</span>
              <span className="text-emerald-400 font-mono">{room?.users?.length || 1} online</span>
            </div>

            {room?.users?.map((u) => {
              const isMe = u.id === userName;
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white">
                      {u.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-1">
                        <span>{u.name}</span>
                        {isMe && <span className="text-[10px] text-indigo-300">(You)</span>}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {u.isHost ? 'Room Host' : 'Viewer'}
                      </div>
                    </div>
                  </div>

                  {u.isHost && (
                    <div className="p-1 px-2 rounded-lg bg-amber-500/20 text-amber-300 font-bold flex items-center gap-1 text-[10px] border border-amber-500/30">
                      <Crown className="w-3 h-3" />
                      <span>Host</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'media' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs touch-scroll">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Change Video Stream
            </div>

            {/* Quick URL Input */}
            <form onSubmit={handleLoadUrl} className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-300">
                Stream / YouTube URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Paste YouTube, MP4 or HLS m3u8 link..."
                  style={{ fontSize: '15px' }}
                  className="flex-1 glass-input rounded-xl px-3 py-2.5 text-white placeholder-slate-500"
                />
                <button
                  type="submit"
                  disabled={!inputUrl.trim()}
                  className="px-4 py-2.5 btn-cinema-primary disabled:opacity-30 rounded-xl font-bold active:scale-95"
                >
                  Load
                </button>
              </div>
            </form>

            {/* Local Video Matcher Trigger */}
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <FolderOpen className="w-4 h-4" />
                <span>Play Local Downloaded Video</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Watch high-bitrate movies downloaded on your phone with zero data usage when peers load their copy.
              </p>
              <button
                type="button"
                onClick={() => { triggerHaptic(10); setIsLocalFileOpen(true); }}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl active:scale-98 transition-all"
              >
                Select Local Video File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Sheets */}
      <LocalFilePicker 
        isOpen={isLocalFileOpen} 
        onClose={() => setIsLocalFileOpen(false)}
        onLocalBlobSelected={(blobUrl) => setGuestLocalBlobUrl(blobUrl)}
      />

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <TunnelModal 
        isOpen={isTunnelOpen}
        onClose={() => setIsTunnelOpen(false)}
      />
    </div>
  );
};
