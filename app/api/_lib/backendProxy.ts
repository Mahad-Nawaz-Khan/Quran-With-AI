import {
  SURAH_METADATA,
  getMaxAyahs,
  getSurahMeta,
  isValidReference,
  isValidSurah,
} from '@/lib/quran/surahMetadata';

const POSITIVE_INT_REGEX = /^\d{1,4}$/;
const TRAILING_SLASH_REGEX = /\/+$/;

export function getBackendBaseUrl(): string {
  const configured = process.env.PYTHON_BACKEND_URL ?? 'http://127.0.0.1:8000';
  return configured.replace(TRAILING_SLASH_REGEX, '');
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePositiveIntParam(raw: string): number | null {
  const match = POSITIVE_INT_REGEX.exec(raw.trim());
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export {
  SURAH_METADATA,
  getMaxAyahs,
  getSurahMeta,
  isValidReference,
  isValidSurah,
};
