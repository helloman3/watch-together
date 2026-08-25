import React from 'react';
import { useSocket } from '../context/SocketContext';

export const ReactionOverlay = () => {
  const { reactions } = useSocket();

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {reactions.map((r, i) => {
        // Random horizontal offset
        const leftPercent = 20 + ((r.id.charCodeAt(0) * 17) % 60);

        return (
          <div
            key={r.id}
            style={{ left: `${leftPercent}%`, bottom: '15%' }}
            className="absolute animate-float-up flex flex-col items-center select-none"
          >
            <span className="text-4xl filter drop-shadow-lg">{r.emoji}</span>
            <span className="text-[10px] font-semibold text-slate-300 bg-slate-900/80 px-1.5 py-0.5 rounded-full mt-1 border border-slate-700">
              {r.userName}
            </span>
          </div>
        );
      })}
    </div>
  );
};
