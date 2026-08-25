import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { 
  Send, 
  Users, 
  Crown, 
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Sparkles,
  Smile,
  Clock,
  Volume2,
  Mic,
  ShieldCheck,
  Radio
} from 'lucide-react';

export const DesktopSidebar = ({ isOpen, onToggle }) => {
  const { 
    room, 
    socket, 
    messages, 
    sendChatMessage, 
    sendReaction,
    userName,
    latency 
  } = useSocket();

  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'peers'
  const [emojiCount, setEmojiCount] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const messagesEndRef = useRef(null);
  const emojiResetTimerRef = useRef(null);

  const quickEmojis = ['❤️', '😂', '🔥', '🍿', '😱', '👏', '🎉', '👀'];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cooldown countdown timer
  useEffect(() => {
    let interval = null;
    if (cooldownRemaining > 0) {
      interval = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            setEmojiCount(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldownRemaining]);

  const handleSendReaction = (emoji) => {
    if (cooldownRemaining > 0) return;

    const nextCount = emojiCount + 1;
    setEmojiCount(nextCount);
    sendReaction(emoji);

    if (nextCount >= 5) {
      setCooldownRemaining(10);
      if (emojiResetTimerRef.current) clearTimeout(emojiResetTimerRef.current);
    } else {
      if (emojiResetTimerRef.current) clearTimeout(emojiResetTimerRef.current);
      emojiResetTimerRef.current = setTimeout(() => {
        setEmojiCount(0);
      }, 4000);
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    sendChatMessage(inputText);
    setInputText('');
  };

  const totalUserMessages = messages.filter(m => m.type !== 'system').length;

  if (!isOpen) {
    return (
      <div className="w-12 border-l border-white/[0.08] glass-panel flex flex-col items-center py-4 justify-between z-20">
        <button
          onClick={onToggle}
          className="p-2.5 rounded-xl glass-card-interactive text-slate-300 hover:text-white cursor-pointer"
          title="Expand Sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <button 
            onClick={() => { onToggle(); setActiveTab('chat'); }} 
            className="p-2 rounded-lg hover:text-white cursor-pointer hover:bg-white/5 relative"
            title="Open Chat"
          >
            <MessageSquare className="w-4 h-4" />
            {totalUserMessages > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500" />
            )}
          </button>
          <button 
            onClick={() => { onToggle(); setActiveTab('peers'); }} 
            className="p-2 rounded-lg hover:text-white cursor-pointer hover:bg-white/5"
            title="Open Peers"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>
    );
  }

  return (
    <aside className="w-80 lg:w-96 border-l border-white/[0.08] glass-panel flex flex-col h-full select-none z-20 transition-all">
      {/* Header Tabs */}
      <div className="p-3 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/[0.06] text-xs">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-glass-glow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat ({totalUserMessages})</span>
          </button>

          <button
            onClick={() => setActiveTab('peers')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'peers'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-glass-glow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Peers ({room?.users?.length || 1})</span>
          </button>
        </div>

        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Collapse Sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col min-h-0 text-xs">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 py-16">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="font-bold text-white text-sm">Room Chat Active</p>
                <p className="text-xs mt-1 text-slate-400">Say hello or react with an emoji below!</p>
              </div>
            )}

            {messages.map((msg) => {
              if (msg.type === 'system') {
                return (
                  <div key={msg.id} className="text-center text-[11px] text-indigo-300/80 py-1.5 px-3 bg-indigo-950/30 rounded-xl border border-indigo-500/20 shadow-sm font-medium">
                    <span>{msg.text}</span>
                  </div>
                );
              }

              const isMe = msg.userId === socket?.id;

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className={`text-[11px] font-bold ${isMe ? 'text-indigo-300' : 'text-slate-200'}`}>
                      {isMe ? 'You' : msg.userName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs font-medium break-words shadow-md ${
                      isMe
                        ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-br-none shadow-indigo-500/20'
                        : 'glass-panel-subtle text-slate-100 rounded-bl-none border border-white/[0.08]'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reaction Bar */}
          <div className="px-3 py-2 border-t border-white/[0.06] bg-black/40 relative">
            {cooldownRemaining > 0 ? (
              <div className="py-1.5 px-3 rounded-lg bg-amber-950/40 border border-amber-500/40 flex items-center justify-center gap-2 text-amber-300 font-bold text-[11px]">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Reaction Cooldown: {cooldownRemaining}s</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                {quickEmojis.map((emoji, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendReaction(emoji)}
                    className="hover:scale-125 active:scale-95 transition-transform text-xl p-1 cursor-pointer"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chat Message Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-white/[0.08] glass-panel">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message to room..."
                className="flex-1 glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="px-3.5 py-2.5 btn-cinema-primary disabled:opacity-30 rounded-xl cursor-pointer flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Connected Peers Hub */
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            <span>Room Members</span>
            <span className="text-emerald-400 font-mono">{room?.users?.length || 1} Connected</span>
          </div>

          {room?.users?.map((u) => {
            const isMe = u.id === socket?.id;
            return (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-xl glass-panel-subtle border border-white/[0.06] hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-xs text-white shadow-sm">
                      {u.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#07080d]" />
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>{u.name}</span>
                      {isMe && <span className="text-[10px] text-indigo-300 font-mono">(You)</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      {u.isHost ? (
                        <span className="text-amber-300 font-medium">Room Host</span>
                      ) : (
                        <span>Connected Peer</span>
                      )}
                    </div>
                  </div>
                </div>

                {u.isHost && (
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold flex items-center gap-1 text-[11px] border border-amber-500/30">
                    <Crown className="w-3.5 h-3.5" />
                    <span>Host</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};
