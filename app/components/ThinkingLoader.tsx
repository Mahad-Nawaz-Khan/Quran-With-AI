'use client';

import { useState, useEffect } from 'react';

const FALLBACK_PHRASES: readonly string[] = [
  '🔍 Searching the Quran...',
  '📖 Consulting canonical verses...',
  '🕌 Grounding in verified Islamic sources...',
  '✨ Synthesizing explanation...',
];

interface ThinkingLoaderProps {
  status?: string;
}

export default function ThinkingLoader({ status }: ThinkingLoaderProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (status !== undefined) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % FALLBACK_PHRASES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  const activeStatus = status ?? FALLBACK_PHRASES[phraseIndex];

  return (
    <div className="block py-2" aria-live="polite">
      {/* Shimmer indicator bars */}
      <div className="space-y-2 mb-2">
        <div className="h-2.5 rounded-full bg-[var(--border)] animate-pulse w-[85%]" />
        <div className="h-2.5 rounded-full bg-[var(--border)] animate-pulse w-[70%]" />
      </div>
      {/* Real-time status */}
      <p className="text-xs text-[var(--primary)] font-medium flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-ping inline-block shrink-0" />
        <span>{activeStatus}</span>
      </p>
    </div>
  );
}
