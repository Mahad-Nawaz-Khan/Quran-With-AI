'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import { BookOpen, ChevronRight } from 'lucide-react';

interface Juz {
  number: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

// Juz data mapping
const JUZ_DATA: Juz[] = [
  { number: 1, startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141 },
  { number: 2, startSurah: 2, startAyah: 142, endSurah: 2, endAyah: 252 },
  { number: 3, startSurah: 2, startAyah: 253, endSurah: 3, endAyah: 92 },
  { number: 4, startSurah: 3, startAyah: 93, endSurah: 4, endAyah: 23 },
  { number: 5, startSurah: 4, startAyah: 24, endSurah: 4, endAyah: 147 },
  { number: 6, startSurah: 4, startAyah: 148, endSurah: 5, endAyah: 81 },
  { number: 7, startSurah: 5, startAyah: 82, endSurah: 6, endAyah: 110 },
  { number: 8, startSurah: 6, startAyah: 111, endSurah: 7, endAyah: 87 },
  { number: 9, startSurah: 7, startAyah: 88, endSurah: 8, endAyah: 40 },
  { number: 10, startSurah: 8, startAyah: 41, endSurah: 9, endAyah: 92 },
  { number: 11, startSurah: 9, startAyah: 93, endSurah: 11, endAyah: 5 },
  { number: 12, startSurah: 11, startAyah: 6, endSurah: 12, endAyah: 52 },
  { number: 13, startSurah: 12, startAyah: 53, endSurah: 14, endAyah: 52 },
  { number: 14, startSurah: 15, startAyah: 1, endSurah: 16, endAyah: 128 },
  { number: 15, startSurah: 17, startAyah: 1, endSurah: 18, endAyah: 74 },
  { number: 16, startSurah: 18, startAyah: 75, endSurah: 20, endAyah: 135 },
  { number: 17, startSurah: 21, startAyah: 1, endSurah: 22, endAyah: 78 },
  { number: 18, startSurah: 23, startAyah: 1, endSurah: 25, endAyah: 20 },
  { number: 19, startSurah: 25, startAyah: 21, endSurah: 27, endAyah: 55 },
  { number: 20, startSurah: 27, startAyah: 56, endSurah: 28, endAyah: 50 },
  { number: 21, startSurah: 29, startAyah: 1, endSurah: 33, endAyah: 30 },
  { number: 22, startSurah: 33, startAyah: 31, endSurah: 36, endAyah: 27 },
  { number: 23, startSurah: 36, startAyah: 28, endSurah: 39, endAyah: 31 },
  { number: 24, startSurah: 39, startAyah: 32, endSurah: 41, endAyah: 46 },
  { number: 25, startSurah: 41, startAyah: 47, endSurah: 45, endAyah: 37 },
  { number: 26, startSurah: 46, startAyah: 1, endSurah: 51, endAyah: 30 },
  { number: 27, startSurah: 51, startAyah: 31, endSurah: 57, endAyah: 29 },
  { number: 28, startSurah: 58, startAyah: 1, endSurah: 66, endAyah: 12 },
  { number: 29, startSurah: 67, startAyah: 1, endSurah: 77, endAyah: 50 },
  { number: 30, startSurah: 78, startAyah: 1, endSurah: 114, endAyah: 6 },
];

export default function JuzPage() {
  const [surahs, setSurahs] = useState<{[key: number]: string}>({});

  useEffect(() => {
    fetch('https://api.alquran.cloud/v1/surah')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          const map: {[key: number]: string} = {};
          data.data.forEach((s: any) => {
            map[s.number] = s.englishName;
          });
          setSurahs(map);
        }
      });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[var(--primary)]" />
            Juz Index
          </h1>
          <p className="text-[var(--text-muted)] mt-1">The Quran is divided into 30 equal parts (Juz) for easier recitation</p>
        </div>

        {/* Juz Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {JUZ_DATA.map(juz => (
            <Link
              key={juz.number}
              href={`/surah/${juz.startSurah}?ayah=${juz.startAyah}`}
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)] transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl font-bold text-[var(--primary)]">Juz {juz.number}</span>
                <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
              </div>
              <div className="text-sm text-[var(--text-muted)]">
                <p>{surahs[juz.startSurah] || `Surah ${juz.startSurah}`} {juz.startAyah !== 1 && `:${juz.startAyah}`}</p>
                <p className="text-xs mt-1">
                  to {surahs[juz.endSurah] || `Surah ${juz.endSurah}`}:{juz.endAyah}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
