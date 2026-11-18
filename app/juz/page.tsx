'use client';

import Link from 'next/link';
import Header from '../components/Header';
import { BookOpen, ChevronRight } from 'lucide-react';
import { JUZ_METADATA } from '@/lib/quran/constants';
import { SURAHS } from '@/lib/quran/surahMetadata';

export default function JuzPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-[var(--primary)]" />
            Juz Index
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            The Quran is divided into 30 equal sections (Juz) to facilitate structured recitation.
          </p>
        </div>

        {/* Juz Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {JUZ_METADATA.map((juz) => {
            const startSurah = SURAHS[juz.startSurah - 1];
            const endSurah = SURAHS[juz.endSurah - 1];
            return (
              <Link
                key={juz.number}
                href={`/surah/${juz.startSurah}?ayah=${juz.startAyah}`}
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] hover:bg-[var(--card-hover)] transition-all group block focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-bold text-[var(--primary)]">Juz {juz.number}</span>
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="mb-2">
                  <span className="text-sm font-semibold text-[var(--foreground)] block">{juz.name}</span>
                  <span className="font-arabic text-xs text-[var(--text-muted)]" dir="rtl">{juz.arabicName}</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-2 mt-2 space-y-0.5">
                  <p className="truncate">
                    From {startSurah?.englishName ?? `Surah ${juz.startSurah}`}:{juz.startAyah}
                  </p>
                  <p className="truncate">
                    To {endSurah?.englishName ?? `Surah ${juz.endSurah}`}:{juz.endAyah}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
