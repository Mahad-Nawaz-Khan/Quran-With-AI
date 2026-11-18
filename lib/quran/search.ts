import { fetchAyah, fetchSearch } from './api';
import {
  SURAH_METADATA,
  getJuzStart,
  getMaxAyahs,
  getPageStart,
  getSurahMeta,
  isValidJuz,
  isValidPage,
  isValidReference,
  isValidSurah,
} from './surahMetadata';
import type {
  AyahSearchMatch,
  CommandIntent,
  SearchResult,
  SurahMeta,
  SurahSearchMatch,
} from './types';

const AYAH_REF_REGEX = /^(\d+):(\d+)$/;
const SURAH_CMD_REGEX = /^surah\s+(\d+)$/i;
const BARE_NUM_REGEX = /^(\d+)$/;
const JUZ_CMD_REGEX = /^juz\s+(\d+)$/i;
const PAGE_CMD_REGEX = /^page\s+(\d+)$/i;
const PUNCT_STRIP_REGEX = /['’\-_.,]/g;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(PUNCT_STRIP_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

function toSurahSearchMatch(meta: SurahMeta): SurahSearchMatch {
  return {
    type: 'surah',
    surahNumber: meta.number,
    englishName: meta.englishName,
    arabicName: meta.arabicName,
    englishNameTranslation: meta.englishNameTranslation,
    numberOfAyahs: meta.ayahCount,
    revelationType: meta.revelationType,
  };
}

function parseReferenceIntent(trimmed: string): CommandIntent | null {
  const refMatch = AYAH_REF_REGEX.exec(trimmed);
  if (!refMatch) {
    return null;
  }

  const surah = Number.parseInt(refMatch[1], 10);
  const ayah = Number.parseInt(refMatch[2], 10);

  if (isValidReference(surah, ayah)) {
    return {
      kind: 'reference',
      surahNumber: surah,
      ayahNumber: ayah,
      href: `/surah/${surah}?ayah=${ayah}`,
    };
  }

  if (!isValidSurah(surah)) {
    return {
      kind: 'invalid_reference',
      raw: trimmed,
      reason: 'Surah number must be between 1 and 114.',
    };
  }

  const maxAyahs = getMaxAyahs(surah);
  const meta = getSurahMeta(surah);
  const name = meta ? meta.englishName : `Surah ${surah}`;
  return {
    kind: 'invalid_reference',
    raw: trimmed,
    reason: `${name} (${surah}) has ${maxAyahs} ayahs. Valid range is 1-${maxAyahs}.`,
  };
}

function parseNavCommandIntent(trimmed: string): CommandIntent | null {
  const surahMatch = SURAH_CMD_REGEX.exec(trimmed);
  if (surahMatch) {
    const n = Number.parseInt(surahMatch[1], 10);
    if (isValidSurah(n)) {
      return { kind: 'surah', surahNumber: n, href: `/surah/${n}`, isExplicitCommand: true };
    }
    return {
      kind: 'invalid_reference',
      raw: trimmed,
      reason: 'Surah number must be between 1 and 114.',
    };
  }

  const juzMatch = JUZ_CMD_REGEX.exec(trimmed);
  if (juzMatch) {
    const juz = Number.parseInt(juzMatch[1], 10);
    const start = isValidJuz(juz) ? getJuzStart(juz) : null;
    if (start) {
      return {
        kind: 'juz',
        juzNumber: juz,
        startSurah: start.surah,
        startAyah: start.ayah,
        href: `/surah/${start.surah}?ayah=${start.ayah}`,
      };
    }
    return {
      kind: 'invalid_reference',
      raw: trimmed,
      reason: 'Juz number must be between 1 and 30.',
    };
  }

  const pageMatch = PAGE_CMD_REGEX.exec(trimmed);
  if (pageMatch) {
    const page = Number.parseInt(pageMatch[1], 10);
    const start = isValidPage(page) ? getPageStart(page) : null;
    if (start) {
      return {
        kind: 'page',
        pageNumber: page,
        startSurah: start.surah,
        startAyah: start.ayah,
        href: `/surah/${start.surah}?ayah=${start.ayah}`,
      };
    }
    return {
      kind: 'invalid_reference',
      raw: trimmed,
      reason: 'Page number must be between 1 and 604.',
    };
  }

  return null;
}

export function parseSearchIntent(rawQuery: string): CommandIntent {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { kind: 'empty' };
  }

  const refIntent = parseReferenceIntent(trimmed);
  if (refIntent) {
    return refIntent;
  }

  const navIntent = parseNavCommandIntent(trimmed);
  if (navIntent) {
    return navIntent;
  }

  const numMatch = BARE_NUM_REGEX.exec(trimmed);
  if (numMatch) {
    const n = Number.parseInt(numMatch[1], 10);
    if (isValidSurah(n)) {
      return { kind: 'surah', surahNumber: n, href: `/surah/${n}`, isExplicitCommand: false };
    }
    return {
      kind: 'invalid_reference',
      raw: trimmed,
      reason: 'Surah number must be between 1 and 114.',
    };
  }

  return { kind: 'keyword', query: trimmed };
}

function scoreSurahMatch(meta: SurahMeta, normalizedQuery: string, rawTrimmed: string): number {
  const numStr = String(meta.number);
  if (numStr === rawTrimmed) return 100;

  const normEn = normalizeText(meta.englishName);
  const compactEn = normEn.replace(/\s+/g, '');
  const compactQuery = normalizedQuery.replace(/\s+/g, '');

  if (normEn === normalizedQuery || compactEn === compactQuery) return 95;
  if (normEn.startsWith(normalizedQuery) || compactEn.startsWith(compactQuery)) return 80;
  if (numStr.startsWith(rawTrimmed)) return 75;

  const normMeaning = normalizeText(meta.englishNameTranslation);
  if (
    normEn.includes(normalizedQuery) ||
    compactEn.includes(compactQuery) ||
    normMeaning.includes(normalizedQuery) ||
    meta.arabicName.includes(rawTrimmed)
  ) {
    return 50;
  }

  return 0;
}

export function searchSurahsLocally(query: string, limit = 10): SurahSearchMatch[] {
  const rawTrimmed = query.trim();
  const normalizedQuery = normalizeText(rawTrimmed);
  if (!normalizedQuery) {
    return [];
  }

  const scored: Array<{ score: number; meta: SurahMeta }> = [];
  for (const meta of SURAH_METADATA) {
    const score = scoreSurahMatch(meta, normalizedQuery, rawTrimmed);
    if (score > 0) {
      scored.push({ score, meta });
    }
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.meta.number - b.meta.number));
  return scored.slice(0, limit).map((item) => toSurahSearchMatch(item.meta));
}

export interface ExecuteSearchOptions {
  editionId?: string;
  limit?: number;
  signal?: AbortSignal;
}

async function buildDirectAyahSearchResult(
  rawQuery: string,
  intent: CommandIntent,
  surahNumber: number,
  ayahNumber: number,
  editionId: string,
  signal?: AbortSignal
): Promise<SearchResult> {
  const ayah = await fetchAyah(surahNumber, ayahNumber, [editionId], signal);
  const meta = getSurahMeta(surahNumber);
  const ayahMatch: AyahSearchMatch = {
    type: 'ayah',
    surahNumber,
    ayahNumber,
    surahName: meta?.englishName ?? ayah.surahName ?? '',
    arabicName: meta?.arabicName ?? '',
    text: ayah.text,
    translation: ayah.translation ?? '',
    editionId,
  };
  return {
    query: rawQuery.trim(),
    intent,
    surahMatches: meta ? [toSurahSearchMatch(meta)] : [],
    ayahMatches: [ayahMatch],
    totalAyahMatches: 1,
  };
}

export async function executeSearch(
  rawQuery: string,
  options: ExecuteSearchOptions = {}
): Promise<SearchResult> {
  const intent = parseSearchIntent(rawQuery);
  const editionId = options.editionId ?? 'en.sahih';
  const limit = options.limit ?? 40;

  if (intent.kind === 'empty' || intent.kind === 'invalid_reference') {
    return {
      query: rawQuery.trim(),
      intent,
      surahMatches: [],
      ayahMatches: [],
      totalAyahMatches: 0,
    };
  }

  if (intent.kind === 'reference') {
    return buildDirectAyahSearchResult(
      rawQuery,
      intent,
      intent.surahNumber,
      intent.ayahNumber,
      editionId,
      options.signal
    );
  }

  if (intent.kind === 'surah') {
    const meta = getSurahMeta(intent.surahNumber);
    const surahMatches = meta ? [toSurahSearchMatch(meta)] : [];
    return {
      query: rawQuery.trim(),
      intent,
      surahMatches,
      ayahMatches: [],
      totalAyahMatches: 0,
    };
  }

  if (intent.kind === 'juz' || intent.kind === 'page') {
    return buildDirectAyahSearchResult(
      rawQuery,
      intent,
      intent.startSurah,
      intent.startAyah,
      editionId,
      options.signal
    );
  }

  const localSurahs = searchSurahsLocally(intent.query, 8);
  const remote = await fetchSearch(intent.query, editionId, limit, options.signal);
  const surahMatches = remote.surahMatches.length > 0 ? remote.surahMatches : localSurahs;

  return {
    query: intent.query,
    intent,
    surahMatches,
    ayahMatches: remote.ayahMatches,
    totalAyahMatches: remote.totalAyahMatches,
  };
}
