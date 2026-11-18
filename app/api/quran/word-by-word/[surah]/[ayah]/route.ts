import { NextResponse } from 'next/server';
import {
  fetchWithTimeout,
  getBackendBaseUrl,
  isObjectRecord,
  isValidReference,
  parsePositiveIntParam,
} from '@/app/api/_lib/backendProxy';

const BACKEND_TIMEOUT_MS = 4_000;
const PUBLIC_TIMEOUT_MS = 8_000;

interface WordItemDto {
  position: number;
  arabic: string;
  transliteration: string;
  translation: string;
  root: string | null;
}

function mapQuranComWord(raw: unknown): WordItemDto | null {
  if (!isObjectRecord(raw)) return null;
  if (raw.char_type_name === 'end') return null;

  const position = typeof raw.position === 'number' ? raw.position : 0;
  const arabic = typeof raw.text_uthmani === 'string' ? raw.text_uthmani : '';
  const transliteration =
    isObjectRecord(raw.transliteration) && typeof raw.transliteration.text === 'string'
      ? raw.transliteration.text
      : '';
  const translation =
    isObjectRecord(raw.translation) && typeof raw.translation.text === 'string'
      ? raw.translation.text
      : '';

  if (position <= 0 || !arabic) return null;

  return {
    position,
    arabic,
    transliteration,
    translation,
    root: null,
  };
}

async function tryBackendWordByWord(
  surah: number,
  ayah: number,
  cacheHeaders: Record<string, string>,
  signal?: AbortSignal
): Promise<Response | null> {
  try {
    const backendUrl = `${getBackendBaseUrl()}/quran/word-by-word/${surah}/${ayah}`;
    const upstream = await fetchWithTimeout(
      backendUrl,
      { method: 'GET' },
      BACKEND_TIMEOUT_MS,
      signal
    );
    if (upstream.ok) {
      const payload: unknown = await upstream.json();
      if (isObjectRecord(payload) && Array.isArray(payload.words)) {
        return NextResponse.json(payload, { headers: cacheHeaders });
      }
    }
  } catch {
    if (signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    // Fall through to Quran.com v4 word-by-word fallback.
  }
  return null;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ surah: string; ayah: string }> }
) {
  const { surah: surahRaw, ayah: ayahRaw } = await context.params;
  const surah = parsePositiveIntParam(surahRaw);
  const ayah = parsePositiveIntParam(ayahRaw);

  if (surah === null || ayah === null || !isValidReference(surah, ayah)) {
    return NextResponse.json({ error: 'Invalid Quran reference.' }, { status: 400 });
  }

  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
  };

  const backendResponse = await tryBackendWordByWord(surah, ayah, cacheHeaders, req.signal);
  if (backendResponse) {
    return backendResponse;
  }

  try {
    const url = `https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?words=true&word_fields=text_uthmani,location&fields=text_uthmani`;
    const res = await fetchWithTimeout(url, { method: 'GET' }, PUBLIC_TIMEOUT_MS, req.signal);
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Word-by-word data is currently unavailable.' },
        { status: 502 }
      );
    }

    const json: unknown = await res.json();
    if (!isObjectRecord(json) || !isObjectRecord(json.verse) || !Array.isArray(json.verse.words)) {
      return NextResponse.json(
        { error: 'Word-by-word data is currently unavailable.' },
        { status: 502 }
      );
    }

    const words = json.verse.words
      .map(mapQuranComWord)
      .filter((item): item is WordItemDto => item !== null);

    return NextResponse.json({ surah, ayah, words }, { headers: cacheHeaders });
  } catch (error) {
    if (req.signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error('Word-by-word lookup error:', error);
    return NextResponse.json(
      { error: 'Word-by-word data is currently unavailable.' },
      { status: 502 }
    );
  }
}
