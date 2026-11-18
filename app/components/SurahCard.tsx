'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Bookmark } from 'lucide-react';
import type { SurahMeta } from '@/lib/quran/types';

export interface SurahCardData {
  number: number;
  name?: string;
  arabicName?: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs?: number;
  ayahCount?: number;
  revelationType: string;
}

interface SurahCardProps {
  surah: SurahCardData | SurahMeta;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

function getSurahArabicName(surah: SurahCardData | SurahMeta): string {
  if ('arabicName' in surah && surah.arabicName) {
    return surah.arabicName;
  }
  if ('name' in surah && typeof surah.name === 'string') {
    return surah.name;
  }
  return '';
}

function getSurahTotalAyahs(surah: SurahCardData | SurahMeta): number {
  if ('ayahCount' in surah && typeof surah.ayahCount === 'number') {
    return surah.ayahCount;
  }
  if ('numberOfAyahs' in surah && typeof surah.numberOfAyahs === 'number') {
    return surah.numberOfAyahs;
  }
  return 0;
}

export default function SurahCard({ surah, isBookmarked, onToggleBookmark }: SurahCardProps) {
  const router = useRouter();

  const handlePlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/surah/${surah.number}?autoplay=1`);
  };

  const handleBookmarkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark?.();
  };

  const arabicName = getSurahArabicName(surah);
  const totalAyahs = getSurahTotalAyahs(surah);

  return (
    <article className="surah-card group relative bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-all flex items-center justify-between gap-4">
      {/* Primary Link for Navigation */}
      <Link
        href={`/surah/${surah.number}`}
        aria-label={`${surah.number}. ${surah.englishName} (${surah.englishNameTranslation})`}
        className="flex items-center gap-4 flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-lg"
      >
        {/* Diamond Surah Number */}
        <div className="relative shrink-0" aria-hidden="true">
          <div className="w-10 h-10 bg-[var(--surface-elevated)] rotate-45 rounded-lg flex items-center justify-center group-hover:bg-[var(--primary)] group-focus-within:bg-[var(--primary)] transition-colors">
            <span className="text-[var(--foreground)] group-hover:text-white group-focus-within:text-white text-sm font-semibold -rotate-45">
              {surah.number}
            </span>
          </div>
        </div>

        {/* English Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--foreground)] text-sm sm:text-base truncate group-hover:text-[var(--primary)] transition-colors">
            <span className="sr-only">{surah.number}. </span>
            {surah.englishName}
          </h3>
          <p className="text-xs text-[var(--text-muted)] truncate">
            {surah.englishNameTranslation}
          </p>
        </div>

        {/* Arabic Info */}
        <div className="text-right shrink-0">
          <p className="font-arabic text-[var(--primary)] text-base sm:text-lg leading-tight" dir="rtl">
            {arabicName}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {totalAyahs} Ayahs
          </p>
        </div>
      </Link>

      {/* Action Buttons (External to <a> tag) */}
      <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-80 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
        {onToggleBookmark && (
          <button
            type="button"
            onClick={handleBookmarkClick}
            aria-label={`Bookmark Surah ${surah.englishName}`}
            className={`p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors ${
              isBookmarked ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>
        )}
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label={`Play Surah ${surah.englishName}`}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--surface-elevated)] transition-colors"
        >
          <Play className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}
