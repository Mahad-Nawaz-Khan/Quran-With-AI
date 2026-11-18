'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import {
  TRANSLATION_EDITIONS,
  MAX_PARALLEL_TRANSLATIONS,
  LEGACY_TRANSLATION_ALIASES,
} from '@/lib/quran/constants';

interface TranslationSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function TranslationSelector({ selectedIds, onChange }: TranslationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const normalizedSelectedIds = selectedIds.map(
    (id) => LEGACY_TRANSLATION_ALIASES[id] ?? id
  );

  const handleToggle = (id: string) => {
    if (normalizedSelectedIds.includes(id)) {
      if (normalizedSelectedIds.length > 1) {
        onChange(normalizedSelectedIds.filter((t) => t !== id));
      }
      return;
    }
    if (normalizedSelectedIds.length < MAX_PARALLEL_TRANSLATIONS) {
      onChange([...normalizedSelectedIds, id]);
    }
  };

  const selectedTranslations = TRANSLATION_EDITIONS.filter((t) =>
    normalizedSelectedIds.includes(t.id)
  );

  const displayLabel =
    selectedTranslations.length > 0
      ? selectedTranslations.map((t) => t.name).join(', ')
      : 'Select translations';

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Select translations"
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-xs sm:text-sm hover:border-[var(--primary)] transition-colors"
      >
        <Globe className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        <span className="truncate max-w-[140px] sm:max-w-[200px] text-left">
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-72 max-w-[90vw] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-xl z-30 p-2 text-[var(--foreground)]">
          <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Translations
            </span>
            <span className="text-xs text-[var(--primary)] font-medium">
              {normalizedSelectedIds.length}/{MAX_PARALLEL_TRANSLATIONS} selected
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)] py-1">
            {TRANSLATION_EDITIONS.map((edition) => {
              const isSelected = normalizedSelectedIds.includes(edition.id);
              const isDisabled =
                !isSelected && normalizedSelectedIds.length >= MAX_PARALLEL_TRANSLATIONS;

              return (
                <label
                  key={edition.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--card-hover)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => handleToggle(edition.id)}
                    className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[var(--foreground)]">{edition.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {edition.language} • {edition.id}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
