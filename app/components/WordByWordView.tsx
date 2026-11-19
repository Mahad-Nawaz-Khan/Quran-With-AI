'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Languages, Volume2, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchWordByWord } from '@/lib/quran/api';
import type { WordByWordResponse, WordByWordToken } from '@/lib/quran/types';

interface WordByWordViewProps {
  isOpen: boolean;
  onClose: () => void;
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
}

function useWordByWordData(params: {
  isOpen: boolean;
  surahNumber: number;
  ayahNumber: number;
  retryToken: number;
}) {
  const { isOpen, surahNumber, ayahNumber, retryToken } = params;
  const [data, setData] = useState<WordByWordResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const controller = new AbortController();

    const startTimer = setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setErrorMessage(null);
      void fetchWordByWord(surahNumber, ayahNumber, controller.signal)
        .then((res) => {
          if (active) setData(res);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const msg = err instanceof Error ? err.message : 'Unable to load word morphology.';
          setErrorMessage(msg);
          setData(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(startTimer);
      controller.abort();
    };
  }, [isOpen, surahNumber, ayahNumber, retryToken]);

  return { data, loading, errorMessage };
}

function WordTokenCard({
  word,
  onPlayAudio,
}: Readonly<{
  word: WordByWordToken;
  onPlayAudio: (audioUrl?: string | null) => void;
}>) {
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3 flex flex-col items-center text-center min-w-[100px] sm:min-w-[120px] hover:border-[var(--primary)] transition-colors">
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          #{word.position}
        </span>
        {word.audioUrl && (
          <button
            type="button"
            onClick={() => onPlayAudio(word.audioUrl)}
            aria-label={`Play pronunciation for word ${word.position}`}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--primary)] rounded transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <span className="font-arabic text-2xl sm:text-3xl text-[var(--foreground)] my-1.5 leading-normal" dir="rtl">
        {word.arabic}
      </span>

      {word.transliteration && (
        <span className="text-[11px] font-medium text-[var(--primary)] mb-0.5">
          {word.transliteration}
        </span>
      )}

      <span className="text-xs text-[var(--text-muted)] leading-snug">
        {word.translation || '—'}
      </span>

      {word.root && (
        <span className="mt-1.5 px-1.5 py-0.5 bg-[var(--card-bg)] border border-[var(--border)] text-[10px] text-[var(--text-muted)] rounded font-arabic">
          Root: {word.root}
        </span>
      )}
    </div>
  );
}

function WordByWordBody({
  loadState,
  errorMessage,
  data,
  onRetry,
  onPlayAudio,
}: Readonly<{
  loadState: 'loading' | 'ready';
  errorMessage: string | null;
  data: WordByWordResponse | null;
  onRetry: () => void;
  onPlayAudio: (audioUrl?: string | null) => void;
}>) {
  if (loadState === 'loading') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: 8 }, (_, n) => `skeleton-${n + 1}`).map((id) => (
          <div
            key={id}
            className="h-28 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)]"
          />
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-sm flex items-start gap-3"
      >
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-red-500">{errorMessage}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 text-xs font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.words.length === 0) {
    return (
      <p className="text-center text-[var(--text-muted)] text-sm py-8">
        No word breakdown data found for this verse.
      </p>
    );
  }

  return (
    <div dir="rtl" className="flex flex-wrap gap-3 justify-center sm:justify-start">
      {data.words.map((word) => (
        <WordTokenCard
          key={`${word.position}-${word.arabic}`}
          word={word}
          onPlayAudio={onPlayAudio}
        />
      ))}
    </div>
  );
}

export default function WordByWordView({
  isOpen,
  onClose,
  surahNumber,
  ayahNumber,
  surahName,
}: Readonly<WordByWordViewProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const { data, loading, errorMessage } = useWordByWordData({
    isOpen,
    surahNumber,
    ayahNumber,
    retryToken,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, [onClose]);

  const handlePlayWordAudio = (audioUrl?: string | null) => {
    if (!audioUrl) return;
    audioRef.current?.pause();
    const fullUrl = audioUrl.startsWith('http')
      ? audioUrl
      : `https://audio.qurancdn.com/${audioUrl}`;
    const audio = new Audio(fullUrl);
    audioRef.current = audio;
    void audio.play().catch(() => {});
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-3xl w-full"
    >
      <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4 flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Languages className="w-5 h-5 text-[var(--primary)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Word-by-Word Morphology
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Surah {surahName} • Verse {surahNumber}:{ayahNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close word-by-word modal"
            className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <WordByWordBody
            loadState={loading ? 'loading' : 'ready'}
            errorMessage={errorMessage}
            data={data}
            onRetry={() => setRetryToken((t) => t + 1)}
            onPlayAudio={handlePlayWordAudio}
          />
        </div>
      </div>
    </dialog>
  );
}
