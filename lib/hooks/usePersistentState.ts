'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { LANGUAGE_DIRECTION } from '@/lib/i18n/translations';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_RECITER,
  DEFAULT_TRANSLATIONS,
  normalizeTranslationIds,
} from '@/lib/quran/constants';
import { isValidSurah, parseAyahKey } from '@/lib/quran/surahMetadata';
import type {
  AppLanguageCode,
  BookmarkEntry,
  PlaybackSpeed,
  ReadingProgress,
  StudyNote,
  ThemeMode,
} from '@/lib/quran/types';

export interface PersistentStoreConfig<T> {
  key: string;
  defaultValue: T;
  encoding?: 'json' | 'string';
  parse: (raw: string) => T;
  serialize?: (value: T) => string;
}

const listenersByKey = new Map<string, Set<() => void>>();

function notifyKeyListeners(key: string): void {
  const listeners = listenersByKey.get(key);
  if (!listeners) return;
  for (const listener of listeners) {
    listener();
  }
}

function subscribeToKey(key: string, onStoreChange: () => void): () => void {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      onStoreChange();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners?.delete(onStoreChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function readRawStorage(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRawStorage(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or private-mode failures cleanly.
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripOuterJsonQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export interface PersistentStore<T> {
  readonly key: string;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
  setValue: (next: T | ((prev: T) => T)) => void;
  resetCache: () => void;
}

function isUpdater<T>(value: T | ((prev: T) => T)): value is (prev: T) => T {
  return typeof value === 'function';
}

function computeNextCache<T>(
  config: PersistentStoreConfig<T>,
  encoding: 'json' | 'string',
  resolved: T
): { raw: string; value: T } {
  if (config.serialize) {
    const raw = config.serialize(resolved);
    try {
      return { raw, value: config.parse(raw) };
    } catch {
      return { raw, value: resolved };
    }
  }
  const raw = encoding === 'string' ? String(resolved) : JSON.stringify(resolved);
  return { raw, value: resolved };
}

export function createPersistentStore<T>(
  config: PersistentStoreConfig<T>
): PersistentStore<T> {
  let cached: { raw: string | null; value: T } | null = null;
  const encoding = config.encoding ?? 'json';

  const getSnapshot = (): T => {
    const raw = readRawStorage(config.key);
    if (cached && cached.raw === raw) {
      return cached.value;
    }
    if (raw === null) {
      cached = { raw: null, value: config.defaultValue };
      return cached.value;
    }
    try {
      const nextValue = config.parse(raw);
      cached = { raw, value: nextValue };
      return nextValue;
    } catch {
      cached = { raw, value: config.defaultValue };
      return config.defaultValue;
    }
  };

  const getServerSnapshot = (): T => config.defaultValue;

  const subscribe = (callback: () => void): (() => void) =>
    subscribeToKey(config.key, callback);

  const setValue = (next: T | ((prev: T) => T)): void => {
    const current = getSnapshot();
    const resolved = isUpdater(next) ? next(current) : next;
    const nextCache = computeNextCache(config, encoding, resolved);
    cached = nextCache;
    writeRawStorage(config.key, nextCache.raw);
    notifyKeyListeners(config.key);
  };

  const resetCache = (): void => {
    cached = null;
  };

  return {
    key: config.key,
    getSnapshot,
    getServerSnapshot,
    subscribe,
    setValue,
    resetCache,
  };
}

export function usePersistentStore<T>(
  store: PersistentStore<T>
): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      store.setValue(next);
    },
    [store]
  );
  return [value, setValue];
}

// ── Parsers (exported for unit tests) ───────────────────────────────────────

export function parseSurahBookmarks(raw: string): number[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const item of parsed) {
    if (typeof item === 'number' && isValidSurah(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function normalizeBookmarkItem(item: unknown): BookmarkEntry | null {
  if (typeof item === 'string') {
    const parsedKey = parseAyahKey(item);
    if (!parsedKey) return null;
    return {
      key: `${parsedKey.surah}:${parsedKey.ayah}`,
      surahNumber: parsedKey.surah,
      ayahNumber: parsedKey.ayah,
      savedAt: 0,
    };
  }
  if (!isObjectRecord(item) || typeof item.key !== 'string') {
    return null;
  }
  const parsedKey = parseAyahKey(item.key);
  if (!parsedKey) return null;
  const savedAt =
    typeof item.savedAt === 'number' && Number.isFinite(item.savedAt)
      ? item.savedAt
      : 0;
  const collection =
    typeof item.collection === 'string' && item.collection.trim().length > 0
      ? item.collection.trim()
      : undefined;
  return {
    key: `${parsedKey.surah}:${parsedKey.ayah}`,
    surahNumber: parsedKey.surah,
    ayahNumber: parsedKey.ayah,
    savedAt,
    ...(collection ? { collection } : {}),
  };
}

export function parseAyahBookmarks(raw: string): BookmarkEntry[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const result: BookmarkEntry[] = [];
  for (const item of parsed) {
    const normalized = normalizeBookmarkItem(item);
    if (!normalized || seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    result.push(normalized);
  }
  return result;
}

export function parseStudyNotes(raw: string): Record<string, StudyNote> {
  const parsed: unknown = JSON.parse(raw);
  if (!isObjectRecord(parsed)) return {};
  const result: Record<string, StudyNote> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const parsedKey = parseAyahKey(key);
    if (!parsedKey || !isObjectRecord(value) || typeof value.note !== 'string') {
      continue;
    }
    const tags = Array.isArray(value.tags)
      ? value.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [];
    const updatedAt =
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0;
    result[`${parsedKey.surah}:${parsedKey.ayah}`] = {
      note: value.note,
      tags,
      updatedAt,
    };
  }
  return result;
}

const DEFAULT_READING_PROGRESS: ReadingProgress = {
  lastRead: null,
  completedAyahs: [],
  dailyGoal: 20,
};

function parseLastReadPosition(rawLastRead: unknown): ReadingProgress['lastRead'] {
  if (!isObjectRecord(rawLastRead)) return null;
  const { surah, ayah, updatedAt } = rawLastRead;
  if (typeof surah !== 'number' || typeof ayah !== 'number') return null;
  if (!parseAyahKey(`${surah}:${ayah}`)) return null;
  return {
    surah,
    ayah,
    updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function parseCompletedAyahKeys(rawCompleted: unknown): string[] {
  if (!Array.isArray(rawCompleted)) return [];
  const completedSet = new Set<string>();
  for (const item of rawCompleted) {
    if (typeof item !== 'string') continue;
    const valid = parseAyahKey(item);
    if (valid) {
      completedSet.add(`${valid.surah}:${valid.ayah}`);
    }
  }
  return Array.from(completedSet);
}

function parseDailyGoal(rawGoal: unknown): number {
  if (typeof rawGoal !== 'number' || !Number.isInteger(rawGoal)) return 20;
  return rawGoal >= 1 && rawGoal <= 6236 ? rawGoal : 20;
}

export function parseReadingProgress(raw: string): ReadingProgress {
  const parsed: unknown = JSON.parse(raw);
  if (!isObjectRecord(parsed)) return DEFAULT_READING_PROGRESS;

  return {
    lastRead: parseLastReadPosition(parsed.lastRead),
    completedAyahs: parseCompletedAyahKeys(parsed.completedAyahs),
    dailyGoal: parseDailyGoal(parsed.dailyGoal),
  };
}

export function parseTranslations(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [...DEFAULT_TRANSLATIONS];
  const ids = parsed.filter((item): item is string => typeof item === 'string');
  return normalizeTranslationIds(ids);
}

export function parseReciter(raw: string): string {
  const cleaned = stripOuterJsonQuotes(raw);
  return cleaned.length > 0 ? cleaned : DEFAULT_RECITER;
}

const VALID_LANGUAGES = new Set<string>(['en', 'ar', 'ur', 'id', 'tr']);

export function parseLanguage(raw: string): AppLanguageCode {
  const cleaned = stripOuterJsonQuotes(raw);
  if (cleaned === 'ar' || cleaned === 'ur' || cleaned === 'id' || cleaned === 'tr') {
    return cleaned;
  }
  return VALID_LANGUAGES.has(cleaned) ? 'en' : DEFAULT_LANGUAGE;
}

export function parseTheme(raw: string): ThemeMode {
  const cleaned = stripOuterJsonQuotes(raw);
  return cleaned === 'light' ? 'light' : 'dark';
}

export function parsePlaybackSpeed(raw: string): PlaybackSpeed {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === 0.75 || parsed === 1 || parsed === 1.25 || parsed === 1.5) {
    return parsed;
  }
  return 1;
}

export function parseHifzMode(raw: string): boolean {
  const parsed: unknown = JSON.parse(raw);
  return parsed === true;
}

// ── Domain Stores ───────────────────────────────────────────────────────────

const EMPTY_SURAH_BOOKMARKS: number[] = [];
const EMPTY_AYAH_BOOKMARKS: BookmarkEntry[] = [];
const EMPTY_STUDY_NOTES: Record<string, StudyNote> = {};
const DEFAULT_TRANSLATIONS_MUTABLE: string[] = [...DEFAULT_TRANSLATIONS];

export const surahBookmarksStore = createPersistentStore<number[]>({
  key: 'quran-bookmarks',
  defaultValue: EMPTY_SURAH_BOOKMARKS,
  parse: parseSurahBookmarks,
});

export const ayahBookmarksStore = createPersistentStore<BookmarkEntry[]>({
  key: 'quran-ayah-bookmarks',
  defaultValue: EMPTY_AYAH_BOOKMARKS,
  parse: parseAyahBookmarks,
});

export const studyNotesStore = createPersistentStore<Record<string, StudyNote>>({
  key: 'quran-study-notes',
  defaultValue: EMPTY_STUDY_NOTES,
  parse: parseStudyNotes,
});

export const readingProgressStore = createPersistentStore<ReadingProgress>({
  key: 'quran-reading-progress',
  defaultValue: DEFAULT_READING_PROGRESS,
  parse: parseReadingProgress,
});

export const selectedTranslationsStore = createPersistentStore<string[]>({
  key: 'quran-translations',
  defaultValue: DEFAULT_TRANSLATIONS_MUTABLE,
  parse: parseTranslations,
  serialize: (ids) => JSON.stringify(normalizeTranslationIds(ids)),
});
export const translationsStore = selectedTranslationsStore;

export const selectedReciterStore = createPersistentStore<string>({
  key: 'quran-reciter',
  defaultValue: DEFAULT_RECITER,
  encoding: 'string',
  parse: parseReciter,
});
export const reciterStore = selectedReciterStore;

export const languageStore = createPersistentStore<AppLanguageCode>({
  key: 'quran-language',
  defaultValue: DEFAULT_LANGUAGE,
  encoding: 'string',
  parse: parseLanguage,
});
export const selectedLanguageStore = languageStore;

export const themeStore = createPersistentStore<ThemeMode>({
  key: 'theme',
  defaultValue: 'dark',
  encoding: 'string',
  parse: parseTheme,
});

export const playbackSpeedStore = createPersistentStore<PlaybackSpeed>({
  key: 'quran-playback-speed',
  defaultValue: 1,
  parse: parsePlaybackSpeed,
});

export const hifzModeStore = createPersistentStore<boolean>({
  key: 'quran-hifz-mode',
  defaultValue: false,
  parse: parseHifzMode,
});

// ── Domain Hooks ────────────────────────────────────────────────────────────

export function useSurahBookmarks() {
  const [bookmarks, setBookmarks] = usePersistentStore(surahBookmarksStore);

  const isBookmarked = useCallback(
    (surahNumber: number) => bookmarks.includes(surahNumber),
    [bookmarks]
  );

  const toggleBookmark = useCallback(
    (surahNumber: number) => {
      if (!isValidSurah(surahNumber)) return;
      setBookmarks((prev) =>
        prev.includes(surahNumber)
          ? prev.filter((id) => id !== surahNumber)
          : [...prev, surahNumber]
      );
    },
    [setBookmarks]
  );

  return { bookmarks, setBookmarks, isBookmarked, toggleBookmark };
}

function normalizeAyahBookmarkKey(key: string): string {
  const parsed = parseAyahKey(key);
  return parsed ? `${parsed.surah}:${parsed.ayah}` : key.trim();
}

function toggleAyahBookmarkEntry(
  prev: readonly BookmarkEntry[],
  parsed: { surah: number; ayah: number },
  collection?: string
): BookmarkEntry[] {
  const canonicalKey = `${parsed.surah}:${parsed.ayah}`;
  if (prev.some((entry) => entry.key === canonicalKey)) {
    return prev.filter((entry) => entry.key !== canonicalKey);
  }
  const trimmedCollection = collection?.trim();
  const nextEntry: BookmarkEntry = {
    key: canonicalKey,
    surahNumber: parsed.surah,
    ayahNumber: parsed.ayah,
    savedAt: Date.now(),
    ...(trimmedCollection ? { collection: trimmedCollection } : {}),
  };
  return [...prev, nextEntry];
}

function updateAyahBookmarkCollection(
  prev: readonly BookmarkEntry[],
  canonicalKey: string,
  collection: string | undefined
): BookmarkEntry[] {
  const trimmed = collection?.trim();
  return prev.map((entry) => {
    if (entry.key !== canonicalKey) return entry;
    if (!trimmed) {
      return {
        key: entry.key,
        surahNumber: entry.surahNumber,
        ayahNumber: entry.ayahNumber,
        savedAt: entry.savedAt,
      };
    }
    return { ...entry, collection: trimmed };
  });
}

export function useAyahBookmarks() {
  const [bookmarks, setBookmarks] = usePersistentStore(ayahBookmarksStore);

  const isBookmarked = useCallback(
    (key: string) => {
      const canonicalKey = normalizeAyahBookmarkKey(key);
      return bookmarks.some((entry) => entry.key === canonicalKey);
    },
    [bookmarks]
  );

  const toggleBookmark = useCallback(
    (key: string, collection?: string) => {
      const parsed = parseAyahKey(key);
      if (!parsed) return;
      setBookmarks((prev) => toggleAyahBookmarkEntry(prev, parsed, collection));
    },
    [setBookmarks]
  );

  const setCollection = useCallback(
    (key: string, collection: string | undefined) => {
      const canonicalKey = normalizeAyahBookmarkKey(key);
      setBookmarks((prev) =>
        updateAyahBookmarkCollection(prev, canonicalKey, collection)
      );
    },
    [setBookmarks]
  );

  const removeBookmark = useCallback(
    (key: string) => {
      const canonicalKey = normalizeAyahBookmarkKey(key);
      setBookmarks((prev) => prev.filter((entry) => entry.key !== canonicalKey));
    },
    [setBookmarks]
  );

  return { bookmarks, isBookmarked, toggleBookmark, setCollection, removeBookmark };
}

export function useStudyNotes() {
  const [notes, setNotes] = usePersistentStore(studyNotesStore);

  const saveNote = useCallback(
    (key: string, note: string, tags: string[] = []) => {
      const parsed = parseAyahKey(key);
      if (!parsed) return;
      const canonicalKey = `${parsed.surah}:${parsed.ayah}`;
      const cleanTags = Array.from(
        new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))
      );
      setNotes((prev) => ({
        ...prev,
        [canonicalKey]: {
          note: note.trim(),
          tags: cleanTags,
          updatedAt: Date.now(),
        },
      }));
    },
    [setNotes]
  );

  const deleteNote = useCallback(
    (key: string) => {
      setNotes((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setNotes]
  );

  return { notes, saveNote, deleteNote };
}

export function useReadingProgress() {
  const [progress, setProgress] = usePersistentStore(readingProgressStore);

  const updateLastRead = useCallback(
    (surah: number, ayah: number) => {
      if (!parseAyahKey(`${surah}:${ayah}`)) return;
      setProgress((prev) => ({
        ...prev,
        lastRead: { surah, ayah, updatedAt: Date.now() },
      }));
    },
    [setProgress]
  );

  const toggleCompletedAyah = useCallback(
    (key: string) => {
      const parsed = parseAyahKey(key);
      if (!parsed) return;
      const canonical = `${parsed.surah}:${parsed.ayah}`;
      setProgress((prev) => {
        const exists = prev.completedAyahs.includes(canonical);
        const completedAyahs = exists
          ? prev.completedAyahs.filter((item) => item !== canonical)
          : [...prev.completedAyahs, canonical];
        return { ...prev, completedAyahs };
      });
    },
    [setProgress]
  );

  const setDailyGoal = useCallback(
    (dailyGoal: number) => {
      const finiteGoal = Number.isFinite(dailyGoal) ? Math.trunc(dailyGoal) : 20;
      const clamped = Math.min(Math.max(finiteGoal, 1), 6236);
      setProgress((prev) => ({ ...prev, dailyGoal: clamped }));
    },
    [setProgress]
  );

  return { progress, updateLastRead, toggleCompletedAyah, setDailyGoal };
}

export function useSelectedTranslations() {
  const [translations, setTranslationsState] = usePersistentStore(
    selectedTranslationsStore
  );

  const setTranslations = useCallback(
    (ids: string[]) => {
      setTranslationsState(normalizeTranslationIds(ids));
    },
    [setTranslationsState]
  );

  return { translations, setTranslations };
}

export function useSelectedReciter() {
  const [reciter, setReciter] = usePersistentStore(selectedReciterStore);
  return { reciter, setReciter };
}

export function useLanguage() {
  const [language, setLanguageState] = usePersistentStore(languageStore);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = LANGUAGE_DIRECTION[language];
    }
  }, [language]);

  const setLanguage = useCallback(
    (next: AppLanguageCode) => {
      setLanguageState(next);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = next;
        document.documentElement.dir = LANGUAGE_DIRECTION[next];
      }
    },
    [setLanguageState]
  );

  return { language, setLanguage };
}

export function useTheme() {
  const [theme, setThemeState] = usePersistentStore(themeStore);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', mode === 'dark');
        document.documentElement.style.colorScheme = mode;
      }
    },
    [setThemeState]
  );

  const toggleTheme = useCallback(() => {
    const currentTheme = themeStore.getSnapshot();
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}

export function usePlaybackSpeed() {
  const [speed, setSpeed] = usePersistentStore(playbackSpeedStore);
  return { speed, setSpeed };
}

export function useHifzMode() {
  const [hifzMode, setHifzMode] = usePersistentStore(hifzModeStore);
  return { hifzMode, setHifzMode };
}

export const usePersistentState = usePersistentStore;
