'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import { Compass, BookOpen, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { QURAN_TOPICS } from '@/lib/quran/topics';
import { SURAHS } from '@/lib/quran/surahMetadata';
import { fetchAyahsBatch } from '@/lib/quran/api';
import type { Ayah, TopicVerseRef } from '@/lib/quran/types';

export default function TopicsPage() {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(QURAN_TOPICS[0].id);
  const [versesData, setVersesData] = useState<Record<string, Ayah>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const activeTopic = QURAN_TOPICS.find((t) => t.id === selectedTopicId) ?? QURAN_TOPICS[0];

  const loadTopicVerses = useCallback(async (verses: readonly TopicVerseRef[]) => {
    setLoading(true);
    setError(null);
    try {
      const refs = verses.map((v) => ({ surah: v.surah, ayah: v.ayah }));
      const fetched = await fetchAyahsBatch(refs, ['en.sahih']);
      const record: Record<string, Ayah> = {};
      fetched.forEach((ayah) => {
        record[`${ayah.surahNumber}:${ayah.numberInSurah}`] = ayah;
      });
      setVersesData((prev) => ({ ...prev, ...record }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topic verses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopicVerses(activeTopic.verses);
  }, [activeTopic, loadTopicVerses]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <Compass className="w-7 h-7 text-[var(--primary)]" />
            Thematic &amp; Topics Explorer
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Explore the Holy Quran by theme, virtue, prayers, and prophetic narratives.
          </p>
        </div>

        {/* Topics Selection Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {QURAN_TOPICS.map((topic) => {
            const isSelected = topic.id === activeTopic.id;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setSelectedTopicId(topic.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-[var(--primary)]/15 border-[var(--primary)] shadow-lg shadow-[var(--primary)]/10'
                    : 'bg-[var(--card-bg)] border-[var(--border)] hover:border-[var(--primary)]/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-arabic text-sm text-[var(--primary)]" dir="rtl">
                    {topic.arabicTitle}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-[var(--primary)] inline-block" />
                  )}
                </div>
                <div className="font-semibold text-[var(--foreground)] text-sm sm:text-base leading-tight">
                  {topic.title}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {topic.verses.length} selected verses
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Topic Verses Container */}
        <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 shadow-xl">
          <div className="border-b border-[var(--border)] pb-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
                  {activeTopic.title}
                </h2>
                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
                  {activeTopic.description}
                </p>
              </div>
              <span className="font-arabic text-2xl text-[var(--primary)] shrink-0" dir="rtl">
                {activeTopic.arabicTitle}
              </span>
            </div>
          </div>

          {/* Error State with Retry (FLOW-03) */}
          {error && (
            <div
              role="alert"
              className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between text-red-400 mb-6"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => loadTopicVerses(activeTopic.verses)}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-semibold transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          <div className="space-y-4">
            {activeTopic.verses.map((verseRef) => (
              <TopicVerseCard
                key={verseRef.key}
                verseRef={verseRef}
                ayahData={versesData[`${verseRef.surah}:${verseRef.ayah}`]}
                loadState={loading ? 'loading' : 'ready'}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function TopicVerseCard({
  verseRef,
  ayahData,
  loadState,
}: {
  verseRef: TopicVerseRef;
  ayahData?: Ayah;
  loadState: 'loading' | 'ready';
}) {
  const surah = SURAHS[verseRef.surah - 1];
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-4 sm:p-5 hover:border-[var(--primary)] transition-colors flex flex-col gap-3 group">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
        <div className="flex items-center gap-2">
          <Link
            href={`/surah/${verseRef.surah}?ayah=${verseRef.ayah}`}
            className="font-bold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors text-sm sm:text-base flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-[var(--primary)]" />
            <span>Quran {verseRef.surah}:{verseRef.ayah}</span>
          </Link>
          <span className="text-xs text-[var(--text-muted)]">
            ({surah?.englishName ?? `Surah ${verseRef.surah}`})
          </span>
        </div>

        <Link
          href={`/surah/${verseRef.surah}?ayah=${verseRef.ayah}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] group-hover:translate-x-1 transition-transform shrink-0"
        >
          <span>Read in Surah</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <p className="text-xs sm:text-sm text-[var(--text-muted)] italic">
        {verseRef.label}
      </p>

      {ayahData && (
        <div className="space-y-2 pt-1">
          <p className="font-arabic text-xl sm:text-2xl text-right text-[var(--foreground)] leading-loose" dir="rtl">
            {ayahData.text}
          </p>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            {ayahData.translation}
          </p>
        </div>
      )}

      {!ayahData && loadState === 'loading' && (
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
          <span>Loading verified verse text...</span>
        </div>
      )}
    </div>
  );
}
