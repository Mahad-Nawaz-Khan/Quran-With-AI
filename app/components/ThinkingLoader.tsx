'use client';

import { useState, useEffect } from 'react';

const THINKING_PHRASES = [
  '🔍 Searching the Quran...',
  '📖 Reading scholarly sources...',
  '🕌 Finding relevant context...',
  '✨ Crafting your answer...',
  '🌙 Gathering Islamic insights...',
];

export default function ThinkingLoader() {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % THINKING_PHRASES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Shimmer bars */}
      <div className="space-y-2.5">
        <div className="h-3 rounded-full bg-[#3a3d42] shimmer-bar w-[90%]" />
        <div className="h-3 rounded-full bg-[#3a3d42] shimmer-bar w-[75%]" style={{ animationDelay: '0.15s' }} />
        <div className="h-3 rounded-full bg-[#3a3d42] shimmer-bar w-[60%]" style={{ animationDelay: '0.3s' }} />
      </div>
      {/* Rotating phrase */}
      <p className="text-xs text-gray-500 transition-opacity duration-500 animate-fade-phrase">
        {THINKING_PHRASES[phraseIndex]}
      </p>
    </div>
  );
}
