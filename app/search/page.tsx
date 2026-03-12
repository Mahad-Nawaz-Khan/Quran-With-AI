'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import { Search, Sparkles, BookOpen, Loader2, X, ChevronRight } from 'lucide-react';

interface AyahResult {
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  arabicName: string;
  text: string;
  translation: string;
  type: 'ayah';
}

interface SurahResult {
  surahNumber: number;
  englishName: string;
  arabicName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
  type: 'surah';
}

interface SurahInfo {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

type SearchResult = AyahResult | SurahResult;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [surahs, setSurahs] = useState<Record<number, SurahInfo>>({});
  const [allAyahs, setAllAyahs] = useState<{surah: number; ayah: number; text: string; translation: string}[]>([]);
  const [isLoadingAyahs, setIsLoadingAyahs] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load surah list
  useEffect(() => {
    fetch('https://api.alquran.cloud/v1/surah')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          const map: Record<number, SurahInfo> = {};
          data.data.forEach((s: any) => {
            map[s.number] = {
              number: s.number,
              name: s.name,
              englishName: s.englishName,
              englishNameTranslation: s.englishNameTranslation,
              numberOfAyahs: s.numberOfAyahs,
              revelationType: s.revelationType
            };
          });
          setSurahs(map);
        }
      });
  }, []);

  // Load all ayahs
  useEffect(() => {
    const loadAyahs = async () => {
      const cached = sessionStorage.getItem('quran-all-ayahs');
      if (cached) {
        setAllAyahs(JSON.parse(cached));
        return;
      }
      
      setIsLoadingAyahs(true);
      try {
        const allData: {surah: number; ayah: number; text: string; translation: string}[] = [];
        for (let i = 1; i <= 114; i++) {
          const res = await fetch(`https://api.alquran.cloud/v1/surah/${i}/editions/quran-uthmani,en.sahih`);
          const data = await res.json();
          if (data.code === 200) {
            const arabic = data.data[0];
            const english = data.data[1];
            arabic.ayahs.forEach((ayah: any, index: number) => {
              allData.push({
                surah: arabic.number,
                ayah: ayah.numberInSurah,
                text: ayah.text,
                translation: english.ayahs[index].text
              });
            });
          }
        }
        setAllAyahs(allData);
        sessionStorage.setItem('quran-all-ayahs', JSON.stringify(allData));
      } catch (e) {
        console.error('Failed to load ayahs', e);
      }
      setIsLoadingAyahs(false);
    };
    
    loadAyahs();
  }, []);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search functions
  const searchSurahs = useCallback((q: string): SurahResult[] => {
    if (!q.trim()) return [];
    const query = q.toLowerCase();
    const matches: SurahResult[] = [];
    
    for (const [num, info] of Object.entries(surahs)) {
      const n = parseInt(num);
      if (
        info.englishName.toLowerCase().includes(query) ||
        info.englishNameTranslation.toLowerCase().includes(query) ||
        info.name.includes(q)
      ) {
        matches.push({
          surahNumber: n,
          englishName: info.englishName,
          arabicName: info.name,
          englishNameTranslation: info.englishNameTranslation,
          numberOfAyahs: info.numberOfAyahs,
          revelationType: info.revelationType,
          type: 'surah'
        });
      }
    }
    return matches.slice(0, 5);
  }, [surahs]);

  const searchAyahs = useCallback((q: string, limit: number = 10): AyahResult[] => {
    if (!q.trim() || allAyahs.length === 0) return [];
    
    const query = q.toLowerCase();
    const matches: { result: AyahResult; score: number }[] = [];
    
    // Check for direct reference like "2:255"
    const refMatch = q.match(/^(\d+):(\d+)$/);
    if (refMatch) {
      const [, s, a] = refMatch;
      const found = allAyahs.find(x => x.surah === parseInt(s) && x.ayah === parseInt(a));
      if (found) {
        const info = surahs[found.surah];
        return [{
          surahNumber: found.surah,
          ayahNumber: found.ayah,
          surahName: info?.englishName || `Surah ${found.surah}`,
          arabicName: info?.name || '',
          text: found.text,
          translation: found.translation,
          type: 'ayah'
        }];
      }
    }
    
    for (const ayah of allAyahs) {
      let score = 0;
      const trans = ayah.translation.toLowerCase();
      
      if (trans.includes(query)) score += 100;
      if (ayah.text.includes(q)) score += 80;
      
      const words = query.split(/\s+/);
      for (const w of words) {
        if (w.length > 2) {
          if (trans.includes(w)) score += 20;
          if (ayah.text.includes(w)) score += 10;
        }
      }
      
      if (score > 0) {
        const info = surahs[ayah.surah];
        matches.push({
          result: {
            surahNumber: ayah.surah,
            ayahNumber: ayah.ayah,
            surahName: info?.englishName || `Surah ${ayah.surah}`,
            arabicName: info?.name || '',
            text: ayah.text,
            translation: ayah.translation,
            type: 'ayah'
          },
          score
        });
      }
    }
    
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map(m => m.result);
  }, [allAyahs, surahs]);

  // Real-time suggestions
  const updateSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      if (!q.trim()) {
        setSuggestions([]);
        return;
      }
      const surahMatches = searchSurahs(q);
      const ayahMatches = searchAyahs(q, 5);
      setSuggestions([...surahMatches, ...ayahMatches]);
    }, 150);
  }, [searchSurahs, searchAyahs]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowSuggestions(true);
    updateSuggestions(val);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setShowSuggestions(false);
    setLoading(true);
    setHasSearched(true);
    
    const surahMatches = searchSurahs(query);
    const ayahMatches = searchAyahs(query, 50);
    setResults([...surahMatches, ...ayahMatches]);
    
    setLoading(false);
  };

  const clearSearch = () => {
    setQuery('');
    setSuggestions([]);
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // Group results
  const surahResults = results.filter(r => r.type === 'surah') as SurahResult[];
  const ayahResults = results.filter(r => r.type === 'ayah') as AyahResult[];

  return (
    <div className="min-h-screen bg-[#1f2125]">
      <Header />
      
      <main className="pt-14">
        {/* Hero Search Section */}
        {!hasSearched && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-8 tracking-tight">
              Quranic<span className="text-[#2ca4ab]">AI</span>
            </h1>
            
            <div ref={searchRef} className="w-full max-w-2xl relative">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  placeholder="Search the Quran..."
                  className="w-full pl-14 pr-12 py-4 bg-[#2d2f33] border border-[#3a3d42] rounded-full text-white text-lg placeholder-gray-500 focus:outline-none focus:border-[#2ca4ab] transition-colors"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </form>
              
              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#2d2f33] border border-[#3a3d42] rounded-xl shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
                  {/* Surah Results */}
                  {suggestions.filter(s => s.type === 'surah').length > 0 && (
                    <div className="p-2">
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Surahs
                      </div>
                      {suggestions.filter(s => s.type === 'surah').map((s, i) => (
                        <Link
                          key={`s-${i}`}
                          href={`/surah/${s.surahNumber}`}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#3a3d42] rounded-lg transition-colors"
                        >
                          <BookOpen className="w-4 h-4 text-gray-500" />
                          <span className="text-white font-medium">
                            {s.surahNumber}. {(s as SurahResult).englishName}
                          </span>
                          <span className="text-gray-500 text-sm">
                            ({(s as SurahResult).englishNameTranslation})
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  
                  {/* Ayah Results */}
                  {suggestions.filter(s => s.type === 'ayah').length > 0 && (
                    <div className="p-2 border-t border-[#3a3d42]">
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ayahs
                      </div>
                      {suggestions.filter(s => s.type === 'ayah').map((s, i) => {
                        const a = s as AyahResult;
                        return (
                          <Link
                            key={`a-${i}`}
                            href={`/surah/${a.surahNumber}?ayah=${a.ayahNumber}`}
                            className="block px-3 py-3 hover:bg-[#3a3d42] rounded-lg transition-colors"
                          >
                            <p className="font-arabic text-lg text-right text-white/90 mb-1" dir="rtl">
                              {a.text.slice(0, 100)}{a.text.length > 100 ? '...' : ''}
                            </p>
                            <p className="text-gray-400 text-sm line-clamp-1">
                              {a.translation.slice(0, 120)}{a.translation.length > 120 ? '...' : ''}
                            </p>
                            <p className="text-[#2ca4ab] text-xs mt-1">
                              {a.surahName} {a.surahNumber}:{a.ayahNumber}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              
              {/* Loading indicator */}
              {isLoadingAyahs && query && suggestions.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#2d2f33] border border-[#3a3d42] rounded-xl p-4 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#2ca4ab] mx-auto" />
                  <p className="text-gray-400 text-sm mt-2">Loading search data...</p>
                </div>
              )}
            </div>
            
            {/* Quick Links */}
            <div className="flex items-center gap-4 mt-6">
              <Link 
                href="/surah" 
                className="flex items-center gap-2 px-4 py-2 bg-[#2d2f33] hover:bg-[#3a3d42] rounded-full text-white text-sm transition-colors"
              >
                <span className="text-[#2ca4ab]">☰</span>
                Navigate Quran
              </Link>
              <span className="text-gray-600">or</span>
              <Link 
                href="/surah/1" 
                className="flex items-center gap-2 px-4 py-2 bg-[#2d2f33] hover:bg-[#3a3d42] rounded-full text-white text-sm transition-colors"
              >
                <Sparkles className="w-4 h-4 text-[#2ca4ab]" />
                Popular
              </Link>
            </div>
          </div>
        )}
        
        {/* Search Results Page */}
        {hasSearched && (
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Search Bar */}
            <div ref={searchRef} className="mb-8">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  placeholder="Search the Quran..."
                  className="w-full pl-12 pr-12 py-3 bg-[#2d2f33] border border-[#3a3d42] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#2ca4ab] transition-colors"
                />
                {query && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </form>
              
              {/* Suggestions */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="mt-2 bg-[#2d2f33] border border-[#3a3d42] rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    s.type === 'surah' ? (
                      <Link
                        key={i}
                        href={`/surah/${s.surahNumber}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[#3a3d42] border-b border-[#3a3d42] last:border-0"
                      >
                        <BookOpen className="w-4 h-4 text-gray-500" />
                        <span className="text-white">{s.surahNumber}. {(s as SurahResult).englishName}</span>
                      </Link>
                    ) : (
                      <Link
                        key={i}
                        href={`/surah/${s.surahNumber}?ayah=${(s as AyahResult).ayahNumber}`}
                        className="block px-4 py-3 hover:bg-[#3a3d42] border-b border-[#3a3d42] last:border-0"
                      >
                        <p className="text-gray-400 text-sm line-clamp-1">{(s as AyahResult).translation}</p>
                        <p className="text-[#2ca4ab] text-xs mt-1">
                          {(s as AyahResult).surahName} {(s as AyahResult).surahNumber}:{(s as AyahResult).ayahNumber}
                        </p>
                      </Link>
                    )
                  ))}
                </div>
              )}
            </div>
            
            {/* Results Count */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-gray-400 text-sm">
                {surahResults.length > 0 && `${surahResults.length} surah${surahResults.length > 1 ? 's' : ''}`}
                {surahResults.length > 0 && ayahResults.length > 0 && ' • '}
                {ayahResults.length > 0 && `${ayahResults.length} ayah${ayahResults.length > 1 ? 's' : ''}`}
                {!loading && results.length === 0 && 'No results'}
              </h2>
              <button
                onClick={() => setHasSearched(false)}
                className="text-[#2ca4ab] text-sm hover:underline"
              >
                Back to search
              </button>
            </div>
            
            {/* Loading */}
            {loading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#2ca4ab]" />
              </div>
            )}
            
            {/* Results */}
            {!loading && results.length > 0 && (
              <div className="space-y-6">
                {/* Surah Results */}
                {surahResults.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-gray-500 text-xs uppercase tracking-wider font-medium px-1">
                      Surahs
                    </h3>
                    <div className="space-y-1">
                      {surahResults.map((s, i) => (
                        <Link
                          key={i}
                          href={`/surah/${s.surahNumber}`}
                          className="flex items-center gap-3 px-4 py-3 bg-[#2d2f33] hover:bg-[#3a3d42] rounded-lg transition-colors group"
                        >
                          <BookOpen className="w-4 h-4 text-gray-500" />
                          <span className="text-white font-medium">
                            {s.surahNumber}. {s.englishName}
                          </span>
                          <span className="text-gray-500 text-sm">
                            ({s.englishNameTranslation})
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Ayah Results */}
                {ayahResults.length > 0 && (
                  <div className="space-y-3">
                    {surahResults.length > 0 && (
                      <h3 className="text-gray-500 text-xs uppercase tracking-wider font-medium px-1 pt-4 border-t border-[#3a3d42]">
                        Ayahs
                      </h3>
                    )}
                    {ayahResults.map((a, i) => (
                      <Link
                        key={i}
                        href={`/surah/${a.surahNumber}?ayah=${a.ayahNumber}`}
                        className="block bg-[#2d2f33] hover:bg-[#3a3d42] rounded-lg p-4 transition-colors"
                      >
                        {/* Arabic */}
                        <p className="font-arabic text-xl text-right text-white leading-relaxed mb-3" dir="rtl">
                          {a.text}
                        </p>
                        
                        {/* Translation */}
                        <p className="text-gray-300 leading-relaxed">
                          {a.translation}
                        </p>
                        
                        {/* Reference */}
                        <p className="text-[#2ca4ab] text-sm mt-3">
                          ({a.surahName} {a.surahNumber}:{a.ayahNumber})
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* No Results */}
            {!loading && results.length === 0 && (
              <div className="text-center py-16">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">No results found for &quot;{query}&quot;</p>
                <p className="text-gray-500 text-sm mt-2">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
