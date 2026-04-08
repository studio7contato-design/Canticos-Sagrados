console.log("Player.tsx module loaded");
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Download, Heart, Shuffle, Repeat } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Song } from '../lib/supabase';
import { formatTime, cn } from '../lib/utils';

interface PlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  isPro: boolean;
  onSubscribe: () => void;
  favorites: string[];
  onToggleFavorite: (e: React.MouseEvent, songId: string) => void;
  downloadedSongs: Song[];
  onDownloadToApp: (song: Song) => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: 'none' | 'one' | 'all';
  onToggleRepeat: () => void;
}

export const Player: React.FC<PlayerProps> = ({
  currentSong,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  isPro,
  onSubscribe,
  favorites,
  onToggleFavorite,
  downloadedSongs,
  onDownloadToApp,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onToggleRepeat
}) => {
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => onTogglePlay());
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime || 0;
      const duration = audioRef.current.duration || 0;
      setCurrentTime(current);
      if (duration > 0) {
        setProgress((current / duration) * 100);
      } else {
        setProgress(0);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const duration = audioRef.current?.duration || 0;
    const seekValue = Number(e.target.value);
    if (!isNaN(duration) && duration > 0) {
      const seekTime = (seekValue / 100) * duration;
      if (audioRef.current) {
        audioRef.current.currentTime = seekTime;
        setProgress(seekValue);
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const handleDownload = async () => {
    if (!isPro || !currentSong) {
      onSubscribe();
      return;
    }

    try {
      // Se a URL for apenas o nome do arquivo (ex: 'hino.mp3'), 
      // você usaria a função getSongUrl aqui.
      // Para este exemplo, vamos baixar a URL direta.
      const response = await fetch(currentSong.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSong.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar música:', error);
    }
  };

  if (!currentSong) return null;

  return (
    <div className={cn(
      "fixed z-50 apple-blur border-gray-200/50 transition-all duration-300",
      "bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-lg rounded-3xl border shadow-xl px-4 py-3",
      "lg:bottom-0 lg:left-0 lg:right-0 lg:translate-x-0 lg:w-full lg:max-w-none lg:rounded-none lg:border-t lg:px-6 lg:py-4 lg:pb-6"
    )}>
      <audio
        ref={audioRef}
        src={currentSong.url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={onNext}
      />
      
      <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
        {/* Song Info */}
        <div className="flex items-center gap-3 w-1/3">
          <img 
            src={currentSong.cover_url} 
            alt={currentSong.title} 
            className="w-12 h-12 rounded-lg object-cover shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div className="hidden sm:block overflow-hidden">
            <h4 className="font-semibold text-sm truncate">{currentSong.title}</h4>
            <p className="text-xs text-gray-500 truncate">{currentSong.category} • {currentSong.theme}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="flex items-center gap-4 sm:gap-6">
            <button 
              onClick={onToggleShuffle}
              className={cn("hidden sm:block transition-colors", isShuffle ? "text-apple-red" : "text-gray-400 hover:text-gray-600")}
            >
              <Shuffle size={18} />
            </button>
            <button onClick={onPrev} className="text-gray-600 hover:text-black transition-colors">
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button 
              onClick={onTogglePlay}
              className="w-10 h-10 flex items-center justify-center bg-black text-white rounded-full hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
            </button>
            <button onClick={onNext} className="text-gray-600 hover:text-black transition-colors">
              <SkipForward size={24} fill="currentColor" />
            </button>
            <button 
              onClick={onToggleRepeat}
              className={cn("hidden sm:block transition-colors relative", repeatMode !== 'none' ? "text-apple-red" : "text-gray-400 hover:text-gray-600")}
            >
              <Repeat size={18} />
              {repeatMode === 'one' && (
                <span className="absolute -top-1 -right-1 bg-apple-red text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">1</span>
              )}
            </button>
          </div>
          
          <div className="w-full max-w-md flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-8 text-right">{formatTime(currentTime)}</span>
            <input 
              type="range" 
              value={progress} 
              onChange={handleSeek}
              className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-red"
            />
            <span className="text-[10px] text-gray-400 w-8">{formatTime(audioRef.current?.duration || 0)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 w-1/3">
          <button 
            onClick={(e) => onToggleFavorite(e, currentSong.id)}
            className={cn(
              "p-2 rounded-full transition-colors",
              favorites.includes(currentSong.id) ? "text-apple-red" : "text-gray-400 hover:text-apple-red"
            )}
          >
            <Heart size={20} fill={favorites.includes(currentSong.id) ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={() => onDownloadToApp(currentSong)}
            className={cn(
              "p-2 rounded-full transition-colors",
              downloadedSongs.find(s => s.id === currentSong.id) ? "text-green-500" : (isPro ? "text-gray-600 hover:bg-gray-100" : "text-gray-300")
            )}
            title={downloadedSongs.find(s => s.id === currentSong.id) ? "Baixada para ouvir offline" : (isPro ? "Baixar para o app" : "Assine para baixar")}
          >
            <Download size={20} />
          </button>
          <div className="hidden md:flex items-center gap-2 group/volume">
            <button 
              onClick={() => setVolume(v => v === 0 ? 0.7 : 0)}
              className="text-gray-400 hover:text-black transition-colors"
            >
              <Volume2 size={18} className={cn(volume === 0 && "text-gray-300")} />
            </button>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={volume} 
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
