'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Volume2,
  AlertCircle,
  Eye,
  EyeOff,
  Info,
  X,
  Sparkles,
} from 'lucide-react';

import Header from '@/app/components/Header';
import AyahView from '@/app/components/AyahView';
import AudioPlayer from '@/app/components/AudioPlayer';
import SurahSidebar from '@/app/components/SurahSidebar';
import TranslationSelector from '@/app/components/TranslationSelector';
import ExplanationModal from '@/app/components/ExplanationModal';
import TafsirDrawer from '@/app/components/TafsirDrawer';
import WordByWordView from '@/app/components/WordByWordView';
import VerseCardModal from '@/app/components/VerseCardModal';

import { SURAHS, isValidReference } from '@/lib/quran/surahMetadata';
import { CANONICAL_BISMILLAH, fetchSurahWithEditions } from '@/lib/quran/api';
import { TAJWEED_LEGEND } from '@/lib/quran/tajweed';
import {
  usePersistentStore,
  translationsStore,
  reciterStore,
  hifzModeStore,
  useAyahBookmarks,
  useReadingProgress,
} from '@/lib/hooks/usePersistentState';
import type { Ayah, SurahMeta } from '@/lib/quran/types';

function parseSurahRouteParam(raw: string | string[] | undefined): number {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+$/.test(value)) return 0;
  return Number.parseInt(value, 10);
}

function isEditableFocusedElement(): boolean {
  const activeTag = (document.activeElement?.tagName ?? '').toLowerCase();
  return activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
}

function InvalidSurahView() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center p-6 pt-20 text-center">
        <h1 className="text-3xl font-bold mb-3">Invalid Surah</h1>
        <p className="text-[var(--text-muted)] mb-6 max-w-md">
          The requested Surah number does not exist. The Holy Quran contains 114 Surahs (1–114).
        </p>
        <Link
          href="/surah"
          className="px-5 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white font-medium rounded-xl transition-colors"
        >
          All Surahs
        </Link>
      </main>
    </div>
  );
}

function SurahInfoDialog({
  surahMeta,
  dialogState,
  onClose,
}: {
  surahMeta: SurahMeta;
  dialogState: 'open' | 'closed';
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = dialogState === 'open';

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
    const handleBackdrop = (e: MouseEvent) => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('click', handleBackdrop);
    return () => dialog.removeEventListener('click', handleBackdrop);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-md w-full"
    >
      <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base text-[var(--foreground)]">
              {surahMeta.number}. {surahMeta.englishName}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">{surahMeta.englishNameTranslation}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close surah info"
            className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <dl className="p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Arabic Name</dt>
            <dd className="font-arabic text-lg" dir="rtl">{surahMeta.arabicName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Revelation Type</dt>
            <dd className="font-medium">{surahMeta.revelationType}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Revelation Order</dt>
            <dd className="font-medium">#{surahMeta.revelationOrder}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Total Ayahs</dt>
            <dd className="font-medium">{surahMeta.ayahCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Starts at</dt>
            <dd className="font-medium">
              Juz {surahMeta.startJuz} • Page {surahMeta.startPage}
            </dd>
          </div>
        </dl>
      </div>
    </dialog>
  );
}

interface ReaderToolbarProps {
  surahMeta: SurahMeta;
  pageInfo: string;
  listenDisabled: boolean;
  listenText: string;
  selectedTranslations: string[];
  isHifzMode: boolean;
  isTajweedMode: boolean;
  arabicFontSizePx: number;
  onToggleSidebar: () => void;
  onOpenSurahInfo: () => void;
  onListen: () => void;
  onTranslationsChange: (ids: string[]) => void;
  onToggleHifz: () => void;
  onToggleTajweed: () => void;
  onFontSizeChange: (px: number) => void;
}

function SurahReaderToolbar({
  surahMeta,
  pageInfo,
  listenDisabled,
  listenText,
  selectedTranslations,
  isHifzMode,
  isTajweedMode,
  arabicFontSizePx,
  onToggleSidebar,
  onOpenSurahInfo,
  onListen,
  onTranslationsChange,
  onToggleHifz,
  onToggleTajweed,
  onFontSizeChange,
}: ReaderToolbarProps) {
  const toggleBtnBase = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors';
  const toggleActive = 'bg-[var(--primary)]/15 border-[var(--primary)] text-[var(--primary)] font-semibold';
  const toggleInactive = 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--foreground)]';

  return (
    <div className="border-b border-[var(--border)] bg-[var(--card-bg)]/95 backdrop-blur sticky top-14 z-40 px-4 py-2.5">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            className="p-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] lg:hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold truncate text-[var(--foreground)]">
              {surahMeta.number}. {surahMeta.englishName}
            </h1>
            <span className="text-xs text-[var(--text-muted)] block sm:inline">
              {surahMeta.englishNameTranslation} • {pageInfo}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSurahInfo}
            aria-label="Surah info"
            title="Surah Revelation & Metadata"
            className="p-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onListen}
            disabled={listenDisabled}
            aria-label={listenText === 'Listen' ? 'Listen' : 'Playing recitation'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{listenText}</span>
          </button>

          <TranslationSelector selectedIds={selectedTranslations} onChange={onTranslationsChange} />

          <button
            type="button"
            onClick={onToggleHifz}
            aria-pressed={isHifzMode}
            aria-label="Hifz mode"
            className={`${toggleBtnBase} ${isHifzMode ? toggleActive : toggleInactive}`}
          >
            {isHifzMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">Hifz</span>
          </button>

          <button
            type="button"
            onClick={onToggleTajweed}
            aria-pressed={isTajweedMode}
            aria-label="Tajweed mode"
            className={`${toggleBtnBase} ${isTajweedMode ? toggleActive : toggleInactive}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Tajweed</span>
          </button>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
            <label htmlFor="arabic-font-slider" className="text-[11px] text-[var(--text-muted)]">
              Size
            </label>
            <input
              id="arabic-font-slider"
              type="range"
              min={18}
              max={56}
              step={2}
              value={arabicFontSizePx}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              aria-label="Arabic font size"
              className="w-16 sm:w-20 h-1.5 accent-[var(--primary)] cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SurahHeroSection({
  surahMeta,
  showBismillahBanner,
  isTajweedMode,
}: {
  surahMeta: SurahMeta;
  showBismillahBanner: boolean;
  isTajweedMode: boolean;
}) {
  return (
    <div className="pt-8 pb-4 text-center">
      <span className="px-3 py-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-full text-xs text-[var(--primary)] font-medium uppercase tracking-wider">
        {surahMeta.revelationType} • {surahMeta.ayahCount} Verses
      </span>
      <p className="font-arabic text-4xl sm:text-5xl text-[var(--foreground)] mt-4" dir="rtl">
        {surahMeta.arabicName}
      </p>

      {showBismillahBanner && (
        <div id="bismillah-banner" className="py-6 border-b border-[var(--border)] my-4">
          <p className="font-arabic text-2xl sm:text-3xl text-[var(--primary)] tracking-wide" dir="rtl">
            {CANONICAL_BISMILLAH}
          </p>
        </div>
      )}

      {isTajweedMode && (
        <div className="flex flex-wrap justify-center gap-2 mt-4 p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border)] text-[11px]">
          {TAJWEED_LEGEND.map((item) => (
            <span key={item.label} className={`font-medium ${item.className}`}>
              ● {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SurahAyahsList({
  loading,
  ayahs,
  surahId,
  surahName,
  currentAyahIndex,
  isPlaying,
  completedAyahs,
  isHifzMode,
  isTajweedMode,
  arabicFontSizePx,
  isBookmarked,
  onToggleBookmark,
  onToggleRead,
  onPlayAyah,
  onExplainAyah,
  onTafsirAyah,
  onWordByWordAyah,
  onVerseCardAyah,
}: {
  loading: boolean;
  ayahs: Ayah[];
  surahId: number;
  surahName: string;
  currentAyahIndex: number;
  isPlaying: boolean;
  completedAyahs: readonly string[];
  isHifzMode: boolean;
  isTajweedMode: boolean;
  arabicFontSizePx: number;
  isBookmarked: (key: string) => boolean;
  onToggleBookmark: (key: string) => void;
  onToggleRead: (index: number, ayahNum: number) => void;
  onPlayAyah: (index: number) => void;
  onExplainAyah: (ayah: Ayah) => void;
  onTafsirAyah: (ayah: Ayah) => void;
  onWordByWordAyah: (ayah: Ayah) => void;
  onVerseCardAyah: (ayah: Ayah, tab: 'notes' | 'card') => void;
}) {
  if (loading && ayahs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[var(--text-muted)]">
          Loading Surah recitation &amp; translations...
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {ayahs.map((ayah, index) => {
        const key = `${surahId}:${ayah.numberInSurah}`;
        return (
          <AyahView
            key={ayah.number}
            ayah={ayah}
            surahNumber={surahId}
            surahName={surahName}
            isActive={currentAyahIndex === index}
            isCurrentPlaying={currentAyahIndex === index && isPlaying}
            isBookmarked={isBookmarked(key)}
            isRead={completedAyahs.includes(key)}
            isHifzMode={isHifzMode}
            isTajweedMode={isTajweedMode}
            arabicFontSizePx={arabicFontSizePx}
            onToggleBookmark={() => onToggleBookmark(key)}
            onToggleRead={() => onToggleRead(index, ayah.numberInSurah)}
            onPlay={() => onPlayAyah(index)}
            onExplain={() => onExplainAyah(ayah)}
            onOpenTafsir={() => onTafsirAyah(ayah)}
            onOpenWordByWord={() => onWordByWordAyah(ayah)}
            onOpenVerseCard={(tab) => onVerseCardAyah(ayah, tab)}
          />
        );
      })}
    </div>
  );
}

function SurahFooterNav({
  prevSurah,
  nextSurah,
}: {
  prevSurah: SurahMeta | null;
  nextSurah: SurahMeta | null;
}) {
  return (
    <nav
      aria-label="Surah Footer Navigation"
      className="grid grid-cols-2 gap-4 mt-12 pt-6 border-t border-[var(--border)]"
    >
      {prevSurah ? (
        <Link
          href={`/surah/${prevSurah.number}`}
          className="p-4 bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--border)] rounded-xl flex items-center gap-3 text-left transition-colors group"
        >
          <ChevronLeft className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)] shrink-0" />
          <div className="min-w-0">
            <span className="text-[11px] text-[var(--text-muted)] block uppercase">Previous Surah</span>
            <span className="text-sm font-semibold text-[var(--foreground)] truncate block">
              {prevSurah.number}. {prevSurah.englishName}
            </span>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {nextSurah ? (
        <Link
          href={`/surah/${nextSurah.number}`}
          className="p-4 bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--border)] rounded-xl flex items-center justify-between text-right transition-colors group"
        >
          <div className="min-w-0">
            <span className="text-[11px] text-[var(--text-muted)] block uppercase">Next Surah</span>
            <span className="text-sm font-semibold text-[var(--foreground)] truncate block">
              {nextSurah.number}. {nextSurah.englishName}
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)] shrink-0" />
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}

function useSurahEditionsLoader(params: {
  surahId: number;
  selectedTranslations: string[];
  selectedReciter: string;
  isTajweedMode: boolean;
  reloadCount: number;
}) {
  const { surahId, selectedTranslations, selectedReciter, isTajweedMode, reloadCount } = params;
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setErrorMessage(null);
      void fetchSurahWithEditions(surahId, selectedTranslations, selectedReciter, {
        includeTajweed: isTajweedMode,
        signal: controller.signal,
      })
        .then((edition) => {
          if (active) setAyahs(edition.ayahs);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          const msg = err instanceof Error ? err.message : 'Unable to load surah recitation.';
          setErrorMessage(msg);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [surahId, selectedTranslations, selectedReciter, isTajweedMode, reloadCount]);

  return { ayahs, loading, errorMessage };
}

function useReaderKeyboardShortcuts(params: {
  onNext: () => void;
  onPrevious: () => void;
  onToggleSpacePlay: () => void;
}) {
  const { onNext, onPrevious, onToggleSpacePlay } = params;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableFocusedElement() || document.querySelector('dialog[open]')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        onToggleSpacePlay();
        return;
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onPrevious();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrevious, onToggleSpacePlay]);
}

function SurahReaderDialogs({
  surahId,
  surahMeta,
  showSurahInfo,
  explanationAyah,
  tafsirAyah,
  wordByWordAyah,
  verseCardState,
  onCloseInfo,
  onCloseExplain,
  onCloseTafsir,
  onCloseWbw,
  onCloseVerseCard,
}: {
  surahId: number;
  surahMeta: SurahMeta;
  showSurahInfo: boolean;
  explanationAyah: Ayah | null;
  tafsirAyah: Ayah | null;
  wordByWordAyah: Ayah | null;
  verseCardState: { ayah: Ayah; tab: 'notes' | 'card' } | null;
  onCloseInfo: () => void;
  onCloseExplain: () => void;
  onCloseTafsir: () => void;
  onCloseWbw: () => void;
  onCloseVerseCard: () => void;
}) {
  return (
    <>
      <SurahInfoDialog
        surahMeta={surahMeta}
        dialogState={showSurahInfo ? 'open' : 'closed'}
        onClose={onCloseInfo}
      />

      {explanationAyah && (
        <ExplanationModal
          isOpen={true}
          onClose={onCloseExplain}
          surahNumber={surahId}
          ayahNumber={explanationAyah.numberInSurah}
          surahName={surahMeta.englishName}
          arabicText={explanationAyah.text}
          translationText={explanationAyah.translation}
        />
      )}

      {tafsirAyah && (
        <TafsirDrawer
          isOpen={true}
          onClose={onCloseTafsir}
          surahNumber={surahId}
          ayahNumber={tafsirAyah.numberInSurah}
          surahName={surahMeta.englishName}
          arabicText={tafsirAyah.text}
          translationText={tafsirAyah.translation}
        />
      )}

      {wordByWordAyah && (
        <WordByWordView
          isOpen={true}
          onClose={onCloseWbw}
          surahNumber={surahId}
          ayahNumber={wordByWordAyah.numberInSurah}
          surahName={surahMeta.englishName}
        />
      )}

      {verseCardState && (
        <VerseCardModal
          isOpen={true}
          onClose={onCloseVerseCard}
          surahNumber={surahId}
          ayahNumber={verseCardState.ayah.numberInSurah}
          surahName={surahMeta.englishName}
          arabicText={verseCardState.ayah.text}
          translationText={verseCardState.ayah.translation}
          initialTab={verseCardState.tab}
        />
      )}
    </>
  );
}

function buildReaderPageInfo(
  surahId: number,
  surahMeta: SurahMeta,
  currentAyah?: Ayah
) {
  const prevSurah = surahId > 1 ? SURAHS[surahId - 2] : null;
  const nextSurah = surahId < 114 ? SURAHS[surahId] : null;
  const activeJuz = currentAyah?.juz ?? surahMeta.startJuz;
  const activePage = currentAyah?.page ?? surahMeta.startPage;
  const activeHizb = Math.max(1, Math.ceil((currentAyah?.hizbQuarter ?? 1) / 4));
  const pageInfo = `Page ${activePage} • Juz ${activeJuz} / Hizb ${activeHizb}`;
  return { prevSurah, nextSurah, pageInfo };
}

function useInitialReaderDeepLink(params: {
  loading: boolean;
  ayahs: Ayah[];
  searchParams: ReturnType<typeof useSearchParams>;
  onSelectIndex: (idx: number) => void;
  onStartAutoplay: () => void;
}) {
  const { loading, ayahs, searchParams, onSelectIndex, onStartAutoplay } = params;
  const handledRef = useRef(false);

  useEffect(() => {
    if (loading || ayahs.length === 0 || handledRef.current) return;
    handledRef.current = true;

    const ayahParam = searchParams.get('ayah');
    const autoplayParam = searchParams.get('autoplay');

    const timer = setTimeout(() => {
      if (ayahParam) {
        const targetAyah = Number.parseInt(ayahParam, 10);
        const targetIdx = ayahs.findIndex((a) => a.numberInSurah === targetAyah);
        if (targetIdx !== -1) {
          onSelectIndex(targetIdx);
          document.getElementById(`ayah-${targetAyah}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }
      if (autoplayParam === '1') {
        onStartAutoplay();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [loading, ayahs, searchParams, onSelectIndex, onStartAutoplay]);
}

function SurahReaderContentInner({ surahId, surahMeta }: { surahId: number; surahMeta: SurahMeta }) {
  const searchParams = useSearchParams();

  const [selectedTranslations, setSelectedTranslations] = usePersistentStore(translationsStore);
  const [selectedReciter, setSelectedReciter] = usePersistentStore(reciterStore);
  const [isHifzMode, setIsHifzMode] = usePersistentStore(hifzModeStore);
  const { isBookmarked, toggleBookmark } = useAyahBookmarks();
  const { progress, updateLastRead, toggleCompletedAyah } = useReadingProgress();

  const [reloadCount, setReloadCount] = useState(0);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [isAudioBarOpen, setIsAudioBarOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingFullSurah, setIsPlayingFullSurah] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSurahInfo, setShowSurahInfo] = useState(false);
  const [isTajweedMode, setIsTajweedMode] = useState(false);
  const [arabicFontSizePx, setArabicFontSizePx] = useState(28);
  const [loopRange, setLoopRange] = useState<{ startAyah: number; endAyah: number } | null>(null);

  const [explanationAyah, setExplanationAyah] = useState<Ayah | null>(null);
  const [tafsirAyah, setTafsirAyah] = useState<Ayah | null>(null);
  const [wordByWordAyah, setWordByWordAyah] = useState<Ayah | null>(null);
  const [verseCardState, setVerseCardState] = useState<{
    ayah: Ayah;
    tab: 'notes' | 'card';
  } | null>(null);

  const { ayahs, loading, errorMessage } = useSurahEditionsLoader({
    surahId,
    selectedTranslations,
    selectedReciter,
    isTajweedMode,
    reloadCount,
  });

  const startAutoplay = useCallback(() => {
    setIsAudioBarOpen(true);
    setIsPlaying(true);
    setIsPlayingFullSurah(true);
  }, []);

  useInitialReaderDeepLink({
    loading,
    ayahs,
    searchParams,
    onSelectIndex: setCurrentAyahIndex,
    onStartAutoplay: startAutoplay,
  });

  const rawAyahParam = Number.parseInt(searchParams.get('ayah') ?? '1', 10);
  const initialLastReadAyah = isValidReference(surahId, rawAyahParam) ? rawAyahParam : 1;

  useEffect(() => {
    updateLastRead(surahId, initialLastReadAyah);
  }, [surahId, initialLastReadAyah, updateLastRead]);

  useEffect(() => {
    const activeAyah = ayahs[currentAyahIndex];
    if (activeAyah) {
      updateLastRead(surahId, activeAyah.numberInSurah);
    }
  }, [surahId, currentAyahIndex, ayahs, updateLastRead]);

  const handleSelectAyahNumber = useCallback(
    (ayahNum: number) => {
      const idx = ayahs.findIndex((a) => a.numberInSurah === ayahNum);
      if (idx === -1) return;
      setCurrentAyahIndex(idx);
      setIsAudioBarOpen(true);
      setIsPlaying(true);
    },
    [ayahs]
  );

  const handlePrevious = useCallback(() => {
    setCurrentAyahIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    if (currentAyahIndex < ayahs.length - 1) {
      setCurrentAyahIndex((prev) => prev + 1);
      return;
    }
    setIsPlaying(false);
    setIsPlayingFullSurah(false);
  }, [currentAyahIndex, ayahs.length]);

  useReaderKeyboardShortcuts({
    onNext: handleNext,
    onPrevious: handlePrevious,
    onToggleSpacePlay: () => {
      setIsAudioBarOpen(true);
      setIsPlaying((prev) => !prev);
    },
  });

  const handleListenFullSurah = () => {
    if (ayahs.length === 0) return;
    setIsAudioBarOpen(true);
    if (isPlayingFullSurah && isPlaying) {
      setIsPlaying(false);
      setIsPlayingFullSurah(false);
      return;
    }
    setCurrentAyahIndex(0);
    setIsPlaying(true);
    setIsPlayingFullSurah(true);
  };

  const currentAyah = ayahs[currentAyahIndex];
  const { prevSurah, nextSurah, pageInfo } = buildReaderPageInfo(surahId, surahMeta, currentAyah);
  const listenText = isPlayingFullSurah && isPlaying ? 'Playing...' : 'Listen';
  const showFooter = !loading && ayahs.length > 0;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <Header surahNumber={surahId} surahName={surahMeta.englishName} />

      <div className="flex-1 flex pt-14">
        <SurahSidebar
          currentSurahId={surahId}
          isOpen={showSidebar}
          onClose={() => setShowSidebar(false)}
        />

        <div className="flex-1 flex flex-col min-w-0 lg:pl-80">
          <SurahReaderToolbar
            surahMeta={surahMeta}
            pageInfo={pageInfo}
            listenDisabled={loading || ayahs.length === 0}
            listenText={listenText}
            selectedTranslations={selectedTranslations}
            isHifzMode={isHifzMode}
            isTajweedMode={isTajweedMode}
            arabicFontSizePx={arabicFontSizePx}
            onToggleSidebar={() => setShowSidebar((prev) => !prev)}
            onOpenSurahInfo={() => setShowSurahInfo(true)}
            onListen={handleListenFullSurah}
            onTranslationsChange={setSelectedTranslations}
            onToggleHifz={() => setIsHifzMode((prev) => !prev)}
            onToggleTajweed={() => setIsTajweedMode((prev) => !prev)}
            onFontSizeChange={setArabicFontSizePx}
          />

          <main className="flex-1 max-w-4xl w-full mx-auto px-4 pb-36">
            <SurahHeroSection
              surahMeta={surahMeta}
              showBismillahBanner={surahId !== 1 && surahId !== 9}
              isTajweedMode={isTajweedMode}
            />

            {errorMessage && (
              <div
                role="alert"
                className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between text-red-500 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReloadCount((c) => c + 1)}
                  className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500 font-medium"
                >
                  Retry
                </button>
              </div>
            )}

            <SurahAyahsList
              loading={loading}
              ayahs={ayahs}
              surahId={surahId}
              surahName={surahMeta.englishName}
              currentAyahIndex={currentAyahIndex}
              isPlaying={isPlaying}
              completedAyahs={progress.completedAyahs}
              isHifzMode={isHifzMode}
              isTajweedMode={isTajweedMode}
              arabicFontSizePx={arabicFontSizePx}
              isBookmarked={isBookmarked}
              onToggleBookmark={toggleBookmark}
              onToggleRead={(index, ayahNum) => {
                setCurrentAyahIndex(index);
                updateLastRead(surahId, ayahNum);
                toggleCompletedAyah(`${surahId}:${ayahNum}`);
              }}
              onPlayAyah={(index) => {
                setCurrentAyahIndex(index);
                setIsAudioBarOpen(true);
                setIsPlaying(true);
                setIsPlayingFullSurah(false);
              }}
              onExplainAyah={setExplanationAyah}
              onTafsirAyah={setTafsirAyah}
              onWordByWordAyah={setWordByWordAyah}
              onVerseCardAyah={(ayah, tab) => setVerseCardState({ ayah, tab })}
            />

            {showFooter && (
              <SurahFooterNav prevSurah={prevSurah} nextSurah={nextSurah} />
            )}
          </main>
        </div>
      </div>

      {isAudioBarOpen && currentAyah && (
        <AudioPlayer
          audioUrl={currentAyah.audio}
          surahName={surahMeta.englishName}
          surahNumber={surahId}
          ayahNumber={currentAyah.numberInSurah}
          totalAyahs={surahMeta.ayahCount}
          selectedReciter={selectedReciter}
          onReciterChange={setSelectedReciter}
          onPrevious={() => {
            handlePrevious();
            setIsPlaying(true);
          }}
          onNext={() => {
            handleNext();
            if (currentAyahIndex < ayahs.length - 1) setIsPlaying(true);
          }}
          onSelectAyahNumber={handleSelectAyahNumber}
          isPlayingProp={isPlaying}
          onPlayingChange={setIsPlaying}
          loopRange={loopRange}
          onSetLoopRange={setLoopRange}
        />
      )}

      <SurahReaderDialogs
        surahId={surahId}
        surahMeta={surahMeta}
        showSurahInfo={showSurahInfo}
        explanationAyah={explanationAyah}
        tafsirAyah={tafsirAyah}
        wordByWordAyah={wordByWordAyah}
        verseCardState={verseCardState}
        onCloseInfo={() => setShowSurahInfo(false)}
        onCloseExplain={() => setExplanationAyah(null)}
        onCloseTafsir={() => setTafsirAyah(null)}
        onCloseWbw={() => setWordByWordAyah(null)}
        onCloseVerseCard={() => setVerseCardState(null)}
      />
    </div>
  );
}

function SurahReaderContent() {
  const params = useParams();
  const surahId = parseSurahRouteParam(params.id);
  const surahMeta = SURAHS.find((s) => s.number === surahId);

  if (!surahMeta) {
    return <InvalidSurahView />;
  }
  return <SurahReaderContentInner key={surahId} surahId={surahId} surahMeta={surahMeta} />;
}

export default function SurahPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--foreground)]">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SurahReaderContent />
    </Suspense>
  );
}
