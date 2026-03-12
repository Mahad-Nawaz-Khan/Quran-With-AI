'use client';

import Link from 'next/link';
import { Play, Bookmark } from 'lucide-react';

interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface SurahCardProps {
  surah: Surah;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

export default function SurahCard({ surah, isBookmarked, onToggleBookmark }: SurahCardProps) {
  return (
    <Link
      href={`/surah/${surah.number}`}
      className="surah-card block bg-[#2d2f33] border border-[#3a3d42] rounded-xl p-4 hover:border-[#2ca4ab] transition-colors group"
    >
      <div className="flex items-center gap-4">
        {/* Diamond Surah Number */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 bg-[#3a3d42] rotate-45 rounded-lg flex items-center justify-center group-hover:bg-[#2ca4ab] transition-colors">
            <span className="text-white text-sm font-semibold -rotate-45">
              {surah.number}
            </span>
          </div>
        </div>

        {/* Left side - English Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm sm:text-base truncate">
            {surah.englishName}
          </h3>
          <p className="text-xs text-gray-500 truncate">
            {surah.englishNameTranslation}
          </p>
        </div>

        {/* Right side - Arabic Info */}
        <div className="text-right flex-shrink-0">
          <p className="font-arabic text-[#2ca4ab] text-base sm:text-lg leading-tight">
            {surah.name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {surah.numberOfAyahs} Ayahs
          </p>
        </div>

        {/* Actions - Hidden by default, show on hover */}
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.preventDefault();
              onToggleBookmark?.();
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-[#2ca4ab]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>
          <div
            className="p-1.5 rounded-lg text-[#2ca4ab]"
            onClick={(e) => e.preventDefault()}
          >
            <Play className="w-4 h-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}
