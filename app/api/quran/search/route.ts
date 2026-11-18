import { NextResponse } from 'next/server';
import { LEGACY_TRANSLATION_ALIASES } from '@/lib/quran/constants';
import { searchSurahsLocally } from '@/lib/quran/search';
import {
  fetchWithTimeout,
  getBackendBaseUrl,
  getSurahMeta,
  isObjectRecord,
  isValidReference,
} from '@/app/api/_lib/backendProxy';

const EDITION_LANG_REGEX = /^[a-z]{2}$/i;
const EDITION_SLUG_REGEX = /^[a-z0-9-]{1,30}$/i;
const REF_REGEX = /^(\d+):(\d+)$/;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const LEADING_ZEROS_REGEX = /^0+/;
const BACKEND_TIMEOUT_MS = 4_000;
const PUBLIC_API_TIMEOUT_MS = 8_000;
const MAX_SEARCH_LIMIT = 100;

interface SurahMatchDto {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface AyahMatchDto {
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  arabicName: string;
  text: string;
  translation: string;
  edition: string;
}

function isValidEditionId(edition: string): boolean {
  const parts = edition.split('.');
  return (
    parts.length === 2 &&
    Boolean(EDITION_LANG_REGEX.exec(parts[0])) &&
    Boolean(EDITION_SLUG_REGEX.exec(parts[1]))
  );
}

function findSurahMatches(query: string, maxResults = 10): SurahMatchDto[] {
  return searchSurahsLocally(query, maxResults).map((item) => ({
    number: item.surahNumber,
    name: item.arabicName,
    englishName: item.englishName,
    englishNameTranslation: item.englishNameTranslation,
    numberOfAyahs: item.numberOfAyahs,
    revelationType: item.revelationType,
  }));
}

function pickNonEmptyString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function pickFiniteNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizeBackendSurahMatch(item: unknown): SurahMatchDto | null {
  if (!isObjectRecord(item)) return null;
  const num = pickFiniteNumber(item.number, item.surahNumber) ?? 0;
  const meta = getSurahMeta(num);
  if (!meta) return null;
  return {
    number: meta.number,
    name: pickNonEmptyString(item.name, item.arabicName) ?? meta.arabicName,
    englishName: pickNonEmptyString(item.englishName) ?? meta.englishName,
    englishNameTranslation:
      pickNonEmptyString(item.englishNameTranslation, item.englishTranslation) ??
      meta.englishNameTranslation,
    numberOfAyahs: pickFiniteNumber(item.numberOfAyahs, item.ayahCount) ?? meta.ayahCount,
    revelationType: pickNonEmptyString(item.revelationType) ?? meta.revelationType,
  };
}

function normalizeBackendAyahMatch(
  item: unknown,
  fallbackEdition: string
): AyahMatchDto | null {
  if (!isObjectRecord(item)) return null;
  const surahNumber = pickFiniteNumber(item.surahNumber) ?? 0;
  const ayahNumber = pickFiniteNumber(item.ayahNumber) ?? 0;
  if (!isValidReference(surahNumber, ayahNumber)) return null;

  const meta = getSurahMeta(surahNumber);
  const arabic = pickNonEmptyString(item.arabic) ?? '';
  const translation = pickNonEmptyString(item.translation) ?? '';
  const text = pickNonEmptyString(item.text, arabic, translation) ?? '';

  return {
    surahNumber,
    ayahNumber,
    surahName: pickNonEmptyString(item.surahName) ?? meta?.englishName ?? '',
    arabicName: pickNonEmptyString(item.arabicName) ?? meta?.arabicName ?? '',
    text,
    translation,
    edition: pickNonEmptyString(item.edition) ?? fallbackEdition,
  };
}

function normalizeBackendSearchPayload(
  payload: Record<string, unknown>,
  query: string,
  edition: string
): Record<string, unknown> {
  const rawSurahs = Array.isArray(payload.surahMatches) ? payload.surahMatches : [];
  const rawAyahs = Array.isArray(payload.ayahMatches) ? payload.ayahMatches : [];
  const surahMatches = rawSurahs
    .map(normalizeBackendSurahMatch)
    .filter((item): item is SurahMatchDto => item !== null);
  const ayahMatches = rawAyahs
    .map((item) => normalizeBackendAyahMatch(item, edition))
    .filter((item): item is AyahMatchDto => item !== null);
  const totalAyahMatches =
    typeof payload.totalAyahMatches === 'number'
      ? payload.totalAyahMatches
      : ayahMatches.length;

  return {
    query: pickNonEmptyString(payload.query) ?? query,
    surahMatches,
    ayahMatches,
    totalAyahMatches,
    source: 'backend',
    ...(typeof payload.invalidReference === 'string'
      ? { invalidReference: payload.invalidReference }
      : {}),
  };
}

function extractReferenceTexts(
  items: unknown[],
  edition: string
): { arabicText: string; translationText: string } {
  let arabicText = '';
  let translationText = '';
  for (const item of items) {
    if (!isObjectRecord(item) || !isObjectRecord(item.edition) || typeof item.text !== 'string') {
      continue;
    }
    const edId = item.edition.identifier;
    if (edId === 'quran-uthmani') arabicText = item.text;
    else if (edId === edition) translationText = item.text;
  }
  return { arabicText, translationText };
}

async function fetchReferenceFallback(
  surah: number,
  ayah: number,
  edition: string,
  signal?: AbortSignal
): Promise<AyahMatchDto[]> {
  if (!isValidReference(surah, ayah)) {
    return [];
  }

  const url = `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,${encodeURIComponent(edition)}`;
  const res = await fetchWithTimeout(url, { method: 'GET' }, PUBLIC_API_TIMEOUT_MS, signal);
  if (!res.ok) return [];

  const json: unknown = await res.json();
  if (!isObjectRecord(json) || json.code !== 200 || !Array.isArray(json.data)) {
    return [];
  }

  const { arabicText, translationText } = extractReferenceTexts(json.data, edition);
  const meta = getSurahMeta(surah);
  return [
    {
      surahNumber: surah,
      ayahNumber: ayah,
      surahName: meta?.englishName ?? `Surah ${surah}`,
      arabicName: meta?.arabicName ?? '',
      text: arabicText || translationText,
      translation: translationText,
      edition,
    },
  ];
}

function mapKeywordMatch(
  item: unknown,
  searchEdition: string
): AyahMatchDto | null {
  if (!isObjectRecord(item) || !isObjectRecord(item.surah)) return null;
  const surahNumber = typeof item.surah.number === 'number' ? item.surah.number : 0;
  const ayahNumber = typeof item.numberInSurah === 'number' ? item.numberInSurah : 0;
  if (!isValidReference(surahNumber, ayahNumber)) return null;

  const matchedText = typeof item.text === 'string' ? item.text : '';
  const meta = getSurahMeta(surahNumber);
  const surahName = pickNonEmptyString(item.surah.englishName, meta?.englishName) ?? '';
  const arabicName = pickNonEmptyString(item.surah.name, meta?.arabicName) ?? '';

  return {
    surahNumber,
    ayahNumber,
    surahName,
    arabicName,
    text: matchedText,
    translation: searchEdition === 'quran-uthmani' ? '' : matchedText,
    edition: searchEdition,
  };
}

async function fetchKeywordFallback(
  query: string,
  edition: string,
  limit: number,
  signal?: AbortSignal
): Promise<{ matches: AyahMatchDto[]; total: number }> {
  const isArabic = Boolean(ARABIC_CHAR_REGEX.exec(query));
  const searchEdition = isArabic ? 'quran-uthmani' : edition;
  const url = `https://api.alquran.cloud/v1/search/${encodeURIComponent(query)}/all/${encodeURIComponent(searchEdition)}`;

  const res = await fetchWithTimeout(url, { method: 'GET' }, PUBLIC_API_TIMEOUT_MS, signal);
  if (res.status === 404) {
    return { matches: [], total: 0 };
  }
  if (!res.ok) {
    throw new Error(`Search fallback failed with status ${res.status}`);
  }

  const json: unknown = await res.json();
  if (!isObjectRecord(json) || json.code !== 200 || !isObjectRecord(json.data)) {
    return { matches: [], total: 0 };
  }

  const rawMatches = Array.isArray(json.data.matches) ? json.data.matches : [];
  const total = typeof json.data.count === 'number' ? json.data.count : rawMatches.length;
  const matches = rawMatches
    .slice(0, limit)
    .map((item) => mapKeywordMatch(item, searchEdition))
    .filter((item): item is AyahMatchDto => item !== null);

  return { matches, total };
}

async function tryBackendSearch(
  query: string,
  edition: string,
  limit: number,
  cacheHeaders: Record<string, string>,
  signal?: AbortSignal
): Promise<Response | null> {
  try {
    const backendUrl = `${getBackendBaseUrl()}/quran/search?q=${encodeURIComponent(query)}&edition=${encodeURIComponent(edition)}&limit=${limit}`;
    const upstream = await fetchWithTimeout(
      backendUrl,
      { method: 'GET' },
      BACKEND_TIMEOUT_MS,
      signal
    );
    if (upstream.ok) {
      const payload: unknown = await upstream.json();
      if (isObjectRecord(payload)) {
        return NextResponse.json(
          normalizeBackendSearchPayload(payload, query, edition),
          { headers: cacheHeaders }
        );
      }
    }
  } catch {
    if (signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    // Fall through to authoritative public Quran API fallback.
  }
  return null;
}

function parseSearchLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (!DIGITS_ONLY_REGEX.exec(trimmed)) {
    return null;
  }
  const normalized = trimmed.replace(LEADING_ZEROS_REGEX, '');
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > 3) {
    return MAX_SEARCH_LIMIT;
  }
  return Math.min(Number.parseInt(normalized, 10), MAX_SEARCH_LIMIT);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') ?? '').trim();
  if (query.length === 0 || query.length > 200) {
    return NextResponse.json(
      { error: 'Query parameter q must be between 1 and 200 characters.' },
      { status: 400 }
    );
  }

  const rawEdition = (searchParams.get('edition') ?? 'en.sahih').trim();
  if (!isValidEditionId(rawEdition)) {
    return NextResponse.json({ error: 'Invalid edition format.' }, { status: 400 });
  }
  const normalizedEdition = rawEdition.toLowerCase();
  const edition = Object.hasOwn(LEGACY_TRANSLATION_ALIASES, normalizedEdition)
    ? LEGACY_TRANSLATION_ALIASES[normalizedEdition]
    : normalizedEdition;

  const limitRaw = searchParams.get('limit') ?? '40';
  const limit = parseSearchLimit(limitRaw);
  if (limit === null) {
    return NextResponse.json({ error: 'Invalid limit parameter.' }, { status: 400 });
  }

  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  };

  const backendResponse = await tryBackendSearch(query, edition, limit, cacheHeaders, req.signal);
  if (backendResponse) {
    return backendResponse;
  }

  try {
    const surahMatches = findSurahMatches(query);
    const refMatch = REF_REGEX.exec(query);

    if (refMatch) {
      const surah = Number.parseInt(refMatch[1], 10);
      const ayah = Number.parseInt(refMatch[2], 10);
      const ayahMatches = await fetchReferenceFallback(surah, ayah, edition, req.signal);
      return NextResponse.json(
        {
          query,
          surahMatches,
          ayahMatches,
          totalAyahMatches: ayahMatches.length,
          source: 'alquran-cloud',
        },
        { headers: cacheHeaders }
      );
    }

    const { matches, total } = await fetchKeywordFallback(query, edition, limit, req.signal);
    return NextResponse.json(
      {
        query,
        surahMatches,
        ayahMatches: matches,
        totalAyahMatches: total,
        source: 'alquran-cloud',
      },
      { headers: cacheHeaders }
    );
  } catch (error) {
    if (req.signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error('Quran search error:', error);
    return NextResponse.json(
      { error: 'Quran search is currently unavailable.' },
      { status: 502 }
    );
  }
}
