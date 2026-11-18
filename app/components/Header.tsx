'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Search, Moon, Sun, Settings, Globe, ChevronDown } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahMetadata';
import { useTheme, useLanguage } from '@/lib/hooks/usePersistentState';
import { SUPPORTED_LANGUAGES } from '@/lib/quran/constants';
import { getTranslationDictionary } from '@/lib/i18n/translations';
import type { AppLanguageCode, SurahMeta } from '@/lib/quran/types';
import HeaderSearchModal from './HeaderSearchModal';
import SettingsModal from './SettingsModal';

interface HeaderProps {
  surahNumber?: number;
  surahName?: string;
  pageInfo?: string;
}

interface SurahSwitcherProps {
  surahNumber: number;
  surahName?: string;
  isOpen: boolean;
  filterQuery: string;
  filteredSurahs: SurahMeta[];
  onToggle: () => void;
  onFilterChange: (value: string) => void;
  onSelect: () => void;
}

function SurahSwitcherDropdown({
  surahNumber,
  surahName,
  isOpen,
  filterQuery,
  filteredSurahs,
  onToggle,
  onFilterChange,
  onSelect,
}: SurahSwitcherProps) {
  const displayName = surahName ?? SURAHS[surahNumber - 1]?.englishName ?? '';
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Switch Surah"
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--foreground)] text-sm border border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors"
      >
        <span>{surahNumber}. {displayName}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl z-50 p-2">
          <div className="p-1 mb-2">
            <input
              id="header-surah-filter"
              type="text"
              value={filterQuery}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder="Filter surahs..."
              aria-label="Filter surahs"
              className="w-full px-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
            />
          </div>
          {filteredSurahs.map((s) => (
            <Link
              key={s.number}
              href={`/surah/${s.number}`}
              onClick={onSelect}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                s.number === surahNumber
                  ? 'text-[var(--primary)] bg-[var(--surface-elevated)] font-semibold'
                  : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
              }`}
            >
              <span>{s.number}. {s.englishName}</span>
              <span className="font-arabic text-[var(--text-muted)]" dir="rtl">{s.arabicName}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface LanguageMenuProps {
  language: AppLanguageCode;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (code: AppLanguageCode) => void;
}

function LanguageSwitcherMenu({ language, isOpen, onToggle, onSelect }: LanguageMenuProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
        title="Select Language"
        aria-label="Language selector"
      >
        <Globe className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl z-50 p-1">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => onSelect(l.code)}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-between ${
                language === l.code
                  ? 'text-[var(--primary)] bg-[var(--surface-elevated)] font-semibold'
                  : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
              }`}
            >
              <span>{l.name}</span>
              <span className="text-[var(--text-muted)]">{l.nativeName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function filterSurahsByQuery(query: string): SurahMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SURAHS];
  return SURAHS.filter((s) => (
    String(s.number) === q ||
    s.englishName.toLowerCase().includes(q) ||
    s.englishNameTranslation.toLowerCase().includes(q) ||
    s.arabicName.includes(q)
  ));
}

export default function Header({ surahNumber, surahName, pageInfo }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const t = useMemo(() => getTranslationDictionary(language), [language]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSurahDropdown, setShowSurahDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [surahFilterQuery, setSurahFilterQuery] = useState('');

  const surahDropdownRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (surahDropdownRef.current && !surahDropdownRef.current.contains(e.target)) {
        setShowSurahDropdown(false);
      }
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target)) {
        setShowLanguageDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageSelect = (lang: AppLanguageCode) => {
    setLanguage(lang);
    setShowLanguageDropdown(false);
  };

  const filteredSurahs = useMemo(() => filterSurahsByQuery(surahFilterQuery), [surahFilterQuery]);

  const navLinkClass =
    'px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors';

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-[var(--card-bg)]/95 backdrop-blur-md border-b border-[var(--border)] text-[var(--foreground)] transition-colors"
      >
        <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded-lg"
            >
              <span className="text-[var(--foreground)] font-bold text-lg">Quranic</span>
              <span className="text-[var(--primary)] font-bold text-lg">AI</span>
            </Link>

            <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1 text-sm font-medium">
              <Link href="/" className={navLinkClass}>{t.navHome}</Link>
              <Link href="/surah" className={navLinkClass}>{t.navSurahs}</Link>
              <Link href="/juz" className={navLinkClass}>{t.navJuz}</Link>
              <Link href="/topics" className={navLinkClass}>{t.navTopics}</Link>
              <Link href="/bookmarks" className={navLinkClass}>{t.navBookmarks}</Link>
              <Link href="/search" className={navLinkClass}>{t.navSearch}</Link>
            </nav>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            {surahNumber && (
              <div ref={surahDropdownRef}>
                <SurahSwitcherDropdown
                  surahNumber={surahNumber}
                  surahName={surahName}
                  isOpen={showSurahDropdown}
                  filterQuery={surahFilterQuery}
                  filteredSurahs={filteredSurahs}
                  onToggle={() => setShowSurahDropdown((prev) => !prev)}
                  onFilterChange={setSurahFilterQuery}
                  onSelect={() => setShowSurahDropdown(false)}
                />
              </div>
            )}
            {pageInfo && <span className="text-xs text-[var(--text-muted)]">{pageInfo}</span>}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--card-hover)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors text-xs"
              title="Search or Jump to verse (Ctrl+K)"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">{t.navSearch}</span>
              <kbd className="hidden sm:inline px-1.5 py-0.5 bg-[var(--card-bg)] border border-[var(--border)] rounded text-[10px] text-[var(--text-muted)] font-mono">
                Ctrl K
              </kbd>
            </button>

            <div ref={languageDropdownRef}>
              <LanguageSwitcherMenu
                language={language}
                isOpen={showLanguageDropdown}
                onToggle={() => setShowLanguageDropdown((prev) => !prev)}
                onSelect={handleLanguageSelect}
              />
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <HeaderSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    </>
  );
}
