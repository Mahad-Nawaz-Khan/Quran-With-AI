'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '../components/Header';
import {
  Search,
  BookOpen,
  Loader2,
  X,
  ArrowRight,
  CornerDownLeft,
  AlertCircle,
  Compass,
  FileText,
} from 'lucide-react';
import { executeSearch } from '@/lib/quran/search';
import { getSurahMeta } from '@/lib/quran/surahMetadata';
import type {
  CommandIntent,
  SurahSearchMatch,
  AyahSearchMatch,
  SearchResult,
} from '@/lib/quran/types';

interface IntentBannerDescriptor {
  eyebrow: string;
  title: string;
  href: string;
  ctaLabel: string;
  ariaLabel?: string;
  icon: 'compass' | 'page' | 'book' | 'none';
}

function describeSearchIntentBanner(intent: CommandIntent): IntentBannerDescriptor | null {
  if (intent.kind === 'reference') {
    const surahName = getSurahMeta(intent.surahNumber)?.englishName ?? String(intent.surahNumber);
    return {
      eyebrow: 'Direct Reference Jump',
      title: `Surah ${surahName}, Ayah ${intent.ayahNumber}`,
      href: intent.href,
      ctaLabel: `Go to ${intent.surahNumber}:${intent.ayahNumber}`,
      ariaLabel: `Go to Verse ${intent.surahNumber}:${intent.ayahNumber}`,
      icon: 'none',
    };
  }
  if (intent.kind === 'juz') {
    return {
      eyebrow: 'Direct Juz Jump',
      title: `Juz ${intent.juzNumber}`,
      href: intent.href,
      ctaLabel: 'Open Juz',
      icon: 'compass',
    };
  }
  if (intent.kind === 'page') {
    return {
      eyebrow: 'Direct Page Jump',
      title: `Page ${intent.pageNumber}`,
      href: intent.href,
      ctaLabel: 'Open Page',
      icon: 'page',
    };
  }
  if (intent.kind === 'surah') {
    const surahName = getSurahMeta(intent.surahNumber)?.englishName ?? '';
    return {
      eyebrow: 'Direct Surah Jump',
      title: `${intent.surahNumber}. ${surahName}`,
      href: intent.href,
      ctaLabel: 'Open Surah',
      icon: 'book',
    };
  }
  return null;
}

function renderBannerIcon(icon: IntentBannerDescriptor['icon']) {
  if (icon === 'compass') return <Compass className="w-6 h-6 text-[var(--primary)]" />;
  if (icon === 'page') return <FileText className="w-6 h-6 text-[var(--primary)]" />;
  if (icon === 'book') return <BookOpen className="w-6 h-6 text-[var(--primary)]" />;
  return null;
}

function SearchIntentBanner({ intent }: { intent: CommandIntent }) {
  if (intent.kind === 'invalid_reference') {
    return (
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-500 text-sm">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p>{intent.reason}</p>
      </div>
    );
  }

  const descriptor = describeSearchIntentBanner(intent);
  if (!descriptor) return null;

  return (
    <div className="p-4 bg-[var(--primary)]/10 border border-[var(--primary)]/40 rounded-2xl flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {renderBannerIcon(descriptor.icon)}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)] block">
            {descriptor.eyebrow}
          </span>
          <span className="text-base sm:text-lg font-bold text-[var(--foreground)]">
            {descriptor.title}
          </span>
        </div>
      </div>
      <Link
        href={descriptor.href}
        aria-label={descriptor.ariaLabel}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
      >
        {descriptor.ctaLabel} <CornerDownLeft className="w-4 h-4" />
      </Link>
    </div>
  );
}

function SearchSurahMatchesPanel({ matches }: { matches: SurahSearchMatch[] }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-[var(--foreground)] mb-3">
        Matching Surahs ({matches.length})
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((surah) => (
          <Link
            key={surah.surahNumber}
            href={`/surah/${surah.surahNumber}`}
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--surface-elevated)] flex items-center justify-center font-bold text-[var(--primary)] text-sm group-hover:bg-[var(--primary)] group-hover:text-white transition-colors">
                {surah.surahNumber}
              </div>
              <div>
                <div className="font-semibold text-[var(--foreground)] text-sm group-hover:text-[var(--primary)] transition-colors">
                  {surah.englishName}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {surah.englishNameTranslation} • {surah.numberOfAyahs} ayahs
                </div>
              </div>
            </div>
            <span className="font-arabic text-sm text-[var(--text-muted)]" dir="rtl">
              {surah.arabicName}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SearchAyahResultsPanel({
  matches,
  total,
  linkReferenceText,
}: {
  matches: AyahSearchMatch[];
  total: number;
  linkReferenceText: 'include' | 'omit';
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-[var(--foreground)] mb-3">
        Ayah Results ({total})
      </h2>
      <div className="space-y-3">
        {matches.map((ayah) => (
          <article
            key={`${ayah.surahNumber}:${ayah.ayahNumber}`}
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--primary)]/80 transition-colors"
          >
            <div className="flex items-center justify-between mb-3 border-b border-[var(--border)] pb-2.5">
              {linkReferenceText === 'include' ? (
                <Link
                  href={`/surah/${ayah.surahNumber}?ayah=${ayah.ayahNumber}`}
                  className="font-bold text-sm text-[var(--foreground)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5"
                >
                  <BookOpen className="w-4 h-4 text-[var(--primary)]" />
                  <span>Surah {ayah.surahName}</span>
                  <span className="text-[var(--primary)]">
                    {ayah.surahNumber}:{ayah.ayahNumber}
                  </span>
                </Link>
              ) : (
                <span className="font-bold text-sm text-[var(--foreground)] flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[var(--primary)]" />
                  <span>Surah {ayah.surahName}</span>
                  <span className="text-[var(--primary)]">
                    {ayah.surahNumber}:{ayah.ayahNumber}
                  </span>
                </span>
              )}

              <Link
                href={`/surah/${ayah.surahNumber}?ayah=${ayah.ayahNumber}`}
                className="text-xs text-[var(--primary)] hover:underline inline-flex items-center gap-1"
              >
                Read in Reader <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <p className="font-arabic text-xl text-right text-[var(--foreground)] leading-loose mb-3" dir="rtl">
              {ayah.text}
            </p>

            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              {ayah.translation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SearchResultsView({
  loading,
  error,
  searchResult,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  searchResult: SearchResult | null;
  onRetry: () => void;
}) {
  if (error && !loading) {
    return (
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
          onClick={onRetry}
          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] mb-3" />
        <p className="text-sm font-medium">Searching canonical text...</p>
      </div>
    );
  }

  if (!searchResult) {
    return (
      <div className="text-center py-20 text-[var(--text-muted)] max-w-md mx-auto">
        <BookOpen className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
        <h2 className="text-base font-medium text-[var(--foreground)] mb-1">Search the Holy Quran</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Type a topic, translation phrase, or verse number into the search bar above to begin.
        </p>
      </div>
    );
  }

  const hasEmptyResults =
    searchResult.surahMatches.length === 0 &&
    searchResult.ayahMatches.length === 0 &&
    searchResult.intent.kind !== 'invalid_reference';

  return (
    <div className="space-y-8">
      <SearchIntentBanner intent={searchResult.intent} />
      {searchResult.surahMatches.length > 0 && (
        <SearchSurahMatchesPanel matches={searchResult.surahMatches} />
      )}
      {searchResult.ayahMatches.length > 0 && (
        <SearchAyahResultsPanel
          matches={searchResult.ayahMatches}
          total={searchResult.totalAyahMatches}
          linkReferenceText={searchResult.intent.kind === 'reference' ? 'omit' : 'include'}
        />
      )}
      {hasEmptyResults && (
        <div className="text-center py-16 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6">
          <Search className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-base font-semibold text-[var(--foreground)]">
            No results found for &ldquo;{searchResult.query}&rdquo;
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md mx-auto">
            Try searching for general keywords (e.g. &ldquo;charity&rdquo;, &ldquo;prayer&rdquo;, &ldquo;Abraham&rdquo;) or a specific verse reference (e.g. &ldquo;2:255&rdquo;).
          </p>
        </div>
      )}
    </div>
  );
}

function SearchContentInner({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [inputVal, setInputVal] = useState(initialQuery);
  const [loading, setLoading] = useState(Boolean(initialQuery.trim()));
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);

  const runSearch = useCallback(async (queryToRun: string) => {
    const trimmed = queryToRun.trim();
    if (!trimmed) {
      setSearchResult(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await executeSearch(trimmed);
      setSearchResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search service unavailable. Please retry.');
      setSearchResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = initialQuery.trim();
    if (!trimmed) return;
    let active = true;
    const controller = new AbortController();
    void executeSearch(trimmed, { signal: controller.signal })
      .then((res) => {
        if (active) {
          setSearchResult(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Search service unavailable. Please retry.');
          setSearchResult(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [initialQuery]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      void runSearch(trimmed);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20 text-[var(--foreground)]">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] flex items-center gap-2.5">
          <Search className="w-7 h-7 text-[var(--primary)]" />
          Search the Quran
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Search by English translation, Arabic text, Surah name, or verse reference (e.g. &ldquo;2:255&rdquo;)
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="mb-8">
        <div className="relative flex items-center bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-2 focus-within:border-[var(--primary)] transition-colors">
          <Search className="w-5 h-5 text-[var(--text-muted)] ml-2 mr-3 shrink-0" />
          <input
            type="search"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Search keywords (e.g. patience, mercy, fasting) or verse reference (2:255)..."
            aria-label="Search the Quran"
            className="flex-1 bg-transparent text-[var(--foreground)] text-base outline-none placeholder-[var(--text-muted)] py-1"
          />
          {inputVal && (
            <button
              type="button"
              onClick={() => {
                setInputVal('');
                setSearchResult(null);
                setError(null);
              }}
              aria-label="Clear search input"
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-hover)] mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
          >
            Search
          </button>
        </div>
      </form>

      <SearchResultsView
        loading={loading}
        error={error}
        searchResult={searchResult}
        onRetry={() => void runSearch(inputVal)}
      />
    </main>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q') ?? '';
  return <SearchContentInner key={qParam} initialQuery={qParam} />;
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header />
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-32 text-[var(--text-muted)]">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
          </div>
        }
      >
        <SearchContent />
      </Suspense>
    </div>
  );
}
