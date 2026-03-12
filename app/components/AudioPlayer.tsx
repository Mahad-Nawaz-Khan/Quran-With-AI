'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat,
  List
} from 'lucide-react';

interface AudioPlayerProps {
  audioUrl?: string;
  surahName?: string;
  ayahNumber?: number;
  selectedReciter?: string;
  onReciterChange?: (reciterId: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  isPlayingProp?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}

const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.abdurrahmaansudais', name: 'Abdurrahman As-Sudais' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdul Samad' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
];

export default function AudioPlayer({
  audioUrl,
  surahName,
  ayahNumber,
  selectedReciter: propReciter,
  onReciterChange,
  onPrevious,
  onNext,
  isPlayingProp,
  onPlayingChange
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  
  // Use controlled isPlaying from prop if provided, otherwise use internal state
  const isPlaying = isPlayingProp !== undefined ? isPlayingProp : internalIsPlaying;
  const setIsPlaying = onPlayingChange || setInternalIsPlaying;
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isRepeat, setIsRepeat] = useState(false);
  const [showReciters, setShowReciters] = useState(false);

  // Use prop reciter if provided, otherwise fallback to default
  const currentReciter = propReciter || 'ar.alafasy';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play();
      } else {
        setIsPlaying(false);
        onNext?.();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isRepeat, onNext, setIsPlaying]);

  // Handle external isPlaying prop changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    
    if (isPlaying) {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl, setIsPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#1f2125] border-t border-[#2d2f33] audio-player z-40">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          {/* Surah Info - Mobile: compact, Desktop: full */}
          <div className="hidden sm:flex sm:min-w-[150px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white truncate text-sm">{surahName}</p>
              <p className="text-xs text-gray-400">Ayah {ayahNumber}</p>
            </div>
          </div>

          {/* Mobile: Surah info inline */}
          <div className="flex sm:hidden items-center justify-between">
            <p className="font-medium text-white text-sm truncate">{surahName} :{ayahNumber}</p>
          </div>

          {/* Main Controls - Always visible */}
          <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={onPrevious}
                className="p-1.5 sm:p-2 rounded-full hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#2ca4ab] text-white flex items-center justify-center hover:bg-[#258a90] transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />}
              </button>

              <button
                onClick={onNext}
                className="p-1.5 sm:p-2 rounded-full hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile: volume/reciter buttons */}
            <div className="flex sm:hidden items-center gap-1">
              <button
                onClick={() => setShowReciters(!showReciters)}
                className="p-1.5 rounded-full hover:bg-[#2d2f33] text-gray-400"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 flex items-center gap-1 sm:gap-2">
            <span className="text-xs text-gray-400 min-w-[35px] text-center">
              {formatTime(progress)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1 bg-[#2d2f33] rounded-full appearance-none cursor-pointer accent-[#2ca4ab]"
            />
            <span className="text-xs text-gray-400 min-w-[35px] text-center">
              {formatTime(duration)}
            </span>
          </div>

          {/* Secondary Controls - Desktop only */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setIsRepeat(!isRepeat)}
              className={`p-2 rounded-full hover:bg-[#2d2f33] transition-colors ${
                isRepeat ? 'text-[#2ca4ab]' : 'text-gray-400'
              }`}
            >
              <Repeat className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowReciters(!showReciters)}
                className="p-2 rounded-full hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              >
                <List className="w-4 h-4" />
              </button>

              {showReciters && (
                <div className="absolute bottom-full right-0 mb-2 w-56 bg-[#1f2125] border border-[#2d2f33] rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-[#2d2f33]">
                    <p className="text-sm font-medium text-white">Select Reciter</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {RECITERS.map((reciter) => (
                      <button
                        key={reciter.id}
                        onClick={() => {
                          onReciterChange?.(reciter.id);
                          setShowReciters(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[#2d2f33] transition-colors ${
                          currentReciter === reciter.id
                            ? 'text-[#2ca4ab] bg-[#2d2f33]'
                            : 'text-white'
                        }`}
                      >
                        {reciter.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Volume */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-full hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 lg:w-20 h-1 bg-[#2d2f33] rounded-full appearance-none cursor-pointer accent-[#2ca4ab]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Reciters Dropdown */}
      {showReciters && (
        <div className="sm:hidden absolute bottom-full left-0 right-0 bg-[#1f2125] border-b border-[#2d2f33] p-2 max-h-48 overflow-y-auto">
          {RECITERS.map((reciter) => (
            <button
              key={reciter.id}
              onClick={() => {
                onReciterChange?.(reciter.id);
                setShowReciters(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#2d2f33] transition-colors ${
                currentReciter === reciter.id
                  ? 'text-[#2ca4ab] bg-[#2d2f33]'
                  : 'text-white'
              }`}
            >
              {reciter.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
