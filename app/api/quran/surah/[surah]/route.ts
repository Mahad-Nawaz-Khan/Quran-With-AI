import { NextResponse } from 'next/server';
import {
  fetchWithTimeout,
  isObjectRecord,
  parsePositiveIntParam,
} from '@/app/api/_lib/backendProxy';
import { isValidSurah } from '@/lib/quran/surahMetadata';

const ALQURAN_SURAH_BASE = 'https://api.alquran.cloud/v1/surah';
const PUBLIC_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 3_600_000;
const MAX_CACHE_ENTRIES = 128;
const EDITION_TOKEN_REGEX = /^[a-z0-9._-]{2,40}$/i;

const responseCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getCachedSurah(key: string): unknown {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.payload;
}

function setCachedSurah(key: string, payload: unknown): void {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) {
      responseCache.delete(oldestKey);
    }
  }
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

function sanitizeEditionsParam(raw: string | null): string[] {
  const parts = (raw ?? 'quran-uthmani,en.sahih,ar.alafasy')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => EDITION_TOKEN_REGEX.test(s));
  const merged = ['quran-uthmani', ...parts.filter((p) => p !== 'quran-uthmani')];
  return Array.from(new Set(merged)).slice(0, 8);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ surah: string }> }
) {
  const { surah: rawSurah } = await context.params;
  const surahNumber = parsePositiveIntParam(rawSurah);
  if (surahNumber === null || !isValidSurah(surahNumber)) {
    return NextResponse.json({ error: 'Surah number must be between 1 and 114.' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const editions = sanitizeEditionsParam(searchParams.get('editions'));
  const cacheKey = `${surahNumber}:${editions.join(',')}`;
  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
  };

  const cached = getCachedSurah(cacheKey);
  if (cached !== undefined) {
    return NextResponse.json(cached, { headers: cacheHeaders });
  }

  try {
    const upstreamUrl = `${ALQURAN_SURAH_BASE}/${surahNumber}/editions/${editions.join(',')}`;
    const res = await fetchWithTimeout(upstreamUrl, { method: 'GET' }, PUBLIC_TIMEOUT_MS, req.signal);
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Unable to load surah recitation from upstream Quran service.' },
        { status: 502 }
      );
    }

    const payload: unknown = await res.json();
    if (!isObjectRecord(payload) || payload.code !== 200 || !Array.isArray(payload.data)) {
      return NextResponse.json(
        { error: 'Unexpected upstream surah payload.' },
        { status: 502 }
      );
    }

    setCachedSurah(cacheKey, payload);
    return NextResponse.json(payload, { headers: cacheHeaders });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError' && req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return NextResponse.json(
      { error: 'Surah data service is temporarily unavailable.' },
      { status: 502 }
    );
  }
}
