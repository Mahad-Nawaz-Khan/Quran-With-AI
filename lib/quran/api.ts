import {
  ALQURAN_API_BASE,
  DEFAULT_RECITER,
  DEFAULT_TAFSIR_SLUG,
  JUZ_METADATA,
  getTranslationMeta,
  normalizeTranslationIds,
} from './constants';
import {
  getSurahMeta,
  isValidJuz,
  isValidPage,
  isValidReference,
  isValidSurah,
  SURAH_METADATA,
} from './surahMetadata';
import type {
  AlQuranAyah,
  AlQuranEditionMeta,
  AlQuranSurahEditionPayload,
  Ayah,
  AyahSearchMatch,
  AyahTranslation,
  JuzSliceResponse,
  PageSliceResponse,
  SurahEdition,
  SurahMeta,
  SurahSearchMatch,
  TafsirResponse,
  WordByWordResponse,
} from './types';

export class QuranApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'QuranApiError';
    this.status = status;
    this.code = code;
  }
}

export const CANONICAL_BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

const BISMILLAH_PREFIXES = [
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
  'بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
] as const;

const MAX_CACHE_ENTRIES = 200;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 12_000;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const apiCache = new Map<string, CacheEntry>();

export function clearQuranApiCache(): void {
  apiCache.clear();
}

function getCachedValue(key: string): unknown {
  const entry = apiCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedValue(key: string, value: unknown, ttlMs: number): void {
  if (apiCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = apiCache.keys().next().value;
    if (oldestKey !== undefined) {
      apiCache.delete(oldestKey);
    }
  }
  apiCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function stripBismillahPrefix(
  text: string,
  surahNumber: number,
  ayahNumber: number
): string {
  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (surahNumber === 1 || surahNumber === 9 || ayahNumber !== 1) {
    return clean;
  }

  for (const prefix of BISMILLAH_PREFIXES) {
    if (clean.startsWith(prefix)) {
      const remainder = clean.slice(prefix.length).trim();
      return remainder.length > 0 ? remainder : clean;
    }
  }

  return clean;
}

interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cacheKey?: string;
  ttlMs?: number;
}

async function fetchJsonRaw(
  url: string,
  options: FetchJsonOptions = {}
): Promise<unknown> {
  if (options.cacheKey) {
    const cached = getCachedValue(options.cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(options.signal?.reason);
  };

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new QuranApiError(
        res.status,
        'UPSTREAM_HTTP_ERROR',
        `Request failed with status ${res.status}`
      );
    }
    const parsed: unknown = await res.json();
    if (options.cacheKey) {
      setCachedValue(
        options.cacheKey,
        parsed,
        options.ttlMs ?? DEFAULT_CACHE_TTL_MS
      );
    }
    return parsed;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAlQuranAyah(value: unknown): value is AlQuranAyah {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.number === 'number' &&
    typeof value.numberInSurah === 'number' &&
    typeof value.text === 'string' &&
    typeof value.juz === 'number' &&
    typeof value.page === 'number' &&
    typeof value.hizbQuarter === 'number'
  );
}

function isAlQuranSurahEditionPayload(
  value: unknown
): value is AlQuranSurahEditionPayload {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.number === 'number' &&
    Array.isArray(value.ayahs) &&
    isObjectRecord(value.edition) &&
    typeof value.edition.identifier === 'string'
  );
}

function isAlQuranAyahEditionItem(
  value: unknown
): value is AlQuranAyah & { edition: AlQuranEditionMeta } {
  return (
    isAlQuranAyah(value) &&
    isObjectRecord(value) &&
    isObjectRecord(value.edition) &&
    typeof value.edition.identifier === 'string'
  );
}

function unwrapAlQuranData(payload: unknown): unknown {
  if (!isObjectRecord(payload) || typeof payload.code !== 'number') {
    throw new QuranApiError(502, 'INVALID_PAYLOAD', 'Unexpected API response format.');
  }
  if (payload.code !== 200 || !('data' in payload)) {
    throw new QuranApiError(
      payload.code,
      'ALQURAN_API_ERROR',
      typeof payload.status === 'string' ? payload.status : 'Quran API error.'
    );
  }
  return payload.data;
}

function mapAlQuranAyah(
  raw: AlQuranAyah,
  surahNumber: number,
  options?: {
    translation?: string;
    allTranslations?: AyahTranslation[];
    tajweedText?: string;
    transliteration?: string;
    audio?: string;
  }
): Ayah {
  const cleanText = stripBismillahPrefix(raw.text, surahNumber, raw.numberInSurah);
  return {
    number: raw.number,
    numberInSurah: raw.numberInSurah,
    surahNumber,
    text: cleanText,
    rawText: raw.text,
    tajweedText: options?.tajweedText,
    transliteration: options?.transliteration,
    translation: options?.translation,
    audio: options?.audio ?? raw.audio,
    juz: raw.juz,
    page: raw.page,
    hizbQuarter: raw.hizbQuarter,
    manzil: raw.manzil,
    ruku: raw.ruku,
    isSajda: Boolean(raw.sajda),
    surahName: raw.surah?.englishName,
    allTranslations: options?.allTranslations,
  };
}

function findEditionPayload(
  editions: readonly AlQuranSurahEditionPayload[],
  editionId: string
): AlQuranSurahEditionPayload | undefined {
  return editions.find((item) => item.edition.identifier === editionId);
}

function buildTranslationItem(
  editionId: string,
  payload: AlQuranSurahEditionPayload,
  ayahText: string
): AyahTranslation {
  const meta = getTranslationMeta(editionId);
  return {
    editionId,
    language: meta?.language ?? payload.edition.language ?? 'Translation',
    languageCode: meta?.languageCode ?? payload.edition.language ?? 'en',
    direction: meta?.direction ?? payload.edition.direction ?? 'ltr',
    name: meta?.name ?? payload.edition.englishName ?? editionId,
    text: ayahText,
  };
}

function buildAyahTranslations(
  translationIds: readonly string[],
  editions: readonly AlQuranSurahEditionPayload[],
  index: number
): AyahTranslation[] {
  const items: AyahTranslation[] = [];
  for (const editionId of translationIds) {
    const payload = findEditionPayload(editions, editionId);
    const ayahText = payload?.ayahs[index]?.text;
    if (payload && ayahText !== undefined) {
      items.push(buildTranslationItem(editionId, payload, ayahText));
    }
  }
  return items;
}

export async function fetchAllSurahs(signal?: AbortSignal): Promise<SurahMeta[]> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return [...SURAH_METADATA];
}

export interface FetchSurahOptions {
  includeTajweed?: boolean;
  includeTransliteration?: boolean;
  signal?: AbortSignal;
}

function collectRequestedEditions(
  normalizedTranslations: readonly string[],
  safeReciter: string,
  options: FetchSurahOptions
): string[] {
  const requested = ['quran-uthmani', ...normalizedTranslations];
  if (options.includeTajweed) requested.push('quran-tajweed');
  if (options.includeTransliteration) requested.push('en.transliteration');
  requested.push(safeReciter);
  return Array.from(new Set(requested));
}

function mapSingleAyahEdition(
  rawAyah: AlQuranAyah,
  index: number,
  surahNumber: number,
  normalizedTranslations: readonly string[],
  editionPayloads: readonly AlQuranSurahEditionPayload[],
  optional: {
    tajweedPayload?: AlQuranSurahEditionPayload;
    translitPayload?: AlQuranSurahEditionPayload;
    audioPayload?: AlQuranSurahEditionPayload;
  }
): Ayah {
  const allTranslations = buildAyahTranslations(normalizedTranslations, editionPayloads, index);
  const audioAyah = optional.audioPayload?.ayahs[index];
  return mapAlQuranAyah(rawAyah, surahNumber, {
    translation: allTranslations[0]?.text,
    allTranslations,
    tajweedText: optional.tajweedPayload?.ayahs[index]?.text,
    transliteration: optional.translitPayload?.ayahs[index]?.text,
    audio: audioAyah?.audio ?? audioAyah?.audioSecondary?.[0],
  });
}

function mapSurahEditionPayload(
  raw: unknown,
  surahMeta: SurahMeta,
  normalizedTranslations: readonly string[],
  safeReciter: string,
  options: FetchSurahOptions
): SurahEdition {
  const rawData = unwrapAlQuranData(raw);
  const editionPayloads = Array.isArray(rawData)
    ? rawData.filter(isAlQuranSurahEditionPayload)
    : [];
  const arabicPayload = findEditionPayload(editionPayloads, 'quran-uthmani') ?? editionPayloads[0];
  if (!arabicPayload || !Array.isArray(arabicPayload.ayahs)) {
    throw new QuranApiError(502, 'MISSING_ARABIC_EDITION', 'Surah Arabic text could not be loaded.');
  }

  const optional = {
    tajweedPayload: options.includeTajweed
      ? findEditionPayload(editionPayloads, 'quran-tajweed')
      : undefined,
    translitPayload: options.includeTransliteration
      ? findEditionPayload(editionPayloads, 'en.transliteration')
      : undefined,
    audioPayload: findEditionPayload(editionPayloads, safeReciter),
  };

  const ayahs = arabicPayload.ayahs.map((rawAyah, index) =>
    mapSingleAyahEdition(
      rawAyah,
      index,
      surahMeta.number,
      normalizedTranslations,
      editionPayloads,
      optional
    )
  );

  return {
    surah: surahMeta,
    ayahs,
    editionIds: [...normalizedTranslations],
    reciterId: safeReciter,
  };
}

export async function fetchSurahWithEditions(
  surahNumber: number,
  translationIds: readonly string[],
  reciterId: string = DEFAULT_RECITER,
  options: FetchSurahOptions = {}
): Promise<SurahEdition> {
  const surahMeta = getSurahMeta(surahNumber);
  if (!surahMeta) {
    throw new QuranApiError(400, 'INVALID_SURAH', 'Surah number must be between 1 and 114.');
  }

  const normalizedTranslations = normalizeTranslationIds(translationIds);
  const safeReciter = reciterId.trim() || DEFAULT_RECITER;
  const uniqueEditions = collectRequestedEditions(normalizedTranslations, safeReciter, options);

  const upstreamUrl = `${ALQURAN_API_BASE}/surah/${surahNumber}/editions/${uniqueEditions.join(',')}`;
  const url =
    typeof window !== 'undefined'
      ? `/api/quran/surah/${surahNumber}?editions=${encodeURIComponent(uniqueEditions.join(','))}`
      : upstreamUrl;
  const raw = await fetchJsonRaw(url, {
    signal: options.signal,
    cacheKey: `surah:${surahNumber}:${uniqueEditions.join(',')}`,
  });

  return mapSurahEditionPayload(raw, surahMeta, normalizedTranslations, safeReciter, options);
}

function mapSliceAyahs(ayahs: readonly AlQuranAyah[]): Ayah[] {
  return ayahs.map((raw) => {
    const surahNumber = raw.surah?.number ?? 1;
    return mapAlQuranAyah(raw, surahNumber);
  });
}

function extractSliceAyahs(rawData: unknown): AlQuranAyah[] {
  if (!isObjectRecord(rawData) || !Array.isArray(rawData.ayahs)) {
    return [];
  }
  return rawData.ayahs.filter(isAlQuranAyah);
}

export async function fetchJuz(
  juzNumber: number,
  editionId = 'quran-uthmani',
  signal?: AbortSignal
): Promise<JuzSliceResponse> {
  if (!isValidJuz(juzNumber)) {
    throw new QuranApiError(400, 'INVALID_JUZ', 'Juz number must be between 1 and 30.');
  }
  const url = `${ALQURAN_API_BASE}/juz/${juzNumber}/${encodeURIComponent(editionId)}`;
  const raw = await fetchJsonRaw(url, {
    signal,
    cacheKey: `juz:${juzNumber}:${editionId}`,
  });
  const rawAyahs = extractSliceAyahs(unwrapAlQuranData(raw));
  return {
    juz: JUZ_METADATA[juzNumber - 1],
    editionId,
    ayahs: mapSliceAyahs(rawAyahs),
  };
}

export async function fetchPage(
  pageNumber: number,
  editionId = 'quran-uthmani',
  signal?: AbortSignal
): Promise<PageSliceResponse> {
  if (!isValidPage(pageNumber)) {
    throw new QuranApiError(400, 'INVALID_PAGE', 'Page number must be between 1 and 604.');
  }
  const url = `${ALQURAN_API_BASE}/page/${pageNumber}/${encodeURIComponent(editionId)}`;
  const raw = await fetchJsonRaw(url, {
    signal,
    cacheKey: `page:${pageNumber}:${editionId}`,
  });
  const rawAyahs = extractSliceAyahs(unwrapAlQuranData(raw));
  return {
    page: pageNumber,
    editionId,
    ayahs: mapSliceAyahs(rawAyahs),
  };
}

function buildSingleAyahTranslations(
  normalized: readonly string[],
  items: readonly (AlQuranAyah & { edition: AlQuranEditionMeta })[]
): AyahTranslation[] {
  const allTranslations: AyahTranslation[] = [];
  for (const id of normalized) {
    const item = items.find((entry) => entry.edition.identifier === id);
    if (!item) continue;
    const meta = getTranslationMeta(id);
    allTranslations.push({
      editionId: id,
      language: meta?.language ?? item.edition.language,
      languageCode: meta?.languageCode ?? item.edition.language,
      direction: meta?.direction ?? item.edition.direction ?? 'ltr',
      name: meta?.name ?? item.edition.englishName,
      text: item.text,
    });
  }
  return allTranslations;
}

export async function fetchAyah(
  surahNumber: number,
  ayahNumber: number,
  editionIds: readonly string[] = ['en.sahih'],
  signal?: AbortSignal
): Promise<Ayah> {
  if (!isValidReference(surahNumber, ayahNumber)) {
    throw new QuranApiError(400, 'INVALID_REFERENCE', `Invalid Quran reference ${surahNumber}:${ayahNumber}.`);
  }

  const normalized = normalizeTranslationIds(editionIds);
  const editions = ['quran-uthmani', ...normalized];
  const url = `${ALQURAN_API_BASE}/ayah/${surahNumber}:${ayahNumber}/editions/${editions.join(',')}`;
  const raw = await fetchJsonRaw(url, {
    signal,
    cacheKey: `ayah:${surahNumber}:${ayahNumber}:${editions.join(',')}`,
  });

  const rawData = unwrapAlQuranData(raw);
  const items = Array.isArray(rawData)
    ? rawData.filter(isAlQuranAyahEditionItem)
    : [];
  const arabicItem = items.find((i) => i.edition.identifier === 'quran-uthmani') ?? items[0];
  if (!arabicItem) {
    throw new QuranApiError(502, 'MISSING_AYAH', `Ayah ${surahNumber}:${ayahNumber} was not returned.`);
  }

  const allTranslations = buildSingleAyahTranslations(normalized, items);
  return mapAlQuranAyah(arabicItem, surahNumber, {
    translation: allTranslations[0]?.text,
    allTranslations,
  });
}

export async function fetchAyahsBatch(
  refs: readonly { surah: number; ayah: number }[],
  editionIds: readonly string[] = ['en.sahih'],
  signal?: AbortSignal
): Promise<Ayah[]> {
  const results: Ayah[] = [];
  const chunkSize = 6;

  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize);
    const settled = await Promise.all(
      chunk.map((ref) => fetchAyah(ref.surah, ref.ayah, editionIds, signal))
    );
    results.push(...settled);
  }

  return results;
}

function isTafsirResponse(value: unknown): value is TafsirResponse {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.surah === 'number' &&
    typeof value.ayah === 'number' &&
    typeof value.text === 'string'
  );
}

export async function fetchTafsir(
  surahNumber: number,
  ayahNumber: number,
  slug: string = DEFAULT_TAFSIR_SLUG,
  signal?: AbortSignal
): Promise<TafsirResponse> {
  if (!isValidReference(surahNumber, ayahNumber)) {
    throw new QuranApiError(400, 'INVALID_REFERENCE', `Invalid Quran reference ${surahNumber}:${ayahNumber}.`);
  }
  const safeSlug = slug.trim() || DEFAULT_TAFSIR_SLUG;
  const url = `/api/quran/tafsir/${surahNumber}/${ayahNumber}?slug=${encodeURIComponent(safeSlug)}`;
  const raw = await fetchJsonRaw(url, {
    signal,
    cacheKey: `tafsir:${surahNumber}:${ayahNumber}:${safeSlug}`,
  });
  if (!isTafsirResponse(raw)) {
    throw new QuranApiError(502, 'INVALID_TAFSIR_PAYLOAD', 'Unexpected tafsir response format.');
  }
  return raw;
}

function isWordByWordResponse(value: unknown): value is WordByWordResponse {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.surah === 'number' &&
    typeof value.ayah === 'number' &&
    Array.isArray(value.words)
  );
}

export async function fetchWordByWord(
  surahNumber: number,
  ayahNumber: number,
  signal?: AbortSignal
): Promise<WordByWordResponse> {
  if (!isValidReference(surahNumber, ayahNumber)) {
    throw new QuranApiError(400, 'INVALID_REFERENCE', `Invalid Quran reference ${surahNumber}:${ayahNumber}.`);
  }
  const url = `/api/quran/word-by-word/${surahNumber}/${ayahNumber}`;
  const raw = await fetchJsonRaw(url, {
    signal,
    cacheKey: `wbw:${surahNumber}:${ayahNumber}`,
  });
  if (!isWordByWordResponse(raw)) {
    throw new QuranApiError(502, 'INVALID_WBW_PAYLOAD', 'Unexpected word-by-word response format.');
  }
  return raw;
}

export interface SearchApiResponse {
  query: string;
  surahMatches: SurahSearchMatch[];
  ayahMatches: AyahSearchMatch[];
  totalAyahMatches: number;
}

function toSurahSearchMatch(raw: unknown): SurahSearchMatch | null {
  if (!isObjectRecord(raw)) return null;
  const surahNumber = typeof raw.surahNumber === 'number' ? raw.surahNumber : raw.number;
  if (typeof surahNumber !== 'number' || !isValidSurah(surahNumber)) return null;
  const meta = SURAH_METADATA[surahNumber - 1];
  return {
    type: 'surah',
    surahNumber,
    englishName: typeof raw.englishName === 'string' ? raw.englishName : meta.englishName,
    arabicName: typeof raw.arabicName === 'string' ? raw.arabicName : meta.arabicName,
    englishNameTranslation:
      typeof raw.englishNameTranslation === 'string'
        ? raw.englishNameTranslation
        : meta.englishNameTranslation,
    numberOfAyahs:
      typeof raw.numberOfAyahs === 'number' ? raw.numberOfAyahs : meta.ayahCount,
    revelationType: meta.revelationType,
  };
}

function toAyahSearchMatch(raw: unknown, defaultEdition: string): AyahSearchMatch | null {
  if (!isObjectRecord(raw)) return null;
  if (typeof raw.surahNumber !== 'number' || typeof raw.ayahNumber !== 'number') {
    return null;
  }
  const meta = getSurahMeta(raw.surahNumber);
  return {
    type: 'ayah',
    surahNumber: raw.surahNumber,
    ayahNumber: raw.ayahNumber,
    surahName: typeof raw.surahName === 'string' ? raw.surahName : (meta?.englishName ?? ''),
    arabicName: typeof raw.arabicName === 'string' ? raw.arabicName : (meta?.arabicName ?? ''),
    text: typeof raw.text === 'string' ? raw.text : '',
    translation: typeof raw.translation === 'string' ? raw.translation : '',
    editionId: typeof raw.edition === 'string' ? raw.edition : defaultEdition,
  };
}

export async function fetchSearch(
  query: string,
  editionId = 'en.sahih',
  limit = 40,
  signal?: AbortSignal
): Promise<SearchApiResponse> {
  const trimmed = query.trim();
  const safeEdition = normalizeTranslationIds([editionId])[0];
  const finiteLimit = Number.isFinite(limit) ? Math.trunc(limit) : 40;
  const safeLimit = Math.min(Math.max(finiteLimit, 1), 100);
  const url = `/api/quran/search?q=${encodeURIComponent(trimmed)}&edition=${encodeURIComponent(safeEdition)}&limit=${safeLimit}`;

  const raw = await fetchJsonRaw(url, {
    signal,
    cacheKey: `search:${trimmed.toLowerCase()}:${safeEdition}:${safeLimit}`,
    ttlMs: SEARCH_CACHE_TTL_MS,
  });

  if (!isObjectRecord(raw)) {
    throw new QuranApiError(502, 'INVALID_SEARCH_PAYLOAD', 'Unexpected search response.');
  }

  const rawSurahs = Array.isArray(raw.surahMatches) ? raw.surahMatches : [];
  const rawAyahs = Array.isArray(raw.ayahMatches) ? raw.ayahMatches : [];
  const surahMatches = rawSurahs
    .map(toSurahSearchMatch)
    .filter((item): item is SurahSearchMatch => item !== null);
  const ayahMatches = rawAyahs
    .map((item) => toAyahSearchMatch(item, safeEdition))
    .filter((item): item is AyahSearchMatch => item !== null);

  return {
    query: typeof raw.query === 'string' ? raw.query : trimmed,
    surahMatches,
    ayahMatches,
    totalAyahMatches:
      typeof raw.totalAyahMatches === 'number' ? raw.totalAyahMatches : ayahMatches.length,
  };
}
