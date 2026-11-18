import { NextResponse } from 'next/server';
import {
  fetchWithTimeout,
  getBackendBaseUrl,
  isObjectRecord,
  isValidReference,
  parsePositiveIntParam,
} from '@/app/api/_lib/backendProxy';

const SLUG_REGEX = /^[a-z0-9-]{2,60}$/i;
const DEFAULT_SLUG = 'en-tafisr-ibn-kathir';
const BACKEND_TIMEOUT_MS = 4_000;
const PUBLIC_TIMEOUT_MS = 8_000;

interface TafsirMapping {
  readonly resourceId: number | null;
  readonly cdnSlug: string;
  readonly name: string;
}

const TAFSIR_SLUG_MAP: Record<string, TafsirMapping> = {
  'en-tafisr-ibn-kathir': {
    resourceId: 169,
    cdnSlug: 'en-tafisr-ibn-kathir',
    name: 'Tafsir Ibn Kathir (Abridged)',
  },
  'en-tafsir-ibn-kathir': {
    resourceId: 169,
    cdnSlug: 'en-tafisr-ibn-kathir',
    name: 'Tafsir Ibn Kathir (Abridged)',
  },
  'en-tafsir-maarif-ul-quran': {
    resourceId: 168,
    cdnSlug: 'en-tafsir-maarif-ul-quran',
    name: "Ma'arif al-Qur'an",
  },
  'tazkirul-quran-en': {
    resourceId: 817,
    cdnSlug: 'en-tazkirul-quran',
    name: 'Tazkirul Quran',
  },
  'en-al-jalalayn': {
    resourceId: null,
    cdnSlug: 'en-al-jalalayn',
    name: 'Tafsir al-Jalalayn',
  },
  'en-asbab-al-nuzul-by-al-wahidi': {
    resourceId: null,
    cdnSlug: 'en-asbab-al-nuzul-by-al-wahidi',
    name: 'Asbab al-Nuzul (Al-Wahidi)',
  },
  'ar-tafsir-muyassar': {
    resourceId: 16,
    cdnSlug: 'ar-tafsir-muyassar',
    name: 'التفسير الميسر',
  },
  'ar-tafsir-ibn-kathir': {
    resourceId: 14,
    cdnSlug: 'ar-tafsir-ibn-kathir',
    name: 'تفسير ابن كثير',
  },
  'ar-tafsir-al-tabari': {
    resourceId: 15,
    cdnSlug: 'ar-tafsir-al-tabari',
    name: 'تفسير الطبري',
  },
  'tafseer-ibn-e-kaseer-urdu': {
    resourceId: 160,
    cdnSlug: 'ur-tafseer-ibn-e-kaseer',
    name: 'تفسیر ابن کثیر (اردو)',
  },
};

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#8217;': '\u2019',
  '&rsquo;': '\u2019',
  '&lsquo;': '\u2018',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
};

const ENTITY_REGEX = /&[a-z0-9#]+;/gi;
const TAG_TERMINATOR_REGEX = /[\s>/]/;
const DANGEROUS_OPEN_PREFIXES = ['<script', '<style'] as const;

function isTagNameTerminator(char: string | undefined): boolean {
  return char === undefined || TAG_TERMINATOR_REGEX.test(char);
}

function findNextTagIndex(lower: string, prefix: string, fromIndex: number): number {
  let pos = fromIndex;
  while (pos < lower.length) {
    const idx = lower.indexOf(prefix, pos);
    if (idx === -1) return -1;
    if (isTagNameTerminator(lower[idx + prefix.length])) {
      return idx;
    }
    pos = idx + prefix.length;
  }
  return -1;
}

function findLastTagIndexBefore(lower: string, prefix: string, beforeIndex: number): number {
  let pos = beforeIndex;
  while (pos >= 0) {
    const idx = lower.lastIndexOf(prefix, pos);
    if (idx === -1) return -1;
    if (isTagNameTerminator(lower[idx + prefix.length])) {
      return idx;
    }
    pos = idx - 1;
  }
  return -1;
}

function trimSplitTagRemnant(
  before: string,
  after: string,
  openPrefix: string,
  removeFrom: number
): string {
  const next = before + after;
  const lowerBefore = before.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
  const lowerNext = next.replace(/[A-Z]/g, (ch) => ch.toLowerCase());

  for (let len = openPrefix.length - 1; len >= 2; len -= 1) {
    const frag = openPrefix.slice(0, len);
    if (!lowerBefore.endsWith(frag)) continue;
    const joinedAt = removeFrom - frag.length;
    const isReformed = DANGEROUS_OPEN_PREFIXES.some(
      (prefix) =>
        lowerNext.startsWith(prefix, joinedAt) &&
        isTagNameTerminator(lowerNext[joinedAt + prefix.length])
    );
    return isReformed ? next : before.slice(0, before.length - frag.length) + after;
  }

  return next;
}

function pickEarliestTag(
  lower: string
): { tagName: 'script' | 'style'; firstOpenIdx: number } | null {
  const scriptOpen = findNextTagIndex(lower, '<script', 0);
  const styleOpen = findNextTagIndex(lower, '<style', 0);
  if (scriptOpen === -1 && styleOpen === -1) return null;
  if (styleOpen !== -1 && (scriptOpen === -1 || styleOpen < scriptOpen)) {
    return { tagName: 'style', firstOpenIdx: styleOpen };
  }
  return { tagName: 'script', firstOpenIdx: scriptOpen };
}

function stripDangerousBlocks(html: string): string {
  let current = html;
  const maxIterations = html.length + 1;

  for (let i = 0; i < maxIterations; i += 1) {
    const lower = current.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
    const earliest = pickEarliestTag(lower);
    if (!earliest) return current;

    const openPrefix = `<${earliest.tagName}`;
    const closePrefix = `</${earliest.tagName}`;
    const closeIdx = findNextTagIndex(
      lower,
      closePrefix,
      earliest.firstOpenIdx + openPrefix.length
    );
    if (closeIdx === -1) {
      return current.slice(0, earliest.firstOpenIdx);
    }

    const openIdx = findLastTagIndexBefore(lower, openPrefix, closeIdx);
    const removeFrom = openIdx === -1 ? earliest.firstOpenIdx : openIdx;
    const closeEnd = current.indexOf('>', closeIdx + closePrefix.length);
    if (closeEnd === -1) {
      return current.slice(0, removeFrom);
    }

    current = trimSplitTagRemnant(
      current.slice(0, removeFrom),
      current.slice(closeEnd + 1),
      openPrefix,
      removeFrom
    );
  }

  return current;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY_REGEX, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity);
}

function sanitizeTafsirText(rawHtml: string): string {
  const withoutDangerous = stripDangerousBlocks(rawHtml);
  const stripped = withoutDangerous
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(stripped)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchFromQuranCom(
  surah: number,
  ayah: number,
  resourceId: number,
  signal?: AbortSignal
): Promise<{ text: string; sourceUrl: string } | null> {
  const url = `https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?tafsirs=${resourceId}`;
  const res = await fetchWithTimeout(url, { method: 'GET' }, PUBLIC_TIMEOUT_MS, signal);
  if (!res.ok) return null;

  const json: unknown = await res.json();
  if (!isObjectRecord(json) || !isObjectRecord(json.verse)) return null;
  const tafsirs = Array.isArray(json.verse.tafsirs) ? json.verse.tafsirs : [];
  const first = tafsirs[0];
  if (!isObjectRecord(first) || typeof first.text !== 'string') return null;

  const text = sanitizeTafsirText(first.text);
  if (!text) return null;

  return {
    text,
    sourceUrl: `https://quran.com/${surah}:${ayah}/tafsirs`,
  };
}

async function fetchFromJsDelivr(
  surah: number,
  ayah: number,
  cdnSlug: string,
  signal?: AbortSignal
): Promise<{ text: string; sourceUrl: string } | null> {
  const url = `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@v1/tafsir/${encodeURIComponent(cdnSlug)}/${surah}/${ayah}.json`;
  const res = await fetchWithTimeout(url, { method: 'GET' }, PUBLIC_TIMEOUT_MS, signal);
  if (!res.ok) return null;

  const json: unknown = await res.json();
  if (!isObjectRecord(json) || typeof json.text !== 'string') return null;
  const text = sanitizeTafsirText(json.text);
  if (!text) return null;

  return { text, sourceUrl: url };
}

async function tryBackendTafsir(
  surah: number,
  ayah: number,
  slug: string,
  cacheHeaders: Record<string, string>,
  signal?: AbortSignal
): Promise<Response | null> {
  try {
    const backendUrl = `${getBackendBaseUrl()}/quran/tafsir/${surah}/${ayah}?slug=${encodeURIComponent(slug)}`;
    const upstream = await fetchWithTimeout(
      backendUrl,
      { method: 'GET' },
      BACKEND_TIMEOUT_MS,
      signal
    );
    if (upstream.ok) {
      const payload: unknown = await upstream.json();
      if (isObjectRecord(payload) && typeof payload.text === 'string') {
        const sanitizedText = sanitizeTafsirText(payload.text);
        if (sanitizedText) {
          return NextResponse.json(
            { ...payload, text: sanitizedText },
            { headers: cacheHeaders }
          );
        }
      }
    }
    if (upstream.status === 400) {
      return NextResponse.json({ error: 'Unsupported tafsir slug.' }, { status: 400 });
    }
  } catch {
    if (signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    // Fall through to authoritative public Tafsir fallbacks.
  }
  return null;
}

async function tryPublicTafsirFallback(
  surah: number,
  ayah: number,
  slug: string,
  mapping: TafsirMapping,
  cacheHeaders: Record<string, string>,
  signal?: AbortSignal
): Promise<Response | null> {
  if (mapping.resourceId !== null) {
    try {
      const quranComResult = await fetchFromQuranCom(
        surah,
        ayah,
        mapping.resourceId,
        signal
      );
      if (quranComResult) {
        return NextResponse.json(
          {
            surah,
            ayah,
            slug,
            tafsirName: mapping.name,
            sourceUrl: quranComResult.sourceUrl,
            text: quranComResult.text,
          },
          { headers: cacheHeaders }
        );
      }
    } catch (error) {
      if (signal?.aborted) {
        return new Response(null, { status: 499 });
      }
      console.error('Quran.com tafsir fallback error:', error);
    }
  }

  try {
    const cdnResult = await fetchFromJsDelivr(surah, ayah, mapping.cdnSlug, signal);
    if (cdnResult) {
      return NextResponse.json(
        {
          surah,
          ayah,
          slug,
          tafsirName: mapping.name,
          sourceUrl: cdnResult.sourceUrl,
          text: cdnResult.text,
        },
        { headers: cacheHeaders }
      );
    }
  } catch (error) {
    if (signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error('jsDelivr tafsir fallback error:', error);
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

  const { searchParams } = new URL(req.url);
  const rawSlug = (searchParams.get('slug') ?? DEFAULT_SLUG).trim();
  if (!SLUG_REGEX.exec(rawSlug)) {
    return NextResponse.json({ error: 'Invalid tafsir slug.' }, { status: 400 });
  }
  const slug = rawSlug.toLowerCase();
  if (!Object.hasOwn(TAFSIR_SLUG_MAP, slug)) {
    return NextResponse.json({ error: 'Unsupported tafsir slug.' }, { status: 400 });
  }

  const cacheHeaders = {
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
  };

  const backendResponse = await tryBackendTafsir(surah, ayah, slug, cacheHeaders, req.signal);
  if (backendResponse) {
    return backendResponse;
  }

  const mapping = TAFSIR_SLUG_MAP[slug];

  const fallbackResponse = await tryPublicTafsirFallback(
    surah,
    ayah,
    slug,
    mapping,
    cacheHeaders,
    req.signal
  );
  if (fallbackResponse) {
    return fallbackResponse;
  }

  return NextResponse.json(
    { error: 'Tafsir is currently unavailable.' },
    { status: 502 }
  );
}
