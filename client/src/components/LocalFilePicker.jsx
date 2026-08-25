import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useDeviceMode } from '../utils/useDeviceMode';
import { 
  FolderOpen, 
  X, 
  Check, 
  HardDrive,
  Film
} from 'lucide-react';

export const LocalFilePicker = ({ isOpen, onClose, onLocalBlobSelected }) => {
  const { isHost, changeMedia, room } = useSocket();
  const { triggerHaptic } = useDeviceMode();
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const lastBlobUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current);
        lastBlobUrlRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    triggerHaptic(15);
    setSelectedFile(file);
    setFileName(file.name);
  };

  const handleConfirm = () => {
    if (!selectedFile) return;
    triggerHaptic(20);

    const localBlobUrl = URL.createObjectURL(selectedFile);
    if (lastBlobUrlRef.current && lastBlobUrlRef.current !== localBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrlRef.current); } catch (e) {}
    }
    lastBlobUrlRef.current = localBlobUrl;

    if (onLocalBlobSelected) {
      onLocalBlobSelected(localBlobUrl, selectedFile.name);
    }

    if (isHost) {
      changeMedia('local_file', localBlobUrl, selectedFile.name);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="w-full max-w-md glass-panel border border-white/[0.12] rounded-3xl p-6 shadow-glass-card relative text-xs">
        {/* Close Button */}
        <button
          onClick={() => { triggerHaptic(10); onClose(); }}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.08]">
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <HardDrive className="w-4 h-4" />
          </div>
          <h3 className="font-extrabold text-white text-base">Select Local Video File</h3>
        </div>

        {/* Explanation */}
        <p className="text-slate-400 text-xs leading-relaxed mb-4">
          Select a downloaded video file on your device. When peers load their matching copy, you watch together with <span className="text-emerald-400 font-bold">100% sync & 0 data bandwidth</span>.
        </p>

        {/* Target File Prompt */}
        {room?.media?.type === 'local_file' && room.media.title && (
          <div className="mb-4 p-3.5 bg-black/50 border border-white/[0.08] rounded-2xl text-[11px]">
            <span className="text-slate-400 block mb-1 font-bold">Host is playing:</span>
            <span className="text-indigo-300 font-bold font-mono break-all">{room.media.title}</span>
          </div>
        )}

        {/* File Dropzone */}
        <label className="border-2 border-dashed border-white/20 hover:border-indigo-500/70 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-white/[0.02] hover:bg-white/[0.05] transition-all mb-5 group">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <FolderOpen className="w-6 h-6" />
          </div>
          <span className="text-white font-bold mb-1 text-center truncate max-w-[280px]">
            {fileName ? fileName : 'Tap to Browse Video File'}
          </span>
          <span className="text-slate-500 text-[11px] font-mono">
            MP4, MKV, WebM, MOV supported
          </span>
          <input
            type="file"
            accept="video/*,.mkv,.mp4,.webm,.mov,.avi"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5">
          <button
            onClick={() => { triggerHaptic(10); onClose(); }}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedFile}
            className="px-5 py-2.5 btn-cinema-primary text-xs rounded-xl disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer shadow-glass-glow"
          >
            <Check className="w-4 h-4" />
            <span>Load Video</span>
          </button>
        </div>
      </div>
    </div>
  );
};
