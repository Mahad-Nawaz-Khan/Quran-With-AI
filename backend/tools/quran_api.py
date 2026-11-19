"""Authoritative Quran API service functions and agent `@function_tool` wrappers."""

from __future__ import annotations

import asyncio
import functools
import logging
import re
from typing import Any
from urllib.parse import quote

import httpx
from agents import RunContextWrapper, function_tool

from backend.cache import TTLCache
from backend.grounding import GroundingContext, VerifiedAyahRecord
from backend.quran_metadata import (
    extract_references,
    find_surah_matches,
    get_surah_meta,
    strip_bismillah_prefix,
    validate_reference,
)

logger = logging.getLogger(__name__)

DEFAULT_TRANSLATION_EDITION = "en.sahih"
DEFAULT_ALQURAN_API_BASE = "https://api.alquran.cloud/v1"

_EDITION_SAFE_RE = re.compile(r"^[a-z0-9.-]+$")
_SEARCH_STRIP_RE = re.compile(r"[/?#\x00-\x1f]")
_MAX_RANGE_AYAHS = 20
_QUERY_WORD_RE = re.compile(r"[a-z0-9]{3,}")
_QUERY_STOPWORDS: frozenset[str] = frozenset({
    "the", "and", "for", "are", "was", "were", "with", "that", "this",
    "what", "does", "which", "about", "from", "quran", "quranic", "verse",
    "verses", "ayah", "ayahs", "surah", "talk", "talks", "say", "says",
    "quote", "relevant", "verbatim", "its", "reference", "give", "exact",
})


def _extract_query_terms(text: str) -> list[str]:
    terms: list[str] = []
    for tok in _QUERY_WORD_RE.findall(text.lower()):
        if tok not in _QUERY_STOPWORDS and tok not in terms:
            terms.append(tok)
    return terms


def _score_query_term(term: str, word_set: set[str], words_in_text: list[str]) -> int:
    term_score = 4 + min(1, words_in_text.count(term) - 1) if term in word_set else 0
    stem = term[:4] if len(term) >= 5 else ""
    if stem and any(w != term and w.startswith(stem) for w in word_set):
        term_score += 3
    return term_score


def _score_search_match(
    match: dict[str, Any],
    query_terms: list[str],
    idx: int,
) -> tuple[int, int]:
    text_lower = str(match.get("text") or "").lower()
    words_in_text = _QUERY_WORD_RE.findall(text_lower)
    word_set = set(words_in_text)
    score = sum(_score_query_term(term, word_set, words_in_text) for term in query_terms)
    if "mercy" in query_terms and "mercy of allah" in text_lower:
        score += 5
    if "mercy" in query_terms and "despair of the mercy of allah" in text_lower:
        score += 8
    if 60 <= len(text_lower) <= 220:
        score += 1
    return (-score, idx)


def _select_top_search_matches(
    raw_matches: list[dict[str, Any]],
    query: str,
    user_query: str,
    limit: int = 3,
) -> list[dict[str, Any]]:
    if len(raw_matches) <= limit:
        return raw_matches
    terms = _extract_query_terms(f"{query} {user_query}")
    if not terms:
        return raw_matches[:limit]

    ranked = sorted(
        enumerate(raw_matches),
        key=lambda pair: _score_search_match(pair[1], terms, pair[0]),
    )
    selected: list[dict[str, Any]] = []
    seen_surahs: set[int] = set()
    for _, match in ranked:
        s_num = int(match["surahNumber"])
        if s_num not in seen_surahs:
            selected.append(match)
            seen_surahs.add(s_num)
            if len(selected) >= limit:
                return selected
    for _, match in ranked:
        if match not in selected:
            selected.append(match)
            if len(selected) >= limit:
                break
    return selected


def _decode_json_response(resp: httpx.Response) -> tuple[int, Any]:
    if resp.status_code != 200:
        return resp.status_code, None
    try:
        return resp.status_code, resp.json()
    except (httpx.DecodingError, ValueError) as exc:
        raise RuntimeError("Upstream Quran service returned malformed JSON.") from exc


async def _fetch_json(
    url: str,
    http_client: httpx.AsyncClient | None = None,
) -> tuple[int, Any]:
    if http_client is not None:
        resp = await http_client.get(url)
        return _decode_json_response(resp)

    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(url)
        return _decode_json_response(resp)


def _sanitize_edition_list(editions: tuple[str, ...] | list[str]) -> list[str]:
    clean: list[str] = []
    for raw in editions:
        candidate = raw.strip().lower()
        if candidate and _EDITION_SAFE_RE.match(candidate) and candidate not in clean:
            clean.append(candidate)
    return clean


def _find_arabic_item(items: list[dict[str, Any]]) -> dict[str, Any]:
    for item in items:
        if (item.get("edition") or {}).get("identifier") == "quran-uthmani":
            return item
    return items[0]


def _extract_ayah_translations(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    translations: list[dict[str, str]] = []
    for item in items:
        ed_info = item.get("edition") or {}
        ed_id = str(ed_info.get("identifier", ""))
        if ed_id == "quran-uthmani":
            continue
        translations.append(
            {
                "edition": ed_id,
                "name": str(ed_info.get("englishName") or ed_info.get("name") or ed_id),
                "language": str(ed_info.get("language") or "en"),
                "text": str(item.get("text", "")).strip(),
            }
        )
    return translations


def _parse_ayah_editions_payload(
    surah: int,
    ayah: int,
    url: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    items = payload.get("data")
    if not isinstance(items, list) or not items:
        raise RuntimeError(f"Empty data returned for {surah}:{ayah}")

    arabic_item = _find_arabic_item(items)
    arabic_text = str(arabic_item.get("text", "")).lstrip("\ufeff")
    translations = _extract_ayah_translations(items)
    surah_info = arabic_item.get("surah") or {}
    meta = get_surah_meta(surah)
    fallback_name = meta.english_name if meta else f"Surah {surah}"
    fallback_rev = meta.revelation_type if meta else ""

    return {
        "surah": surah,
        "ayah": ayah,
        "surahName": str(surah_info.get("englishName") or fallback_name),
        "revelationType": str(surah_info.get("revelationType") or fallback_rev),
        "arabic": arabic_text,
        "translations": translations,
        "primaryTranslation": translations[0]["text"] if translations else "",
        "juz": int(arabic_item.get("juz") or 1),
        "page": int(arabic_item.get("page") or 1),
        "hizbQuarter": int(arabic_item.get("hizbQuarter") or 1),
        "sourceUrl": url,
    }


async def _load_ayah_editions(
    surah: int,
    ayah: int,
    url: str,
    http_client: httpx.AsyncClient | None,
) -> dict[str, Any]:
    status, payload = await _fetch_json(url, http_client=http_client)
    if status != 200 or not isinstance(payload, dict) or payload.get("code") != 200:
        raise RuntimeError(f"Al-Quran Cloud returned status {status} for {surah}:{ayah}")
    return _parse_ayah_editions_payload(surah, ayah, url, payload)


async def fetch_ayah_editions(
    surah: int,
    ayah: int,
    editions: tuple[str, ...] = ("quran-uthmani", DEFAULT_TRANSLATION_EDITION),
    http_client: httpx.AsyncClient | None = None,
    cache: TTLCache | None = None,
    base_url: str = DEFAULT_ALQURAN_API_BASE,
) -> dict[str, Any]:
    """Fetch canonical Arabic and requested translation editions for a single ayah."""
    ok, err = validate_reference(surah, ayah)
    if not ok:
        raise ValueError(err or "Invalid Quran reference")

    requested = _sanitize_edition_list(editions)
    translation_eds = [e for e in requested if e != "quran-uthmani"][:3]
    if not translation_eds:
        translation_eds = [DEFAULT_TRANSLATION_EDITION]
    editions_param = ",".join(["quran-uthmani", *translation_eds])
    url = f"{base_url.rstrip('/')}/ayah/{surah}:{ayah}/editions/{editions_param}"
    cache_key = f"ayah:{surah}:{ayah}:{editions_param}"
    loader = functools.partial(_load_ayah_editions, surah, ayah, url, http_client)

    if cache is not None:
        return await cache.get_or_set(cache_key, loader, ttl=3600)
    return await loader()


def _extract_surah_blocks(
    ed_blocks: list[dict[str, Any]],
    clean_translations: list[str],
    clean_reciter: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any] | None]:
    arabic_block = next(
        (b for b in ed_blocks if (b.get("edition") or {}).get("identifier") == "quran-uthmani"),
        ed_blocks[0],
    )
    translation_blocks = [
        b
        for b in ed_blocks
        if (b.get("edition") or {}).get("identifier") in clean_translations
    ]
    audio_block = next(
        (
            b
            for b in ed_blocks
            if clean_reciter and (b.get("edition") or {}).get("identifier") == clean_reciter
        ),
        None,
    )
    return arabic_block, translation_blocks, audio_block


def _collect_ayah_translations(
    idx: int,
    translation_blocks: list[dict[str, Any]],
) -> list[dict[str, str]]:
    all_tr: list[dict[str, str]] = []
    for tb in translation_blocks:
        t_ayahs = tb.get("ayahs") or []
        t_info = tb.get("edition") or {}
        t_text = str(t_ayahs[idx].get("text", "")).strip() if idx < len(t_ayahs) else ""
        all_tr.append(
            {
                "edition": str(t_info.get("identifier", "")),
                "name": str(t_info.get("englishName") or t_info.get("name") or ""),
                "language": str(t_info.get("language") or "en"),
                "text": t_text,
            }
        )
    return all_tr


def _build_surah_ayah_item(
    idx: int,
    ar: dict[str, Any],
    surah: int,
    translation_blocks: list[dict[str, Any]],
    audio_ayahs: list[dict[str, Any]],
) -> dict[str, Any]:
    num_in_surah = int(ar.get("numberInSurah") or (idx + 1))
    raw_text = str(ar.get("text", "")).lstrip("\ufeff")
    clean_text = strip_bismillah_prefix(raw_text, surah, num_in_surah)
    all_tr = _collect_ayah_translations(idx, translation_blocks)
    audio_url = str(audio_ayahs[idx].get("audio") or "") if idx < len(audio_ayahs) else ""
    return {
        "number": int(ar.get("number") or 0),
        "numberInSurah": num_in_surah,
        "text": clean_text,
        "rawText": raw_text,
        "translation": all_tr[0]["text"] if all_tr else "",
        "allTranslations": all_tr,
        "audio": audio_url,
        "juz": int(ar.get("juz") or 1),
        "page": int(ar.get("page") or 1),
        "hizbQuarter": int(ar.get("hizbQuarter") or 1),
        "sajda": bool(ar.get("sajda")),
    }


def _build_surah_meta_dict(
    surah: int,
    arabic_block: dict[str, Any],
    ayahs_count: int,
) -> dict[str, Any]:
    meta = get_surah_meta(surah)
    if meta is not None:
        return {
            "number": surah,
            "name": meta.arabic_full_name,
            "englishName": meta.alquran_name,
            "englishNameTranslation": meta.english_translation,
            "numberOfAyahs": meta.ayah_count,
            "revelationType": meta.revelation_type,
            "revelationOrder": meta.revelation_order,
            "juzStart": meta.juz_start,
            "pageStart": meta.page_start,
        }
    return {
        "number": surah,
        "name": str(arabic_block.get("name", "")),
        "englishName": str(arabic_block.get("englishName", "")),
        "englishNameTranslation": str(arabic_block.get("englishNameTranslation", "")),
        "numberOfAyahs": ayahs_count,
        "revelationType": str(arabic_block.get("revelationType", "")),
        "revelationOrder": 0,
        "juzStart": 1,
        "pageStart": 1,
    }


async def _load_surah_editions(
    surah: int,
    url: str,
    clean_translations: list[str],
    clean_reciter: str,
    http_client: httpx.AsyncClient | None,
) -> dict[str, Any]:
    status, payload = await _fetch_json(url, http_client=http_client)
    if status != 200 or not isinstance(payload, dict) or payload.get("code") != 200:
        raise RuntimeError(f"Al-Quran Cloud returned status {status} for surah {surah}")

    ed_blocks = payload.get("data")
    if not isinstance(ed_blocks, list) or not ed_blocks:
        raise RuntimeError(f"Empty surah payload for surah {surah}")

    arabic_block, translation_blocks, audio_block = _extract_surah_blocks(
        ed_blocks, clean_translations, clean_reciter
    )
    arabic_ayahs = arabic_block.get("ayahs") or []
    audio_ayahs = (audio_block.get("ayahs") or []) if audio_block else []
    ayahs_out = [
        _build_surah_ayah_item(idx, ar, surah, translation_blocks, audio_ayahs)
        for idx, ar in enumerate(arabic_ayahs)
    ]
    return {
        "surah": _build_surah_meta_dict(surah, arabic_block, len(ayahs_out)),
        "editions": clean_translations,
        "reciter": clean_reciter,
        "bismillahPre": surah not in (1, 9),
        "ayahs": ayahs_out,
    }


async def fetch_surah_editions(
    surah: int,
    translations: tuple[str, ...] = (DEFAULT_TRANSLATION_EDITION,),
    reciter: str = "ar.alafasy",
    http_client: httpx.AsyncClient | None = None,
    cache: TTLCache | None = None,
    base_url: str = DEFAULT_ALQURAN_API_BASE,
) -> dict[str, Any]:
    """Fetch full Surah with canonical Arabic, up to 3 translations, and optional audio."""
    ok, err = validate_reference(surah, None)
    if not ok:
        raise ValueError(err or "Invalid Surah number")

    clean_translations = [e for e in _sanitize_edition_list(translations) if e != "quran-uthmani"][:3]
    if not clean_translations:
        clean_translations = [DEFAULT_TRANSLATION_EDITION]

    clean_reciter = reciter.strip().lower() if reciter else ""
    if clean_reciter and not _EDITION_SAFE_RE.match(clean_reciter):
        clean_reciter = "ar.alafasy"

    editions_list = ["quran-uthmani", *clean_translations]
    if clean_reciter:
        editions_list.append(clean_reciter)
    editions_param = ",".join(editions_list)
    url = f"{base_url.rstrip('/')}/surah/{surah}/editions/{editions_param}"
    cache_key = f"surah:{surah}:{editions_param}"
    loader = functools.partial(
        _load_surah_editions,
        surah,
        url,
        clean_translations,
        clean_reciter,
        http_client,
    )

    if cache is not None:
        return await cache.get_or_set(cache_key, loader, ttl=3600)
    return await loader()


async def fetch_ayah_range(
    surah: int,
    start_ayah: int,
    end_ayah: int,
    edition: str = DEFAULT_TRANSLATION_EDITION,
    http_client: httpx.AsyncClient | None = None,
    cache: TTLCache | None = None,
    base_url: str = DEFAULT_ALQURAN_API_BASE,
) -> dict[str, Any]:
    """Fetch a bounded slice of ayahs (`<= 20`) from a Surah."""
    ok_start, err_start = validate_reference(surah, start_ayah)
    if not ok_start:
        raise ValueError(err_start or "Invalid start reference")
    ok_end, err_end = validate_reference(surah, end_ayah)
    if not ok_end:
        raise ValueError(err_end or "Invalid end reference")
    if start_ayah > end_ayah:
        raise ValueError(f"start_ayah ({start_ayah}) cannot exceed end_ayah ({end_ayah}).")
    if end_ayah - start_ayah + 1 > _MAX_RANGE_AYAHS:
        raise ValueError(f"Requested range exceeds {_MAX_RANGE_AYAHS} ayahs per call.")

    clean_edition = edition.strip().lower()
    if not _EDITION_SAFE_RE.match(clean_edition) or clean_edition == "quran-uthmani":
        clean_edition = DEFAULT_TRANSLATION_EDITION

    surah_data = await fetch_surah_editions(
        surah,
        translations=(clean_edition,),
        reciter="",
        http_client=http_client,
        cache=cache,
        base_url=base_url,
    )
    sliced = [
        a
        for a in surah_data["ayahs"]
        if start_ayah <= a["numberInSurah"] <= end_ayah
    ]
    return {
        "surah": surah,
        "surahName": surah_data["surah"]["englishName"],
        "startAyah": start_ayah,
        "endAyah": end_ayah,
        "edition": clean_edition,
        "ayahs": sliced,
        "sourceUrl": f"{base_url.rstrip('/')}/surah/{surah}/editions/quran-uthmani,{clean_edition}",
    }


def _format_surah_matches(query: str) -> list[dict[str, Any]]:
    matches = find_surah_matches(query, limit=5)
    return [
        {
            "number": s.number,
            "name": s.arabic_name,
            "arabicName": s.arabic_name,
            "englishName": s.english_name,
            "englishNameTranslation": s.english_translation,
            "numberOfAyahs": s.ayah_count,
            "revelationType": s.revelation_type,
        }
        for s in matches
    ]


def _find_invalid_search_ref(refs: list[tuple[int, int]]) -> str | None:
    for s_ref, a_ref in refs:
        ok, err = validate_reference(s_ref, a_ref)
        if not ok:
            return err or f"Invalid reference {s_ref}:{a_ref}"
    return None


async def _fetch_direct_ref_matches(
    refs: list[tuple[int, int]],
    clean_edition: str,
    http_client: httpx.AsyncClient | None,
    cache: TTLCache | None,
    base_url: str,
) -> tuple[list[dict[str, Any]], set[tuple[int, int]]]:
    ayah_matches: list[dict[str, Any]] = []
    seen_refs: set[tuple[int, int]] = set()
    for s_ref, a_ref in refs[:3]:
        direct = await fetch_ayah_editions(
            s_ref,
            a_ref,
            editions=("quran-uthmani", clean_edition),
            http_client=http_client,
            cache=cache,
            base_url=base_url,
        )
        seen_refs.add((s_ref, a_ref))
        ayah_matches.append(
            {
                "surahNumber": s_ref,
                "surahName": direct["surahName"],
                "ayahNumber": a_ref,
                "text": direct["arabic"],
                "translation": direct["primaryTranslation"],
                "edition": clean_edition,
                "sourceUrl": direct["sourceUrl"],
            }
        )
    return ayah_matches, seen_refs


def _build_keyword_match_item(
    raw_match: dict[str, Any],
    search_url: str,
    clean_edition: str,
    seen_refs: set[tuple[int, int]],
) -> dict[str, Any] | None:
    s_info = raw_match.get("surah") or {}
    s_num = int(s_info.get("number") or 0)
    a_num = int(raw_match.get("numberInSurah") or 0)
    if not s_num or not a_num or (s_num, a_num) in seen_refs:
        return None
    seen_refs.add((s_num, a_num))
    matched_text = str(raw_match.get("text") or "").strip()
    is_arabic_ed = clean_edition == "quran-uthmani"
    return {
        "surahNumber": s_num,
        "surahName": str(s_info.get("englishName") or f"Surah {s_num}"),
        "ayahNumber": a_num,
        "text": matched_text,
        "translation": "" if is_arabic_ed else matched_text,
        "edition": clean_edition,
        "sourceUrl": search_url,
    }


def _append_keyword_matches(
    payload: dict[str, Any],
    search_url: str,
    clean_edition: str,
    bounded_limit: int,
    ayah_matches: list[dict[str, Any]],
    seen_refs: set[tuple[int, int]],
) -> int:
    data = payload.get("data") or {}
    raw_matches = data.get("matches") or []
    api_count = int(data.get("count") or len(raw_matches))

    for m in raw_matches:
        if len(ayah_matches) >= bounded_limit:
            break
        item = _build_keyword_match_item(m, search_url, clean_edition, seen_refs)
        if item is not None:
            ayah_matches.append(item)
    return api_count


async def _fetch_raw_search_payload(
    search_url: str,
    cache_key: str,
    http_client: httpx.AsyncClient | None,
    cache: TTLCache | None,
) -> tuple[int, Any]:
    if cache is not None:
        found, cached = await cache.get(cache_key)
        if found:
            return 200, cached
    status, payload = await _fetch_json(search_url, http_client=http_client)
    if cache is not None and status == 200 and isinstance(payload, dict) and payload.get("code") == 200:
        await cache.set(cache_key, payload, ttl=600)
    return status, payload


async def _load_search_results(
    cleaned_q: str,
    refs: list[tuple[int, int]],
    clean_edition: str,
    bounded_limit: int,
    http_client: httpx.AsyncClient | None,
    cache: TTLCache | None,
    base_url: str,
) -> dict[str, Any]:
    surah_matches = _format_surah_matches(cleaned_q)
    ayah_matches, seen_refs = await _fetch_direct_ref_matches(
        refs, clean_edition, http_client, cache, base_url
    )
    total_count = len(ayah_matches)
    url_safe_q = " ".join(_SEARCH_STRIP_RE.sub(" ", cleaned_q).split())

    if url_safe_q:
        encoded_q = quote(url_safe_q, safe="")
        search_url = f"{base_url.rstrip('/')}/search/{encoded_q}/all/{clean_edition}"
        raw_cache_key = f"rawsearch:{clean_edition}:{url_safe_q.lower()}"
        status, payload = await _fetch_raw_search_payload(
            search_url, raw_cache_key, http_client, cache
        )
        if status == 200 and isinstance(payload, dict) and payload.get("code") == 200:
            api_count = _append_keyword_matches(
                payload, search_url, clean_edition, bounded_limit, ayah_matches, seen_refs
            )
            total_count = max(total_count, api_count)
        elif status != 404:
            raise RuntimeError(f"Al-Quran Cloud search returned HTTP {status}")

    return {
        "query": cleaned_q,
        "edition": clean_edition,
        "surahMatches": surah_matches,
        "ayahMatches": ayah_matches,
        "totalAyahMatches": total_count,
    }


async def search_quran_text(
    query: str,
    edition: str = DEFAULT_TRANSLATION_EDITION,
    limit: int = 40,
    http_client: httpx.AsyncClient | None = None,
    cache: TTLCache | None = None,
    base_url: str = DEFAULT_ALQURAN_API_BASE,
) -> dict[str, Any]:
    """Search Surahs locally and Quran verses via Al-Quran Cloud (mapping 404 -> empty)."""
    cleaned_q = " ".join(query.strip().split())
    if not cleaned_q:
        raise ValueError("Search query cannot be empty.")

    clean_edition = edition.strip().lower()
    if not _EDITION_SAFE_RE.match(clean_edition):
        clean_edition = DEFAULT_TRANSLATION_EDITION
    bounded_limit = max(1, min(limit, 200))

    refs = extract_references(cleaned_q)
    invalid_err = _find_invalid_search_ref(refs)
    if invalid_err is not None:
        return {
            "query": cleaned_q,
            "edition": clean_edition,
            "surahMatches": [],
            "ayahMatches": [],
            "totalAyahMatches": 0,
            "invalidReference": invalid_err,
        }

    cache_key = f"search:{clean_edition}:{bounded_limit}:{cleaned_q.lower()}"
    loader = functools.partial(
        _load_search_results,
        cleaned_q,
        refs,
        clean_edition,
        bounded_limit,
        http_client,
        cache,
        base_url,
    )
    if cache is not None:
        return await cache.get_or_set(cache_key, loader, ttl=600)
    return await loader()


def _parse_wbw_words(raw_words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    words_out: list[dict[str, Any]] = []
    for w in raw_words:
        if w.get("char_type_name") != "word":
            continue
        translit = (w.get("transliteration") or {}).get("text") or ""
        transl = (w.get("translation") or {}).get("text") or ""
        audio_rel = w.get("audio_url")
        words_out.append(
            {
                "position": int(w.get("position") or (len(words_out) + 1)),
                "arabic": str(w.get("text_uthmani") or w.get("text") or ""),
                "transliteration": str(translit).strip(),
                "translation": str(transl).strip(),
                "root": None,
                "audioUrl": f"https://audio.qurancdn.com/{audio_rel}" if audio_rel else None,
            }
        )
    return words_out


async def _load_word_by_word(
    surah: int,
    ayah: int,
    url: str,
    http_client: httpx.AsyncClient | None,
) -> dict[str, Any]:
    status, payload = await _fetch_json(url, http_client=http_client)
    if status != 200 or not isinstance(payload, dict) or "verse" not in payload:
        raise RuntimeError(f"Quran.com WBW returned status {status} for {surah}:{ayah}")

    raw_words = (payload["verse"] or {}).get("words") or []
    return {
        "surah": surah,
        "ayah": ayah,
        "words": _parse_wbw_words(raw_words),
        "sourceUrl": f"https://quran.com/{surah}/{ayah}",
    }


async def fetch_word_by_word(
    surah: int,
    ayah: int,
    http_client: httpx.AsyncClient | None = None,
    cache: TTLCache | None = None,
    quran_com_base: str = "https://api.quran.com/api/v4",
) -> dict[str, Any]:
    """Fetch Word-by-Word breakdown from Quran.com v4, dropping `end` markers."""
    ok, err = validate_reference(surah, ayah)
    if not ok:
        raise ValueError(err or "Invalid Quran reference")

    url = (
        f"{quran_com_base.rstrip('/')}/verses/by_key/{surah}:{ayah}"
        "?words=true&word_fields=text_uthmani,transliteration,translation"
    )
    cache_key = f"wbw:{surah}:{ayah}"
    loader = functools.partial(_load_word_by_word, surah, ayah, url, http_client)

    if cache is not None:
        return await cache.get_or_set(cache_key, loader, ttl=3600)
    return await loader()


def _record_verified_ayah(
    gctx: GroundingContext,
    surah: int,
    ayah: int,
    surah_name: str,
    arabic: str,
    edition: str,
    translation: str,
    source_url: str,
) -> None:
    existing = gctx.verified_ayahs.get((surah, ayah))
    if existing is None:
        gctx.verified_ayahs[(surah, ayah)] = VerifiedAyahRecord(
            surah=surah,
            ayah=ayah,
            surah_name=surah_name,
            arabic=arabic,
            translations={edition: translation} if translation else {},
            source_url=source_url,
        )
    elif translation:
        existing.translations[edition] = translation


@function_tool
async def get_quran_ayah(
    ctx: RunContextWrapper[GroundingContext],
    surah_number: int,
    ayah_number: int,
    edition: str = DEFAULT_TRANSLATION_EDITION,
) -> str:
    """Fetch canonical Arabic and translation for a single Quranic ayah."""
    gctx = ctx.context
    gctx.tool_calls.append(f"get_quran_ayah:{surah_number}:{ayah_number}")

    ok, err = validate_reference(surah_number, ayah_number)
    if not ok:
        return f"INVALID_REFERENCE: {err}"

    try:
        async with asyncio.timeout(gctx.http_timeout):
            data = await fetch_ayah_editions(
                surah_number,
                ayah_number,
                editions=("quran-uthmani", edition),
                http_client=gctx.http_client,
                cache=gctx.cache,
                base_url=gctx.alquran_api_base,
            )
    except Exception as exc:
        logger.warning("get_quran_ayah error for %s:%s: %s", surah_number, ayah_number, exc)
        return f"QURAN_API_UNAVAILABLE: Could not fetch {surah_number}:{ayah_number}."

    primary_ed = data["translations"][0]["edition"] if data["translations"] else edition
    _record_verified_ayah(
        gctx,
        surah_number,
        ayah_number,
        data["surahName"],
        data["arabic"],
        primary_ed,
        data["primaryTranslation"],
        data["sourceUrl"],
    )
    return (
        f"VERIFIED AYAH {surah_number}:{ayah_number} ({data['surahName']})\n"
        f"Source: {data['sourceUrl']}\n"
        f"Arabic: {data['arabic']}\n"
        f"Translation ({primary_ed}): {data['primaryTranslation']}"
    )


@function_tool
async def get_quran_range(
    ctx: RunContextWrapper[GroundingContext],
    surah_number: int,
    start_ayah: int,
    end_ayah: int,
    edition: str = DEFAULT_TRANSLATION_EDITION,
) -> str:
    """Fetch canonical Arabic and translation for a range of ayahs (max 20) in a Surah."""
    gctx = ctx.context
    gctx.tool_calls.append(f"get_quran_range:{surah_number}:{start_ayah}-{end_ayah}")

    try:
        async with asyncio.timeout(gctx.http_timeout):
            data = await fetch_ayah_range(
                surah_number,
                start_ayah,
                end_ayah,
                edition=edition,
                http_client=gctx.http_client,
                cache=gctx.cache,
                base_url=gctx.alquran_api_base,
            )
    except ValueError as val_err:
        return f"INVALID_REFERENCE: {val_err}"
    except Exception as exc:
        logger.warning("get_quran_range error: %s", exc)
        return f"QURAN_API_UNAVAILABLE: Could not fetch {surah_number}:{start_ayah}-{end_ayah}."

    lines = [f"VERIFIED RANGE {surah_number}:{start_ayah}-{end_ayah} ({data['surahName']})"]
    for a in data["ayahs"]:
        a_num = int(a["numberInSurah"])
        arabic = a.get("rawText") or a.get("text") or ""
        tr = a.get("translation") or ""
        _record_verified_ayah(
            gctx,
            surah_number,
            a_num,
            data["surahName"],
            arabic,
            data["edition"],
            tr,
            data["sourceUrl"],
        )
        lines.append(f"[{surah_number}:{a_num}] {arabic}\nTranslation: {tr}")
    return "\n\n".join(lines)


def _contains_arabic(text: str) -> bool:
    return any("\u0600" <= ch <= "\u06ff" for ch in text)


async def _resolve_search_match(
    match: dict[str, Any],
    edition: str,
    gctx: GroundingContext,
) -> tuple[str, str, str]:
    raw_text = str(match.get("text") or "")
    translation = str(match.get("translation") or raw_text)
    source_url = str(match.get("sourceUrl") or "")
    if _contains_arabic(raw_text):
        return raw_text, translation, source_url

    s_num = int(match["surahNumber"])
    a_num = int(match["ayahNumber"])
    try:
        async with asyncio.timeout(gctx.http_timeout):
            full = await fetch_ayah_editions(
                s_num,
                a_num,
                editions=("quran-uthmani", edition),
                http_client=gctx.http_client,
                cache=gctx.cache,
                base_url=gctx.alquran_api_base,
            )
        return full["arabic"], full["primaryTranslation"], full["sourceUrl"]
    except Exception:
        return "", translation, source_url


async def _resolve_ranked_match(
    idx: int,
    match: dict[str, Any],
    edition: str,
    needs_all_arabic: bool,
    gctx: GroundingContext,
) -> tuple[str, str, str]:
    if idx == 0 or needs_all_arabic:
        return await _resolve_search_match(match, edition, gctx)
    s_num = int(match["surahNumber"])
    a_num = int(match["ayahNumber"])
    tr_text = str(match.get("translation") or match.get("text") or "")
    source_url = (
        f"{gctx.alquran_api_base.rstrip('/')}/ayah/{s_num}:{a_num}"
        f"/editions/quran-uthmani,{edition}"
    )
    return "", tr_text, source_url


@function_tool
async def search_quran(
    ctx: RunContextWrapper[GroundingContext],
    query: str,
    edition: str = DEFAULT_TRANSLATION_EDITION,
) -> str:
    """Search the Quran text by keyword or Surah name and return verified verse matches."""
    gctx = ctx.context
    gctx.tool_calls.append(f"search_quran:{query[:60]}")

    try:
        async with asyncio.timeout(gctx.http_timeout):
            data = await search_quran_text(
                query,
                edition=edition,
                limit=200,
                http_client=gctx.http_client,
                cache=gctx.cache,
                base_url=gctx.alquran_api_base,
            )
    except ValueError as val_err:
        return f"INVALID_QUERY: {val_err}"
    except Exception as exc:
        logger.warning("search_quran error: %s", exc)
        return "QURAN_SEARCH_UNAVAILABLE: Could not query the Quran search API."

    if data.get("invalidReference"):
        return f"INVALID_REFERENCE: {data['invalidReference']}"

    lines: list[str] = []
    if data["surahMatches"]:
        surah_desc = ", ".join(
            f"Surah {s['number']} ({s['englishName']} — {s['numberOfAyahs']} ayahs)"
            for s in data["surahMatches"][:3]
        )
        lines.append(f"Matching Surahs: {surah_desc}")

    selected_matches = _select_top_search_matches(
        data["ayahMatches"], query, gctx.user_query, limit=3
    )
    needs_all_arabic = "arabic" in gctx.user_query.lower()
    resolved_matches = await asyncio.gather(
        *(
            _resolve_ranked_match(idx, match, edition, needs_all_arabic, gctx)
            for idx, match in enumerate(selected_matches)
        )
    )
    for match, (arabic_text, tr_text, source_url) in zip(selected_matches, resolved_matches):
        s_num = int(match["surahNumber"])
        a_num = int(match["ayahNumber"])
        _record_verified_ayah(
            gctx,
            s_num,
            a_num,
            match["surahName"],
            arabic_text,
            match["edition"],
            tr_text,
            source_url,
        )
        arabic_part = f"Arabic: {arabic_text} | " if arabic_text else ""
        lines.append(
            f"[{s_num}:{a_num} - {match['surahName']}] "
            f"{arabic_part}Translation: {tr_text}"
        )

    if not lines:
        return "NO_QURAN_MATCHES: No matching Surahs or Ayahs were found for this query."
    return "\n".join(lines)
