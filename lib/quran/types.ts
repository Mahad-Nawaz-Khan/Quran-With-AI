export type RevelationType = 'Meccan' | 'Medinan';
export type TextDirection = 'ltr' | 'rtl';
export type AppLanguageCode = 'en' | 'ar' | 'ur' | 'id' | 'tr';
export type SupportedLanguage = AppLanguageCode;
export type ThemeMode = 'dark' | 'light';
export type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5;

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface SurahMeta {
  readonly number: number;
  readonly arabicName: string;
  readonly englishName: string;
  readonly englishNameTranslation: string;
  readonly revelationType: RevelationType;
  readonly revelationOrder: number;
  readonly ayahCount: number;
  readonly startJuz: number;
  readonly startPage: number;
}

export interface JuzMeta {
  readonly number: number;
  readonly name: string;
  readonly arabicName: string;
  readonly startSurah: number;
  readonly startAyah: number;
  readonly endSurah: number;
  readonly endAyah: number;
}

export interface TranslationEdition {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly languageCode: string;
  readonly direction: TextDirection;
  readonly author?: string;
}

export interface ReciterOption {
  readonly id: string;
  readonly name: string;
  readonly style?: string;
}

export interface TafsirEdition {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly language: string;
  readonly languageCode: string;
  readonly direction: TextDirection;
}

// ── Al-Quran Cloud Raw Response Shapes ──────────────────────────────────────
export interface AlQuranSurahSummary {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: RevelationType | string;
}

export interface AlQuranEditionMeta {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: 'text' | 'audio';
  type: string;
  direction: TextDirection | null;
}

export interface AlQuranAyah {
  number: number;
  numberInSurah: number;
  text: string;
  audio?: string;
  audioSecondary?: string[];
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean | { id: number; recommended: boolean; obligatory: boolean };
  surah?: AlQuranSurahSummary;
}

export interface AlQuranSurahEditionPayload extends AlQuranSurahSummary {
  ayahs: AlQuranAyah[];
  edition: AlQuranEditionMeta;
}

export interface AlQuranApiEnvelope<T> {
  code: number;
  status: string;
  data: T;
}

// ── Normalized App View Models ──────────────────────────────────────────────
export interface AyahTranslation {
  editionId: string;
  language: string;
  languageCode: string;
  direction: TextDirection;
  name: string;
  text: string;
}

export interface Ayah {
  number: number;
  numberInSurah: number;
  surahNumber: number;
  text: string;
  rawText?: string;
  tajweedText?: string;
  transliteration?: string;
  translation?: string;
  audio?: string;
  juz: number;
  page: number;
  hizbQuarter: number;
  manzil: number;
  ruku: number;
  isSajda: boolean;
  surahName?: string;
  allTranslations?: AyahTranslation[];
}

export interface SurahEdition {
  surah: SurahMeta;
  ayahs: Ayah[];
  editionIds: string[];
  reciterId: string;
}

export interface JuzSliceResponse {
  juz: JuzMeta;
  editionId: string;
  ayahs: Ayah[];
}

export interface PageSliceResponse {
  page: number;
  editionId: string;
  ayahs: Ayah[];
}

// ── Search & Command Palette ────────────────────────────────────────────────
export interface SurahSearchMatch {
  type: 'surah';
  surahNumber: number;
  englishName: string;
  arabicName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: RevelationType;
}

export interface AyahSearchMatch {
  type: 'ayah';
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  arabicName: string;
  text: string;
  translation: string;
  editionId?: string;
}

export type SearchResultItem = SurahSearchMatch | AyahSearchMatch;

export type CommandIntent =
  | { kind: 'empty' }
  | { kind: 'reference'; surahNumber: number; ayahNumber: number; href: string }
  | { kind: 'surah'; surahNumber: number; href: string; isExplicitCommand: boolean }
  | { kind: 'juz'; juzNumber: number; startSurah: number; startAyah: number; href: string }
  | { kind: 'page'; pageNumber: number; startSurah: number; startAyah: number; href: string }
  | { kind: 'invalid_reference'; raw: string; reason: string }
  | { kind: 'keyword'; query: string };

export interface SearchResult {
  query: string;
  intent: CommandIntent;
  surahMatches: SurahSearchMatch[];
  ayahMatches: AyahSearchMatch[];
  totalAyahMatches: number;
}

// ── Tafsir, Word-by-Word & AI Grounding ─────────────────────────────────────
export interface TafsirResponse {
  surah: number;
  ayah: number;
  slug: string;
  tafsirName: string;
  sourceUrl: string;
  text: string;
}

export interface WordByWordToken {
  position: number;
  arabic: string;
  transliteration: string;
  translation: string;
  root: string | null;
  charType?: string;
  audioUrl?: string | null;
}

export interface WordByWordResponse {
  surah: number;
  ayah: number;
  words: WordByWordToken[];
}

export interface GroundingSource {
  type: 'quran' | 'tafsir' | 'web';
  label: string;
  reference: string;
  url?: string;
}

export type ExplainSourceRecord = GroundingSource;

export interface CanonicalVerseRef {
  surah: number;
  ayah: number;
  arabic: string;
  translation: string;
  edition: string;
}

export interface GroundingMetadata {
  verified: boolean;
  refusal: boolean;
  sources: GroundingSource[];
  canonicalVerse: CanonicalVerseRef | null;
}

// ── Persistent User Study State ─────────────────────────────────────────────
export interface BookmarkEntry {
  key: string;
  surahNumber: number;
  ayahNumber: number;
  savedAt: number;
  collection?: string;
}

export interface StudyNote {
  note: string;
  tags: string[];
  updatedAt: number;
}

export interface LastReadPosition {
  surah: number;
  ayah: number;
  updatedAt: number;
}

export interface ReadingProgress {
  lastRead: LastReadPosition | null;
  completedAyahs: string[];
  dailyGoal: number;
}

// ── Thematic Topics ─────────────────────────────────────────────────────────
export interface TopicVerseRef {
  surah: number;
  ayah: number;
  key: string;
  label: string;
}

export interface TopicDefinition {
  id: string;
  slug: string;
  title: string;
  arabicTitle: string;
  description: string;
  iconName: string;
  verses: readonly TopicVerseRef[];
}
