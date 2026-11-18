import type {
  CanonicalVerseRef,
  GroundingMetadata,
  GroundingSource,
} from '@/lib/quran/types';

export interface ExplainHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ExplainSource = GroundingSource;
export type CanonicalVerse = CanonicalVerseRef;
export type ExplainMetadata = GroundingMetadata;

export interface ExplainRequestPayload {
  ayahText: string;
  translation?: string;
  surahNumber?: number | null;
  ayahNumber?: number | null;
  translationEditions?: string[];
  isSearch?: boolean;
  history?: ExplainHistoryMessage[];
}

export interface ExplainStreamCallbacks {
  onStatus?: (status: string) => void;
  onToken?: (token: string, accumulated: string) => void;
  onMetadata?: (metadata: ExplainMetadata) => void;
  onDone?: (fullText: string, metadata: ExplainMetadata | null) => void;
  onError?: (message: string) => void;
}

export interface ExplainStreamResult {
  text: string;
  metadata: ExplainMetadata | null;
  aborted: boolean;
  error?: string;
}

export type ParsedSseEvent =
  | { kind: 'status'; status: string }
  | { kind: 'token'; token: string }
  | { kind: 'metadata'; metadata: ExplainMetadata }
  | { kind: 'done' }
  | { kind: 'error'; error: string }
  | { kind: 'ignore' };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSourceItem(raw: unknown): ExplainSource | null {
  if (!isObjectRecord(raw)) return null;
  const type = raw.type;
  if (type !== 'quran' && type !== 'tafsir' && type !== 'web') return null;
  if (typeof raw.label !== 'string' || typeof raw.reference !== 'string') return null;
  return {
    type,
    label: raw.label,
    reference: raw.reference,
    ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
  };
}

function parseCanonicalVerse(raw: unknown): CanonicalVerse | null {
  if (!isObjectRecord(raw)) return null;
  if (
    typeof raw.surah !== 'number' ||
    typeof raw.ayah !== 'number' ||
    typeof raw.arabic !== 'string' ||
    typeof raw.translation !== 'string' ||
    typeof raw.edition !== 'string'
  ) {
    return null;
  }
  return {
    surah: raw.surah,
    ayah: raw.ayah,
    arabic: raw.arabic,
    translation: raw.translation,
    edition: raw.edition,
  };
}

export function parseExplainMetadata(raw: unknown): ExplainMetadata | null {
  if (!isObjectRecord(raw)) return null;
  const verified = raw.verified === true;
  const refusal = raw.refusal === true;
  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .map(parseSourceItem)
        .filter((item): item is ExplainSource => item !== null)
    : [];
  const canonicalVerse = parseCanonicalVerse(raw.canonicalVerse);
  return { verified, refusal, sources, canonicalVerse };
}

export function parseSseEventLine(line: string): ParsedSseEvent {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return { kind: 'ignore' };
  }
  const jsonText = trimmed.slice(5).trim();
  if (!jsonText) {
    return { kind: 'ignore' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { kind: 'ignore' };
  }

  if (!isObjectRecord(parsed)) {
    return { kind: 'ignore' };
  }
  if (typeof parsed.status === 'string') {
    return { kind: 'status', status: parsed.status };
  }
  if (typeof parsed.token === 'string') {
    return { kind: 'token', token: parsed.token };
  }
  if ('metadata' in parsed) {
    const metadata = parseExplainMetadata(parsed.metadata);
    if (metadata) {
      return { kind: 'metadata', metadata };
    }
  }
  if (typeof parsed.error === 'string') {
    return { kind: 'error', error: parsed.error };
  }
  if (parsed.done === true) {
    return { kind: 'done' };
  }
  return { kind: 'ignore' };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (isObjectRecord(data) && typeof data.error === 'string') {
      return data.error;
    }
  } catch {
    // Fall back to HTTP status text.
  }
  return res.statusText || `Request failed with status ${res.status}`;
}

function handleJsonFallback(
  data: unknown,
  callbacks?: ExplainStreamCallbacks
): ExplainStreamResult {
  if (!isObjectRecord(data) || typeof data.explanation !== 'string') {
    const error = 'Unexpected response from AI service.';
    callbacks?.onError?.(error);
    return { text: '', metadata: null, aborted: false, error };
  }
  const metadata = parseExplainMetadata(data);
  if (metadata) {
    callbacks?.onMetadata?.(metadata);
  }
  if (data.explanation.length > 0) {
    callbacks?.onToken?.(data.explanation, data.explanation);
  }
  callbacks?.onDone?.(data.explanation, metadata);
  return { text: data.explanation, metadata, aborted: false };
}

interface SseAccumulator {
  fullText: string;
  metadata: ExplainMetadata | null;
  done: boolean;
  error?: string;
}

function processSseLines(
  lines: readonly string[],
  acc: SseAccumulator,
  callbacks?: ExplainStreamCallbacks
): void {
  for (const line of lines) {
    const event = parseSseEventLine(line);
    if (event.kind === 'status') {
      callbacks?.onStatus?.(event.status);
    } else if (event.kind === 'token') {
      acc.fullText += event.token;
      callbacks?.onToken?.(event.token, acc.fullText);
    } else if (event.kind === 'metadata') {
      acc.metadata = event.metadata;
      callbacks?.onMetadata?.(event.metadata);
    } else if (event.kind === 'error') {
      acc.error = event.error;
      acc.done = true;
      callbacks?.onError?.(event.error);
      return;
    } else if (event.kind === 'done') {
      acc.done = true;
      return;
    }
  }
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  callbacks?: ExplainStreamCallbacks
): Promise<ExplainStreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const acc: SseAccumulator = { fullText: '', metadata: null, done: false };

  while (!acc.done) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    }
    if (done) {
      buffer += decoder.decode().replace(/\r\n/g, '\n');
      if (buffer.length > 0) {
        processSseLines(buffer.split('\n'), acc, callbacks);
      }
      break;
    }
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    processSseLines(lines, acc, callbacks);
  }

  if (acc.error !== undefined) {
    return { text: acc.fullText, metadata: acc.metadata, aborted: false, error: acc.error };
  }
  callbacks?.onDone?.(acc.fullText, acc.metadata);
  return { text: acc.fullText, metadata: acc.metadata, aborted: false };
}

function mapStreamError(
  err: unknown,
  callbacks?: ExplainStreamCallbacks,
  signal?: AbortSignal
): ExplainStreamResult {
  const isAbortBySignal = signal?.aborted === true;
  const isAbortException =
    (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError';
  if (isAbortBySignal || isAbortException) {
    return { text: '', metadata: null, aborted: true };
  }
  const message =
    err instanceof Error ? err.message : 'Unable to reach the AI service.';
  callbacks?.onError?.(message);
  return { text: '', metadata: null, aborted: false, error: message };
}

async function processExplainResponse(
  res: Response,
  callbacks?: ExplainStreamCallbacks
): Promise<ExplainStreamResult> {
  if (!res.ok) {
    const error = await readErrorMessage(res);
    callbacks?.onError?.(error);
    return { text: '', metadata: null, aborted: false, error };
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data: unknown = await res.json();
    return handleJsonFallback(data, callbacks);
  }

  if (!res.body) {
    const error = 'Empty response stream from AI service.';
    callbacks?.onError?.(error);
    return { text: '', metadata: null, aborted: false, error };
  }

  return consumeSseStream(res.body, callbacks);
}

export async function streamExplain(
  payload: ExplainRequestPayload,
  callbacks?: ExplainStreamCallbacks,
  signal?: AbortSignal
): Promise<ExplainStreamResult> {
  try {
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal,
    });
    return await processExplainResponse(res, callbacks);
  } catch (err) {
    return mapStreamError(err, callbacks, signal);
  }
}
