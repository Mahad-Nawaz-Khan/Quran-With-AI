export interface TajweedRuleInfo {
  code: string;
  className: string;
  label: string;
}

export interface TajweedSegment {
  id: string;
  text: string;
  rule: TajweedRuleInfo | null;
}

const TAJWEED_RULE_MAP: Record<string, TajweedRuleInfo> = {
  h: { code: 'h', className: 'tajweed-silent', label: 'Hamzat ul Wasl' },
  l: { code: 'l', className: 'tajweed-silent', label: 'Lam Shamsiyyah' },
  s: { code: 's', className: 'tajweed-silent', label: 'Silent letter' },
  n: { code: 'n', className: 'tajweed-madd-normal', label: 'Madd Normal (2)' },
  p: { code: 'p', className: 'tajweed-madd-permissible', label: 'Madd Permissible (2/4/6)' },
  o: { code: 'o', className: 'tajweed-madd-obligatory', label: 'Madd Obligatory (4/5)' },
  m: { code: 'm', className: 'tajweed-madd-necessary', label: 'Madd Necessary (6)' },
  q: { code: 'q', className: 'tajweed-qalqalah', label: 'Qalqalah' },
  c: { code: 'c', className: 'tajweed-ikhfa', label: 'Ikhfa Shafawi' },
  f: { code: 'f', className: 'tajweed-ikhfa', label: 'Ikhfa' },
  w: { code: 'w', className: 'tajweed-idgham', label: 'Idgham Shafawi' },
  i: { code: 'i', className: 'tajweed-iqlab', label: 'Iqlab' },
  a: { code: 'a', className: 'tajweed-ghunnah', label: 'Idgham with Ghunnah' },
  u: { code: 'u', className: 'tajweed-silent', label: 'Idgham without Ghunnah' },
  d: { code: 'd', className: 'tajweed-idgham', label: 'Idgham Mutajanisayn' },
  b: { code: 'b', className: 'tajweed-idgham', label: 'Idgham Mutaqaribayn' },
  g: { code: 'g', className: 'tajweed-ghunnah', label: 'Ghunnah (2)' },
};

const BISMILLAH_BASE_LETTERS = 'بسماللهالرحمنالرحيم';
const ARABIC_DIACRITIC_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06ED]/;
const TAG_BODY_REGEX = /^[a-zA-Z0-9:]{1,12}$/;

function resolveRule(tagBody: string): TajweedRuleInfo | null {
  const code = tagBody.charAt(0).toLowerCase();
  return TAJWEED_RULE_MAP[code] ?? null;
}

function tryReadTagOpener(input: string, index: number): { rule: TajweedRuleInfo | null; nextIndex: number } | null {
  if (input.charAt(index) !== '[') return null;
  const secondBracket = input.indexOf('[', index + 1);
  if (secondBracket === -1 || secondBracket - index > 14) return null;
  const tagBody = input.slice(index + 1, secondBracket);
  if (!TAG_BODY_REGEX.test(tagBody)) return null;
  return { rule: resolveRule(tagBody), nextIndex: secondBracket + 1 };
}

function appendSegmentChar(segments: TajweedSegment[], char: string, rule: TajweedRuleInfo | null): void {
  const last = segments.at(-1);
  if (last && last.rule?.code === rule?.code) {
    last.text += char;
    return;
  }
  const code = rule?.code ?? 'plain';
  segments.push({
    id: `${code}-${segments.length}`,
    text: char,
    rule,
  });
}

/**
 * Parse Al-Quran Cloud `[rule[:id][text]]` tajweed bracket markup into display segments.
 */
export function parseTajweedSegments(tajweedText: string): TajweedSegment[] {
  const segments: TajweedSegment[] = [];
  const stack: (TajweedRuleInfo | null)[] = [];
  let i = 0;

  while (i < tajweedText.length) {
    const opener = tryReadTagOpener(tajweedText, i);
    if (opener) {
      stack.push(opener.rule);
      i = opener.nextIndex;
      continue;
    }

    const ch = tajweedText.charAt(i);
    if (ch === ']' && stack.length > 0) {
      stack.pop();
      i += 1;
      continue;
    }

    const activeRule = stack.at(-1) ?? null;
    appendSegmentChar(segments, ch, activeRule);
    i += 1;
  }

  return segments;
}

function isArabicDiacriticOrSpace(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\u00A0' ||
    ch === '\u0640' ||
    ch === '\uFEFF' ||
    ARABIC_DIACRITIC_REGEX.test(ch)
  );
}

function findBismillahCutoffIndex(plainText: string): number {
  let matched = 0;
  let i = 0;

  while (i < plainText.length && matched < BISMILLAH_BASE_LETTERS.length) {
    const ch = plainText.charAt(i);
    if (!isArabicDiacriticOrSpace(ch)) {
      const normalized = ch === 'ٱ' ? 'ا' : ch;
      if (normalized !== BISMILLAH_BASE_LETTERS.charAt(matched)) {
        return 0;
      }
      matched += 1;
    }
    i += 1;
  }

  if (matched < BISMILLAH_BASE_LETTERS.length) return 0;

  while (i < plainText.length && isArabicDiacriticOrSpace(plainText.charAt(i))) {
    i += 1;
  }
  return i;
}

function sliceSegmentsFromOffset(segments: TajweedSegment[], startOffset: number): TajweedSegment[] {
  if (startOffset <= 0) return segments;
  const sliced: TajweedSegment[] = [];
  let cursor = 0;

  for (const seg of segments) {
    const segEnd = cursor + seg.text.length;
    if (segEnd <= startOffset) {
      cursor = segEnd;
      continue;
    }
    const localStart = Math.max(0, startOffset - cursor);
    const trimmed = seg.text.slice(localStart);
    if (trimmed.length > 0) {
      sliced.push({
        id: `${seg.rule?.code ?? 'plain'}-${sliced.length}`,
        text: trimmed,
        rule: seg.rule,
      });
    }
    cursor = segEnd;
  }

  return sliced;
}

/**
 * Parse tajweed text for a specific verse, stripping prepended Bismillah on Surah != 1,9 Ayah 1.
 */
export function buildVerseTajweedSegments(
  tajweedText: string,
  surahNumber: number,
  ayahNumber: number
): TajweedSegment[] {
  const segments = parseTajweedSegments(tajweedText);
  if (surahNumber === 1 || surahNumber === 9 || ayahNumber !== 1) {
    return segments;
  }

  const plainText = segments.map((s) => s.text).join('');
  const cutoff = findBismillahCutoffIndex(plainText);
  return sliceSegmentsFromOffset(segments, cutoff);
}

export const TAJWEED_LEGEND: readonly { className: string; label: string }[] = [
  { className: 'tajweed-ghunnah', label: 'Ghunnah / Idgham w/ Ghunnah' },
  { className: 'tajweed-ikhfa', label: 'Ikhfa' },
  { className: 'tajweed-iqlab', label: 'Iqlab' },
  { className: 'tajweed-qalqalah', label: 'Qalqalah' },
  { className: 'tajweed-madd-normal', label: 'Madd (2)' },
  { className: 'tajweed-madd-permissible', label: 'Madd (2/4/6)' },
  { className: 'tajweed-madd-obligatory', label: 'Madd (4/5/6)' },
  { className: 'tajweed-silent', label: 'Silent / Assimilated' },
];
