import React from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { WebRTCProvider } from './context/WebRTCContext';
import { useDeviceMode } from './utils/useDeviceMode';
import { DesktopLobby } from './components/desktop/DesktopLobby';
import { DesktopRoom } from './components/desktop/DesktopRoom';
import { MobileLobby } from './components/mobile/MobileLobby';
import { MobileRoom } from './components/mobile/MobileRoom';
import { Film, Loader2 } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-[#07080d] text-slate-100 p-6 flex flex-col items-center justify-center text-center select-none ambient-mesh">
          <div className="max-w-md w-full glass-panel border border-red-500/40 rounded-3xl p-6 shadow-glass-card">
            <h2 className="text-lg font-black text-red-400 mb-2">Display Error Detected</h2>
            <p className="text-xs text-slate-300 mb-4 bg-black/60 p-3.5 rounded-2xl border border-red-500/20 break-all text-left font-mono">
              {this.state.error?.message || this.state.error?.toString()}
            </p>
            <button
              onClick={() => {
                sessionStorage.clear();
                localStorage.removeItem('wt_room_code');
                this.setState({ hasError: false, error: null });
                window.location.href = window.location.origin;
              }}
              className="w-full py-3.5 btn-cinema-primary text-white font-extrabold rounded-2xl text-xs cursor-pointer shadow-lg"
            >
              Reset Session & Return to Cinema Lobby
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent = () => {
  const { room, isRejoining } = useSocket();
  const { isMobile } = useDeviceMode();

  if (isRejoining && !room) {
    return (
      <div className="w-screen h-screen bg-[#07080d] flex flex-col items-center justify-center select-none ambient-mesh animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-extrabold flex items-center justify-center text-sm shadow-glass-glow mb-4 border border-white/20">
          <Film className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl glass-panel text-white text-xs font-bold shadow-lg border border-white/10">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          <span>Reconnecting to Cinema Room...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen bg-[#07080d]">
      {room ? (
        isMobile ? <MobileRoom /> : <DesktopRoom />
      ) : (
        isMobile ? <MobileLobby /> : <DesktopLobby />
      )}
    </div>
  );
};

export function App() {
  return (
    <ErrorBoundary>
      <SocketProvider>
        <WebRTCProvider>
          <AppContent />
        </WebRTCProvider>
      </SocketProvider>
    </ErrorBoundary>
  );
}

export default App;
