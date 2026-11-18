'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '../components/Header';
import SurahCard from '../components/SurahCard';
import { Search, Filter } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahMetadata';
import { useSurahBookmarks } from '@/lib/hooks/usePersistentState';

type FilterType = 'all' | 'meccan' | 'medinan';

function SurahsContent() {
  const searchParams = useSearchParams();
  const rawType = searchParams.get('type')?.toLowerCase();
  const queryParamFilter: FilterType =
    rawType === 'meccan' || rawType === 'medinan' ? rawType : 'all';

  const [userFilter, setUserFilter] = useState<FilterType | null>(null);
  const filter: FilterType = userFilter ?? queryParamFilter;

  const [searchQuery, setSearchQuery] = useState('');
  const { isBookmarked, toggleBookmark } = useSurahBookmarks();

  const handleFilterChange = (newFilter: FilterType) => {
    setUserFilter(newFilter);
  };

  const filteredSurahs = useMemo(() => {
    let list = SURAHS;

    if (filter !== 'all') {
      const target = filter === 'meccan' ? 'Meccan' : 'Medinan';
      list = list.filter((s) => s.revelationType === target);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.englishName.toLowerCase().includes(q) ||
          s.englishNameTranslation.toLowerCase().includes(q) ||
          s.arabicName.includes(q) ||
          s.number.toString() === q
      );
    }

    return list;
  }, [filter, searchQuery]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20 text-[var(--foreground)]">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">All Surahs</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Explore every chapter of the Holy Quran</p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <label htmlFor="surah-search" className="sr-only">
            Search Surahs
          </label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            id="surah-search"
            type="search"
            placeholder="Search by name, number, meaning..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl focus:border-[var(--primary)] outline-none transition-colors text-[var(--foreground)] text-sm placeholder-[var(--text-muted)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="surah-filter" className="sr-only">
            Filter by Revelation Type
          </label>
          <Filter className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <select
            id="surah-filter"
            aria-label="Filter by Revelation Type"
            value={filter}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'all' || val === 'meccan' || val === 'medinan') {
                handleFilterChange(val);
              }
            }}
            className="px-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl focus:border-[var(--primary)] outline-none text-[var(--foreground)] text-sm"
          >
            <option value="all">All (114)</option>
            <option value="meccan">Meccan (86)</option>
            <option value="medinan">Medinan (28)</option>
          </select>
        </div>
      </div>

      {/* Results Count */}
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Showing <strong className="text-[var(--foreground)]">{filteredSurahs.length}</strong> surahs
      </p>

      {/* Surahs Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSurahs.map((surah) => (
          <SurahCard
            key={surah.number}
            surah={surah}
            isBookmarked={isBookmarked(surah.number)}
            onToggleBookmark={() => toggleBookmark(surah.number)}
          />
        ))}
      </div>

      {filteredSurahs.length === 0 && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p className="text-base font-medium">No surahs matched &ldquo;{searchQuery}&rdquo;</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Try searching by surah number (e.g. 18) or a different spelling.</p>
        </div>
      )}
    </main>
  );
}

export default function AllSurahsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Header />
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-32 text-[var(--text-muted)]">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <SurahsContent />
      </Suspense>
    </div>
  );
}
