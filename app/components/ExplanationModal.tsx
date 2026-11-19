'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { X, Sparkles, AlertCircle, Copy, Check, RefreshCw, CheckCircle2 } from 'lucide-react';
import ThinkingLoader from './ThinkingLoader';
import { streamExplain } from '@/lib/ai/streamClient';
import { copyTextToClipboard } from '@/lib/browser/clipboard';
import { isValidReference } from '@/lib/quran/surahMetadata';
import type { GroundingSource } from '@/lib/quran/types';

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  arabicText?: string;
  translationText?: string;
}

const VERSE_REF_REGEX = /\[?(\d{1,3}):(\d{1,3})\]?/g;

function renderMarkdownWithCitations(text: string): string {
  return text.replace(
    VERSE_REF_REGEX,
    (match: string, rawSurah: string, rawAyah: string, offset: number, full: string) => {
      const s = Number(rawSurah);
      const a = Number(rawAyah);
      if (!isValidReference(s, a)) return match;
      const nextChar = full.charAt(offset + match.length);
      const prefix = full.slice(Math.max(0, offset - 8), offset);
      if (nextChar === '(' || prefix.endsWith('/surah/')) return match;
      return `[${s}:${a}](/surah/${s}?ayah=${a})`;
    }
  );
}

function useExplanationStream(params: {
  isOpen: boolean;
  surahNumber: number;
  ayahNumber: number;
  arabicText?: string;
  translationText?: string;
  retryCount: number;
}) {
  const { isOpen, surahNumber, ayahNumber, arabicText, translationText, retryCount } = params;
  const [explanation, setExplanation] = useState('');
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Consulting authoritative sources...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const controller = new AbortController();

    const startTimer = setTimeout(() => {
      if (!active) return;
      setExplanation('');
      setSources([]);
      setErrorMessage(null);
      setIsStreaming(true);
      setStatusMessage('Consulting authoritative sources...');

      void streamExplain(
        { ayahText: arabicText ?? '', translation: translationText, surahNumber, ayahNumber },
        {
          onToken: (_token, accumulated) => {
            if (active) setExplanation(accumulated);
          },
          onStatus: (status) => {
            if (active) setStatusMessage(status);
          },
          onMetadata: (meta) => {
            if (active && meta.sources) setSources(meta.sources);
          },
          onError: (errMsg) => {
            if (!active) return;
            setErrorMessage(errMsg || 'Unable to retrieve verified explanation.');
            setIsStreaming(false);
          },
          onDone: () => {
            if (active) setIsStreaming(false);
          },
        },
        controller.signal
      );
    }, 0);

    return () => {
      active = false;
      clearTimeout(startTimer);
      controller.abort();
    };
  }, [isOpen, surahNumber, ayahNumber, arabicText, translationText, retryCount]);

  return { explanation, sources, isStreaming, statusMessage, errorMessage };
}

function MarkdownCitationLink({
  href,
  children,
}: Readonly<React.AnchorHTMLAttributes<HTMLAnchorElement>>) {
  return (
    <Link
      href={href ?? '#'}
      className="text-[var(--primary)] font-medium underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </Link>
  );
}

const MARKDOWN_COMPONENTS = { a: MarkdownCitationLink };

function ExplanationSourcesList({ sources }: Readonly<{ sources: readonly GroundingSource[] }>) {
  if (sources.length === 0) return null;
  return (
    <div className="pt-4 border-t border-[var(--border)]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--primary)]" />
        Verified Sources
      </h3>
      <div className="flex flex-wrap gap-2">
        {sources.map((src) => {
          const parts = src.reference.split(':');
          const surahNum = parts[0] ?? '1';
          const ayahNum = parts[1] ?? '1';
          return (
            <Link
              key={`${src.type}-${src.reference}-${src.label}`}
              href={`/surah/${surahNum}?ayah=${ayahNum}`}
              className="px-2.5 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
            >
              {src.label}: [{src.reference}]
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ExplanationBody({
  explanation,
  streamState,
  statusMessage,
  errorMessage,
  sources,
  onRetry,
}: Readonly<{
  explanation: string;
  streamState: 'streaming' | 'idle';
  statusMessage: string;
  errorMessage: string | null;
  sources: readonly GroundingSource[];
  onRetry: () => void;
}>) {
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
            Retry Explanation
          </button>
        </div>
      </div>
    );
  }

  if (streamState === 'streaming' && !explanation) {
    return <ThinkingLoader status={statusMessage} />;
  }

  if (!explanation) return null;

  return (
    <div className="space-y-4">
      <div className="markdown-body text-sm text-[var(--foreground)] leading-relaxed">
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>
          {renderMarkdownWithCitations(explanation)}
        </ReactMarkdown>
      </div>
      <ExplanationSourcesList sources={sources} />
    </div>
  );
}

export default function ExplanationModal({
  isOpen,
  onClose,
  surahNumber,
  ayahNumber,
  surahName,
  arabicText,
  translationText,
}: Readonly<ExplanationModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const { explanation, sources, isStreaming, statusMessage, errorMessage } = useExplanationStream({
    isOpen,
    surahNumber,
    ayahNumber,
    arabicText,
    translationText,
    retryCount,
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

  const handleCopy = async () => {
    if (!explanation) return;
    const copiedOk = await copyTextToClipboard(explanation);
    if (copiedOk) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-2xl w-full"
    >
      <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4 flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[var(--primary)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                AI Verse Explanation
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Surah {surahName} • Verse {surahNumber}:{ayahNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {explanation && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                aria-label="Copy explanation"
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)] transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-[var(--primary)]" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close explanation modal"
              className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {arabicText && (
            <div className="p-4 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)] text-right">
              <p className="font-arabic text-2xl text-[var(--foreground)] leading-loose" dir="rtl">
                {arabicText}
              </p>
              {translationText && (
                <p className="text-xs text-[var(--text-muted)] text-left mt-2 leading-relaxed">
                  {translationText}
                </p>
              )}
            </div>
          )}

          <ExplanationBody
            explanation={explanation}
            streamState={isStreaming ? 'streaming' : 'idle'}
            statusMessage={statusMessage}
            errorMessage={errorMessage}
            sources={sources}
            onRetry={() => setRetryCount((c) => c + 1)}
          />
        </div>
      </div>
    </dialog>
  );
}
