import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

export const LaserPointer = ({ containerRef }) => {
  const { socket, sendCursorMove } = useSocket();
  const [remoteCursors, setRemoteCursors] = useState(new Map()); // userId -> { x, y, userName, isPointerDown, lastSeen }
  const throttleRef = useRef(0);

  // Track local mouse movements inside video container
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const handleMouseMove = (e) => {
      const now = Date.now();
      if (now - throttleRef.current < 40) return; // ~25 fps throttle
      throttleRef.current = now;

      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        sendCursorMove(x, y, e.buttons === 1);
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [containerRef, sendCursorMove]);

  // Listen for remote cursors
  useEffect(() => {
    if (!socket) return;

    const handleRemoteCursor = (data) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, {
          x: data.x,
          y: data.y,
          userName: data.userName,
          isPointerDown: data.isPointerDown,
          lastSeen: Date.now()
        });
        return next;
      });
    };

    socket.on('cursor_update', handleRemoteCursor);
    return () => socket.off('cursor_update', handleRemoteCursor);
  }, [socket]);

  // Cleanup old inactive cursors (after 4 seconds of inactivity)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, cur] of next) {
          if (now - cur.lastSeen > 4000) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {Array.from(remoteCursors.entries()).map(([userId, cur]) => (
        <div
          key={userId}
          style={{
            left: `${cur.x}%`,
            top: `${cur.y}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'left 0.05s linear, top 0.05s linear'
          }}
          className="absolute flex items-center gap-1.5 pointer-events-none"
        >
          {/* Laser Pointer Dot with Glow */}
          <div
            className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg transition-transform ${
              cur.isPointerDown ? 'scale-150 bg-red-500 shadow-red-500/80 ring-4 ring-red-500/40' : 'bg-indigo-500 shadow-indigo-500/80 ring-2 ring-indigo-500/30'
            }`}
          />
          {/* Username Tag */}
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900/90 text-white shadow border border-slate-700 whitespace-nowrap">
            {cur.userName}
          </span>
        </div>
      ))}
    </div>
  );
};
