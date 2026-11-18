'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, BookOpen, Layers, FileText } from 'lucide-react';
import { SURAH_METADATA, PAGE_STARTS, getSurahMeta } from '@/lib/quran/surahMetadata';
import { JUZ_METADATA } from '@/lib/quran/constants';
import type { JuzMeta, SurahMeta } from '@/lib/quran/types';

type SidebarTab = 'surah' | 'juz' | 'page';

interface PageNavItem {
  number: number;
  surah: number;
  ayah: number;
  surahName: string;
}

const ALL_PAGE_ITEMS: readonly PageNavItem[] = PAGE_STARTS.map(([surah, ayah], idx) => ({
  number: idx + 1,
  surah,
  ayah,
  surahName: getSurahMeta(surah)?.englishName ?? `Surah ${surah}`,
}));

interface SurahSidebarProps {
  currentSurahId: number;
  isOpen: boolean;
  onClose: () => void;
}

function closeSidebarOnMobile(onClose: () => void): void {
  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    onClose();
  }
}

function SidebarTabs({
  activeTab,
  onSelectTab,
}: {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
}) {
  const activeClass = 'bg-[var(--primary)] text-white shadow-sm';
  const inactiveClass = 'text-[var(--text-muted)] hover:text-[var(--foreground)]';

  return (
    <div
      role="tablist"
      aria-label="Quran Sections"
      className="grid grid-cols-3 gap-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border)]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'surah'}
        onClick={() => onSelectTab('surah')}
        className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
          activeTab === 'surah' ? activeClass : inactiveClass
        }`}
      >
        <BookOpen className="w-3.5 h-3.5" />
        Surah
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'juz'}
        onClick={() => onSelectTab('juz')}
        className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
          activeTab === 'juz' ? activeClass : inactiveClass
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        Juz
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'page'}
        onClick={() => onSelectTab('page')}
        className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
          activeTab === 'page' ? activeClass : inactiveClass
        }`}
      >
        <FileText className="w-3.5 h-3.5" />
        Page
      </button>
    </div>
  );
}

function SidebarSurahList({
  surahs,
  currentSurahId,
  onClose,
}: {
  surahs: readonly SurahMeta[];
  currentSurahId: number;
  onClose: () => void;
}) {
  if (surahs.length === 0) {
    return <p className="p-4 text-xs text-center text-[var(--text-muted)]">No matching surahs.</p>;
  }

  return (
    <div>
      {surahs.map((surah) => {
        const isCurrent = surah.number === currentSurahId;
        return (
          <Link
            key={surah.number}
            href={`/surah/${surah.number}`}
            onClick={() => closeSidebarOnMobile(onClose)}
            aria-current={isCurrent ? 'true' : undefined}
            className={`flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
              isCurrent
                ? 'bg-[var(--primary)]/15 border border-[var(--primary)]/40 text-[var(--foreground)] font-semibold'
                : 'hover:bg-[var(--card-hover)] text-[var(--foreground)]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 text-xs font-mono text-[var(--text-muted)] shrink-0">
                {surah.number}.
              </span>
              <div className="truncate">
                <div className="text-xs font-medium text-[var(--foreground)] truncate">
                  {surah.englishName}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  {surah.englishNameTranslation} • {surah.ayahCount}
                </div>
              </div>
            </div>
            <span className="font-arabic text-xs text-[var(--text-muted)] shrink-0" dir="rtl">
              {surah.arabicName}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function SidebarJuzList({
  juzList,
  onClose,
}: {
  juzList: readonly JuzMeta[];
  onClose: () => void;
}) {
  if (juzList.length === 0) {
    return <p className="p-4 text-xs text-center text-[var(--text-muted)]">No matching Juz.</p>;
  }

  return (
    <div>
      {juzList.map((juz) => (
        <Link
          key={juz.number}
          href={`/surah/${juz.startSurah}?ayah=${juz.startAyah}`}
          onClick={() => closeSidebarOnMobile(onClose)}
          className="flex items-center justify-between p-2.5 rounded-lg text-left hover:bg-[var(--card-hover)] text-[var(--foreground)] transition-colors"
        >
          <div className="min-w-0">
            <div className="text-xs font-medium text-[var(--foreground)]">
              Juz {juz.number}: {juz.name}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Starts {juz.startSurah}:{juz.startAyah}
            </div>
          </div>
          <span className="font-arabic text-xs text-[var(--text-muted)] shrink-0" dir="rtl">
            {juz.arabicName}
          </span>
        </Link>
      ))}
    </div>
  );
}

function SidebarPageList({
  pages,
  onClose,
}: {
  pages: readonly PageNavItem[];
  onClose: () => void;
}) {
  if (pages.length === 0) {
    return <p className="p-4 text-xs text-center text-[var(--text-muted)]">No matching page (1–604).</p>;
  }

  return (
    <div>
      {pages.map((page) => (
        <Link
          key={page.number}
          href={`/surah/${page.surah}?ayah=${page.ayah}`}
          onClick={() => closeSidebarOnMobile(onClose)}
          className="flex items-center justify-between p-2.5 rounded-lg text-left hover:bg-[var(--card-hover)] text-[var(--foreground)] transition-colors"
        >
          <span className="text-xs font-medium text-[var(--foreground)]">
            Page {page.number}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {page.surahName} {page.surah}:{page.ayah}
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function SurahSidebar({
  currentSurahId,
  isOpen,
  onClose,
}: SurahSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('surah');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSurahs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SURAH_METADATA;
    return SURAH_METADATA.filter(
      (s) =>
        s.englishName.toLowerCase().includes(q) ||
        s.englishNameTranslation.toLowerCase().includes(q) ||
        s.arabicName.includes(q) ||
        String(s.number).includes(q)
    );
  }, [searchQuery]);

  const filteredJuz = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return JUZ_METADATA;
    return JUZ_METADATA.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        j.arabicName.includes(q) ||
        String(j.number).includes(q)
    );
  }, [searchQuery]);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ALL_PAGE_ITEMS;
    return ALL_PAGE_ITEMS.filter(
      (p) =>
        String(p.number).includes(q) ||
        p.surahName.toLowerCase().includes(q) ||
        `${p.surah}:${p.ayah}`.includes(q)
    );
  }, [searchQuery]);

  return (
    <>
      {isOpen && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar overlay"
          className="fixed inset-0 bg-black/60 z-30 lg:hidden cursor-default"
        />
      )}

      <aside
        id="reader-sidebar"
        aria-label="Surah Navigation"
        className={`fixed top-14 bottom-0 left-0 z-30 pt-24 sm:pt-16 lg:pt-0 w-72 sm:w-80 bg-[var(--card-bg)] border-r border-[var(--border)] flex-col transition-colors ${
          isOpen ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="p-3 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[var(--foreground)]">Navigate Quran</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="p-1 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <SidebarTabs activeTab={activeTab} onSelectTab={setActiveTab} />

          <div className="relative mt-2.5">
            <label htmlFor="sidebar-filter-input" className="sr-only">
              Filter sidebar
            </label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              id="sidebar-filter-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-9 pr-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border)]">
          {activeTab === 'surah' && (
            <SidebarSurahList
              surahs={filteredSurahs}
              currentSurahId={currentSurahId}
              onClose={onClose}
            />
          )}
          {activeTab === 'juz' && (
            <SidebarJuzList juzList={filteredJuz} onClose={onClose} />
          )}
          {activeTab === 'page' && (
            <SidebarPageList pages={filteredPages} onClose={onClose} />
          )}
        </div>
      </aside>
    </>
  );
}
