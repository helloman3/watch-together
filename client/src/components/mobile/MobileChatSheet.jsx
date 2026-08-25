import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useDeviceMode } from '../../utils/useDeviceMode';
import { Send, Sparkles, Clock } from 'lucide-react';

export const MobileChatSheet = () => {
  const { 
    room, 
    socket, 
    messages, 
    sendChatMessage, 
    sendReaction 
  } = useSocket();
  const { triggerHaptic } = useDeviceMode();

  const [inputText, setInputText] = useState('');
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
    triggerHaptic(15);

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
    triggerHaptic(10);
    sendChatMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#07080d] select-none">
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 touch-scroll text-xs">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-10">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2">
              <Sparkles className="w-5 h-5" />
            </div>
            <p className="font-bold text-white text-xs">Live Chat Active</p>
            <p className="text-[11px] text-slate-400">Send messages or reactions while watching</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === 'system') {
            return (
              <div key={msg.id} className="text-center text-[10px] text-indigo-300/90 py-1 px-2.5 bg-indigo-950/30 rounded-xl border border-indigo-500/20 shadow-sm">
                <span>{msg.text}</span>
              </div>
            );
          }

          const isMe = msg.userId === socket?.id;

          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                <span className={`text-[10px] font-bold ${isMe ? 'text-indigo-300' : 'text-slate-300'}`}>
                  {isMe ? 'You' : msg.userName}
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div
                className={`max-w-[88%] px-3.5 py-2 rounded-2xl text-xs font-medium break-words shadow-sm ${
                  isMe
                    ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-br-none'
                    : 'bg-[#131624] text-slate-100 rounded-bl-none border border-white/[0.08]'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reaction Emoji Bar */}
      <div className="px-3 py-1.5 border-t border-white/[0.06] bg-[#090b14] relative">
        {cooldownRemaining > 0 ? (
          <div className="py-1 px-2.5 rounded-lg bg-amber-950/40 border border-amber-500/30 flex items-center justify-center gap-1.5 text-amber-300 font-bold text-[10px]">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Cooldown: {cooldownRemaining}s</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-0.5">
            {quickEmojis.map((emoji, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendReaction(emoji)}
                className="text-lg p-1 active:scale-125 transition-transform cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat input form */}
      <form onSubmit={handleSend} className="p-2.5 border-t border-white/[0.08] bg-[#0d0f1a] pb-safe">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Send message..."
            style={{ fontSize: '15px' }}
            className="flex-1 glass-input rounded-xl px-3 py-2 text-white placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-3.5 py-2 btn-cinema-primary disabled:opacity-30 rounded-xl active:scale-95 transition-transform flex items-center justify-center shadow-md"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
