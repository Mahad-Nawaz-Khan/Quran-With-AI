'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  BookOpen,
  ChevronRight,
  CornerDownLeft,
  AlertCircle,
  Compass,
  FileText,
} from 'lucide-react';
import { getSurahMeta } from '@/lib/quran/surahMetadata';
import { searchSurahsLocally, parseSearchIntent } from '@/lib/quran/search';
import type { CommandIntent, SurahSearchMatch } from '@/lib/quran/types';

interface HeaderSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface JumpDescriptor {
  label: string;
  title: string;
  subtitle: string;
  href: string;
  icon: 'compass' | 'page' | 'book' | 'none';
}

function buildReferenceDescriptor(
  intent: Extract<CommandIntent, { kind: 'reference' }>
): JumpDescriptor {
  const meta = getSurahMeta(intent.surahNumber);
  return {
    label: 'Direct Verse Jump',
    title: `${meta?.englishName ?? ''} ${intent.surahNumber}:${intent.ayahNumber}`.trim(),
    subtitle: `Jump directly to verse ${intent.ayahNumber}`,
    href: intent.href,
    icon: 'none',
  };
}

function buildJuzOrPageDescriptor(
  intent: Extract<CommandIntent, { kind: 'juz' | 'page' }>
): JumpDescriptor {
  const meta = getSurahMeta(intent.startSurah);
  const label = intent.kind === 'juz' ? 'Direct Juz Jump' : 'Direct Page Jump';
  const title = intent.kind === 'juz' ? `Juz ${intent.juzNumber}` : `Page ${intent.pageNumber}`;
  return {
    label,
    title,
    subtitle: `Starts at Surah ${meta?.englishName ?? ''} ${intent.startSurah}:${intent.startAyah}`,
    href: intent.href,
    icon: intent.kind === 'juz' ? 'compass' : 'page',
  };
}

function describeJumpIntent(intent: CommandIntent): JumpDescriptor | null {
  if (intent.kind === 'reference') return buildReferenceDescriptor(intent);
  if (intent.kind === 'juz' || intent.kind === 'page') return buildJuzOrPageDescriptor(intent);
  if (intent.kind === 'surah') {
    const meta = getSurahMeta(intent.surahNumber);
    return {
      label: 'Direct Surah Jump',
      title: `${intent.surahNumber}. ${meta?.englishName ?? ''}`,
      subtitle: `${meta?.revelationType ?? ''} • ${meta?.ayahCount ?? 0} ayahs`,
      href: intent.href,
      icon: 'book',
    };
  }
  return null;
}

function renderJumpIcon(icon: JumpDescriptor['icon']) {
  if (icon === 'compass') return <Compass className="w-5 h-5 text-[var(--primary)]" />;
  if (icon === 'page') return <FileText className="w-5 h-5 text-[var(--primary)]" />;
  if (icon === 'book') return <BookOpen className="w-5 h-5 text-[var(--primary)]" />;
  return null;
}

function JumpResultCard({
  descriptor,
  onNavigate,
}: Readonly<{
  descriptor: JumpDescriptor;
  onNavigate: (href: string) => void;
}>) {
  return (
    <div className="p-3 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)]">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
        {descriptor.label}
      </span>
      <button
        type="button"
        onClick={() => onNavigate(descriptor.href)}
        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--card-hover)] text-left transition-colors"
      >
        <div className="flex items-center gap-3">
          {renderJumpIcon(descriptor.icon)}
          <div>
            <div className="font-semibold text-[var(--foreground)]">{descriptor.title}</div>
            <div className="text-xs text-[var(--text-muted)]">{descriptor.subtitle}</div>
          </div>
        </div>
        <CornerDownLeft className="w-4 h-4 text-[var(--primary)]" />
      </button>
    </div>
  );
}

function SurahMatchList({
  matches,
  onNavigate,
}: Readonly<{
  matches: SurahSearchMatch[];
  onNavigate: (href: string) => void;
}>) {
  return (
    <div className="pt-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-2 block mb-1">
        Matching Surahs
      </span>
      {matches.map((surah) => (
        <button
          key={surah.surahNumber}
          type="button"
          onClick={() => onNavigate(`/surah/${surah.surahNumber}`)}
          className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--card-hover)] text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
            <div>
              <div className="font-medium text-[var(--foreground)]">
                {surah.surahNumber}. {surah.englishName} ({surah.englishNameTranslation})
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {surah.revelationType} • {surah.numberOfAyahs} ayahs
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-arabic text-sm text-[var(--text-muted)]" dir="rtl">
              {surah.arabicName}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
        </button>
      ))}
    </div>
  );
}

function SearchModalResults({
  query,
  intent,
  jumpDescriptor,
  surahMatches,
  onNavigate,
}: Readonly<{
  query: string;
  intent: CommandIntent;
  jumpDescriptor: JumpDescriptor | null;
  surahMatches: SurahSearchMatch[];
  onNavigate: (href: string) => void;
}>) {
  return (
    <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
      {jumpDescriptor && (
        <JumpResultCard descriptor={jumpDescriptor} onNavigate={onNavigate} />
      )}

      {intent.kind === 'invalid_reference' && (
        <output
          aria-live="polite"
          className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 flex items-center gap-2 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{intent.reason}</span>
        </output>
      )}

      {surahMatches.length > 0 && (
        <SurahMatchList matches={surahMatches} onNavigate={onNavigate} />
      )}

      {!query && (
        <div className="p-6 text-center text-sm text-[var(--text-muted)]">
          <p>
            Type a verse like{' '}
            <kbd className="px-1.5 py-0.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]">
              2:255
            </kbd>
            {', '}
            <kbd className="px-1.5 py-0.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]">
              Juz 30
            </kbd>
            {', or '}
            <kbd className="px-1.5 py-0.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-xs text-[var(--foreground)]">
              Page 604
            </kbd>
            {'.'}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-xs">
              Esc
            </kbd>{' '}
            anytime to close.
          </p>
        </div>
      )}

      {query && intent.kind === 'keyword' && surahMatches.length === 0 && (
        <div className="p-6 text-center text-sm text-[var(--text-muted)]">
          <p>
            Press <strong className="text-[var(--foreground)]">Enter</strong> to search the entire Quran for &ldquo;{query}&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}

export default function HeaderSearchModal({ isOpen, onClose }: Readonly<HeaderSearchModalProps>) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) handleClose();
    };
    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, [handleClose]);

  const intent: CommandIntent = useMemo(() => parseSearchIntent(query), [query]);
  const jumpDescriptor = useMemo(() => describeJumpIntent(intent), [intent]);

  const surahMatches: SurahSearchMatch[] = useMemo(() => {
    const trimmed = query.trim();
    return trimmed ? searchSurahsLocally(trimmed).slice(0, 5) : [];
  }, [query]);

  const handleNavigate = useCallback(
    (href: string) => {
      handleClose();
      router.push(href);
    },
    [handleClose, router]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jumpDescriptor) {
      handleNavigate(jumpDescriptor.href);
      return;
    }
    if (intent.kind === 'keyword' && intent.query.trim()) {
      handleNavigate(`/search?q=${encodeURIComponent(intent.query.trim())}`);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-2xl w-full"
    >
      <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4">
        <form
          onSubmit={handleSubmit}
          className="p-4 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface-elevated)]"
        >
          <Search className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to 2:255, Juz 30, Page 604, or search..."
            aria-label="Jump to reference or search"
            className="flex-1 bg-transparent text-base sm:text-lg text-[var(--foreground)] placeholder-[var(--text-muted)] outline-none"
          />
          {jumpDescriptor && (
            <button
              type="button"
              onClick={() => handleNavigate(jumpDescriptor.href)}
              className="px-3 py-1 bg-[var(--primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
            >
              Go
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)]"
          >
            <X className="w-5 h-5" />
          </button>
        </form>

        <SearchModalResults
          query={query}
          intent={intent}
          jumpDescriptor={jumpDescriptor}
          surahMatches={surahMatches}
          onNavigate={handleNavigate}
        />
      </div>
    </dialog>
  );
}
