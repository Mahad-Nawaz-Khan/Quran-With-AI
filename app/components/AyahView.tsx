'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bookmark,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  Play,
  MoreHorizontal,
  BookOpen,
  Languages,
  BookMarked,
  Eye,
  EyeOff,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { buildVerseTajweedSegments } from '@/lib/quran/tajweed';
import { copyTextToClipboard } from '@/lib/browser/clipboard';
import type { Ayah, AyahTranslation } from '@/lib/quran/types';

interface AyahViewProps {
  ayah: Ayah;
  surahNumber: number;
  surahName: string;
  isActive?: boolean;
  isCurrentPlaying?: boolean;
  isBookmarked?: boolean;
  isRead?: boolean;
  isHifzMode?: boolean;
  isTajweedMode?: boolean;
  arabicFontSizePx?: number;
  showTranslation?: boolean;
  onToggleBookmark?: () => void;
  onToggleRead?: () => void;
  onPlay?: () => void;
  onExplain?: () => void;
  onOpenTafsir?: () => void;
  onOpenWordByWord?: () => void;
  onOpenVerseCard?: (tab: 'notes' | 'card') => void;
}

function dispatchAskAiEvent(surah: number, ayahNum: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('quran:ask-ai', {
      detail: {
        surah,
        ayah: ayahNum,
        text: `Explain Quran ${surah}:${ayahNum}`,
      },
    })
  );
}

function resolveTranslationsList(ayah: Ayah): AyahTranslation[] {
  if (ayah.allTranslations && ayah.allTranslations.length > 0) {
    return ayah.allTranslations;
  }
  if (!ayah.translation) return [];
  return [
    {
      editionId: 'en.sahih',
      language: 'English',
      languageCode: 'en',
      direction: 'ltr',
      name: 'Saheeh International',
      text: ayah.translation,
    },
  ];
}

function ArabicScriptParagraph({
  ayah,
  surahNumber,
  scriptMode,
  blurClass,
  arabicFontSizePx,
}: {
  ayah: Ayah;
  surahNumber: number;
  scriptMode: 'tajweed' | 'uthmani';
  blurClass: string;
  arabicFontSizePx: number;
}) {
  const isTajweedMode = scriptMode === 'tajweed';
  const ayahNum = ayah.numberInSurah;
  const tajweedSegments = useMemo(() => {
    if (!isTajweedMode || !ayah.tajweedText) return null;
    return buildVerseTajweedSegments(ayah.tajweedText, surahNumber, ayahNum);
  }, [isTajweedMode, ayah.tajweedText, surahNumber, ayahNum]);

  const tajweedClass = isTajweedMode ? 'tajweed-script' : '';
  const className = `font-arabic leading-loose text-[var(--foreground)] ${tajweedClass} ${blurClass}`.trim();

  return (
    <p
      lang="ar"
      dir="rtl"
      style={{ fontSize: `${arabicFontSizePx}px` }}
      className={className}
    >
      {tajweedSegments
        ? tajweedSegments.map((seg) =>
            seg.rule ? (
              <span key={seg.id} className={seg.rule.className} title={seg.rule.label}>
                {seg.text}
              </span>
            ) : (
              <span key={seg.id}>{seg.text}</span>
            )
          )
        : ayah.text}
      <span className="inline-block mr-3 text-[var(--primary)] text-xl font-normal">
        ﴿{ayahNum}﴾
      </span>
    </p>
  );
}

function AyahMoreMenu({
  ayahNum,
  menuState,
  menuRef,
  onToggle,
  onOpenNotes,
  onOpenCard,
  onOpenTafsir,
  onOpenWordByWord,
}: {
  ayahNum: number;
  menuState: 'open' | 'closed';
  menuRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onOpenNotes: () => void;
  onOpenCard: () => void;
  onOpenTafsir?: () => void;
  onOpenWordByWord?: () => void;
}) {
  const isOpen = menuState === 'open';
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`More options for Ayah ${ayahNum}`}
        className="p-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          id={`more-menu-${ayahNum}`}
          className="absolute right-0 mt-1 w-52 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl z-20 py-1 text-[var(--foreground)]"
        >
          <button
            type="button"
            onClick={onOpenNotes}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[var(--card-hover)] transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>Add Study Note</span>
          </button>

          <button
            type="button"
            onClick={onOpenCard}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[var(--card-hover)] transition-colors"
          >
            <BookMarked className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>Verse Card</span>
          </button>

          <button
            type="button"
            onClick={onOpenTafsir}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[var(--card-hover)] transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>Classical Tafsir</span>
          </button>

          <button
            type="button"
            onClick={onOpenWordByWord}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-[var(--card-hover)] transition-colors"
          >
            <Languages className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>Word-by-Word Analysis</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface AyahActionBarProps {
  surahNumber: number;
  ayahNum: number;
  playingStatus: 'playing' | 'idle';
  bookmarkStatus: 'saved' | 'unsaved';
  readStatus: 'read' | 'unread';
  hifzStatus: 'disabled' | 'blurred' | 'revealed';
  copyStatus: 'copied' | 'idle';
  moreMenuStatus: 'open' | 'closed';
  moreMenuRef: React.RefObject<HTMLDivElement | null>;
  onPlay?: () => void;
  onToggleBookmark?: () => void;
  onToggleRead?: () => void;
  onToggleRevealHifz: () => void;
  onOpenTafsir?: () => void;
  onOpenWordByWord?: () => void;
  onExplain?: () => void;
  onCopy: () => void;
  onToggleMoreMenu: () => void;
  onOpenNotes: () => void;
  onOpenCard: () => void;
  onCloseMoreAndRun: (fn?: () => void) => void;
}

function AyahActionBar({
  surahNumber,
  ayahNum,
  playingStatus,
  bookmarkStatus,
  readStatus,
  hifzStatus,
  copyStatus,
  moreMenuStatus,
  moreMenuRef,
  onPlay,
  onToggleBookmark,
  onToggleRead,
  onToggleRevealHifz,
  onOpenTafsir,
  onOpenWordByWord,
  onExplain,
  onCopy,
  onToggleMoreMenu,
  onOpenNotes,
  onOpenCard,
  onCloseMoreAndRun,
}: AyahActionBarProps) {
  const isPlaying = playingStatus === 'playing';
  const isBookmarked = bookmarkStatus === 'saved';
  const isRead = readStatus === 'read';
  const copied = copyStatus === 'copied';
  const iconBtnClass =
    'p-1.5 rounded-lg hover:bg-[var(--card-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--foreground)]';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="px-2.5 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs font-mono font-medium text-[var(--foreground)]">
          {surahNumber}:{ayahNum}
        </span>

        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play Ayah ${ayahNum}`}
          className={`p-1.5 rounded-lg hover:bg-[var(--card-hover)] transition-colors ${
            isPlaying ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Play className="w-4 h-4" fill={isPlaying ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          onClick={onToggleBookmark}
          aria-pressed={isBookmarked}
          aria-label={`Bookmark Ayah ${ayahNum}`}
          className={`p-1.5 rounded-lg hover:bg-[var(--card-hover)] transition-colors ${
            isBookmarked ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          onClick={onToggleRead}
          aria-pressed={isRead}
          aria-label={`Mark Ayah ${ayahNum} Read`}
          title={isRead ? 'Marked as read' : 'Mark as read'}
          className={`p-1.5 rounded-lg hover:bg-[var(--card-hover)] transition-colors ${
            isRead ? 'text-emerald-500' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>

        {hifzStatus !== 'disabled' && (
          <button
            type="button"
            onClick={onToggleRevealHifz}
            aria-label={hifzStatus === 'revealed' ? 'Hide Arabic text' : 'Reveal Arabic text'}
            className="p-1.5 rounded-lg text-[var(--primary)] hover:bg-[var(--card-hover)] transition-colors"
          >
            {hifzStatus === 'revealed' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={onOpenTafsir}
          aria-label={`Tafsir for Ayah ${ayahNum}`}
          title="Classical Tafsir"
          className={iconBtnClass}
        >
          <BookOpen className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenWordByWord}
          aria-label={`Word by Word for Ayah ${ayahNum}`}
          title="Word-by-Word Morphology"
          className={iconBtnClass}
        >
          <Languages className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onExplain}
          aria-label={`Explain with AI Ayah ${ayahNum}`}
          title="AI Verse Explanation"
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--primary)] text-xs transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span className="hidden md:inline">Explain</span>
        </button>

        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy Ayah ${ayahNum}`}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] text-xs transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 text-xs font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Copy</span>
            </>
          )}
        </button>

        <AyahMoreMenu
          ayahNum={ayahNum}
          menuState={moreMenuStatus}
          menuRef={moreMenuRef}
          onToggle={onToggleMoreMenu}
          onOpenNotes={onOpenNotes}
          onOpenCard={onOpenCard}
          onOpenTafsir={() => onCloseMoreAndRun(onOpenTafsir)}
          onOpenWordByWord={() => onCloseMoreAndRun(onOpenWordByWord)}
        />
      </div>
    </div>
  );
}

function AyahTranslationsBlock({ translations }: { translations: readonly AyahTranslation[] }) {
  return (
    <div className="space-y-3 pt-2 border-t border-[var(--border)]">
      {translations.map((trans) => {
        const isUrdu = trans.editionId.startsWith('ur.');
        return (
          <div key={trans.editionId} className="text-left">
            <p
              data-edition={trans.editionId}
              className={`text-sm text-[var(--text-muted)] leading-relaxed ${
                isUrdu ? 'font-urdu text-base text-right text-[var(--foreground)]' : ''
              }`}
              dir={isUrdu || trans.direction === 'rtl' ? 'rtl' : 'ltr'}
            >
              {trans.text}
            </p>
            <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">
              — {trans.name || trans.editionId}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function resolveHifzStatus(params: {
  enabled: boolean;
  revealed: boolean;
}): 'disabled' | 'blurred' | 'revealed' {
  if (!params.enabled) return 'disabled';
  return params.revealed ? 'revealed' : 'blurred';
}

export default function AyahView({
  ayah,
  surahNumber,
  surahName,
  isActive = false,
  isCurrentPlaying = false,
  isBookmarked = false,
  isRead = false,
  isHifzMode = false,
  isTajweedMode = false,
  arabicFontSizePx = 28,
  showTranslation = true,
  onToggleBookmark,
  onToggleRead,
  onPlay,
  onExplain,
  onOpenTafsir,
  onOpenWordByWord,
  onOpenVerseCard,
}: AyahViewProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isRevealedHifz, setIsRevealedHifz] = useState(false);
  const [copied, setCopied] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const ayahNum = ayah.numberInSurah;
  const translations = resolveTranslationsList(ayah);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (e.target instanceof Element && e.target.closest('dialog')) return;
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showMoreMenu]);

  const handleCopy = async () => {
    const primaryTranslation = ayah.translation ?? translations[0]?.text ?? '';
    const textToCopy = `${ayah.text}\n\n"${primaryTranslation}"\n\n— Quran ${surahNumber}:${ayahNum} (${surahName})`;

    const copiedOk = await copyTextToClipboard(textToCopy);
    if (copiedOk) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hifzStatus = resolveHifzStatus({ enabled: isHifzMode, revealed: isRevealedHifz });
  let blurClass = '';
  if (hifzStatus === 'blurred') blurClass = 'hifz-blurred';
  if (hifzStatus === 'revealed') blurClass = 'hifz-revealed';

  const scriptMode = isTajweedMode ? 'tajweed' : 'uthmani';

  return (
    <article
      id={`ayah-${ayahNum}`}
      data-ayah={ayahNum}
      data-highlighted={isActive || isCurrentPlaying ? 'true' : undefined}
      aria-label={`Ayah ${ayahNum}`}
      aria-current={isActive ? 'true' : undefined}
      className={`group py-6 px-4 border-b border-[var(--border)] transition-colors ${
        isActive ? 'bg-[var(--primary)]/10 border-l-4 border-l-[var(--primary)]' : 'hover:bg-[var(--card-hover)]/40'
      }`}
    >
      <AyahActionBar
        surahNumber={surahNumber}
        ayahNum={ayahNum}
        playingStatus={isCurrentPlaying ? 'playing' : 'idle'}
        bookmarkStatus={isBookmarked ? 'saved' : 'unsaved'}
        readStatus={isRead ? 'read' : 'unread'}
        hifzStatus={hifzStatus}
        copyStatus={copied ? 'copied' : 'idle'}
        moreMenuStatus={showMoreMenu ? 'open' : 'closed'}
        moreMenuRef={moreMenuRef}
        onPlay={onPlay}
        onToggleBookmark={onToggleBookmark}
        onToggleRead={onToggleRead}
        onToggleRevealHifz={() => setIsRevealedHifz((prev) => !prev)}
        onOpenTafsir={onOpenTafsir}
        onOpenWordByWord={onOpenWordByWord}
        onExplain={onExplain}
        onCopy={() => void handleCopy()}
        onToggleMoreMenu={() => setShowMoreMenu((prev) => !prev)}
        onOpenNotes={() => onOpenVerseCard?.('notes')}
        onOpenCard={() => {
          setShowMoreMenu(false);
          onOpenVerseCard?.('card');
        }}
        onCloseMoreAndRun={(fn) => {
          setShowMoreMenu(false);
          fn?.();
        }}
      />

      <div className="space-y-4">
        {isHifzMode ? (
          <button
            type="button"
            onClick={() => setIsRevealedHifz((prev) => !prev)}
            aria-label={
              isRevealedHifz ? `Hide Ayah ${ayahNum} Arabic` : `Reveal Ayah ${ayahNum} Arabic`
            }
            className="block w-full text-right py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded-xl"
          >
            <ArabicScriptParagraph
              ayah={ayah}
              surahNumber={surahNumber}
              scriptMode={scriptMode}
              blurClass={blurClass}
              arabicFontSizePx={arabicFontSizePx}
            />
            {!isRevealedHifz && (
              <span className="block text-xs text-[var(--primary)] mt-1 italic text-left" dir="ltr">
                Click to reveal Arabic text (Hifz Memorization Mode)
              </span>
            )}
          </button>
        ) : (
          <div className="text-right py-2">
            <ArabicScriptParagraph
              ayah={ayah}
              surahNumber={surahNumber}
              scriptMode={scriptMode}
              blurClass=""
              arabicFontSizePx={arabicFontSizePx}
            />
          </div>
        )}

        {showTranslation && translations.length > 0 && (
          <AyahTranslationsBlock translations={translations} />
        )}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => dispatchAskAiEvent(surahNumber, ayahNum)}
          aria-label={`Ask AI about this Ayah ${ayahNum}`}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[var(--primary)]" />
          <span>Ask AI about this Ayah</span>
        </button>
      </div>
    </article>
  );
}
