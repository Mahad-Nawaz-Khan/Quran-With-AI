'use client';

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../components/Header';
import AyahView from '../../components/AyahView';
import AudioPlayer from '../../components/AudioPlayer';
import ThinkingLoader from '../../components/ThinkingLoader';
import { 
  Sparkles,
  X,
  Search,
  BookText,
  Play,
  ChevronDown,
  BookOpen
} from 'lucide-react';

interface Ayah {
  number: number;
  numberInSurah: number;
  text: string;
  translation?: string;
  audio?: string;
  allTranslations?: { language: string; text: string }[];
}

interface SurahInfo {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.abdurrahmaansudais', name: 'Abdurrahman As-Sudais' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdul Samad' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi' },
];

export default function SurahPage() {
  const params = useParams();
  const surahId = parseInt(params.id as string);

  const [surahInfo, setSurahInfo] = useState<SurahInfo | null>(null);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTranslations, setSelectedTranslations] = useState<string[]>([]);
  const [selectedReciter, setSelectedReciter] = useState<string>('ar.alafasy');
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedAyahForAI, setSelectedAyahForAI] = useState<Ayah | null>(null);
  const [isPlayingFullSurah, setIsPlayingFullSurah] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    const savedTranslations = localStorage.getItem('quran-translations');
    const savedReciter = localStorage.getItem('quran-reciter');

    if (savedTranslations) {
      setSelectedTranslations(JSON.parse(savedTranslations));
    } else {
      setSelectedTranslations(['en.sahih']);
    }

    if (savedReciter) {
      setSelectedReciter(savedReciter);
    }

    // Load bookmarks
    const savedBookmarks = localStorage.getItem('quran-ayah-bookmarks');
    if (savedBookmarks) {
      setBookmarks(JSON.parse(savedBookmarks));
    }
  }, []);

  // Save translations preference
  const handleTranslationsChange = (ids: string[]) => {
    setSelectedTranslations(ids);
    localStorage.setItem('quran-translations', JSON.stringify(ids));
  };

  // Save reciter preference
  const handleReciterChange = (reciterId: string) => {
    setSelectedReciter(reciterId);
    localStorage.setItem('quran-reciter', reciterId);
  };

  // Load bookmarks from localStorage
  useEffect(() => {
    const savedBookmarks = localStorage.getItem('quran-ayah-bookmarks');
    if (savedBookmarks) {
      setBookmarks(JSON.parse(savedBookmarks));
    }
  }, []);

  // Fetch surah data when surahId or selections change
  useEffect(() => {
    if (selectedTranslations.length === 0 || !selectedReciter) return;

    setLoading(true);
    setAyahs([]);
    setCurrentAyahIndex(0);
    setIsPlaying(false);

    // Fetch surah info
    fetch(`https://api.alquran.cloud/v1/surah/${surahId}`)
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          setSurahInfo(data.data);
        }
      });

    // Fetch ayahs with Arabic text, translations, and audio
    const translationIds = selectedTranslations.join(',');
    fetch(`https://api.alquran.cloud/v1/surah/${surahId}/editions/quran-uthmani,${translationIds},${selectedReciter}`)
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          const arabicData = data.data[0];
          const audioData = data.data[data.data.length - 1];

          const combinedAyahs = arabicData.ayahs.map((ayah: any, index: number) => {
            const translations = data.data.slice(1, -1).map((edition: any) => ({
              language: edition.englishName,
              text: edition.ayahs[index].text
            }));

            // Remove Bismillah from first ayah for surahs that display it separately
            // (all surahs except Al-Fatiha (1) and At-Tawbah (9))
            let ayahText = ayah.text;
            if (index === 0 && surahId !== 1 && surahId !== 9) {
              // Bismillah + space = 39 characters from API
              const bismillahLength = 39;
              if (ayahText.length > bismillahLength) {
                ayahText = ayahText.slice(bismillahLength).trim();
              }
            }

            return {
              number: ayah.number,
              numberInSurah: ayah.numberInSurah,
              text: ayahText,
              translation: translations[0]?.text || '',
              audio: audioData.ayahs[index]?.audio,
              allTranslations: translations
            };
          });

          setAyahs(combinedAyahs);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [surahId, selectedTranslations, selectedReciter]);

  const toggleBookmark = (ayahKey: string) => {
    const newBookmarks = bookmarks.includes(ayahKey)
      ? bookmarks.filter(b => b !== ayahKey)
      : [...bookmarks, ayahKey];
    setBookmarks(newBookmarks);
    localStorage.setItem('quran-ayah-bookmarks', JSON.stringify(newBookmarks));
  };

  const getAIExplanation = async (ayah: Ayah) => {
    setSelectedAyahForAI(ayah);
    setAiExplanation('');
    setAiLoading(true);

    try {
      const res = await fetch('http://localhost:8000/explain-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ayahText: ayah.text,
          translation: ayah.translation,
          surahNumber: surahId,
          ayahNumber: ayah.numberInSurah,
        }),
      });

      if (!res.ok || !res.body) {
        setAiExplanation('Failed to get explanation. Please try again.');
        setAiLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.token) {
              fullText += payload.token;
              setAiExplanation(fullText);
            }
            if (payload.done) break;
            if (payload.error) {
              setAiExplanation(`Error: ${payload.error}`);
              setAiLoading(false);
              return;
            }
          } catch { /* skip malformed lines */ }
        }
      }

      if (!fullText) setAiExplanation('No explanation generated.');
      setAiLoading(false);
    } catch {
      setAiExplanation('Failed to get explanation. Please try again.');
      setAiLoading(false);
    }
  };

  const playAyah = useCallback((index: number) => {
    setCurrentAyahIndex(index);
    setIsPlaying(true);
    setIsPlayingFullSurah(false); // Single ayah mode - stops after this ayah
  }, []);

  const playAyahInSurah = useCallback((index: number) => {
    setCurrentAyahIndex(index);
    setIsPlaying(true);
    setIsPlayingFullSurah(true); // Full surah mode - continues to next
  }, []);

  const playFullSurah = useCallback(() => {
    if (ayahs.length > 0) {
      if (isPlayingFullSurah && isPlaying) {
        // Stop playback
        setIsPlaying(false);
        setIsPlayingFullSurah(false);
      } else {
        // Start playback from beginning
        setCurrentAyahIndex(0);
        setIsPlaying(true);
        setIsPlayingFullSurah(true);
      }
    }
  }, [ayahs.length, isPlayingFullSurah, isPlaying]);

  const handlePrevious = useCallback(() => {
    if (currentAyahIndex > 0) {
      playAyahInSurah(currentAyahIndex - 1);
    }
  }, [currentAyahIndex, playAyahInSurah]);

  const handleNext = useCallback(() => {
    // Only auto-advance if in full surah mode
    if (isPlayingFullSurah && currentAyahIndex < ayahs.length - 1) {
      playAyahInSurah(currentAyahIndex + 1);
    } else {
      // Stop playback after single ayah or at end of surah
      setIsPlaying(false);
      setIsPlayingFullSurah(false);
    }
  }, [currentAyahIndex, ayahs.length, playAyahInSurah, isPlayingFullSurah]);

  // Sync isPlayingFullSurah with isPlaying - when audio stops, reset full surah mode
  const handlePlayingChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
    if (!playing) {
      setIsPlayingFullSurah(false);
    }
  }, []);

  const currentAyah = ayahs[currentAyahIndex];
  const pageInfo = surahInfo ? `Page 1  Juz 1 / Hizb 1` : '';

  return (
    <div className="min-h-screen bg-[#1f2125] flex">
      <Header 
        surahNumber={surahId} 
        surahName={surahInfo?.englishName}
        pageInfo={pageInfo}
      />

      {/* Left Sidebar - Surah Navigation */}
      <aside
        className={`fixed left-0 top-14 bottom-0 bg-[#1f2125] border-r border-[#2d2f33] z-30 transition-all duration-300 overflow-hidden ${
          showSidebar ? 'w-64 translate-x-0' : 'w-0 -translate-x-full'
        } lg:static lg:translate-x-0 ${showSidebar ? 'lg:w-64' : 'lg:w-0 lg:hidden'}`}
      >
        <div className="h-full flex flex-col">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-[#2d2f33]">
            <button className="flex-1 py-3 text-sm text-white border-b-2 border-[#2ca4ab] flex items-center justify-center gap-2">
              <BookText className="w-4 h-4" />
              Surah
            </button>
            <button className="flex-1 py-3 text-sm text-gray-400 hover:text-white transition-colors">Juz</button>
            <button className="flex-1 py-3 text-sm text-gray-400 hover:text-white transition-colors">Page</button>
          </div>

          {/* Search in Sidebar */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-2 bg-[#2d2f33] border border-[#3a3d42] rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-[#2ca4ab]"
              />
            </div>
          </div>

          {/* Tip */}
          <div className="px-3 pb-2">
            <p className="text-xs text-gray-500">
              Tip: try navigating with <kbd className="px-1.5 py-0.5 bg-[#2d2f33] rounded text-gray-400">ctrl K</kbd>
            </p>
          </div>

          {/* Surah List */}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {Array.from({ length: 114 }, (_, i) => i + 1).map((num) => (
              <Link
                key={num}
                href={`/surah/${num}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  num === surahId
                    ? 'bg-[#2d2f33] text-white'
                    : 'hover:bg-[#2d2f33] text-gray-300'
                }`}
              >
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium ${
                  num === surahId ? 'bg-[#2ca4ab] text-white' : 'bg-[#2d2f33] text-gray-400'
                }`}>
                  {num}
                </span>
                <span className="flex-1 truncate">
                  {[
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
                  ][num - 1]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Surah Header - quranicai style */}
        <div className="bg-[#1f2125] border-b border-[#2d2f33] pt-14">
          {/* Page Info Bar */}
          <div className="max-w-5xl mx-auto px-4 pt-4 pb-2 flex items-center justify-center gap-2 text-sm text-gray-400">
            <BookOpen className="w-4 h-4" />
            <span>Page 1</span>
            <span>Juz 1 / Hizb 1</span>
          </div>

          {/* Action Buttons */}
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
            <button 
              onClick={playFullSurah}
              disabled={loading || ayahs.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[#2d2f33] hover:bg-[#3a3d42] rounded-lg text-sm text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 text-[#2ca4ab]" fill={isPlayingFullSurah ? '#2ca4ab' : 'none'} />
              {isPlayingFullSurah ? 'Playing...' : 'Listen'}
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#2d2f33] hover:bg-[#3a3d42] rounded-lg text-sm text-white transition-colors">
              Translation: Sahih
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Surah Title */}
          <div className="max-w-5xl mx-auto px-4 py-6">
            {surahInfo && (
              <div className="flex items-center justify-between">
                {/* Left: Arabic Name */}
                <div className="text-left">
                  <p className="font-arabic text-5xl text-white" dir="rtl">{surahInfo.name}</p>
                </div>

                {/* Right: English Info */}
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <h1 className="text-xl font-semibold text-white">{surahId}. {surahInfo.englishName}</h1>
                    <span className="px-2 py-0.5 bg-[#2ca4ab] text-white text-xs rounded">info</span>
                  </div>
                  <p className="text-gray-400 text-sm">{surahInfo.englishNameTranslation}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ayahs List */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-[#2ca4ab] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-0">
              {ayahs.map((ayah, index) => (
                <AyahView
                  key={ayah.number}
                  ayah={ayah}
                  surahNumber={surahId}
                  allTranslations={ayah.allTranslations}
                  isBookmarked={bookmarks.includes(`${surahId}:${ayah.numberInSurah}`)}
                  onToggleBookmark={() => toggleBookmark(`${surahId}:${ayah.numberInSurah}`)}
                  onPlay={() => playAyah(index)}
                  onExplain={() => getAIExplanation(ayah)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Sidebar Overlay for mobile */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* AI Explanation Modal */}
      {aiExplanation !== null && selectedAyahForAI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div 
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setAiExplanation(null);
              setSelectedAyahForAI(null);
            }}
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#1f2125] rounded-xl shadow-2xl overflow-hidden border border-[#2d2f33] flex flex-col">
            <div className="p-4 border-b border-[#2d2f33] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#2ca4ab]" />
                <h3 className="font-semibold text-white">AI Explanation</h3>
              </div>
              <button
                onClick={() => {
                  setAiExplanation(null);
                  setSelectedAyahForAI(null);
                }}
                className="p-1.5 rounded hover:bg-[#2d2f33] transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto">
              <p className="font-arabic text-xl sm:text-2xl text-right mb-3 sm:mb-4 text-white leading-relaxed" dir="rtl">
                {selectedAyahForAI.text}
              </p>
              <p className="text-gray-400 mb-4 text-sm sm:text-base leading-relaxed">
                {selectedAyahForAI.translation}
              </p>
              <div className="p-3 sm:p-4 bg-[#2d2f33] rounded-lg">
                {aiLoading && !aiExplanation ? (
                  <ThinkingLoader />
                ) : (
                  <div className="markdown-body">
                    <ReactMarkdown>{aiExplanation}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audio Player */}
      {currentAyah && (
        <AudioPlayer
          audioUrl={currentAyah.audio}
          surahName={surahInfo?.englishName}
          ayahNumber={currentAyah.numberInSurah}
          selectedReciter={selectedReciter}
          onReciterChange={handleReciterChange}
          onPrevious={handlePrevious}
          onNext={handleNext}
          isPlayingProp={isPlaying}
          onPlayingChange={handlePlayingChange}
        />
      )}
    </div>
  );
}
