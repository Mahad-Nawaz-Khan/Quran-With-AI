'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import { QURAN_RECITERS, PLAYBACK_SPEEDS } from '@/lib/quran/constants';
import { usePersistentStore, playbackSpeedStore } from '@/lib/hooks/usePersistentState';
import type { PlaybackSpeed } from '@/lib/quran/types';

interface LoopRange {
  startAyah: number;
  endAyah: number;
}

interface AudioPlayerProps {
  audioUrl?: string;
  surahName?: string;
  ayahNumber?: number;
  totalAyahs?: number;
  selectedReciter?: string;
  onReciterChange?: (reciterId: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSelectAyahNumber?: (ayahNum: number) => void;
  isPlayingProp?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  loopRange?: LoopRange | null;
  onSetLoopRange?: (range: LoopRange | null) => void;
}

function parseSpeedValue(raw: number): PlaybackSpeed | null {
  return PLAYBACK_SPEEDS.find((item) => item === raw) ?? null;
}

function formatAudioTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function clampAyahBound(raw: number, fallback: number, maxAyah: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), Math.max(1, maxAyah));
}

function useAudioElementSync(params: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioUrl?: string;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  volume: number;
  isMuted: boolean;
  safePlay: () => void;
  safePause: () => void;
}) {
  const { audioRef, audioUrl, isPlaying, speed, volume, isMuted, safePlay, safePause } = params;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [audioRef, speed, audioUrl]);

  useEffect(() => {
    if (!audioUrl) return;
    if (isPlaying) {
      safePlay();
      return;
    }
    safePause();
  }, [isPlaying, audioUrl, safePlay, safePause]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [audioRef, volume, isMuted]);

  useEffect(() => {
    window.updateChatFabPosition?.();
    return () => {
      window.updateChatFabPosition?.();
    };
  }, []);
}

function useAudioTrackEvents(params: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  speed: PlaybackSpeed;
  isRepeat: boolean;
  loopRange?: LoopRange | null;
  ayahNumber?: number;
  safePlay: () => void;
  onNext?: () => void;
  onSelectAyahNumber?: (ayahNum: number) => void;
  setProgress: (val: number) => void;
  setDuration: (val: number) => void;
  setIsPlaying: (playing: boolean) => void;
}) {
  const {
    audioRef,
    speed,
    isRepeat,
    loopRange,
    ayahNumber,
    safePlay,
    onNext,
    onSelectAyahNumber,
    setProgress,
    setDuration,
    setIsPlaying,
  } = params;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => {
      setProgress(0);
      setDuration(audio.duration);
      audio.playbackRate = speed;
    };
    const onEnded = () => {
      if (isRepeat && loopRange && ayahNumber !== undefined) {
        if (ayahNumber < loopRange.endAyah) {
          onNext?.();
          return;
        }
        if (loopRange.startAyah === ayahNumber) {
          audio.currentTime = 0;
          safePlay();
          return;
        }
        onSelectAyahNumber?.(loopRange.startAyah);
        return;
      }
      if (isRepeat) {
        audio.currentTime = 0;
        safePlay();
        return;
      }
      setIsPlaying(false);
      onNext?.();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [
    audioRef,
    speed,
    isRepeat,
    loopRange,
    ayahNumber,
    safePlay,
    onNext,
    onSelectAyahNumber,
    setProgress,
    setDuration,
    setIsPlaying,
  ]);
}

function AudioTransportControls({
  firstDisabled,
  lastDisabled,
  playingState,
  onPrevious,
  onTogglePlay,
  onNext,
}: Readonly<{
  firstDisabled: boolean;
  lastDisabled: boolean;
  playingState: 'playing' | 'paused';
  onPrevious?: () => void;
  onTogglePlay: () => void;
  onNext?: () => void;
}>) {
  const isPlaying = playingState === 'playing';
  return (
    <div className="flex items-center justify-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={onPrevious}
        disabled={firstDisabled}
        aria-label="Previous Ayah"
        className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <SkipBack className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pause Audio' : 'Play Audio'}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:bg-[var(--primary-dark)] transition-transform active:scale-95 shadow-md"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={lastDisabled}
        aria-label="Next Ayah"
        className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <SkipForward className="w-4 h-4" />
      </button>
    </div>
  );
}

function AudioSeekBar({
  progress,
  duration,
  onSeek,
}: Readonly<{
  progress: number;
  duration: number;
  onSeek: (seconds: number) => void;
}>) {
  return (
    <div className="flex-1 min-w-[160px] flex items-center gap-2">
      <span className="text-[11px] font-mono text-[var(--text-muted)] min-w-[32px] text-center">
        {formatAudioTime(progress)}
      </span>
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 100}
        value={progress}
        onChange={(e) => onSeek(Number.parseFloat(e.target.value))}
        aria-label="Seek Audio"
        className="flex-1 h-1.5 bg-[var(--surface-elevated)] rounded-full cursor-pointer accent-[var(--primary)]"
      />
      <span className="text-[11px] font-mono text-[var(--text-muted)] min-w-[32px] text-center">
        {formatAudioTime(duration)}
      </span>
    </div>
  );
}

function AudioLoopAndSpeedControls({
  repeatMode,
  loopStart,
  loopEnd,
  maxAyah,
  speed,
  currentReciter,
  onToggleRepeat,
  onLoopStartChange,
  onLoopEndChange,
  onSpeedChange,
  onReciterChange,
}: Readonly<{
  repeatMode: 'on' | 'off';
  loopStart: number;
  loopEnd: number;
  maxAyah: number;
  speed: PlaybackSpeed;
  currentReciter: string;
  onToggleRepeat: () => void;
  onLoopStartChange: (val: number) => void;
  onLoopEndChange: (val: number) => void;
  onSpeedChange: (raw: string) => void;
  onReciterChange?: (id: string) => void;
}>) {
  const isRepeat = repeatMode === 'on';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleRepeat}
        aria-label="Repeat Loop"
        aria-pressed={isRepeat}
        title="Toggle repeat / A-B loop"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
          isRepeat
            ? 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)] font-semibold'
            : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
        }`}
      >
        <Repeat className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Loop</span>
      </button>

      <div className="flex items-center gap-1 text-xs">
        <label htmlFor="loop-start-ayah" className="sr-only">
          Loop Start Ayah
        </label>
        <input
          id="loop-start-ayah"
          type="number"
          min={1}
          max={maxAyah}
          value={loopStart}
          onChange={(e) => onLoopStartChange(Number(e.target.value))}
          aria-label="Loop Start Ayah"
          className="w-12 px-1.5 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-xs text-center text-[var(--foreground)]"
        />
        <span className="text-[var(--text-muted)]">–</span>
        <label htmlFor="loop-end-ayah" className="sr-only">
          Loop End Ayah
        </label>
        <input
          id="loop-end-ayah"
          type="number"
          min={1}
          max={maxAyah}
          value={loopEnd}
          onChange={(e) => onLoopEndChange(Number(e.target.value))}
          aria-label="Loop End Ayah"
          className="w-12 px-1.5 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-xs text-center text-[var(--foreground)]"
        />
      </div>

      <select
        aria-label="Playback Speed"
        value={String(speed)}
        onChange={(e) => onSpeedChange(e.target.value)}
        className="px-2 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
      >
        {PLAYBACK_SPEEDS.map((s) => (
          <option key={s} value={String(s)}>
            {s}x
          </option>
        ))}
      </select>

      <select
        aria-label="Reciter"
        value={currentReciter}
        onChange={(e) => onReciterChange?.(e.target.value)}
        className="max-w-[140px] px-2 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
      >
        {QURAN_RECITERS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function AudioVolumeControl({
  muteState,
  volume,
  onToggleMute,
  onVolumeChange,
}: Readonly<{
  muteState: 'muted' | 'unmuted';
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (val: number) => void;
}>) {
  const isMuted = muteState === 'muted';
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors"
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-red-500" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={isMuted ? 0 : volume}
        onChange={(e) => onVolumeChange(Number.parseFloat(e.target.value))}
        aria-label="Volume"
        className="w-16 h-1.5 bg-[var(--surface-elevated)] rounded-full cursor-pointer accent-[var(--primary)]"
      />
    </div>
  );
}

export default function AudioPlayer({
  audioUrl,
  surahName,
  ayahNumber,
  totalAyahs,
  selectedReciter: propReciter,
  onReciterChange,
  onPrevious,
  onNext,
  onSelectAyahNumber,
  isPlayingProp,
  onPlayingChange,
  loopRange,
  onSetLoopRange,
}: Readonly<AudioPlayerProps>) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const [speed, setSpeed] = usePersistentStore(playbackSpeedStore);
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const isPlaying = isPlayingProp ?? internalIsPlaying;
  const setIsPlaying = onPlayingChange ?? setInternalIsPlaying;

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isRepeat, setIsRepeat] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const maxAyah = totalAyahs ?? 286;
  const defaultStart = ayahNumber ?? 1;
  const defaultEnd = Math.min(defaultStart + 2, maxAyah);
  const [draftLoopStart, setDraftLoopStart] = useState(loopRange?.startAyah ?? defaultStart);
  const [draftLoopEnd, setDraftLoopEnd] = useState(loopRange?.endAyah ?? defaultEnd);

  const currentReciter = propReciter || 'ar.alafasy';
  const isFirst = ayahNumber !== undefined && ayahNumber <= 1;
  const isLast = ayahNumber !== undefined && totalAyahs !== undefined && ayahNumber >= totalAyahs;

  const safePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    playPromiseRef.current = audio.play();
    playPromiseRef.current
      .then(() => {
        playPromiseRef.current = null;
      })
      .catch(() => {
        playPromiseRef.current = null;
      });
  }, []);

  const safePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playPromiseRef.current) {
      playPromiseRef.current.then(() => audio.pause()).catch(() => {});
      return;
    }
    audio.pause();
  }, []);

  useAudioElementSync({
    audioRef,
    audioUrl,
    isPlaying,
    speed,
    volume,
    isMuted,
    safePlay,
    safePause,
  });

  useAudioTrackEvents({
    audioRef,
    speed,
    isRepeat,
    loopRange,
    ayahNumber,
    safePlay,
    onNext,
    onSelectAyahNumber,
    setProgress,
    setDuration,
    setIsPlaying,
  });

  if (!audioUrl) return null;

  const handleLoopStartChange = (raw: number) => {
    const nextStart = clampAyahBound(raw, 1, maxAyah);
    const nextEnd = Math.max(nextStart, draftLoopEnd);
    setDraftLoopStart(nextStart);
    setDraftLoopEnd(nextEnd);
    onSetLoopRange?.({ startAyah: nextStart, endAyah: nextEnd });
  };

  const handleLoopEndChange = (raw: number) => {
    const nextEnd = clampAyahBound(raw, maxAyah, maxAyah);
    const nextStart = Math.min(draftLoopStart, nextEnd);
    setDraftLoopStart(nextStart);
    setDraftLoopEnd(nextEnd);
    onSetLoopRange?.({ startAyah: nextStart, endAyah: nextEnd });
  };

  const handleToggleRepeat = () => {
    const next = !isRepeat;
    setIsRepeat(next);
    if (next && !loopRange) {
      onSetLoopRange?.({ startAyah: draftLoopStart, endAyah: draftLoopEnd });
    }
  };

  const handleSpeedChange = (rawValue: string) => {
    const parsed = parseSpeedValue(Number(rawValue));
    if (parsed === null) return;
    setSpeed(parsed);
    if (audioRef.current) {
      audioRef.current.playbackRate = parsed;
    }
  };

  return (
    <section
      id="audio-player-bar"
      aria-label="Audio Player"
      className="fixed bottom-0 left-0 right-0 bg-[var(--card-bg)] border-t border-[var(--border)] text-[var(--foreground)] z-40 shadow-2xl"
    >
      <audio
        id="quran-audio"
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onError={() => {
          setPlaybackError('Failed to load recitation audio.');
          setIsPlaying(false);
        }}
      >
        <track kind="captions" />
      </audio>

      {playbackError && (
        <div
          role="alert"
          className="bg-red-500/15 border-b border-red-500/30 text-red-500 text-xs px-4 py-1.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{playbackError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPlaybackError(null)}
            className="text-red-500 hover:opacity-80 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-[110px]">
            <p className="font-semibold text-[var(--foreground)] text-xs sm:text-sm truncate">
              {surahName}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Ayah {ayahNumber} {totalAyahs ? `of ${totalAyahs}` : ''}
            </p>
          </div>

          <AudioTransportControls
            firstDisabled={isFirst}
            lastDisabled={isLast}
            playingState={isPlaying ? 'playing' : 'paused'}
            onPrevious={onPrevious}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onNext={onNext}
          />

          <AudioSeekBar
            progress={progress}
            duration={duration}
            onSeek={(seconds) => {
              if (audioRef.current) audioRef.current.currentTime = seconds;
              setProgress(seconds);
            }}
          />

          <AudioLoopAndSpeedControls
            repeatMode={isRepeat ? 'on' : 'off'}
            loopStart={draftLoopStart}
            loopEnd={draftLoopEnd}
            maxAyah={maxAyah}
            speed={speed}
            currentReciter={currentReciter}
            onToggleRepeat={handleToggleRepeat}
            onLoopStartChange={handleLoopStartChange}
            onLoopEndChange={handleLoopEndChange}
            onSpeedChange={handleSpeedChange}
            onReciterChange={onReciterChange}
          />

          <AudioVolumeControl
            muteState={isMuted ? 'muted' : 'unmuted'}
            volume={volume}
            onToggleMute={() => setIsMuted((prev) => !prev)}
            onVolumeChange={(nextVol) => {
              setVolume(nextVol);
              if (nextVol > 0 && isMuted) setIsMuted(false);
            }}
          />
        </div>
      </div>
    </section>
  );
}
