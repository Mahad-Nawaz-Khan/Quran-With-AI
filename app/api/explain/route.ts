import { NextResponse } from 'next/server';
import {
  fetchWithTimeout,
  getBackendBaseUrl,
  getMaxAyahs,
  getSurahMeta,
  isObjectRecord,
  isValidReference,
  isValidSurah,
} from '@/app/api/_lib/backendProxy';

const EDITION_ID_REGEX = /^[a-z0-9._-]{2,40}$/i;
const COLON_REF_REGEX = /(-?\d+):(-?\d+)\b/g;
const SURAH_MENTION_REGEX = /\bsurah\s+(-?\d+)\b/gi;
const WORD_CHAR_REGEX = /\w/;
const BACKEND_TIMEOUT_MS = 45_000;
const MAX_TEXT_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 12;

interface ValidatedHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface ValidatedExplainPayload {
  ayahText: string;
  translation: string;
  surahNumber: number | null;
  ayahNumber: number | null;
  translationEditions: string[];
  isSearch: boolean;
  history: ValidatedHistoryItem[];
}

type ValidationResult =
  | { ok: true; payload: ValidatedExplainPayload }
  | { ok: false; error: string };

function validateSurahAndAyah(
  rawSurah: unknown,
  rawAyah: unknown
): { ok: true; surahNumber: number | null; ayahNumber: number | null } | { ok: false; error: string } {
  const surahNumber = rawSurah === undefined ? null : rawSurah;
  const ayahNumber = rawAyah === undefined ? null : rawAyah;

  if (surahNumber !== null && (typeof surahNumber !== 'number' || !Number.isInteger(surahNumber))) {
    return { ok: false, error: 'surahNumber must be null or an integer.' };
  }

  if (ayahNumber === null) {
    return { ok: true, surahNumber, ayahNumber: null };
  }

  if (typeof ayahNumber !== 'number' || !Number.isInteger(ayahNumber) || surahNumber === null) {
    return { ok: false, error: 'ayahNumber requires a valid surahNumber and must be an integer.' };
  }

  return { ok: true, surahNumber, ayahNumber };
}

function checkSingleReferenceBounds(
  surahNumber: number,
  ayahNumber: number | null
): string | null {
  if (!isValidSurah(surahNumber)) {
    return `Invalid Surah number ${surahNumber}. The Quran has exactly 114 Surahs (1–114).`;
  }
  if (ayahNumber !== null && !isValidReference(surahNumber, ayahNumber)) {
    const maxAyahs = getMaxAyahs(surahNumber);
    const meta = getSurahMeta(surahNumber);
    const surahName = meta ? meta.englishName : `Surah ${surahNumber}`;
    return `Invalid Ayah reference ${surahNumber}:${ayahNumber}. ${surahName} (Surah ${surahNumber}) has ${maxAyahs} ayahs (valid range: 1–${maxAyahs}).`;
  }
  return null;
}

function parseColonRefMatch(
  match: RegExpMatchArray,
  text: string
): { surah: number; ayah: number } | null {
  const rawSurah = match[1];
  const rawAyah = match[2];
  const idx = match.index ?? 0;
  const prevChar = idx > 0 ? text[idx - 1] : '';
  const hasWordPrefix = prevChar.length > 0 && WORD_CHAR_REGEX.exec(prevChar) !== null;
  if (!rawSurah.startsWith('-') && hasWordPrefix) {
    return null;
  }
  const surahToken = rawSurah.startsWith('-') && hasWordPrefix ? rawSurah.slice(1) : rawSurah;
  return {
    surah: Number.parseInt(surahToken, 10),
    ayah: Number.parseInt(rawAyah, 10),
  };
}

function findOutOfBoundsReason(payload: ValidatedExplainPayload): string | null {
  if (payload.surahNumber !== null) {
    const fieldError = checkSingleReferenceBounds(payload.surahNumber, payload.ayahNumber);
    if (fieldError !== null) {
      return fieldError;
    }
  }
  if (!payload.isSearch) {
    return null;
  }
  for (const match of payload.ayahText.matchAll(COLON_REF_REGEX)) {
    const parsed = parseColonRefMatch(match, payload.ayahText);
    if (parsed === null) continue;
    const refError = checkSingleReferenceBounds(parsed.surah, parsed.ayah);
    if (refError !== null) {
      return refError;
    }
  }
  for (const match of payload.ayahText.matchAll(SURAH_MENTION_REGEX)) {
    const surah = Number.parseInt(match[1], 10);
    const surahError = checkSingleReferenceBounds(surah, null);
    if (surahError !== null) {
      return surahError;
    }
  }
  return null;
}

function buildJsonRefusalResponse(explanation: string): Response {
  return NextResponse.json(
    {
      explanation,
      verified: true,
      refusal: true,
      sources: [],
      canonicalVerse: null,
    },
    { status: 200 }
  );
}

function buildSseRefusalResponse(explanation: string): Response {
  const events = [
    `data: ${JSON.stringify({ status: 'Validating reference bounds...' })}\n\n`,
    `data: ${JSON.stringify({ token: explanation })}\n\n`,
    `data: ${JSON.stringify({
      metadata: {
        verified: true,
        refusal: true,
        sources: [],
        canonicalVerse: null,
      },
    })}\n\n`,
    'data: {"done":true}\n\n',
  ].join('');

  return new Response(events, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function validateHistory(rawHistory: unknown): ValidatedHistoryItem[] | null {
  if (rawHistory === undefined) return [];
  if (!Array.isArray(rawHistory) || rawHistory.length > MAX_HISTORY_ITEMS) {
    return null;
  }
  const validated: ValidatedHistoryItem[] = [];
  for (const item of rawHistory) {
    if (!isObjectRecord(item)) return null;
    if (item.role !== 'user' && item.role !== 'assistant') return null;
    if (typeof item.content !== 'string') return null;
    const trimmed = item.content.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return null;
    validated.push({ role: item.role, content: trimmed });
  }
  return validated;
}

function validateEditions(rawEditions: unknown): string[] | null {
  if (rawEditions === undefined) return ['en.sahih'];
  if (!Array.isArray(rawEditions) || rawEditions.length > 3) return null;
  const validated: string[] = [];
  for (const item of rawEditions) {
    if (typeof item !== 'string' || !EDITION_ID_REGEX.exec(item.trim())) {
      return null;
    }
    validated.push(item.trim());
  }
  return validated.length > 0 ? validated : ['en.sahih'];
}

function validateExplainBody(raw: unknown): ValidationResult {
  if (!isObjectRecord(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (typeof raw.ayahText !== 'string') {
    return { ok: false, error: 'ayahText is required.' };
  }
  const ayahText = raw.ayahText.trim();
  if (ayahText.length === 0 || ayahText.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: 'ayahText must be between 1 and 2000 characters.' };
  }

  const rawTranslation = raw.translation ?? '';
  if (typeof rawTranslation !== 'string' || rawTranslation.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: 'translation must be a string up to 2000 characters.' };
  }

  const rawIsSearch = raw.isSearch ?? false;
  if (typeof rawIsSearch !== 'boolean') {
    return { ok: false, error: 'isSearch must be a boolean.' };
  }

  const refResult = validateSurahAndAyah(raw.surahNumber, raw.ayahNumber);
  if (!refResult.ok) {
    return refResult;
  }

  const history = validateHistory(raw.history);
  if (!history) {
    return { ok: false, error: 'history must contain up to 12 valid messages.' };
  }

  const translationEditions = validateEditions(raw.translationEditions);
  if (!translationEditions) {
    return { ok: false, error: 'translationEditions must contain up to 3 valid edition IDs.' };
  }

  return {
    ok: true,
    payload: {
      ayahText,
      translation: rawTranslation,
      surahNumber: refResult.surahNumber,
      ayahNumber: refResult.ayahNumber,
      translationEditions,
      isSearch: rawIsSearch,
      history,
    },
  };
}

async function fetchUpstreamExplain(
  targetUrl: string,
  payload: ValidatedExplainPayload,
  signal: AbortSignal
): Promise<Response> {
  return fetchWithTimeout(
    targetUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    BACKEND_TIMEOUT_MS,
    signal
  );
}

async function forwardExplainStream(
  targetUrl: string,
  payload: ValidatedExplainPayload,
  signal: AbortSignal
): Promise<Response> {
  const upstream = await fetchUpstreamExplain(targetUrl, payload, signal);
  if (!upstream.ok || !upstream.body) {
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return NextResponse.json(
      { error: 'AI service is temporarily unavailable.' },
      { status }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function forwardExplainJson(
  targetUrl: string,
  payload: ValidatedExplainPayload,
  signal: AbortSignal
): Promise<Response> {
  const upstream = await fetchUpstreamExplain(targetUrl, payload, signal);
  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => '');
    console.error('Backend explain error:', upstream.status, errorText);
    const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    return NextResponse.json(
      { error: 'Failed to generate explanation.' },
      { status }
    );
  }

  const data: unknown = await upstream.json();
  return NextResponse.json(data);
}

function handleExplainError(error: unknown, signal?: AbortSignal): Response {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return NextResponse.json(
      { error: 'AI request timed out. Please try again.' },
      { status: 504 }
    );
  }
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return new Response(null, { status: 499 });
  }
  console.error('Explain proxy error:', error);
  return NextResponse.json(
    { error: 'AI service is currently unreachable.' },
    { status: 502 }
  );
}

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const validation = validateExplainBody(rawBody);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const acceptHeader = req.headers.get('accept') ?? '';
  const wantsStream = acceptHeader.includes('text/event-stream');

  const outOfBoundsReason = findOutOfBoundsReason(validation.payload);
  if (outOfBoundsReason !== null) {
    if (wantsStream) {
      return buildSseRefusalResponse(outOfBoundsReason);
    }
    return buildJsonRefusalResponse(outOfBoundsReason);
  }

  const baseUrl = getBackendBaseUrl();

  try {
    if (wantsStream) {
      return await forwardExplainStream(
        `${baseUrl}/explain-stream`,
        validation.payload,
        req.signal
      );
    }
    return await forwardExplainJson(
      `${baseUrl}/explain`,
      validation.payload,
      req.signal
    );
  } catch (error) {
    return handleExplainError(error, req.signal);
  }
}
