'use client';

import { useState } from 'react';
import { Bookmark, Share2, Copy, Sparkles, Play, MoreHorizontal } from 'lucide-react';

interface Ayah {
  number: number;
  numberInSurah: number;
  text: string;
  translation?: string;
  audio?: string;
  surahName?: string;
  allTranslations?: { language: string; text: string }[];
}

interface AyahViewProps {
  ayah: Ayah;
  surahNumber?: number;
  allTranslations?: { language: string; text: string }[];
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onPlay?: () => void;
  onExplain?: () => void;
  showTranslation?: boolean;
  translationLanguage?: string;
}

export default function AyahView({
  ayah,
  surahNumber = 1,
  allTranslations,
  isBookmarked,
  onToggleBookmark,
  onPlay,
  onExplain,
  showTranslation = true,
}: AyahViewProps) {
  const [showMore, setShowMore] = useState(false);

  const copyToClipboard = () => {
    const text = `${ayah.text}\n\n${ayah.translation || ''}`;
    navigator.clipboard.writeText(text);
  };

  const shareAyah = async () => {
    const text = `${ayah.text}\n\n${ayah.translation || ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled
      }
    } else {
      copyToClipboard();
    }
  };

  // Prepare translations array
  const translations = allTranslations && allTranslations.length > 0 
    ? allTranslations 
    : ayah.translation 
      ? [{ language: 'Saheeh International', text: ayah.translation }] 
      : [];

  return (
    <div className="group py-6 px-4 border-b border-[#2d2f33] hover:bg-[#25282c] transition-colors">
      {/* Top Actions Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-400">
            {surahNumber}:{ayah.numberInSurah}
          </span>
          <button
            onClick={onPlay}
            className="p-1.5 rounded-lg hover:bg-[#2d2f33] text-gray-400 hover:text-[#2ca4ab] transition-colors"
            title="Play"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleBookmark}
            className={`p-1.5 rounded-lg hover:bg-[#2d2f33] transition-colors ${
              isBookmarked ? 'text-[#2ca4ab]' : 'text-gray-400'
            }`}
            title="Bookmark"
          >
            <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyToClipboard}
            className="p-1.5 rounded-lg hover:bg-[#2d2f33] text-gray-400 transition-colors"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={shareAyah}
            className="p-1.5 rounded-lg hover:bg-[#2d2f33] text-gray-400 transition-colors"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowMore(!showMore)}
            className="p-1.5 rounded-lg hover:bg-[#2d2f33] text-gray-400 transition-colors"
            title="More"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content - Translations on LEFT, Arabic on RIGHT */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* LEFT: Translations */}
        <div className="flex-1 order-2 lg:order-1">
          {showTranslation && translations.length > 0 && (
            <div className="space-y-4">
              {translations.map((trans, idx) => (
                <div key={idx}>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {trans.text}
                    <sup className="text-[#2ca4ab] ml-0.5 text-xs">{idx + 1}</sup>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">— {trans.language}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Arabic Text */}
        <div className="flex-1 order-1 lg:order-2 text-right">
          <p
            className="font-arabic text-2xl lg:text-3xl leading-loose text-white"
            dir="rtl"
          >
            {ayah.text}
            <span className="inline-block mr-3 text-[#2ca4ab] text-xl lg:text-2xl">
              ﴿{ayah.numberInSurah}﴾
            </span>
          </p>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#2d2f33]">
        <button
          onClick={onExplain}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#2ca4ab] transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Explain with AI</span>
        </button>
      </div>
    </div>
  );
}
