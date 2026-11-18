import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { POST as explainPost } from '@/app/api/explain/route';
import { GET as searchGet } from '@/app/api/quran/search/route';
import { GET as tafsirGet } from '@/app/api/quran/tafsir/[surah]/[ayah]/route';
import { GET as wbwGet } from '@/app/api/quran/word-by-word/[surah]/[ayah]/route';
import { parseSseEventLine, streamExplain } from '@/lib/ai/streamClient';
import { buildVerseTajweedSegments, parseTajweedSegments } from '@/lib/quran/tajweed';
import {
  ayahBookmarksStore,
  createPersistentStore,
  languageStore,
  parseAyahBookmarks,
  parseLanguage,
  parseReciter,
  parseReadingProgress,
  parseStudyNotes,
  parseSurahBookmarks,
  parseTheme,
  selectedTranslationsStore,
  themeStore,
} from '@/lib/hooks/usePersistentState';
import {
  LANGUAGE_DIRECTION,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
  type TranslationKey,
  getTranslationDictionary,
  isUILanguage,
  translate,
} from '@/lib/i18n/translations';
import { stripBismillahPrefix } from '@/lib/quran/api';
import {
  JUZ_METADATA,
  TRANSLATION_EDITIONS,
  getReciterMeta,
  getTranslationMeta,
  normalizeTranslationIds,
} from '@/lib/quran/constants';
import { executeSearch, parseSearchIntent, searchSurahsLocally } from '@/lib/quran/search';
import {
  PAGE_STARTS,
  SURAH_METADATA,
  TOTAL_AYAHS,
  TOTAL_JUZ,
  TOTAL_PAGES,
  TOTAL_SURAHS,
  getJuzStart,
  getPageStart,
  isValidReference,
  isValidSurah,
  parseAyahKey,
} from '@/lib/quran/surahMetadata';
import { ALL_TOPIC_VERSE_KEYS, QURAN_TOPICS, getTopicBySlug } from '@/lib/quran/topics';

test('SURAH_METADATA covers all 114 surahs summing to 6236 ayahs', () => {
  assert.equal(SURAH_METADATA.length, TOTAL_SURAHS);
  assert.equal(TOTAL_SURAHS, 114);
  const sum = SURAH_METADATA.reduce((acc, s) => acc + s.ayahCount, 0);
  assert.equal(sum, TOTAL_AYAHS);
  assert.equal(sum, 6236);
  assert.equal(SURAH_METADATA[0].ayahCount, 7);
  assert.equal(SURAH_METADATA[1].ayahCount, 286);
  assert.equal(SURAH_METADATA[113].ayahCount, 6);
  assert.equal(isValidSurah(0), false);
  assert.equal(isValidSurah(115), false);
  assert.equal(isValidReference(2, 286), true);
  assert.equal(isValidReference(2, 287), false);
});

test('JUZ_METADATA has 30 entries with corrected Juz 20 and Juz 21 boundaries', () => {
  assert.equal(JUZ_METADATA.length, TOTAL_JUZ);
  assert.equal(JUZ_METADATA[19].number, 20);
  assert.equal(JUZ_METADATA[19].startSurah, 27);
  assert.equal(JUZ_METADATA[19].startAyah, 56);
  assert.equal(JUZ_METADATA[19].endSurah, 29);
  assert.equal(JUZ_METADATA[19].endAyah, 45);

  assert.equal(JUZ_METADATA[20].number, 21);
  assert.equal(JUZ_METADATA[20].startSurah, 29);
  assert.equal(JUZ_METADATA[20].startAyah, 46);
  assert.equal(JUZ_METADATA[20].endSurah, 33);
  assert.equal(JUZ_METADATA[20].endAyah, 30);

  assert.deepEqual(getJuzStart(20), { surah: 27, ayah: 56 });
  assert.deepEqual(getJuzStart(21), { surah: 29, ayah: 46 });
  assert.equal(getJuzStart(31), null);
});

test('PAGE_STARTS has 604 valid Quran references', () => {
  assert.equal(PAGE_STARTS.length, TOTAL_PAGES);
  assert.equal(TOTAL_PAGES, 604);
  for (const [surah, ayah] of PAGE_STARTS) {
    assert.equal(
      isValidReference(surah, ayah),
      true,
      `Invalid PAGE_STARTS entry ${surah}:${ayah}`
    );
  }
  assert.deepEqual(getPageStart(1), { surah: 1, ayah: 1 });
  assert.deepEqual(getPageStart(604), { surah: 112, ayah: 1 });
  assert.equal(getPageStart(605), null);
});

test('QURAN_TOPICS contains 8 topics with 48 valid references', () => {
  assert.equal(QURAN_TOPICS.length, 8);
  assert.equal(ALL_TOPIC_VERSE_KEYS.length, 48);
  for (const topic of QURAN_TOPICS) {
    assert.equal(topic.verses.length, 6);
    for (const verse of topic.verses) {
      assert.equal(isValidReference(verse.surah, verse.ayah), true);
      assert.equal(verse.key, `${verse.surah}:${verse.ayah}`);
    }
  }
  assert.ok(getTopicBySlug('rabbana-duas'));
  assert.equal(getTopicBySlug('missing-topic'), undefined);
});

test('parseSearchIntent resolves valid references, commands, keywords, and rejects invalid bounds', () => {
  assert.deepEqual(parseSearchIntent('   '), { kind: 'empty' });
  assert.deepEqual(parseSearchIntent('2:255'), {
    kind: 'reference',
    surahNumber: 2,
    ayahNumber: 255,
    href: '/surah/2?ayah=255',
  });

  const invalidSurah = parseSearchIntent('115:1');
  assert.equal(invalidSurah.kind, 'invalid_reference');
  const invalidAyah = parseSearchIntent('2:300');
  assert.equal(invalidAyah.kind, 'invalid_reference');
  assert.equal(parseSearchIntent('0:1').kind, 'invalid_reference');

  assert.deepEqual(parseSearchIntent('36'), {
    kind: 'surah',
    surahNumber: 36,
    href: '/surah/36',
    isExplicitCommand: false,
  });
  assert.deepEqual(parseSearchIntent('surah 36'), {
    kind: 'surah',
    surahNumber: 36,
    href: '/surah/36',
    isExplicitCommand: true,
  });
  assert.equal(parseSearchIntent('surah 115').kind, 'invalid_reference');

  assert.deepEqual(parseSearchIntent('juz 30'), {
    kind: 'juz',
    juzNumber: 30,
    startSurah: 78,
    startAyah: 1,
    href: '/surah/78?ayah=1',
  });
  assert.equal(parseSearchIntent('juz 31').kind, 'invalid_reference');

  assert.deepEqual(parseSearchIntent('page 604'), {
    kind: 'page',
    pageNumber: 604,
    startSurah: 112,
    startAyah: 1,
    href: '/surah/112?ayah=1',
  });
  assert.equal(parseSearchIntent('page 605').kind, 'invalid_reference');

  assert.deepEqual(parseSearchIntent('mercy'), { kind: 'keyword', query: 'mercy' });
  const surahHits = searchSurahsLocally('yasin');
  assert.equal(surahHits[0]?.surahNumber, 36);
});

test('stripBismillahPrefix handles BOM, Surah 1/2/9, Surahs 95/97 shadda, and tajweed', () => {
  const fatiha = '\uFEFFبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
  assert.equal(stripBismillahPrefix(fatiha, 1, 1), 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');

  const baqarah1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ';
  assert.equal(stripBismillahPrefix(baqarah1, 2, 1), 'الٓمٓ');
  assert.equal(stripBismillahPrefix('الٓمٓ', 2, 1), 'الٓمٓ');

  const tawbah1 = 'بَرَآءَةٌ مِّنَ ٱللَّهِ';
  assert.equal(stripBismillahPrefix(tawbah1, 9, 1), tawbah1);

  const tin1 = 'بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ وَٱلتِّينِ وَٱلزَّيْتُونِ';
  assert.equal(stripBismillahPrefix(tin1, 95, 1), 'وَٱلتِّينِ وَٱلزَّيْتُونِ');

  const qadr1 = 'بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ إِنَّآ أَنزَلْنَٰهُ';
  assert.equal(stripBismillahPrefix(qadr1, 97, 1), 'إِنَّآ أَنزَلْنَٰهُ');

  const tajweed = 'ا[m[لٓ][m[مٓ]';
  assert.equal(stripBismillahPrefix(tajweed, 2, 1), tajweed);
});

test('normalizeTranslationIds maps legacy ur.khan -> ur.kanzuliman, handles mixed case, deduplicates, and caps at 3', () => {
  assert.deepEqual(
    normalizeTranslationIds(['ur.khan', 'en.sahih', 'en.sahih']),
    ['ur.kanzuliman', 'en.sahih']
  );
  assert.deepEqual(
    normalizeTranslationIds(['UR.KHAN', '  Ur.Khan  ', 'EN.SAHIH']),
    ['ur.kanzuliman', 'en.sahih']
  );
  assert.deepEqual(normalizeTranslationIds(['unknown.id', '']), ['en.sahih']);
  assert.deepEqual(
    normalizeTranslationIds(['en.sahih', 'en.asad', 'en.pickthall', 'en.yusufali']),
    ['en.sahih', 'en.asad', 'en.pickthall']
  );
  const kanzMeta = getTranslationMeta('ur.khan');
  assert.equal(kanzMeta?.id, 'ur.kanzuliman');
  assert.equal(kanzMeta?.name, 'Ahmed Raza Khan (Kanz ul Iman)');
  assert.equal(getTranslationMeta('UR.KHAN')?.id, 'ur.kanzuliman');
  assert.equal(getTranslationMeta('  EN.SAHIH  ')?.id, 'en.sahih');
  assert.equal(getTranslationMeta('__proto__'), undefined);
  assert.ok(TRANSLATION_EDITIONS.some((e) => e.id === 'ur.kanzuliman'));
});

test('Storage parsers and snapshot caching handle legacy bookmarks, raw strings, and corrupt JSON', () => {
  assert.deepEqual(parseSurahBookmarks('[1, 2, 2, 999, "bad"]'), [1, 2]);
  assert.deepEqual(
    parseAyahBookmarks('["2:255", {"key":"1:1","savedAt":1000,"collection":"Duas"}, "115:1"]'),
    [
      { key: '2:255', surahNumber: 2, ayahNumber: 255, savedAt: 0 },
      { key: '1:1', surahNumber: 1, ayahNumber: 1, savedAt: 1000, collection: 'Duas' },
    ]
  );
  assert.deepEqual(
    parseStudyNotes('{"2:255":{"note":"Ayat al-Kursi","tags":["tawhid"],"updatedAt":5},"bad":{"note":"x"}}'),
    { '2:255': { note: 'Ayat al-Kursi', tags: ['tawhid'], updatedAt: 5 } }
  );
  assert.deepEqual(
    parseReadingProgress('{"lastRead":{"surah":2,"ayah":255,"updatedAt":10},"completedAyahs":["1:1","999:1"],"dailyGoal":15}'),
    { lastRead: { surah: 2, ayah: 255, updatedAt: 10 }, completedAyahs: ['1:1'], dailyGoal: 15 }
  );
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('"dark"'), 'dark');
  assert.equal(parseLanguage('ur'), 'ur');
  assert.equal(parseLanguage('invalid'), 'en');
  assert.equal(parseReciter('ar.alafasy'), 'ar.alafasy');
  assert.deepEqual(parseAyahKey('2:255'), { surah: 2, ayah: 255 });
  assert.equal(parseAyahKey('2:300'), null);

  // Test snapshot caching + referential equality + corrupt JSON fallback with mock localStorage
  const backing = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
  };
  const mockWindow = {
    localStorage: mockStorage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    configurable: true,
    writable: true,
  });

  try {
    backing.set('quran-ayah-bookmarks', '{bad');
    ayahBookmarksStore.resetCache();
    assert.deepEqual(ayahBookmarksStore.getSnapshot(), []);

    backing.set('quran-ayah-bookmarks', '["2:255"]');
    ayahBookmarksStore.resetCache();
    const first = ayahBookmarksStore.getSnapshot();
    const second = ayahBookmarksStore.getSnapshot();
    assert.equal(first, second);
    assert.equal(first[0]?.key, '2:255');

    backing.set('theme', 'light');
    themeStore.resetCache();
    assert.equal(themeStore.getSnapshot(), 'light');

    backing.set('quran-language', 'ur');
    languageStore.resetCache();
    assert.equal(languageStore.getSnapshot(), 'ur');

    const customStore = createPersistentStore<number[]>({
      key: 'test-custom-store',
      defaultValue: [],
      parse: parseSurahBookmarks,
    });
    customStore.setValue([1, 18]);
    assert.deepEqual(customStore.getSnapshot(), [1, 18]);
  } finally {
    if (previousWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', previousWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('i18n dictionaries are complete across all 5 languages', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 5);
  assert.equal(LANGUAGE_DIRECTION.ar, 'rtl');
  assert.equal(LANGUAGE_DIRECTION.ur, 'rtl');
  assert.equal(LANGUAGE_DIRECTION.en, 'ltr');

  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(isUILanguage(lang.code), true);
    const dict = getTranslationDictionary(lang.code);
    assert.deepEqual(Object.keys(dict).sort(), enKeys);
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim().length > 0, `Empty translation for ${lang.code}.${key}`);
    }
  }
  assert.equal(isUILanguage('fr'), false);
  assert.equal(translate('ur', 'navHome'), 'ہوم');
});

test('parseSseEventLine parses status, token, metadata, done, error, and ignores invalid lines', () => {
  assert.deepEqual(parseSseEventLine('data: {"status":"Retrieving verse..."}'), {
    kind: 'status',
    status: 'Retrieving verse...',
  });
  assert.deepEqual(parseSseEventLine('data: {"token":"Bismillah"}'), {
    kind: 'token',
    token: 'Bismillah',
  });

  const metaEvent = parseSseEventLine(
    'data: {"metadata":{"verified":true,"refusal":false,"sources":[{"type":"quran","label":"Al-Quran Cloud","reference":"2:255"}],"canonicalVerse":{"surah":2,"ayah":255,"arabic":"ٱللَّهُ","translation":"Allah","edition":"en.sahih"}}}'
  );
  assert.equal(metaEvent.kind, 'metadata');
  if (metaEvent.kind === 'metadata') {
    assert.equal(metaEvent.metadata.verified, true);
    assert.equal(metaEvent.metadata.sources[0]?.reference, '2:255');
    assert.equal(metaEvent.metadata.canonicalVerse?.surah, 2);
  }

  assert.deepEqual(parseSseEventLine('data: {"done":true}'), { kind: 'done' });
  assert.deepEqual(parseSseEventLine('data: {"error":"Upstream error"}'), {
    kind: 'error',
    error: 'Upstream error',
  });
  assert.deepEqual(parseSseEventLine(': heartbeat'), { kind: 'ignore' });
  assert.deepEqual(parseSseEventLine('data: {bad json'), { kind: 'ignore' });
});

test('streamExplain decodes SSE stream events and handles AbortError cleanly', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const sseBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"status":"Verifying 2:255..."}\r\n\r\n'));
      controller.enqueue(encoder.encode('data: {"token":"Ayat "}\n\n'));
      controller.enqueue(encoder.encode('data: {"token":"al-Kursi"}\n\n'));
      controller.enqueue(
        encoder.encode(
          'data: {"metadata":{"verified":true,"refusal":false,"sources":[{"type":"quran","label":"Al-Quran Cloud","reference":"2:255"}],"canonicalVerse":null}}\n\n'
        )
      );
      controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
      controller.close();
    },
  });

  const statuses: string[] = [];
  globalThis.fetch = async () =>
    new Response(sseBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

  try {
    const result = await streamExplain(
      { ayahText: 'test', surahNumber: 2, ayahNumber: 255 },
      { onStatus: (s) => statuses.push(s) }
    );
    assert.equal(result.aborted, false);
    assert.equal(result.text, 'Ayat al-Kursi');
    assert.equal(result.metadata?.verified, true);
    assert.deepEqual(statuses, ['Verifying 2:255...']);

    globalThis.fetch = async () => {
      throw new DOMException('Aborted', 'AbortError');
    };
    const abortedResult = await streamExplain({ ayahText: 'test' });
    assert.equal(abortedResult.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeSearch short-circuits empty, invalid_reference, and surah commands offline', async () => {
  const emptyRes = await executeSearch('   ');
  assert.equal(emptyRes.intent.kind, 'empty');
  assert.equal(emptyRes.ayahMatches.length, 0);

  const invalidRes = await executeSearch('2:300');
  assert.equal(invalidRes.intent.kind, 'invalid_reference');
  assert.equal(invalidRes.ayahMatches.length, 0);

  const surahRes = await executeSearch('surah 36');
  assert.equal(surahRes.intent.kind, 'surah');
  assert.equal(surahRes.surahMatches[0]?.surahNumber, 36);
});

test('parseSearchIntent handles 4+ digit out-of-bounds, parseAyahKey zero-padding, and punctuation-only searchSurahsLocally', () => {
  assert.deepEqual(searchSurahsLocally('...'), []);
  assert.deepEqual(searchSurahsLocally("'"), []);
  assert.deepEqual(searchSurahsLocally('-'), []);
  assert.deepEqual(searchSurahsLocally('___'), []);

  assert.equal(parseSearchIntent('1000:1').kind, 'invalid_reference');
  assert.equal(parseSearchIntent('2:1000').kind, 'invalid_reference');
  assert.equal(parseSearchIntent('surah 10000').kind, 'invalid_reference');
  assert.equal(parseSearchIntent('juz 1000').kind, 'invalid_reference');
  assert.equal(parseSearchIntent('page 10000').kind, 'invalid_reference');

  assert.deepEqual(parseAyahKey(' 002:0255 '), { surah: 2, ayah: 255 });
  assert.equal(parseAyahKey('1000:1'), null);
});

test('selectedTranslationsStore normalizes aliases immediately on setValue and themeStore supports rapid toggle reads', () => {
  const backing = new Map<string, string>();
  const mockWindow = {
    localStorage: {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    configurable: true,
    writable: true,
  });

  try {
    selectedTranslationsStore.resetCache();
    selectedTranslationsStore.setValue(['ur.khan']);
    assert.deepEqual(selectedTranslationsStore.getSnapshot(), ['ur.kanzuliman']);
    assert.equal(backing.get('quran-translations'), '["ur.kanzuliman"]');

    themeStore.resetCache();
    themeStore.setValue('dark');
    assert.equal(themeStore.getSnapshot(), 'dark');
    const firstNext = themeStore.getSnapshot() === 'dark' ? 'light' : 'dark';
    themeStore.setValue(firstNext);
    const secondNext = themeStore.getSnapshot() === 'dark' ? 'light' : 'dark';
    themeStore.setValue(secondNext);
    assert.equal(themeStore.getSnapshot(), 'dark');
  } finally {
    if (prevWindow) {
      Object.defineProperty(globalThis, 'window', prevWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('streamExplain flushes trailing EOF SSE lines and handles custom abort reasons without onError', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const eofStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"token":"hello "}\n\ndata: {"token":"world"}'));
      controller.close();
    },
  });

  globalThis.fetch = async () =>
    new Response(eofStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

  try {
    const eofResult = await streamExplain({ ayahText: 'test' });
    assert.equal(eofResult.aborted, false);
    assert.equal(eofResult.text, 'hello world');

    const ac = new AbortController();
    let errorCalled = false;
    globalThis.fetch = async (_url, init) => {
      ac.abort('custom-reason');
      throw init?.signal?.reason ?? new Error('aborted');
    };
    const abortResult = await streamExplain(
      { ayahText: 'test' },
      { onError: () => { errorCalled = true; } },
      ac.signal
    );
    assert.equal(abortResult.aborted, true);
    assert.equal(errorCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value === 'object' && value !== null && !Array.isArray(value), true);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected object record');
  }
  return Object.fromEntries(Object.entries(value));
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  assert.equal(Array.isArray(value), true);
  if (!Array.isArray(value)) {
    throw new Error('Expected array');
  }
  return value.map(asRecord);
}

test('API /api/explain returns 400 on schema errors and 200 deterministic refusal on integer out-of-bounds', async () => {
  const badJsonReq = new Request('http://localhost/api/explain', {
    method: 'POST',
    body: '{bad',
  });
  assert.equal((await explainPost(badJsonReq)).status, 400);

  const nonIntSurahReq = new Request('http://localhost/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ayahText: 'test', surahNumber: '2', ayahNumber: 1 }),
  });
  assert.equal((await explainPost(nonIntSurahReq)).status, 400);

  const floatAyahReq = new Request('http://localhost/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ayahText: 'test', surahNumber: 2, ayahNumber: 1.5 }),
  });
  assert.equal((await explainPost(floatAyahReq)).status, 400);

  const orphanAyahReq = new Request('http://localhost/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ayahText: 'test', ayahNumber: 1 }),
  });
  assert.equal((await explainPost(orphanAyahReq)).status, 400);

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('Should not invoke upstream for out-of-bounds references');
  };

  try {
    const oobSurahRes = await explainPost(
      new Request('http://localhost/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ayahText: 'test', surahNumber: 115, ayahNumber: 1 }),
      })
    );
    assert.equal(oobSurahRes.status, 200);
    const oobSurahJson = asRecord(await oobSurahRes.json());
    assert.equal(oobSurahJson.verified, true);
    assert.equal(oobSurahJson.refusal, true);
    assert.deepEqual(oobSurahJson.sources, []);
    assert.equal(oobSurahJson.canonicalVerse, null);
    assert.match(String(oobSurahJson.explanation), /114/);

    const oobAyahRes = await explainPost(
      new Request('http://localhost/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ayahText: 'test', surahNumber: 2, ayahNumber: 300 }),
      })
    );
    assert.equal(oobAyahRes.status, 200);
    const oobAyahJson = asRecord(await oobAyahRes.json());
    assert.equal(oobAyahJson.verified, true);
    assert.equal(oobAyahJson.refusal, true);
    assert.match(String(oobAyahJson.explanation), /286/);

    const oobSseRes = await explainPost(
      new Request('http://localhost/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ ayahText: 'Explain 115:1', isSearch: true }),
      })
    );
    assert.equal(oobSseRes.status, 200);
    assert.match(oobSseRes.headers.get('content-type') ?? '', /text\/event-stream/);
    const sseText = await oobSseRes.text();
    assert.match(sseText, /"status":/);
    assert.match(sseText, /"token":/);
    assert.match(sseText, /"refusal":true/);
    assert.match(sseText, /"done":true/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function getRequestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  return typeof input === 'string' ? input : input.toString();
}

function mockSearchFetch(requestedUrls: string[]): typeof globalThis.fetch {
  return async (input) => {
    const url = getRequestUrl(input);
    requestedUrls.push(url);
    if (url.includes('127.0.0.1:8000/quran/search') && url.includes('q=yasin')) {
      throw new Error('backend down');
    }
    if (url.includes('api.alquran.cloud/v1/search/yasin')) {
      return new Response(JSON.stringify({ code: 404, data: 'Not found' }), { status: 404 });
    }
    if (url.includes('127.0.0.1:8000/quran/search') && url.includes('q=mercy')) {
      return new Response(
        JSON.stringify({
          query: 'mercy',
          surahMatches: [
            {
              number: 55,
              arabicName: 'الرحمن',
              englishName: 'Ar-Rahman',
              englishTranslation: 'The Beneficent',
              ayahCount: 78,
              revelationType: 'Medinan',
            },
          ],
          ayahMatches: [
            {
              surahNumber: 1,
              ayahNumber: 1,
              surahName: 'Al-Fatihah',
              arabic: 'بِسْمِ ٱللَّهِ',
              translation: 'In the name of Allah',
              edition: 'ur.kanzuliman',
            },
          ],
          totalAyahMatches: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(null, { status: 404 });
  };
}

function mockTafsirFetch(requestedUrls: string[]): typeof globalThis.fetch {
  return async (input) => {
    const url = getRequestUrl(input);
    requestedUrls.push(url);
    if (url.includes('127.0.0.1:8000/quran/tafsir')) {
      throw new Error('backend down');
    }
    if (url.includes('api.quran.com')) {
      throw new Error('Quran.com timeout');
    }
    if (url.includes('cdn.jsdelivr.net')) {
      return new Response(
        JSON.stringify({
          text: '<style>body{display:none}</style ><p>Allah &amp; His Messenger&nbsp;&#39;peace&#39;</p><script type="text/javascript">alert(1)</script >',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(null, { status: 404 });
  };
}

test('API /api/quran/search normalizes ur.khan, matches yasin, normalizes proxy shapes, and /tafsir falls back on Quran.com throw', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = mockSearchFetch(requestedUrls);

  try {
    const yasinRes = await searchGet(new Request('http://localhost/api/quran/search?q=yasin&edition=ur.khan'));
    assert.equal(yasinRes.status, 200);
    const yasinData = asRecord(await yasinRes.json());
    const yasinSurahs = asRecordArray(yasinData.surahMatches);
    assert.equal(yasinSurahs[0]?.number, 36);
    assert.ok(requestedUrls.some((u) => u.includes('edition=ur.kanzuliman')));
    assert.ok(requestedUrls.some((u) => u.includes('/all/ur.kanzuliman')));

    const proxyRes = await searchGet(new Request('http://localhost/api/quran/search?q=mercy&edition=ur.khan'));
    assert.equal(proxyRes.status, 200);
    const proxyData = asRecord(await proxyRes.json());
    const proxySurahs = asRecordArray(proxyData.surahMatches);
    const proxyAyahs = asRecordArray(proxyData.ayahMatches);
    assert.equal(proxySurahs[0]?.number, 55);
    assert.equal(proxySurahs[0]?.name, 'الرحمن');
    assert.equal(proxySurahs[0]?.englishNameTranslation, 'The Beneficent');
    assert.equal(proxySurahs[0]?.numberOfAyahs, 78);
    assert.equal(proxyAyahs[0]?.text, 'بِسْمِ ٱللَّهِ');
    assert.equal(proxyAyahs[0]?.edition, 'ur.kanzuliman');

    globalThis.fetch = mockTafsirFetch(requestedUrls);
    const tafsirRes = await tafsirGet(
      new Request('http://localhost/api/quran/tafsir/2/255'),
      { params: Promise.resolve({ surah: '2', ayah: '255' }) }
    );
    assert.equal(tafsirRes.status, 200);
    const tafsirData = asRecord(await tafsirRes.json());
    assert.equal(tafsirData.text, "Allah & His Messenger 'peace'");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API /api/quran/tafsir rejects unsupported slugs with 400 and normalizes uppercase valid slugs to 200', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      calledUrls.push(getRequestUrl(input));
      return new Response(JSON.stringify({ detail: 'Unsupported tafsir slug' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const unsupportedWithBackend400 = await tafsirGet(
      new Request('http://localhost/api/quran/tafsir/2/255?slug=unsupported-slug'),
      { params: Promise.resolve({ surah: '2', ayah: '255' }) }
    );
    assert.equal(unsupportedWithBackend400.status, 400);
    assert.equal(calledUrls.length, 0);

    globalThis.fetch = async (input) => {
      calledUrls.push(getRequestUrl(input));
      throw new Error('backend down');
    };
    const unsupportedWithBackendDown = await tafsirGet(
      new Request('http://localhost/api/quran/tafsir/2/255?slug=unsupported-slug'),
      { params: Promise.resolve({ surah: '2', ayah: '255' }) }
    );
    assert.equal(unsupportedWithBackendDown.status, 400);
    assert.equal(calledUrls.length, 0);

    globalThis.fetch = mockTafsirFetch(calledUrls);
    const uppercaseValidRes = await tafsirGet(
      new Request('http://localhost/api/quran/tafsir/2/255?slug=EN-AL-JALALAYN'),
      { params: Promise.resolve({ surah: '2', ayah: '255' }) }
    );
    assert.equal(uppercaseValidRes.status, 200);
    const uppercaseJson = asRecord(await uppercaseValidRes.json());
    assert.equal(uppercaseJson.slug, 'en-al-jalalayn');
    assert.ok(calledUrls.some((u) => u.includes('/tafsir/en-al-jalalayn/2/255.json')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Prototype keys return undefined from topic, reciter, and translation lookup helpers', () => {
  assert.equal(getTopicBySlug('toString'), undefined);
  assert.equal(getTopicBySlug('constructor'), undefined);
  assert.equal(getReciterMeta('toString'), undefined);
  assert.equal(getReciterMeta('__proto__'), undefined);
  assert.equal(getTranslationMeta('toString'), undefined);
  assert.equal(getTranslationMeta('constructor'), undefined);
});

test('API route handlers sanitize backend errors (502) and validate search/tafsir/wbw (400)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:8000');
  };
  try {
    const downReq = new Request('http://localhost/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ayahText: 'What is patience?', isSearch: true }),
    });
    const downRes = await explainPost(downReq);
    assert.equal(downRes.status, 502);
    const body: unknown = await downRes.json();
    assert.equal(
      typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string' &&
        !body.error.includes('8000'),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const badSearchRes = await searchGet(new Request('http://localhost/api/quran/search?q='));
  assert.equal(badSearchRes.status, 400);

  const badTafsirRes = await tafsirGet(
    new Request('http://localhost/api/quran/tafsir/115/1'),
    { params: Promise.resolve({ surah: '115', ayah: '1' }) }
  );
  assert.equal(badTafsirRes.status, 400);

  const badWbwRes = await wbwGet(
    new Request('http://localhost/api/quran/word-by-word/2/300'),
    { params: Promise.resolve({ surah: '2', ayah: '300' }) }
  );
  assert.equal(badWbwRes.status, 400);
});

test('API /api/quran/tafsir strips nested, split, and unclosed script/style tags, decodes typographic entities, and sanitizes backend text', async () => {
  const originalFetch = globalThis.fetch;

  const cdnSamples: ReadonlyArray<{ raw: string; expected: string }> = [
    {
      raw: '<script><script>inner</script>LEAKED_SCRIPT</script><p>Safe</p>',
      expected: 'Safe',
    },
    {
      raw: '<scri<script>alert(1)</script>pt>alert(2)</script><p>Safe</p>',
      expected: 'Safe',
    },
    {
      raw: '<style><style>a{}</style>LEAKED_STYLE</style><p>Safe</p>',
      expected: 'Safe',
    },
    {
      raw: '<sty<style>a{}</style>le>body{color:red}</style><p>Safe</p>',
      expected: 'Safe',
    },
    {
      raw: '<p>Before</p><script>alert(1)',
      expected: 'Before',
    },
    {
      raw: '<p>Before</p><style>body{display:none}',
      expected: 'Before',
    },
    {
      raw: '<p>Prophet&#8217;s &ldquo;mercy&rdquo; &lsquo;and&rsquo; grace</p>',
      expected: 'Prophet\u2019s \u201Cmercy\u201D \u2018and\u2019 grace',
    },
    {
      raw: 'İ<script>alert(1)</script><p>Safe</p>',
      expected: 'İSafe',
    },
    {
      raw: 'İİİİİİİİİİ<script>alert(1)</script><p>Safe</p>',
      expected: 'İİİİİİİİİİSafe',
    },
  ];

  try {
    for (const sample of cdnSamples) {
      globalThis.fetch = async (input) => {
        const url = getRequestUrl(input);
        if (url.includes('127.0.0.1:8000/quran/tafsir')) {
          throw new Error('backend down');
        }
        if (url.includes('api.quran.com')) {
          throw new Error('Quran.com timeout');
        }
        if (url.includes('cdn.jsdelivr.net')) {
          return new Response(JSON.stringify({ text: sample.raw }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(null, { status: 404 });
      };

      const res = await tafsirGet(
        new Request('http://localhost/api/quran/tafsir/2/255'),
        { params: Promise.resolve({ surah: '2', ayah: '255' }) }
      );
      assert.equal(res.status, 200);
      const data = asRecord(await res.json());
      assert.equal(data.text, sample.expected);
    }

    globalThis.fetch = async (input) => {
      const url = getRequestUrl(input);
      if (url.includes('127.0.0.1:8000/quran/tafsir')) {
        return new Response(
          JSON.stringify({
            surah: 2,
            ayah: 255,
            slug: 'en-tafisr-ibn-kathir',
            tafsirName: 'Tafsir Ibn Kathir (Abridged)',
            sourceUrl: 'https://quran.com/2:255/tafsirs',
            text: '<script>alert(1)</script><p>From backend&#8217;s source</p><style>body{}</style>',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(null, { status: 404 });
    };

    const backendRes = await tafsirGet(
      new Request('http://localhost/api/quran/tafsir/2/255'),
      { params: Promise.resolve({ surah: '2', ayah: '255' }) }
    );
    assert.equal(backendRes.status, 200);
    const backendData = asRecord(await backendRes.json());
    assert.equal(backendData.text, 'From backend\u2019s source');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('THEME_INIT_SCRIPT unwraps JSON-quoted theme and isolates theme vs quran-language storage errors', () => {
  const layoutPath = path.resolve(process.cwd(), 'app', 'layout.tsx');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  const marker = 'const THEME_INIT_SCRIPT = `';
  const startIdx = layoutSource.indexOf(marker);
  assert.notEqual(startIdx, -1);
  const endIdx = layoutSource.indexOf('`;', startIdx + marker.length);
  assert.notEqual(endIdx, -1);
  const initScript = layoutSource.slice(startIdx + marker.length, endIdx);

  const runInitScript = (getItemImpl: (key: string) => string | null) => {
    const classes = new Set<string>(['dark']);
    const docEl = {
      lang: 'en',
      dir: 'ltr',
      style: { colorScheme: '' },
      classList: {
        add: (cls: string) => classes.add(cls),
        remove: (cls: string) => classes.delete(cls),
      },
    };
    vm.runInNewContext(initScript, {
      document: { documentElement: docEl },
      localStorage: { getItem: getItemImpl },
    });
    return {
      lang: docEl.lang,
      dir: docEl.dir,
      colorScheme: docEl.style.colorScheme,
      hasDark: classes.has('dark'),
    };
  };

  const quotedLight = runInitScript((key) => {
    if (key === 'theme') return '"light"';
    if (key === 'quran-language') return '"ar"';
    return null;
  });
  assert.deepEqual(quotedLight, {
    lang: 'ar',
    dir: 'rtl',
    colorScheme: 'light',
    hasDark: false,
  });

  const partialFailure = runInitScript((key) => {
    if (key === 'theme') return 'light';
    throw new Error('Storage blocked for language');
  });
  assert.deepEqual(partialFailure, {
    lang: 'en',
    dir: 'ltr',
    colorScheme: 'light',
    hasDark: false,
  });

  const reversePartialFailure = runInitScript((key) => {
    if (key === 'theme') {
      throw new Error('Storage blocked for theme');
    }
    if (key === 'quran-language') return 'ar';
    return null;
  });
  assert.deepEqual(reversePartialFailure, {
    lang: 'ar',
    dir: 'rtl',
    colorScheme: 'dark',
    hasDark: true,
  });
});

test('API /api/quran/search lowercases non-alias editions for reference fallback and rejects non-numeric limit suffixes', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      const url = getRequestUrl(input);
      requestedUrls.push(url);
      if (url.includes('127.0.0.1:8000/quran/search')) {
        throw new Error('backend down');
      }
      if (url.includes('api.alquran.cloud/v1/ayah/1:1/editions/')) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: [
              {
                edition: { identifier: 'quran-uthmani' },
                text: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
              },
              {
                edition: { identifier: 'en.sahih' },
                text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(null, { status: 404 });
    };

    const refRes = await searchGet(
      new Request('http://localhost/api/quran/search?q=1:1&edition=EN.SAHIH')
    );
    assert.equal(refRes.status, 200);
    const refData = asRecord(await refRes.json());
    const refAyahs = asRecordArray(refData.ayahMatches);
    assert.equal(refAyahs[0]?.edition, 'en.sahih');
    assert.equal(
      refAyahs[0]?.translation,
      'In the name of Allah, the Entirely Merciful, the Especially Merciful.'
    );
    assert.ok(requestedUrls.some((u) => u.includes('/editions/quran-uthmani,en.sahih')));

    const countBeforeInvalidLimit = requestedUrls.length;
    const badLimitRes = await searchGet(
      new Request('http://localhost/api/quran/search?q=yasin&limit=10abc')
    );
    assert.equal(badLimitRes.status, 400);
    const badLimitData = asRecord(await badLimitRes.json());
    assert.equal(badLimitData.error, 'Invalid limit parameter.');
    assert.equal(requestedUrls.length, countBeforeInvalidLimit);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('M1 Iteration 4 regressions: THEME_INIT_SCRIPT whitespace-padded quotes, negative /api/explain refs, i18n prototype keys, large search limit, and earliest-tag tafsir stripping', async () => {
  // 1. THEME_INIT_SCRIPT whitespace-padded JSON-quoted values
  const layoutPath = path.resolve(process.cwd(), 'app', 'layout.tsx');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  const marker = 'const THEME_INIT_SCRIPT = `';
  const startIdx = layoutSource.indexOf(marker);
  assert.notEqual(startIdx, -1);
  const endIdx = layoutSource.indexOf('`;', startIdx + marker.length);
  assert.notEqual(endIdx, -1);
  const initScript = layoutSource.slice(startIdx + marker.length, endIdx);

  const runInitScript = (getItemImpl: (key: string) => string | null) => {
    const classes = new Set<string>(['dark']);
    const docEl = {
      lang: 'en',
      dir: 'ltr',
      style: { colorScheme: '' },
      classList: {
        add: (cls: string) => classes.add(cls),
        remove: (cls: string) => classes.delete(cls),
      },
    };
    vm.runInNewContext(initScript, {
      document: { documentElement: docEl },
      localStorage: { getItem: getItemImpl },
    });
    return {
      lang: docEl.lang,
      dir: docEl.dir,
      colorScheme: docEl.style.colorScheme,
      hasDark: classes.has('dark'),
    };
  };

  assert.deepEqual(
    runInitScript((key) => {
      if (key === 'theme') return ' "light" ';
      if (key === 'quran-language') return ' "ar" ';
      return null;
    }),
    {
      lang: 'ar',
      dir: 'rtl',
      colorScheme: 'light',
      hasDark: false,
    }
  );

  // 2. getTranslationDictionary & translate prototype-key safety
  for (const protoKey of ['__proto__', 'constructor', 'toString']) {
    const dict = getTranslationDictionary(protoKey as keyof typeof TRANSLATIONS);
    assert.equal(dict, TRANSLATIONS.en);
    assert.equal(translate(protoKey as keyof typeof TRANSLATIONS, 'brandTitle'), 'Quran AI');
  }

  // 3. /api/explain negative Surah/Ayah refs vs valid range expression
  const originalFetch = globalThis.fetch;
  let explainFetchCount = 0;

  try {
    globalThis.fetch = async () => {
      explainFetchCount += 1;
      return new Response(
        JSON.stringify({
          explanation: 'ok',
          verified: true,
          refusal: false,
          sources: [],
          canonicalVerse: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    for (const negPrompt of ['Explain -1:5 please', 'Explain 2:-1', 'Explain Surah -1']) {
      const res = await explainPost(
        new Request('http://localhost/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ayahText: negPrompt, isSearch: true }),
        })
      );
      assert.equal(res.status, 200);
      const data = asRecord(await res.json());
      assert.equal(data.refusal, true, `Expected refusal for ${negPrompt}`);
      assert.equal(data.verified, true);
    }
    assert.equal(explainFetchCount, 0);

    const validRangeRes = await explainPost(
      new Request('http://localhost/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ayahText: 'Explain 2:1-2:5 please', isSearch: true }),
      })
    );
    assert.equal(validRangeRes.status, 200);
    const validRangeData = asRecord(await validRangeRes.json());
    assert.equal(validRangeData.refusal, false);
    assert.equal(explainFetchCount, 1);

    // 4. /api/quran/search large limit clamping & invalid limit rejection
    const searchUrls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = getRequestUrl(input);
      searchUrls.push(url);
      if (url.includes('127.0.0.1:8000/quran/search')) {
        return new Response(
          JSON.stringify({ query: 'yasin', surahMatches: [], ayahMatches: [], totalAyahMatches: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(null, { status: 404 });
    };

    const bigLimitRes = await searchGet(
      new Request('http://localhost/api/quran/search?q=yasin&limit=99999')
    );
    assert.equal(bigLimitRes.status, 200);
    assert.ok(searchUrls.some((u) => u.includes('&limit=100')));

    const countBeforeRejects = searchUrls.length;
    for (const badLimit of ['0', '000', '-5', '10abc', '1e2', '']) {
      const badRes = await searchGet(
        new Request(`http://localhost/api/quran/search?q=yasin&limit=${encodeURIComponent(badLimit)}`)
      );
      assert.equal(badRes.status, 400, `Expected 400 for limit=${badLimit}`);
    }
    assert.equal(searchUrls.length, countBeforeRejects);

    // 5. /api/quran/tafsir earliest-tag stripping and split remnant cleanup
    const tafsirSamples: ReadonlyArray<{ raw: string; expected: string }> = [
      {
        raw: '<style>body{content:"<script>"}</style><p>Safe</p>',
        expected: 'Safe',
      },
      {
        raw: '<script>var s="<style>";</script><p>Safe</p>',
        expected: 'Safe',
      },
      {
        raw: '<scr<script>ipt>alert(1)</script>Safe',
        expected: 'Safe',
      },
      {
        raw: '<p>Compare a &lt; b</p><script>alert(1)</script>',
        expected: 'Compare a < b',
      },
    ];

    for (const sample of tafsirSamples) {
      globalThis.fetch = async (input) => {
        const url = getRequestUrl(input);
        if (url.includes('127.0.0.1:8000/quran/tafsir')) {
          return new Response(
            JSON.stringify({
              surah: 2,
              ayah: 255,
              slug: 'en-tafisr-ibn-kathir',
              tafsirName: 'Tafsir Ibn Kathir (Abridged)',
              sourceUrl: 'https://quran.com/2:255/tafsirs',
              text: sample.raw,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(null, { status: 404 });
      };

      const tafsirRes = await tafsirGet(
        new Request('http://localhost/api/quran/tafsir/2/255'),
        { params: Promise.resolve({ surah: '2', ayah: '255' }) }
      );
      assert.equal(tafsirRes.status, 200);
      const tafsirData = asRecord(await tafsirRes.json());
      assert.equal(tafsirData.text, sample.expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('M1 Iteration 5 regressions: cross-tag tafsir split remnants and translate() prototype-key fallback', async () => {
  // 1. Prototype keys in translate() key parameter return '' instead of Object.prototype members
  const protoKeys = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'] as const;
  for (const protoKey of protoKeys) {
    assert.equal(translate('en', protoKey as TranslationKey), '');
    assert.equal(translate('ar', protoKey as TranslationKey), '');
  }

  // 2. Cross-tag splits sharing <s prefix in /api/quran/tafsir
  const originalFetch = globalThis.fetch;
  const crossTagSamples: ReadonlyArray<{ raw: string; expected: string }> = [
    {
      raw: '<s<style>x</style>cript>alert(1)</script>Safe',
      expected: 'Safe',
    },
    {
      raw: '<s<script>x</script>tyle>body{}</style>Safe',
      expected: 'Safe',
    },
    {
      raw: '<s<style>x</style>cript src="x">alert(1)</script>Safe',
      expected: 'Safe',
    },
    {
      raw: '<s<style>x</style>cript/src="x">alert(1)</script>Safe',
      expected: 'Safe',
    },
    {
      raw: '<p>Keep</p><s<style>x</style>cript',
      expected: 'Keep',
    },
    {
      raw: '<p>Compare a &lt; b</p><s<style>x</style>cript>alert(1)</script>',
      expected: 'Compare a < b',
    },
  ];

  try {
    for (const sample of crossTagSamples) {
      globalThis.fetch = async (input) => {
        const url = getRequestUrl(input);
        if (url.includes('127.0.0.1:8000/quran/tafsir')) {
          return new Response(
            JSON.stringify({
              surah: 2,
              ayah: 255,
              slug: 'en-tafisr-ibn-kathir',
              tafsirName: 'Tafsir Ibn Kathir (Abridged)',
              sourceUrl: 'https://quran.com/2:255/tafsirs',
              text: sample.raw,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(null, { status: 404 });
      };

      const tafsirRes = await tafsirGet(
        new Request('http://localhost/api/quran/tafsir/2/255'),
        { params: Promise.resolve({ surah: '2', ayah: '255' }) }
      );
      assert.equal(tafsirRes.status, 200);
      const tafsirData = asRecord(await tafsirRes.json());
      assert.equal(tafsirData.text, sample.expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tajweed parser extracts segments and strips prepended Bismillah cleanly', () => {
  const sample = 'بِسْمِ [h:1[ٱ]للَّهِ [h:2[ٱ][l[ل]رَّحْمَ[n[ـٰ]نِ [h:3[ٱ][l[ل]رَّحِ[p[ي]مِ';
  const segments = parseTajweedSegments(sample);
  assert.ok(segments.some((seg) => seg.text === 'ٱ' && seg.rule?.className === 'tajweed-silent'));
  assert.ok(segments.some((seg) => seg.text === 'ـٰ' && seg.rule?.className === 'tajweed-madd-normal'));
  assert.ok(segments.some((seg) => seg.text === 'ي' && seg.rule?.className === 'tajweed-madd-permissible'));

  const combined = segments.map((s) => s.text).join('');
  assert.equal(combined.includes('['), false);

  const surah1Segments = buildVerseTajweedSegments(sample, 1, 1);
  assert.equal(surah1Segments.map((s) => s.text).join(''), combined);

  const surah2Sample = `${sample} [m[الٓمٓ]`;
  const surah2Segments = buildVerseTajweedSegments(surah2Sample, 2, 1);
  assert.equal(surah2Segments.map((s) => s.text).join(''), 'الٓمٓ');
  assert.equal(surah2Segments[0]?.rule?.className, 'tajweed-madd-necessary');
});
