'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from './components/Header';
import SurahCard from './components/SurahCard';
import { BookOpen, Sparkles, Play, ArrowRight, Star, Search } from 'lucide-react';

interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

const POPULAR_SURAHS = [1, 2, 18, 36, 55, 56, 67, 112, 113, 114];

export default function Home() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
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
      })
      .catch(() => setLoading(false));

    // Load bookmarks from localStorage
    const savedBookmarks = localStorage.getItem('quran-bookmarks');
    if (savedBookmarks) {
      setBookmarks(JSON.parse(savedBookmarks));
    }
  }, []);

  const toggleBookmark = (surahNumber: number) => {
    const newBookmarks = bookmarks.includes(surahNumber)
      ? bookmarks.filter(b => b !== surahNumber)
      : [...bookmarks, surahNumber];
    setBookmarks(newBookmarks);
    localStorage.setItem('quran-bookmarks', JSON.stringify(newBookmarks));
  };

  const popularSurahs = surahs.filter(s => POPULAR_SURAHS.includes(s.number));
  const meccanSurahs = surahs.filter(s => s.revelationType === 'Meccan').slice(0, 6);
  const medinanSurahs = surahs.filter(s => s.revelationType === 'Medinan').slice(0, 6);

  return (
    <div className="min-h-screen bg-[#1f2125]">
      <Header />

      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-[#2d2f33] via-[#1f2125] to-[#1f2125] text-white py-16 sm:py-24 lg:py-32 mt-14 overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h80v80H0z' fill='none'/%3E%3Cpath d='M20 20c0-11 9-20 20-20s20 9 20 20-9 20-20 20-20-9-20-20zm0 40c0-11 9-20 20-20s20 9 20 20-9 20-20 20-20-9-20-20z' fill='%23ffffff' fill-opacity='0.3'/%3E%3C/svg%3E")`,
          }} />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-4 sm:gap-8 lg:gap-16">
            {/* Left Decorative Element */}
            <div className="hidden sm:flex flex-col items-center gap-2">
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-[#2ca4ab] to-transparent opacity-60" />
              <div className="w-3 h-3 rotate-45 border border-[#2ca4ab] opacity-40" />
              <div className="w-2 h-2 rotate-45 bg-[#2ca4ab] opacity-30" />
              <div className="w-px h-24 bg-gradient-to-b from-transparent via-[#3a3d42] to-transparent" />
            </div>

            {/* Center Content */}
            <div className="text-center flex-1 max-w-3xl">
              {/* Arabic Calligraphy Style Title */}
              <div className="relative mb-6 sm:mb-8">
                <h1 
                  className="font-arabic text-6xl sm:text-8xl lg:text-9xl text-white leading-none tracking-wider"
                  style={{
                    textShadow: '0 0 60px rgba(44, 164, 171, 0.15), 0 4px 20px rgba(0,0,0,0.3)',
                    fontWeight: 400,
                  }}
                >
                  الْقُرْآنُ
                </h1>
                <p className="text-[#2ca4ab] text-sm sm:text-base lg:text-lg mt-4 tracking-[0.3em] uppercase font-medium opacity-80">
                  Al-Qur&apos;an Al-Kareem
                </p>
              </div>

              <p className="text-base sm:text-lg text-gray-400 mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
                Read, Listen & Understand the Holy Quran with translations, audio recitations, and AI-powered explanations
              </p>

              <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                <Link
                  href="/surah/1"
                  className="inline-flex items-center gap-2 bg-[#2ca4ab] text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold hover:bg-[#258a90] transition-all text-sm sm:text-base shadow-lg shadow-[#2ca4ab]/20"
                >
                  <BookOpen className="w-5 h-5" />
                  Start Reading
                </Link>
                <Link
                  href="/surah"
                  className="inline-flex items-center gap-2 bg-[#2d2f33] border border-[#3a3d42] text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold hover:bg-[#3a3d42] hover:border-[#2ca4ab] transition-all text-sm sm:text-base"
                >
                  <Play className="w-5 h-5" />
                  Browse Surahs
                </Link>
              </div>
            </div>

            {/* Right Decorative Element */}
            <div className="hidden sm:flex flex-col items-center gap-2">
              <div className="w-px h-24 bg-gradient-to-b from-transparent via-[#3a3d42] to-transparent" />
              <div className="w-2 h-2 rotate-45 bg-[#2ca4ab] opacity-30" />
              <div className="w-3 h-3 rotate-45 border border-[#2ca4ab] opacity-40" />
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-[#2ca4ab] to-transparent opacity-60" />
            </div>
          </div>

          {/* Bottom Stats */}
          <div className="mt-12 sm:mt-16 flex flex-wrap justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <p className="text-3xl sm:text-4xl font-bold text-[#2ca4ab]">114</p>
              <p className="text-sm text-gray-500 mt-1">Surahs</p>
            </div>
            <div className="w-px h-12 bg-[#3a3d42] hidden sm:block" />
            <div className="text-center">
              <p className="text-3xl sm:text-4xl font-bold text-[#2ca4ab]">30</p>
              <p className="text-sm text-gray-500 mt-1">Juz</p>
            </div>
            <div className="w-px h-12 bg-[#3a3d42] hidden sm:block" />
            <div className="text-center">
              <p className="text-3xl sm:text-4xl font-bold text-[#2ca4ab]">6236</p>
              <p className="text-sm text-gray-500 mt-1">Ayahs</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-8 sm:mb-12">
          <Link href="/surah" className="bg-[#2d2f33] border border-[#3a3d42] rounded-xl p-2 sm:p-4 hover:border-[#2ca4ab] transition-colors text-center">
            <BookOpen className="w-5 h-5 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-[#2ca4ab]" />
            <span className="text-xs sm:text-sm font-medium text-white">Surahs</span>
          </Link>
          <Link href="/juz" className="bg-[#2d2f33] border border-[#3a3d42] rounded-xl p-2 sm:p-4 hover:border-[#2ca4ab] transition-colors text-center">
            <span className="text-lg sm:text-2xl font-bold text-[#2ca4ab]">30</span>
            <span className="block text-xs sm:text-sm font-medium text-white">Juz</span>
          </Link>
          <Link href="/bookmarks" className="bg-[#2d2f33] border border-[#3a3d42] rounded-xl p-2 sm:p-4 hover:border-[#2ca4ab] transition-colors text-center">
            <Star className="w-5 h-5 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-[#2ca4ab]" />
            <span className="text-xs sm:text-sm font-medium text-white">Saved</span>
          </Link>
          <Link href="/search" className="bg-[#2d2f33] border border-[#3a3d42] rounded-xl p-2 sm:p-4 hover:border-[#2ca4ab] transition-colors text-center">
            <Search className="w-5 h-5 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-[#2ca4ab]" />
            <span className="text-xs sm:text-sm font-medium text-white">Search</span>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#2ca4ab] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Popular Surahs */}
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Popular Surahs</h2>
                <Link href="/surah" className="text-[#2ca4ab] hover:underline flex items-center gap-1 text-sm font-medium">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {popularSurahs.map(surah => (
                  <SurahCard
                    key={surah.number}
                    surah={surah}
                    isBookmarked={bookmarks.includes(surah.number)}
                    onToggleBookmark={() => toggleBookmark(surah.number)}
                  />
                ))}
              </div>
            </section>

            {/* Meccan Surahs */}
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Meccan Surahs</h2>
                  <p className="text-sm text-gray-400">Revealed before the migration to Medina</p>
                </div>
                <Link href="/surah?type=meccan" className="text-[#2ca4ab] hover:underline flex items-center gap-1 text-sm font-medium">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {meccanSurahs.map(surah => (
                  <SurahCard
                    key={surah.number}
                    surah={surah}
                    isBookmarked={bookmarks.includes(surah.number)}
                    onToggleBookmark={() => toggleBookmark(surah.number)}
                  />
                ))}
              </div>
            </section>

            {/* Medinan Surahs */}
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Medinan Surahs</h2>
                  <p className="text-sm text-gray-400">Revealed after the migration to Medina</p>
                </div>
                <Link href="/surah?type=medinan" className="text-[#2ca4ab] hover:underline flex items-center gap-1 text-sm font-medium">
                  View all <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {medinanSurahs.map(surah => (
                  <SurahCard
                    key={surah.number}
                    surah={surah}
                    isBookmarked={bookmarks.includes(surah.number)}
                    onToggleBookmark={() => toggleBookmark(surah.number)}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#2d2f33] border-t border-[#3a3d42] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400">
              Quran data from Al-Quran Cloud API • AI explanations powered by Groq
            </p>
            <div className="flex items-center gap-4">
              <Link href="/about" className="text-sm text-gray-400 hover:text-white">
                About
              </Link>
              <Link href="/privacy" className="text-sm text-gray-400 hover:text-white">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}