'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Header from './components/Header';
import SurahCard from './components/SurahCard';
import { BookOpen, Play, ArrowRight, Bookmark, Search, Compass, RotateCcw } from 'lucide-react';
import { SURAHS } from '@/lib/quran/surahMetadata';
import { useReadingProgress, useSurahBookmarks } from '@/lib/hooks/usePersistentState';

const POPULAR_SURAH_NUMBERS = [1, 2, 18, 36, 55, 56, 67, 112, 113, 114];
const TOTAL_AYAH_COUNT = 6236;

export default function Home() {
  const { progress } = useReadingProgress();
  const { isBookmarked, toggleBookmark } = useSurahBookmarks();

  const completedAyahCount = progress.completedAyahs.length;
  const khatamPercent = Math.min(
    100,
    Math.round((completedAyahCount / TOTAL_AYAH_COUNT) * 1000) / 10
  );

  const lastReadSurah = useMemo(() => {
    if (!progress.lastRead) return null;
    return SURAHS[progress.lastRead.surah - 1] ?? null;
  }, [progress.lastRead]);

  const popularSurahs = useMemo(
    () => SURAHS.filter((s) => POPULAR_SURAH_NUMBERS.includes(s.number)),
    []
  );

  const meccanSurahs = useMemo(
    () =>
      SURAHS.filter(
        (s) => s.revelationType === 'Meccan' && !POPULAR_SURAH_NUMBERS.includes(s.number)
      ).slice(0, 6),
    []
  );

  const medinanSurahs = useMemo(
    () =>
      SURAHS.filter(
        (s) => s.revelationType === 'Medinan' && !POPULAR_SURAH_NUMBERS.includes(s.number)
      ).slice(0, 6),
    []
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Header />

      {/* Hero Section */}
      <section className="relative bg-linear-to-b from-[var(--card-bg)] via-[var(--background)] to-[var(--background)] py-16 sm:py-24 mt-14 overflow-hidden border-b border-[var(--border)]">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            {/* Arabic Calligraphy Title */}
            <div className="mb-6">
              <h1 className="font-arabic text-7xl sm:text-9xl text-[var(--foreground)] leading-none font-normal">
                الْقُرْآنُ
              </h1>
              <p className="text-[var(--primary)] text-sm sm:text-base mt-4 tracking-[0.3em] uppercase font-semibold">
                Al-Qur&apos;an Al-Kareem
              </p>
            </div>

            <p className="text-base sm:text-lg text-[var(--text-muted)] mb-8 max-w-xl mx-auto leading-relaxed">
              Read, Listen &amp; Understand the Holy Quran with verified translations, recitations, and zero-hallucination grounded AI explanations.
            </p>

            <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
              <Link
                href="/surah/1"
                className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-colors shadow-lg shadow-[var(--primary)]/20"
              >
                <BookOpen className="w-5 h-5" />
                Start Reading
              </Link>
              <Link
                href="/surah"
                className="inline-flex items-center gap-2 bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground)] px-6 py-3 rounded-xl font-semibold hover:bg-[var(--card-hover)] hover:border-[var(--primary)] transition-colors"
              >
                <Play className="w-5 h-5" />
                Browse Surahs
              </Link>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-12 flex flex-wrap justify-center items-center gap-8 sm:gap-16 text-center">
            <div>
              <p className="text-3xl font-bold text-[var(--primary)]">114</p>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Surahs</p>
            </div>
            <div className="w-px h-10 bg-[var(--border)] hidden sm:block" />
            <div>
              <p className="text-3xl font-bold text-[var(--primary)]">30</p>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Juz</p>
            </div>
            <div className="w-px h-10 bg-[var(--border)] hidden sm:block" />
            <div>
              <p className="text-3xl font-bold text-[var(--primary)]">6,236</p>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Ayahs</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Continue Reading & Khatam Progress Card */}
        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--primary)] mb-1.5">
                <RotateCcw className="w-4 h-4" />
                <span>Khatam Progress: Reading &amp; Completion Tracker</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--foreground)] mb-2">
                {lastReadSurah && progress.lastRead ? (
                  <span>
                    Continue: Surah {lastReadSurah.englishName} ({progress.lastRead.surah}:{progress.lastRead.ayah})
                  </span>
                ) : (
                  <span>Track your personal Quran reading journey</span>
                )}
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                You have marked <strong className="text-[var(--foreground)]">{completedAyahCount} / 6236 ayahs</strong> ({khatamPercent}% of 6,236) completed.
              </p>

              {/* Progress bar */}
              <div className="w-full bg-[var(--surface-elevated)] rounded-full h-2.5 mt-3 overflow-hidden border border-[var(--border)]">
                <div
                  className="bg-[var(--primary)] h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(khatamPercent, 1)}%` }}
                />
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-3">
              {progress.lastRead ? (
                <Link
                  href={`/surah/${progress.lastRead.surah}?ayah=${progress.lastRead.ayah}`}
                  className="px-5 py-2.5 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors"
                >
                  Continue Reading (Ayah {progress.lastRead.ayah})
                </Link>
              ) : (
                <Link
                  href="/surah/1"
                  className="px-5 py-2.5 bg-[var(--primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-colors"
                >
                  Begin Khatam
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Quick Nav Cards */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Link
              href="/surah"
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] hover:bg-[var(--card-hover)] transition-all text-center group"
            >
              <BookOpen className="w-6 h-6 mx-auto mb-2 text-[var(--primary)] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold text-[var(--foreground)] block">Surahs</span>
              <span className="text-xs text-[var(--text-muted)]">114 Surahs</span>
            </Link>
            <Link
              href="/juz"
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] hover:bg-[var(--card-hover)] transition-all text-center group"
            >
              <span className="text-xl font-bold text-[var(--primary)] block mb-1 group-hover:scale-110 transition-transform">30</span>
              <span className="text-sm font-semibold text-[var(--foreground)] block">Juz Directory</span>
              <span className="text-xs text-[var(--text-muted)]">All 30 Sections</span>
            </Link>
            <Link
              href="/topics"
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] hover:bg-[var(--card-hover)] transition-all text-center group"
            >
              <Compass className="w-6 h-6 mx-auto mb-2 text-[var(--primary)] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold text-[var(--foreground)] block">Topics</span>
              <span className="text-xs text-[var(--text-muted)]">Thematic Explorer</span>
            </Link>
            <Link
              href="/bookmarks"
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] hover:bg-[var(--card-hover)] transition-all text-center group"
            >
              <Bookmark className="w-6 h-6 mx-auto mb-2 text-[var(--primary)] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold text-[var(--foreground)] block">Saved</span>
              <span className="text-xs text-[var(--text-muted)]">Notes &amp; Verses</span>
            </Link>
            <Link
              href="/search"
              className="col-span-2 sm:col-span-1 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] hover:bg-[var(--card-hover)] transition-all text-center group"
            >
              <Search className="w-6 h-6 mx-auto mb-2 text-[var(--primary)] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold text-[var(--foreground)] block">Search</span>
              <span className="text-xs text-[var(--text-muted)]">Arabic &amp; Translation</span>
            </Link>
          </div>
        </section>

        {/* Popular Surahs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Popular Surahs</h2>
            <Link href="/surah" className="text-[var(--primary)] hover:underline flex items-center gap-1 text-sm font-medium">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularSurahs.map((surah) => (
              <SurahCard
                key={surah.number}
                surah={surah}
                isBookmarked={isBookmarked(surah.number)}
                onToggleBookmark={() => toggleBookmark(surah.number)}
              />
            ))}
          </div>
        </section>

        {/* Meccan Surahs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Meccan Surahs</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Revealed in Makkah prior to the Hijrah</p>
            </div>
            <Link href="/surah?type=meccan" className="text-[var(--primary)] hover:underline flex items-center gap-1 text-sm font-medium">
              View all Meccan <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {meccanSurahs.map((surah) => (
              <SurahCard
                key={surah.number}
                surah={surah}
                isBookmarked={isBookmarked(surah.number)}
                onToggleBookmark={() => toggleBookmark(surah.number)}
              />
            ))}
          </div>
        </section>

        {/* Medinan Surahs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Medinan Surahs</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Revealed following the migration to Madinah</p>
            </div>
            <Link href="/surah?type=medinan" className="text-[var(--primary)] hover:underline flex items-center gap-1 text-sm font-medium">
              View all Medinan <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {medinanSurahs.map((surah) => (
              <SurahCard
                key={surah.number}
                surah={surah}
                isBookmarked={isBookmarked(surah.number)}
                onToggleBookmark={() => toggleBookmark(surah.number)}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[var(--card-bg)] border-t border-[var(--border)] py-8 text-[var(--foreground)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[var(--text-muted)] text-center sm:text-left">
              Quranic text via authoritative APIs • Grounded zero-hallucination AI explanations via OpenRouter
            </p>
            <div className="flex items-center gap-4 text-xs font-medium text-[var(--text-muted)]">
              <Link href="/about" className="hover:text-[var(--foreground)] transition-colors">
                About &amp; Sources
              </Link>
              <Link href="/privacy" className="hover:text-[var(--foreground)] transition-colors">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
