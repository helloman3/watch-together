import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useWebRTC } from '../context/WebRTCContext';
import { extractYoutubeId } from '../utils/youtube';
import { 
  Link2, 
  Youtube, 
  Film, 
  Monitor, 
  FolderOpen, 
  Play, 
  History,
  Lock,
  ChevronDown,
  ChevronUp,
  Edit3,
  X,
  Radio,
  Loader2,
  Sparkles,
  AlertCircle,
  Trash2
} from 'lucide-react';

export const BrowserTabShare = ({ onSelectLocalFile }) => {
  const { room, isHost, changeMedia, recentUrls, clearRecentUrls, userName } = useSocket();
  const { isScreenSharing, startScreenShare, stopScreenShare, screenShareHasAudio, screenAudioMuted } = useWebRTC();

  const [inputUrl, setInputUrl] = useState('');
  const [activeTab, setActiveTab] = useState('url'); // 'url' | 'youtube' | 'local' | 'screen'
  const [showHistory, setShowHistory] = useState(false);
  const [isPickerExpanded, setIsPickerExpanded] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolverNotice, setResolverNotice] = useState(null);
  const historyDropdownRef = useRef(null);
  const isScreenShareSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target)) {
        setShowHistory(false);
      }
    };
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showHistory]);

  const media = room?.media || { type: 'none', url: '' };
  const hasActiveMedia = media.type !== 'none' && !!media.url;

  const handleStartScreenShare = async () => {
    try {
      const stream = await startScreenShare();
      if (stream) {
        changeMedia('screen_share', 'Screen Share Stream', `${userName || 'Host'}'s Screen Share`);
        setIsPickerExpanded(false);
        setResolverNotice(null);
      }
    } catch (e) {
      console.warn('Screen share start failed:', e);
    }
  };

  const handleLoadUrl = async (e) => {
    e?.preventDefault();
    if (!inputUrl.trim() || isResolving) return;

    if (isScreenSharing) {
      stopScreenShare();
    }

    const trimmed = inputUrl.trim();
    setResolverNotice(null);

    // 1. Direct YouTube link
    const ytId = extractYoutubeId(trimmed);
    if (ytId || trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      changeMedia('youtube', trimmed, trimmed);
      setInputUrl('');
      setShowHistory(false);
      setIsPickerExpanded(false);
      return;
    }

    // 2. Direct Video / HLS Stream
    if (trimmed.match(/\.(mp4|m3u8|webm|ogg|mov|mkv)(\?.*)?$/i)) {
      const title = trimmed.split('/').pop().split('?')[0] || 'Direct Stream';
      changeMedia('video_url', trimmed, decodeURIComponent(title));
      setInputUrl('');
      setShowHistory(false);
      setIsPickerExpanded(false);
      return;
    }

    // 3. Fallback video URL
    const title = trimmed.split('/').pop().split('?')[0] || 'Web Stream';
    changeMedia('video_url', trimmed, decodeURIComponent(title));
    setInputUrl('');
    setShowHistory(false);
    setIsPickerExpanded(false);
  };

  const handleSelectRecent = (item) => {
    if (isScreenSharing) {
      stopScreenShare();
    }
    changeMedia(item.type, item.url, item.title || item.url);
    setShowHistory(false);
    setIsPickerExpanded(false);
  };

  const handleClearMedia = () => {
    if (isScreenSharing) {
      stopScreenShare();
    }
    changeMedia('none', '', '');
    setIsPickerExpanded(true);
  };

  if (!isHost && room?.hostOnlyControl) {
    return (
      <div className="px-6 py-2 glass-panel border-b border-white/[0.08] text-xs text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold text-white truncate">
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400">Host Control:</span>
          <span className="text-indigo-300 font-mono truncate">{media.title || media.url || 'Waiting for stream...'}</span>
        </span>
      </div>
    );
  }

  // 1. Compact "Now Playing" Bar
  if (hasActiveMedia && !isPickerExpanded) {
    return (
      <div className="glass-panel border-b border-white/[0.08] px-6 py-2 flex items-center justify-between text-xs z-10 transition-all select-none">
        {/* Left: Media Badge + Title */}
        <div className="flex items-center gap-3 truncate mr-3">
          {media.type === 'youtube' && (
            <div className="px-2.5 py-0.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-extrabold flex items-center gap-1 shrink-0 uppercase tracking-wider">
              <Youtube className="w-3 h-3" />
              <span>YouTube</span>
            </div>
          )}
          {media.type === 'video_url' && (
            <div className="px-2.5 py-0.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-extrabold flex items-center gap-1 shrink-0 uppercase tracking-wider">
              <Film className="w-3 h-3" />
              <span>Stream</span>
            </div>
          )}
          {media.type === 'local_file' && (
            <div className="px-2.5 py-0.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold flex items-center gap-1 shrink-0 uppercase tracking-wider">
              <FolderOpen className="w-3 h-3" />
              <span>Local Video</span>
            </div>
          )}
          {media.type === 'screen_share' && (
            <div className="px-2.5 py-0.5 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30 text-[10px] font-extrabold flex items-center gap-1 shrink-0 uppercase tracking-wider">
              <Monitor className="w-3 h-3" />
              <span>Screen Share</span>
            </div>
          )}

          <span className="font-bold text-white truncate text-xs">
            {media.title || media.url}
          </span>
        </div>

        {/* Right: Change Media / Clear buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsPickerExpanded(true)}
            className="px-3 py-1 rounded-xl glass-card-interactive text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Change video or stream"
          >
            <Edit3 className="w-3 h-3 text-indigo-300" />
            <span>Change Source</span>
          </button>

          {isHost && (
            <button
              onClick={handleClearMedia}
              className="p-1 rounded-xl glass-panel-subtle hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-white/10 hover:border-red-500/50 transition-colors cursor-pointer"
              title="Stop current media"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. Full Media Input Bar (expanded mode)
  return (
    <div className="glass-panel border-b border-white/[0.08] px-6 py-3 relative z-10 select-none animate-fade-in">
      {/* Top row: Source Tabs & Recent */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('url')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'url'
                ? 'btn-cinema-primary shadow-glass-glow'
                : 'glass-panel-subtle text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-indigo-300" />
            <span>Direct / HLS Stream</span>
          </button>

          <button
            onClick={() => setActiveTab('youtube')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'youtube'
                ? 'bg-red-600 text-white shadow-md'
                : 'glass-panel-subtle text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <Youtube className="w-3.5 h-3.5 text-red-400" />
            <span>YouTube Link</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('local');
              if (onSelectLocalFile) onSelectLocalFile();
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'local'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'glass-panel-subtle text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local Video File</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('screen');
              if (!isScreenSharing) handleStartScreenShare();
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'screen'
                ? 'bg-purple-600 text-white shadow-md'
                : 'glass-panel-subtle text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-purple-400" />
            <span>Live Tab Share</span>
          </button>
        </div>

        {/* Right Action: Recent History & Collapse */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {recentUrls && recentUrls.length > 0 && (
            <div ref={historyDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="px-3 py-1.5 rounded-xl glass-panel-subtle hover:bg-white/10 text-white border border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Recent Watch History"
              >
                <History className="w-3.5 h-3.5 text-amber-400" />
                <span>Recent</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* History Dropdown */}
              {showHistory && (
                <div className="absolute right-0 top-full mt-1.5 w-80 glass-panel border border-white/15 rounded-2xl shadow-2xl p-2 z-50 animate-fade-in">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/[0.08] mb-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Recently Watched
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRecentUrls();
                        setShowHistory(false);
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto no-scrollbar space-y-1">
                    {recentUrls.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectRecent(item)}
                        className="w-full text-left p-2 rounded-xl hover:bg-white/[0.08] text-white text-xs flex items-center gap-2 truncate transition-colors cursor-pointer group"
                      >
                        {item.type === 'youtube' ? <Youtube className="w-3.5 h-3.5 text-red-400 shrink-0" /> : <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                        <span className="truncate group-hover:text-indigo-300">{item.title || item.url}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasActiveMedia && (
            <button
              onClick={() => setIsPickerExpanded(false)}
              className="p-1.5 rounded-xl glass-panel-subtle hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 cursor-pointer"
              title="Collapse Media Bar"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* URL Input Form */}
      {(activeTab === 'url' || activeTab === 'youtube') && (
        <form onSubmit={handleLoadUrl} className="flex flex-col gap-2">
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                {activeTab === 'youtube' ? <Youtube className="w-4 h-4 text-red-400" /> : <Link2 className="w-4 h-4 text-indigo-400" />}
              </div>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (resolverNotice) setResolverNotice(null);
                }}
                disabled={isResolving}
                placeholder={
                  activeTab === 'youtube'
                    ? 'Paste YouTube URL (watch, shorts, youtu.be...)'
                    : 'Paste Anime Episode, Movie Link, or Stream (.m3u8, .mp4, URL)'
                }
                className="w-full pl-10 pr-4 py-2.5 glass-input rounded-xl text-white font-medium placeholder-slate-500 text-xs disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isResolving || !inputUrl.trim()}
              className="px-5 py-2.5 btn-cinema-primary text-xs font-extrabold rounded-xl shadow-glass-glow flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isResolving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  <span>Resolving Stream...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Load</span>
                </>
              )}
            </button>
          </div>

          {resolverNotice && (
            <div className="p-3 rounded-xl bg-purple-950/50 border border-purple-500/40 flex items-center justify-between gap-3 animate-fade-in text-xs">
              <div className="flex items-center gap-2 text-purple-200">
                <AlertCircle className="w-4 h-4 text-purple-400 shrink-0" />
                <span>{resolverNotice.message}</span>
              </div>
              <button
                type="button"
                onClick={handleStartScreenShare}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold flex items-center gap-1.5 shadow transition-all cursor-pointer whitespace-nowrap"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Stream via Tab Share</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* Screen Share Tab */}
      {activeTab === 'screen' && (
        <div className="space-y-2.5 animate-fade-in">
          <div className="p-4 rounded-2xl glass-panel-subtle border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                <Monitor className={`w-5 h-5 ${isScreenSharing ? 'animate-pulse text-emerald-400' : ''}`} />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>{isScreenSharing ? 'Currently Broadcasting Browser Tab / Screen' : 'Live Tab & Screen Share'}</span>
                  {isScreenSharing && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] uppercase tracking-wider font-extrabold animate-pulse">
                      Live
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  {!isScreenShareSupported
                    ? 'Screen Broadcasting is available on PC / Mac. On mobile, host easily using Local Video or YouTube!'
                    : isScreenSharing
                    ? 'Your tab and audio are streaming in high framerate.'
                    : 'Select "Chrome Tab" and check "Also share tab audio" for synced sound.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {isScreenSharing ? (
                <button
                  type="button"
                  onClick={() => {
                    stopScreenShare();
                    changeMedia('none', '', '');
                  }}
                  className="px-4 py-2 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Stop Sharing</span>
                </button>
              ) : isScreenShareSupported ? (
                <button
                  type="button"
                  onClick={handleStartScreenShare}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-purple-glow transition-all cursor-pointer"
                >
                  <Monitor className="w-4 h-4" />
                  <span>Start Sharing Browser Tab</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('youtube')}
                  className="px-4 py-2 rounded-xl btn-cinema-primary text-xs flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Paste Link</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
