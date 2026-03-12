'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import SurahCard from '../components/SurahCard';
import { Search, Filter, ArrowRight } from 'lucide-react';

interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export default function AllSurahsPage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [filteredSurahs, setFilteredSurahs] = useState<Surah[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'meccan' | 'medinan'>('all');

  useEffect(() => {
    fetch('https://api.alquran.cloud/v1/surah')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          setSurahs(data.data);
          setFilteredSurahs(data.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const savedBookmarks = localStorage.getItem('quran-bookmarks');
    if (savedBookmarks) {
      setBookmarks(JSON.parse(savedBookmarks));
    }
  }, []);

  useEffect(() => {
    let result = surahs;
    
    if (filter !== 'all') {
      result = result.filter(s => s.revelationType.toLowerCase() === filter);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.englishName.toLowerCase().includes(query) ||
        s.englishNameTranslation.toLowerCase().includes(query) ||
        s.name.includes(query) ||
        s.number.toString() === query
      );
    }
    
    setFilteredSurahs(result);
  }, [surahs, filter, searchQuery]);

  const toggleBookmark = (surahNumber: number) => {
    const newBookmarks = bookmarks.includes(surahNumber)
      ? bookmarks.filter(b => b !== surahNumber)
      : [...bookmarks, surahNumber];
    setBookmarks(newBookmarks);
    localStorage.setItem('quran-bookmarks', JSON.stringify(newBookmarks));
  };

  return (
    <div className="min-h-screen bg-[#1f2125]">
      <Header />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 pt-20">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">All Surahs</h1>
          <p className="text-sm sm:text-base text-gray-400 mt-1">Browse all 114 surahs</p>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-6 sm:mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-[#2d2f33] border border-[#3a3d42] rounded-xl focus:border-[#2ca4ab] outline-none transition-colors text-white text-sm sm:text-base placeholder-gray-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 sm:px-4 py-2.5 sm:py-3 bg-[#2d2f33] border border-[#3a3d42] rounded-xl focus:border-[#2ca4ab] outline-none transition-colors text-white text-sm sm:text-base"
            >
              <option value="all">All</option>
              <option value="meccan">Meccan</option>
              <option value="medinan">Medinan</option>
            </select>
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-gray-400 mb-4">
          {filteredSurahs.length} surahs
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#2ca4ab] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSurahs.map(surah => (
              <SurahCard
                key={surah.number}
                surah={surah}
                isBookmarked={bookmarks.includes(surah.number)}
                onToggleBookmark={() => toggleBookmark(surah.number)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
