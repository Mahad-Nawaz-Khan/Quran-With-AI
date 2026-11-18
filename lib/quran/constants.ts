import type {
  AppLanguageCode,
  JuzMeta,
  PlaybackSpeed,
  ReciterOption,
  TafsirEdition,
  TextDirection,
  TranslationEdition,
} from './types';

export const ALQURAN_API_BASE = 'https://api.alquran.cloud/v1';
export const QURAN_AUDIO_BITRATE = 128;
export const MAX_PARALLEL_TRANSLATIONS = 3;

export const DEFAULT_TRANSLATIONS: readonly string[] = ['en.sahih'];
export const DEFAULT_RECITER = 'ar.alafasy';
export const DEFAULT_TAFSIR_SLUG = 'en-tafisr-ibn-kathir';
export const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

export const POPULAR_SURAH_NUMBERS: readonly number[] = [
  1, 2, 18, 36, 55, 56, 67, 112, 113, 114,
];

export interface AppLanguageConfig {
  readonly code: AppLanguageCode;
  readonly name: string;
  readonly nativeName: string;
  readonly direction: TextDirection;
  readonly defaultTranslation: string;
}

export const APP_LANGUAGES: readonly AppLanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', defaultTranslation: 'en.sahih' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', defaultTranslation: 'en.sahih' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl', defaultTranslation: 'ur.jalandhry' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr', defaultTranslation: 'id.indonesian' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', defaultTranslation: 'tr.diyanet' },
] as const;

export const SUPPORTED_LANGUAGES = APP_LANGUAGES;
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [0.75, 1, 1.25, 1.5];

export const LEGACY_TRANSLATION_ALIASES: Record<string, string> = {
  'ur.khan': 'ur.kanzuliman',
};

export const TRANSLATION_EDITIONS: readonly TranslationEdition[] = [
  { id: 'en.sahih', name: 'Saheeh International', language: 'English', languageCode: 'en', direction: 'ltr', author: 'Saheeh International' },
  { id: 'en.asad', name: 'Muhammad Asad', language: 'English', languageCode: 'en', direction: 'ltr', author: 'Muhammad Asad' },
  { id: 'en.pickthall', name: 'Marmaduke Pickthall', language: 'English', languageCode: 'en', direction: 'ltr', author: 'Mohammed Marmaduke Pickthall' },
  { id: 'en.yusufali', name: 'Abdullah Yusuf Ali', language: 'English', languageCode: 'en', direction: 'ltr', author: 'Abdullah Yusuf Ali' },
  { id: 'ur.jalandhry', name: 'Fateh Muhammad Jalandhry', language: 'Urdu', languageCode: 'ur', direction: 'rtl', author: 'Fateh Muhammad Jalandhry' },
  { id: 'ur.kanzuliman', name: 'Ahmed Raza Khan (Kanz ul Iman)', language: 'Urdu', languageCode: 'ur', direction: 'rtl', author: 'Ahmed Raza Khan' },
  { id: 'ur.ahmedali', name: 'Ahmed Ali', language: 'Urdu', languageCode: 'ur', direction: 'rtl', author: 'Ahmed Ali' },
  { id: 'id.indonesian', name: 'Bahasa Indonesia', language: 'Indonesian', languageCode: 'id', direction: 'ltr', author: 'Kementerian Agama RI' },
  { id: 'fr.hamidullah', name: 'Muhammad Hamidullah', language: 'French', languageCode: 'fr', direction: 'ltr', author: 'Muhammad Hamidullah' },
  { id: 'de.bubenheim', name: 'Bubenheim & Elyas', language: 'German', languageCode: 'de', direction: 'ltr', author: 'Bubenheim & Elyas' },
  { id: 'tr.diyanet', name: 'Diyanet İşleri', language: 'Turkish', languageCode: 'tr', direction: 'ltr', author: 'Diyanet İşleri' },
] as const;

const TRANSLATION_BY_ID: Record<string, TranslationEdition> = Object.fromEntries(
  TRANSLATION_EDITIONS.map((edition) => [edition.id, edition])
);

export const RECITERS: readonly ReciterOption[] = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy', style: 'Murattal' },
  { id: 'ar.abdurrahmaansudais', name: 'Abdurrahman As-Sudais', style: 'Murattal' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit Abdul Samad', style: 'Murattal' },
  { id: 'ar.husary', name: 'Mahmoud Khalil Al-Husary', style: 'Murattal' },
  { id: 'ar.minshawi', name: 'Mohamed Siddiq El-Minshawi', style: 'Murattal' },
] as const;

export const QURAN_RECITERS = RECITERS;

const RECITER_BY_ID: Record<string, ReciterOption> = Object.fromEntries(
  RECITERS.map((reciter) => [reciter.id, reciter])
);

export const TAFSIR_EDITIONS: readonly TafsirEdition[] = [
  { id: 169, slug: 'en-tafisr-ibn-kathir', name: 'Tafsir Ibn Kathir (Abridged)', language: 'English', languageCode: 'en', direction: 'ltr' },
  { id: 168, slug: 'en-tafsir-maarif-ul-quran', name: "Ma'arif al-Qur'an", language: 'English', languageCode: 'en', direction: 'ltr' },
  { id: 817, slug: 'tazkirul-quran-en', name: 'Tazkirul Quran', language: 'English', languageCode: 'en', direction: 'ltr' },
  { id: 16, slug: 'ar-tafsir-muyassar', name: 'التفسير الميسر', language: 'Arabic', languageCode: 'ar', direction: 'rtl' },
  { id: 14, slug: 'ar-tafsir-ibn-kathir', name: 'تفسير ابن كثير', language: 'Arabic', languageCode: 'ar', direction: 'rtl' },
  { id: 160, slug: 'tafseer-ibn-e-kaseer-urdu', name: 'تفسیر ابن کثیر (اردو)', language: 'Urdu', languageCode: 'ur', direction: 'rtl' },
] as const;

export const JUZ_METADATA: readonly JuzMeta[] = [
  { number: 1, name: 'Alif-Lam-Mim', arabicName: 'الم', startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141 },
  { number: 2, name: 'Sayaqul', arabicName: 'سيقول', startSurah: 2, startAyah: 142, endSurah: 2, endAyah: 252 },
  { number: 3, name: 'Tilka ar-Rusul', arabicName: 'تلك الرسل', startSurah: 2, startAyah: 253, endSurah: 3, endAyah: 92 },
  { number: 4, name: 'Lan Tanalu', arabicName: 'لن تنالوا', startSurah: 3, startAyah: 93, endSurah: 4, endAyah: 23 },
  { number: 5, name: 'Wal-Muhsanat', arabicName: 'والمحصنات', startSurah: 4, startAyah: 24, endSurah: 4, endAyah: 147 },
  { number: 6, name: 'La Yuhibbullah', arabicName: 'لا يحب الله', startSurah: 4, startAyah: 148, endSurah: 5, endAyah: 81 },
  { number: 7, name: "Wa Idha Sami'u", arabicName: 'وإذا سمعوا', startSurah: 5, startAyah: 82, endSurah: 6, endAyah: 110 },
  { number: 8, name: 'Wa Law Annana', arabicName: 'ولو أننا', startSurah: 6, startAyah: 111, endSurah: 7, endAyah: 87 },
  { number: 9, name: "Qal al-Mala'u", arabicName: 'قال الملأ', startSurah: 7, startAyah: 88, endSurah: 8, endAyah: 40 },
  { number: 10, name: "Wa'lamu", arabicName: 'واعلموا', startSurah: 8, startAyah: 41, endSurah: 9, endAyah: 92 },
  { number: 11, name: "Ya'tadhiruna", arabicName: 'يعتذرون', startSurah: 9, startAyah: 93, endSurah: 11, endAyah: 5 },
  { number: 12, name: 'Wa Ma min Dabbah', arabicName: 'وما من دابة', startSurah: 11, startAyah: 6, endSurah: 12, endAyah: 52 },
  { number: 13, name: "Wa Ma Ubarri'u", arabicName: 'وما أبرئ', startSurah: 12, startAyah: 53, endSurah: 14, endAyah: 52 },
  { number: 14, name: 'Rubama', arabicName: 'ربما', startSurah: 15, startAyah: 1, endSurah: 16, endAyah: 128 },
  { number: 15, name: 'Subhanalladhi', arabicName: 'سبحان الذي', startSurah: 17, startAyah: 1, endSurah: 18, endAyah: 74 },
  { number: 16, name: 'Qal Alam', arabicName: 'قال ألم', startSurah: 18, startAyah: 75, endSurah: 20, endAyah: 135 },
  { number: 17, name: 'Iqtaraba lin-Nas', arabicName: 'اقترب للناس', startSurah: 21, startAyah: 1, endSurah: 22, endAyah: 78 },
  { number: 18, name: 'Qad Aflaha', arabicName: 'قد أفلح', startSurah: 23, startAyah: 1, endSurah: 25, endAyah: 20 },
  { number: 19, name: 'Wa Qalalladhina', arabicName: 'وقال الذين', startSurah: 25, startAyah: 21, endSurah: 27, endAyah: 55 },
  { number: 20, name: 'Amman Khalaqa', arabicName: 'أمن خلق', startSurah: 27, startAyah: 56, endSurah: 29, endAyah: 45 },
  { number: 21, name: 'Utlu Ma Uhiya', arabicName: 'اتل ما أوحي', startSurah: 29, startAyah: 46, endSurah: 33, endAyah: 30 },
  { number: 22, name: 'Wa Man Yaqnut', arabicName: 'ومن يقنت', startSurah: 33, startAyah: 31, endSurah: 36, endAyah: 27 },
  { number: 23, name: 'Wa Mali', arabicName: 'وما لي', startSurah: 36, startAyah: 28, endSurah: 39, endAyah: 31 },
  { number: 24, name: 'Faman Azlamu', arabicName: 'فمن أظلم', startSurah: 39, startAyah: 32, endSurah: 41, endAyah: 46 },
  { number: 25, name: 'Ilayhi Yuraddu', arabicName: 'إليه يرد', startSurah: 41, startAyah: 47, endSurah: 45, endAyah: 37 },
  { number: 26, name: 'Ha-Mim', arabicName: 'حم', startSurah: 46, startAyah: 1, endSurah: 51, endAyah: 30 },
  { number: 27, name: 'Qala Fama Khatbukum', arabicName: 'قال فما خطبكم', startSurah: 51, startAyah: 31, endSurah: 57, endAyah: 29 },
  { number: 28, name: "Qad Sami'allahu", arabicName: 'قد سمع الله', startSurah: 58, startAyah: 1, endSurah: 66, endAyah: 12 },
  { number: 29, name: 'Tabarakalladhi', arabicName: 'تبارك الذي', startSurah: 67, startAyah: 1, endSurah: 77, endAyah: 50 },
  { number: 30, name: "Amma Yatasa'alun", arabicName: 'عم يتساءلون', startSurah: 78, startAyah: 1, endSurah: 114, endAyah: 6 },
] as const;

export function getTranslationMeta(id: string): TranslationEdition | undefined {
  const normalized = id.trim().toLowerCase();
  const canonicalId = Object.hasOwn(LEGACY_TRANSLATION_ALIASES, normalized)
    ? LEGACY_TRANSLATION_ALIASES[normalized]
    : normalized;
  return Object.hasOwn(TRANSLATION_BY_ID, canonicalId)
    ? TRANSLATION_BY_ID[canonicalId]
    : undefined;
}

export function normalizeTranslationIds(ids: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawId of ids) {
    if (typeof rawId !== 'string') continue;
    const normalized = rawId.trim().toLowerCase();
    if (!normalized) continue;
    const canonical = Object.hasOwn(LEGACY_TRANSLATION_ALIASES, normalized)
      ? LEGACY_TRANSLATION_ALIASES[normalized]
      : normalized;
    if (!Object.hasOwn(TRANSLATION_BY_ID, canonical) || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
    if (result.length >= MAX_PARALLEL_TRANSLATIONS) break;
  }

  return result.length > 0 ? result : [...DEFAULT_TRANSLATIONS];
}

export function getReciterMeta(id: string): ReciterOption | undefined {
  return Object.hasOwn(RECITER_BY_ID, id) ? RECITER_BY_ID[id] : undefined;
}
