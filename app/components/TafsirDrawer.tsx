'use client';

import { useEffect, useRef, useState } from 'react';
import { X, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { TAFSIR_EDITIONS, DEFAULT_TAFSIR_SLUG } from '@/lib/quran/constants';
import { fetchTafsir } from '@/lib/quran/api';
import type { TafsirResponse } from '@/lib/quran/types';

interface TafsirDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  arabicText?: string;
  translationText?: string;
}

interface TafsirParagraph {
  id: string;
  isHeading: boolean;
  text: string;
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&rsquo;': '\u2019',
  '&lsquo;': '\u2018',
  '&rdquo;': '\u201D',
  '&ldquo;': '\u201C',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
};

const ENTITY_REGEX = /&[a-z0-9#]{2,8};/gi;
const NUMERIC_ENTITY_REGEX = /&#(\d{1,6});/g;
const HTML_TAG_REGEX = /<[^>]{1,120}>/g;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(ENTITY_REGEX, (match) => ENTITY_MAP[match.toLowerCase()] ?? match)
    .replace(NUMERIC_ENTITY_REGEX, (_m, code: string) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) && parsed > 0 ? String.fromCodePoint(parsed) : '';
    });
}

function parseTafsirParagraphs(rawHtml: string): TafsirParagraph[] {
  const normalized = rawHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, '\n[H$1]')
    .replace(/<\/h[1-6]>/gi, '\n');

  const stripped = decodeHtmlEntities(normalized.replace(HTML_TAG_REGEX, ' '));
  const lines = stripped.split('\n');
  const paragraphs: TafsirParagraph[] = [];

  for (const rawLine of lines) {
    const clean = rawLine.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const isHeading = clean.startsWith('[H') && clean.indexOf(']') === 3;
    const text = isHeading ? clean.slice(4).trim() : clean;
    if (!text) continue;
    paragraphs.push({
      id: `para-${paragraphs.length}-${text.slice(0, 16)}`,
      isHeading,
      text,
    });
  }
  return paragraphs;
}

function useTafsirData(params: {
  isOpen: boolean;
  surahNumber: number;
  ayahNumber: number;
  selectedSlug: string;
  retryToken: number;
}) {
  const { isOpen, surahNumber, ayahNumber, selectedSlug, retryToken } = params;
  const [tafsirData, setTafsirData] = useState<TafsirResponse | null>(null);
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
      void fetchTafsir(surahNumber, ayahNumber, selectedSlug, controller.signal)
        .then((res) => {
          if (active) setTafsirData(res);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const msg = err instanceof Error ? err.message : 'Unable to load tafsir commentary.';
          setErrorMessage(msg);
          setTafsirData(null);
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
  }, [isOpen, surahNumber, ayahNumber, selectedSlug, retryToken]);

  return { tafsirData, loading, errorMessage };
}

function TafsirContentView({
  loadState,
  errorMessage,
  tafsirData,
  selectedSlug,
  onRetry,
}: Readonly<{
  loadState: 'loading' | 'ready';
  errorMessage: string | null;
  tafsirData: TafsirResponse | null;
  selectedSlug: string;
  onRetry: () => void;
}>) {
  if (loadState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-[var(--text-muted)]">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--primary)]" />
        <p className="text-xs">Loading classical commentary...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-500 text-xs"
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium">Commentary Unavailable</p>
          <p className="mt-0.5">{errorMessage}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-[11px] text-red-500 font-medium transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tafsirData) return null;

  const edition = TAFSIR_EDITIONS.find((t) => t.slug === selectedSlug);
  const direction = edition?.direction ?? 'ltr';
  const paragraphs = parseTafsirParagraphs(tafsirData.text);

  return (
    <div dir={direction} className="text-xs sm:text-sm text-[var(--foreground)] leading-relaxed space-y-3">
      {paragraphs.map((item) =>
        item.isHeading ? (
          <h3 key={item.id} className="text-sm sm:text-base font-bold text-[var(--primary)] pt-1">
            {item.text}
          </h3>
        ) : (
          <p key={item.id}>{item.text}</p>
        )
      )}
    </div>
  );
}

export default function TafsirDrawer({
  isOpen,
  onClose,
  surahNumber,
  ayahNumber,
  surahName,
  arabicText,
  translationText,
}: Readonly<TafsirDrawerProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>(DEFAULT_TAFSIR_SLUG);
  const [retryToken, setRetryToken] = useState(0);

  const { tafsirData, loading, errorMessage } = useTafsirData({
    isOpen,
    surahNumber,
    ayahNumber,
    selectedSlug,
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

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-2xl w-full"
    >
      <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4 flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[var(--primary)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Classical Tafsir</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Surah {surahName} • Verse {surahNumber}:{ayahNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tafsir drawer"
            className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-[var(--surface-elevated)] border-b border-[var(--border)] flex items-center gap-2 shrink-0 overflow-x-auto">
          <label htmlFor="tafsir-edition-select" className="text-xs text-[var(--text-muted)] shrink-0">
            Author / Book:
          </label>
          <select
            id="tafsir-edition-select"
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="flex-1 px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          >
            {TAFSIR_EDITIONS.map((edition) => (
              <option key={edition.slug} value={edition.slug}>
                {edition.name} ({edition.language})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-3 bg-[var(--surface-elevated)] rounded-xl space-y-2 border border-[var(--border)]">
            {arabicText && (
              <p className="font-arabic text-lg text-right text-[var(--foreground)] leading-relaxed" dir="rtl">
                {arabicText}
              </p>
            )}
            {translationText && (
              <p className="text-xs text-[var(--text-muted)] italic">
                &ldquo;{translationText}&rdquo;
              </p>
            )}
          </div>

          <TafsirContentView
            loadState={loading ? 'loading' : 'ready'}
            errorMessage={errorMessage}
            tafsirData={tafsirData}
            selectedSlug={selectedSlug}
            onRetry={() => setRetryToken((t) => t + 1)}
          />
        </div>

        <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between text-xs text-[var(--text-muted)] shrink-0">
          <span>Authoritative Tafsir from Quran.com API v4</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--border)] text-[var(--foreground)] rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
