'use client';

import { useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  useTheme,
  useLanguage,
  useSelectedReciter,
  usePlaybackSpeed,
  useSelectedTranslations,
} from '@/lib/hooks/usePersistentState';
import {
  SUPPORTED_LANGUAGES,
  QURAN_RECITERS,
  PLAYBACK_SPEEDS,
  TRANSLATION_EDITIONS,
} from '@/lib/quran/constants';
import { getTranslationDictionary } from '@/lib/i18n/translations';
import type { AppLanguageCode, PlaybackSpeed } from '@/lib/quran/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function parseAppLanguageCode(raw: string): AppLanguageCode | null {
  const match = SUPPORTED_LANGUAGES.find((item) => item.code === raw);
  return match ? match.code : null;
}

function parsePlaybackSpeed(raw: number): PlaybackSpeed | null {
  const match = PLAYBACK_SPEEDS.find((item) => item === raw);
  return match ?? null;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { reciter, setReciter } = useSelectedReciter();
  const { speed, setSpeed } = usePlaybackSpeed();
  const { translations, setTranslations } = useSelectedTranslations();

  const t = useMemo(() => getTranslationDictionary(language), [language]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        onClose();
      }
    };
    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-50 p-0 m-auto bg-transparent backdrop:bg-black/60 max-w-md w-full"
    >
      {isOpen && (
        <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden m-4">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-elevated)]">
            <h2 className="font-semibold text-lg text-[var(--foreground)]">{t.settingsTitle}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="p-1 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <fieldset className="min-w-0 border-0 p-0 m-0">
              <legend className="text-sm font-medium text-[var(--text-muted)] mb-2 block">
                {t.settingsTheme}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                  className={`py-2 rounded-lg font-medium text-sm transition-colors border ${
                    theme === 'dark'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t.settingsThemeDark}
                </button>
                <button
                  type="button"
                  aria-pressed={theme === 'light'}
                  onClick={() => setTheme('light')}
                  className={`py-2 rounded-lg font-medium text-sm transition-colors border ${
                    theme === 'light'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t.settingsThemeLight}
                </button>
              </div>
            </fieldset>

            <div>
              <label htmlFor="settings-language" className="text-sm font-medium text-[var(--text-muted)] mb-2 block">
                {t.settingsLanguage}
              </label>
              <select
                id="settings-language"
                aria-label={t.settingsLanguage === 'Language' ? 'Language' : `${t.settingsLanguage} (Language)`}
                value={language}
                onChange={(e) => {
                  const parsed = parseAppLanguageCode(e.target.value);
                  if (parsed) setLanguage(parsed);
                }}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.nativeName}) [{l.code}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settings-translation" className="text-sm font-medium text-[var(--text-muted)] mb-2 block">
                Default Translation
              </label>
              <select
                id="settings-translation"
                value={translations[0] ?? 'en.sahih'}
                onChange={(e) => setTranslations([e.target.value])}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]"
              >
                {TRANSLATION_EDITIONS.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.name} ({ed.language})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settings-reciter" className="text-sm font-medium text-[var(--text-muted)] mb-2 block">
                Default Reciter
              </label>
              <select
                id="settings-reciter"
                value={reciter}
                onChange={(e) => setReciter(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]"
              >
                {QURAN_RECITERS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.style})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="settings-speed" className="text-sm font-medium text-[var(--text-muted)] mb-2 block">
                Audio Playback Speed
              </label>
              <select
                id="settings-speed"
                value={speed}
                onChange={(e) => {
                  const parsed = parsePlaybackSpeed(Number(e.target.value));
                  if (parsed !== null) setSpeed(parsed);
                }}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]"
              >
                {PLAYBACK_SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
