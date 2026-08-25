import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { DesktopHeader } from './DesktopHeader';
import { DesktopSidebar } from './DesktopSidebar';
import { BrowserTabShare } from '../BrowserTabShare';
import { VideoPlayer } from '../VideoPlayer';
import { LaserPointer } from '../LaserPointer';
import { ReactionOverlay } from '../ReactionOverlay';
import { LocalFilePicker } from '../LocalFilePicker';
import { SettingsModal } from '../SettingsModal';
import { TunnelModal } from '../TunnelModal';

export const DesktopRoom = () => {
  const { room } = useSocket();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLocalFileOpen, setIsLocalFileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTunnelOpen, setIsTunnelOpen] = useState(false);
  const [guestLocalBlobUrl, setGuestLocalBlobUrl] = useState(null);
  const videoPlayerContainerRef = useRef(null);

  // Clear guest local blob when host changes media
  useEffect(() => {
    if (room?.media?.type !== 'local_file') {
      setGuestLocalBlobUrl(null);
    }
  }, [room?.media?.url, room?.media?.type]);

  if (!room) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07080d] text-slate-100 overflow-hidden select-none ambient-mesh">
      {/* Top Studio Header */}
      <DesktopHeader 
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTunnel={() => setIsTunnelOpen(true)}
      />

      {/* Media Source Selector Bar */}
      <BrowserTabShare onSelectLocalFile={() => setIsLocalFileOpen(true)} />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left / Center Video Stage */}
        <main className="flex-1 relative flex items-center justify-center bg-black/80 min-h-0 overflow-hidden">
          {/* Subtle Ambient Backlight */}
          <div className="absolute inset-0 bg-radial from-indigo-900/10 via-transparent to-black pointer-events-none" />

          <div ref={videoPlayerContainerRef} className="relative w-full h-full flex items-center justify-center">
            {/* The Main Video Player */}
            <VideoPlayer 
              onSelectLocalFile={() => setIsLocalFileOpen(true)} 
              guestLocalBlobUrl={guestLocalBlobUrl}
            />

            {/* Synchronized Laser Pointer Overlay */}
            <LaserPointer containerRef={videoPlayerContainerRef} />

            {/* Floating Emoji Reactions Overlay */}
            <ReactionOverlay />
          </div>
        </main>

        {/* Right Collapsible Chat & Peers Sidebar */}
        <DesktopSidebar 
          isOpen={isSidebarOpen} 
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
        />
      </div>

      {/* Local Video File Picker Modal */}
      <LocalFilePicker 
        isOpen={isLocalFileOpen} 
        onClose={() => setIsLocalFileOpen(false)}
        onLocalBlobSelected={(blobUrl) => setGuestLocalBlobUrl(blobUrl)}
      />

      {/* Room & Audio Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      {/* Internet Tunnel Modal */}
      <TunnelModal 
        isOpen={isTunnelOpen}
        onClose={() => setIsTunnelOpen(false)}
      />
    </div>
  );
};
