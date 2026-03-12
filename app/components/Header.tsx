'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Moon, Sun, Settings, Globe, ChevronDown, X, BookOpen, Loader2 } from 'lucide-react';

interface HeaderProps {
  surahNumber?: number;
  surahName?: string;
  pageInfo?: string;
}

interface SurahInfo {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface AyahResult {
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  text: string;
  translation: string;
  type: 'ayah';
}

interface SurahResult {
  surahNumber: number;
  englishName: string;
  arabicName: string;
  englishNameTranslation: string;
  type: 'surah';
}

type SearchResult = AyahResult | SurahResult;

const SURAH_NAMES = [
  'Al-Fatihah', 'Al-Baqarah', 'Ali Imran', 'An-Nisa', "Al-Ma'idah", 'Al-Anam', "Al-A'raf", 'Al-Anfal', 'At-Tawbah', 'Yunus',
  'Hud', 'Yusuf', 'Ar-Rad', 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan', 'Ash-Shuara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum',
  'Luqman', 'As-Sajda', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
  'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiya', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
  'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqia', 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah',
  'As-Saff', 'Al-Jumuah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', 'Al-Maarij',
  'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Naziat', 'Abasa',
  'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-Ala', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
  'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zilzal', 'Al-Adiyat',
  'Al-Qaria', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh', "Al-Ma'un", 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas'
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'ur', name: 'اردو' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'tr', name: 'Türkçe' },
];

export default function Header({ surahNumber, surahName, pageInfo }: HeaderProps) {
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSurahDropdown, setShowSurahDropdown] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  
  // Search state
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [surahs, setSurahs] = useState<Record<number, SurahInfo>>({});
  const [allAyahs, setAllAyahs] = useState<{surah: number; ayah: number; text: string; translation: string}[]>([]);
  const [isLoadingAyahs, setIsLoadingAyahs] = useState(false);
  
  const surahDropdownRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  // Load all ayahs for searching
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

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const savedLang = localStorage.getItem('quran-language');
    if (savedLang) setSelectedLanguage(savedLang);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (surahDropdownRef.current && !surahDropdownRef.current.contains(e.target as Node)) {
        setShowSurahDropdown(false);
      }
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setShowLanguageDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

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
          type: 'surah'
        });
      }
    }
    return matches.slice(0, 5);
  }, [surahs]);

  const searchAyahs = useCallback((q: string, limit: number = 5): AyahResult[] => {
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

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    updateSuggestions(val);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setIsSearchOpen(false);
      setSearchQuery('');
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (suggestion: SearchResult) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSuggestions([]);
    
    if (suggestion.type === 'surah') {
      router.push(`/surah/${suggestion.surahNumber}`);
    } else {
      router.push(`/surah/${suggestion.surahNumber}?ayah=${suggestion.ayahNumber}`);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    document.documentElement.classList.toggle('dark', newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const handleSurahSelect = (num: number) => {
    router.push(`/surah/${num}`);
    setShowSurahDropdown(false);
  };

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code);
    localStorage.setItem('quran-language', code);
    setShowLanguageDropdown(false);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#1f2125] border-b border-[#2d2f33]">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1">
            <span className="text-white font-bold text-lg">Quranic</span>
            <span className="text-[#2ca4ab] font-bold text-lg">AI</span>
          </Link>

          {/* Center - Surah Selector & Page Info */}
          <div className="hidden md:flex items-center gap-4">
            {surahNumber && (
              <div className="relative" ref={surahDropdownRef}>
                <button 
                  onClick={() => setShowSurahDropdown(!showSurahDropdown)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2d2f33] text-white hover:bg-[#3a3d42] transition-colors"
                >
                  <span className="text-sm">{surahNumber}. {surahName}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showSurahDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showSurahDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-64 max-h-80 overflow-y-auto bg-[#1f2125] border border-[#2d2f33] rounded-lg shadow-lg z-50">
                    <div className="p-2 border-b border-[#2d2f33]">
                      <input
                        type="text"
                        placeholder="Search surah..."
                        className="w-full px-3 py-2 bg-[#2d2f33] border border-[#3a3d42] rounded text-sm text-white placeholder-gray-500 outline-none focus:border-[#2ca4ab]"
                        onChange={(e) => {
                          // Filter logic could be added here
                        }}
                      />
                    </div>
                    {SURAH_NAMES.map((name, idx) => (
                      <button
                        key={idx + 1}
                        onClick={() => handleSurahSelect(idx + 1)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[#2d2f33] transition-colors ${
                          idx + 1 === surahNumber ? 'text-[#2ca4ab] bg-[#2d2f33]' : 'text-white'
                        }`}
                      >
                        {idx + 1}. {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {pageInfo && (
              <span className="text-sm text-gray-400">{pageInfo}</span>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2 rounded-lg hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              title="Search"
            >
              <Search className="w-5 h-5" />
            </button>
            
            <div className="relative" ref={languageDropdownRef}>
              <button 
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="p-2 rounded-lg hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
                title="Language"
              >
                <Globe className="w-5 h-5" />
              </button>
              
              {showLanguageDropdown && (
                <div className="absolute top-full right-0 mt-2 w-40 bg-[#1f2125] border border-[#2d2f33] rounded-lg shadow-lg z-50">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[#2d2f33] transition-colors ${
                        selectedLanguage === lang.code ? 'text-[#2ca4ab] bg-[#2d2f33]' : 'text-white'
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-lg hover:bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Search Modal with Real-time Suggestions */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-60 flex items-start justify-center pt-20 px-4">
          <div 
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              setIsSearchOpen(false);
              setSuggestions([]);
            }}
          />
          <div className="relative w-full max-w-2xl">
            {/* Search Input */}
            <div className="bg-[#1f2125] rounded-xl shadow-2xl border border-[#2d2f33] overflow-hidden">
              <form onSubmit={handleSearch} className="p-4">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    placeholder="Search the Quran..."
                    className="flex-1 bg-transparent text-white text-lg outline-none placeholder-gray-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSuggestions([]);
                        searchInputRef.current?.focus();
                      }}
                      className="p-1 rounded hover:bg-[#2d2f33] text-gray-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchOpen(false);
                      setSuggestions([]);
                    }}
                    className="p-1 rounded hover:bg-[#2d2f33]"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </form>

              {/* Loading State */}
              {isLoadingAyahs && searchQuery && suggestions.length === 0 && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading search data...</span>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="max-h-[60vh] overflow-y-auto border-t border-[#2d2f33]">
                  {/* Surah Results */}
                  {suggestions.filter(s => s.type === 'surah').length > 0 && (
                    <div className="p-2">
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Surahs
                      </div>
                      {suggestions.filter(s => s.type === 'surah').map((s, i) => (
                        <button
                          key={`s-${i}`}
                          onClick={() => handleSuggestionClick(s)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2d2f33] rounded-lg transition-colors text-left"
                        >
                          <BookOpen className="w-4 h-4 text-gray-500" />
                          <div className="flex-1">
                            <span className="text-white font-medium">
                              {s.surahNumber}. {(s as SurahResult).englishName}
                            </span>
                            <span className="text-gray-500 text-sm ml-2">
                              ({(s as SurahResult).englishNameTranslation})
                            </span>
                          </div>
                          <ChevronDown className="w-4 h-4 text-gray-500 -rotate-90" />
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Ayah Results */}
                  {suggestions.filter(s => s.type === 'ayah').length > 0 && (
                    <div className="p-2 border-t border-[#2d2f33]">
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ayahs
                      </div>
                      {suggestions.filter(s => s.type === 'ayah').map((s, i) => {
                        const a = s as AyahResult;
                        return (
                          <button
                            key={`a-${i}`}
                            onClick={() => handleSuggestionClick(s)}
                            className="w-full block px-3 py-3 hover:bg-[#2d2f33] rounded-lg transition-colors text-left"
                          >
                            <p className="font-arabic text-base text-right text-white/90 mb-1" dir="rtl">
                              {a.text.slice(0, 80)}{a.text.length > 80 ? '...' : ''}
                            </p>
                            <p className="text-gray-400 text-sm line-clamp-1">
                              {a.translation.slice(0, 100)}{a.translation.length > 100 ? '...' : ''}
                            </p>
                            <p className="text-[#2ca4ab] text-xs mt-1">
                              {a.surahName} {a.surahNumber}:{a.ayahNumber}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Empty State / Hint */}
              {!isLoadingAyahs && suggestions.length === 0 && searchQuery && (
                <div className="px-4 pb-4">
                  <p className="text-gray-500 text-sm">
                    No results found. Press Enter to search or try a different term.
                  </p>
                </div>
              )}

              {/* Hint when no query */}
              {!searchQuery && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-gray-500">
                    Type to search or press <kbd className="px-1.5 py-0.5 bg-[#2d2f33] rounded text-gray-400">Esc</kbd> to close
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowSettingsModal(false)}
          />
          <div className="relative w-full max-w-md bg-[#1f2125] rounded-xl shadow-2xl border border-[#2d2f33]">
            <div className="p-4 border-b border-[#2d2f33] flex items-center justify-between">
              <h3 className="font-semibold text-white">Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded hover:bg-[#2d2f33]"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Language</label>
                <select 
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2d2f33] border border-[#3a3d42] rounded-lg text-white outline-none focus:border-[#2ca4ab]"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Theme</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsDark(true); document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }}
                    className={`flex-1 py-2 rounded-lg transition-colors ${isDark ? 'bg-[#2ca4ab] text-white' : 'bg-[#2d2f33] text-gray-400'}`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => { setIsDark(false); document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }}
                    className={`flex-1 py-2 rounded-lg transition-colors ${!isDark ? 'bg-[#2ca4ab] text-white' : 'bg-[#2d2f33] text-gray-400'}`}
                  >
                    Light
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
