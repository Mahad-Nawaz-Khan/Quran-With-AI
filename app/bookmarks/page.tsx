'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import SurahCard from '../components/SurahCard';
import { Bookmark, Trash2, Star } from 'lucide-react';

interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface AyahBookmark {
  key: string;
  surahNumber: number;
  ayahNumber: number;
  timestamp: number;
}

export default function BookmarksPage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [surahBookmarks, setSurahBookmarks] = useState<number[]>([]);
  const [ayahBookmarks, setAyahBookmarks] = useState<AyahBookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch all surahs
    fetch('https://api.alquran.cloud/v1/surah')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          setSurahs(data.data);
        }
        setLoading(false);
      });

    // Load bookmarks
    const savedSurahBookmarks = localStorage.getItem('quran-bookmarks');
    if (savedSurahBookmarks) {
      setSurahBookmarks(JSON.parse(savedSurahBookmarks));
    }

    const savedAyahBookmarks = localStorage.getItem('quran-ayah-bookmarks');
    if (savedAyahBookmarks) {
      const keys = JSON.parse(savedAyahBookmarks) as string[];
      const parsed = keys.map(key => {
        const [surah, ayah] = key.split(':').map(Number);
        return { key, surahNumber: surah, ayahNumber: ayah, timestamp: Date.now() };
      });
      setAyahBookmarks(parsed);
    }
  }, []);

  const toggleSurahBookmark = (surahNumber: number) => {
    const newBookmarks = surahBookmarks.filter(b => b !== surahNumber);
    setSurahBookmarks(newBookmarks);
    localStorage.setItem('quran-bookmarks', JSON.stringify(newBookmarks));
  };

  const removeAyahBookmark = (key: string) => {
    const newBookmarks = ayahBookmarks.filter(b => b.key !== key);
    setAyahBookmarks(newBookmarks);
    localStorage.setItem('quran-ayah-bookmarks', JSON.stringify(newBookmarks.map(b => b.key)));
  };

  const bookmarkedSurahs = surahs.filter(s => surahBookmarks.includes(s.number));

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <Bookmark className="w-8 h-8 text-[var(--accent)]" />
            Bookmarks
          </h1>
          <p className="text-[var(--text-muted)] mt-1">Your saved surahs and ayahs</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Bookmarked Surahs */}
            <section className="mb-12">
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-[var(--accent)]" />
                Bookmarked Surahs ({bookmarkedSurahs.length})
              </h2>
              
              {bookmarkedSurahs.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {bookmarkedSurahs.map(surah => (
                    <SurahCard
                      key={surah.number}
                      surah={surah}
                      isBookmarked={true}
                      onToggleBookmark={() => toggleSurahBookmark(surah.number)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-[var(--card-bg)] rounded-xl border border-[var(--border)]">
                  <Bookmark className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
                  <p className="text-[var(--text-muted)]">No bookmarked surahs yet</p>
                  <Link
                    href="/surah"
                    className="inline-block mt-4 text-[var(--primary)] hover:underline"
                  >
                    Browse surahs
                  </Link>
                </div>
              )}
            </section>

            {/* Bookmarked Ayahs */}
            <section>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-[var(--primary)]" />
                Bookmarked Ayahs ({ayahBookmarks.length})
              </h2>
              
              {ayahBookmarks.length > 0 ? (
                <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] overflow-hidden">
                  {ayahBookmarks.map((bookmark) => {
                    const surah = surahs.find(s => s.number === bookmark.surahNumber);
                    return (
                      <div
                        key={bookmark.key}
                        className="flex items-center justify-between p-4 border-b border-[var(--border)] last:border-0 hover:bg-[var(--background)] transition-colors"
                      >
                        <Link
                          href={`/surah/${bookmark.surahNumber}?ayah=${bookmark.ayahNumber}`}
                          className="flex-1"
                        >
                          <div className="flex items-center gap-3">
                            <div className="ayah-number">
                              {bookmark.ayahNumber}
                            </div>
                            <div>
                              <p className="font-medium text-[var(--foreground)]">
                                {surah?.englishName || `Surah ${bookmark.surahNumber}`}
                              </p>
                              <p className="text-sm text-[var(--text-muted)]">
                                Ayah {bookmark.ayahNumber}
                              </p>
                            </div>
                          </div>
                        </Link>
                        <button
                          onClick={() => removeAyahBookmark(bookmark.key)}
                          className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                          title="Remove bookmark"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 bg-[var(--card-bg)] rounded-xl border border-[var(--border)]">
                  <Bookmark className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
                  <p className="text-[var(--text-muted)]">No bookmarked ayahs yet</p>
                  <p className="text-sm text-[var(--text-muted)] mt-2">
                    Click the bookmark icon on any ayah to save it
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
