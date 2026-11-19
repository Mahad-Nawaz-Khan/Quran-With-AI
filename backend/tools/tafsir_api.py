"""Authoritative Tafsir API service (Quran.com v4 + spa5k/tafsir_api fallback)."""

from __future__ import annotations

import asyncio
import functools
import html
import logging
import re
from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from backend.cache import TTLCache
from backend.grounding import GroundingContext, TafsirRecord
from backend.quran_metadata import validate_reference

logger = logging.getLogger(__name__)

_SLUG_SAFE_RE = re.compile(r"^[a-z0-9-]+$")
_SCRIPT_BLOCK_RE = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.IGNORECASE | re.DOTALL)
_STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>.*?</style\s*>", re.IGNORECASE | re.DOTALL)
_BLOCK_END_RE = re.compile(r"</(?:p|h[1-6]|li|div|blockquote)>|<br\s*/?>", re.IGNORECASE)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")

TAFSIR_REGISTRY: dict[str, dict[str, Any]] = {
    "en-tafisr-ibn-kathir": {
        "qurancom_id": 169,
        "spa5k_slug": "en-tafisr-ibn-kathir",
        "name": "Tafsir Ibn Kathir (Abridged)",
        "lang": "en",
    },
    "en-tafsir-ibn-kathir": {
        "qurancom_id": 169,
        "spa5k_slug": "en-tafisr-ibn-kathir",
        "name": "Tafsir Ibn Kathir (Abridged)",
        "lang": "en",
    },
    "en-tafsir-maarif-ul-quran": {
        "qurancom_id": 168,
        "spa5k_slug": "en-tafsir-maarif-ul-quran",
        "name": "Ma'arif al-Qur'an",
        "lang": "en",
    },
    "tazkirul-quran-en": {
        "qurancom_id": 817,
        "spa5k_slug": "en-tazkirul-quran",
        "name": "Tazkirul Quran",
        "lang": "en",
    },
    "en-al-jalalayn": {
        "qurancom_id": None,
        "spa5k_slug": "en-al-jalalayn",
        "name": "Tafsir al-Jalalayn",
        "lang": "en",
    },
    "en-asbab-al-nuzul-by-al-wahidi": {
        "qurancom_id": None,
        "spa5k_slug": "en-asbab-al-nuzul-by-al-wahidi",
        "name": "Asbab al-Nuzul (Al-Wahidi)",
        "lang": "en",
    },
    "ar-tafsir-muyassar": {
        "qurancom_id": 16,
        "spa5k_slug": "ar-tafsir-muyassar",
        "name": "Tafsir Muyassar",
        "lang": "ar",
    },
    "ar-tafsir-ibn-kathir": {
        "qurancom_id": 14,
        "spa5k_slug": "ar-tafsir-ibn-kathir",
        "name": "Tafsir Ibn Kathir (Arabic)",
        "lang": "ar",
    },
    "ar-tafsir-al-tabari": {
        "qurancom_id": 15,
        "spa5k_slug": "ar-tafsir-al-tabari",
        "name": "Tafsir al-Tabari",
        "lang": "ar",
    },
    "tafseer-ibn-e-kaseer-urdu": {
        "qurancom_id": 160,
        "spa5k_slug": "ur-tafseer-ibn-e-kaseer",
        "name": "Tafsir Ibn Kathir (Urdu)",
        "lang": "ur",
    },
}

TAFSIR_ALIASES: dict[str, str] = {
    "en-tafsir-ibn-kathir": "en-tafisr-ibn-kathir",
    "ibn-kathir": "en-tafisr-ibn-kathir",
    "jalalayn": "en-al-jalalayn",
    "al-jalalayn": "en-al-jalalayn",
    "maarif-ul-quran": "en-tafsir-maarif-ul-quran",
    "asbab-al-nuzul": "en-asbab-al-nuzul-by-al-wahidi",
    "muyassar": "ar-tafsir-muyassar",
    "tazkirul-quran": "tazkirul-quran-en",
    "en-tazkirul-quran": "tazkirul-quran-en",
    "tabari": "ar-tafsir-al-tabari",
    "al-tabari": "ar-tafsir-al-tabari",
    "ur-tafseer-ibn-e-kaseer": "tafseer-ibn-e-kaseer-urdu",
}


def resolve_tafsir_slug(slug: str) -> str:
    """Validate and normalize tafsir slug names (including the `tafisr` upstream typo)."""
    cleaned = slug.strip().lower()
    if not cleaned or not _SLUG_SAFE_RE.match(cleaned):
        raise ValueError(f"Invalid tafsir slug '{slug}'.")
    normalized = TAFSIR_ALIASES.get(cleaned, cleaned)
    if normalized not in TAFSIR_REGISTRY:
        raise ValueError(f"Unsupported tafsir slug '{slug}'.")
    return normalized


def clean_tafsir_html(raw_html: str) -> str:
    """Convert HTML tafsir payloads into clean, readable plain text."""
    no_scripts = _SCRIPT_BLOCK_RE.sub("", raw_html)
    no_styles = _STYLE_BLOCK_RE.sub("", no_scripts)
    with_breaks = _BLOCK_END_RE.sub("\n\n", no_styles)
    stripped = _HTML_TAG_RE.sub("", with_breaks)
    unescaped = html.unescape(stripped)
    lines = [line.strip() for line in unescaped.splitlines()]
    joined = "\n".join(lines)
    return _MULTI_NEWLINE_RE.sub("\n\n", joined).strip()


def _decode_json_response(resp: httpx.Response) -> tuple[int, Any]:
    if resp.status_code != 200:
        return resp.status_code, None
    try:
        return resp.status_code, resp.json()
    except (httpx.DecodingError, ValueError) as exc:
        raise RuntimeError("Upstream tafsir service returned malformed JSON.") from exc


async def _get_json(
    url: str,
    http_client: httpx.AsyncClient | None = None,
) -> tuple[int, Any]:
    if http_client is not None:
        resp = await http_client.get(url)
        return _decode_json_response(resp)

    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(url)
        return _decode_json_response(resp)


async def _try_qurancom_tafsir(
    surah: int,
    ayah: int,
    canonical_slug: str,
    entry: dict[str, Any],
    http_client: httpx.AsyncClient | None,
    quran_com_base: str,
) -> dict[str, Any] | None:
    qurancom_id = entry["qurancom_id"]
    if qurancom_id is None:
        return None
    q_url = f"{quran_com_base.rstrip('/')}/tafsirs/{qurancom_id}/by_ayah/{surah}:{ayah}"
    try:
        status, payload = await _get_json(q_url, http_client=http_client)
    except Exception as exc:
        logger.warning("Quran.com tafsir primary failed (%s:%s): %s", surah, ayah, exc)
        return None
    if status != 200 or not isinstance(payload, dict):
        return None
    raw_text = ((payload.get("tafsir") or {}).get("text")) or ""
    cleaned = clean_tafsir_html(str(raw_text))
    if not cleaned:
        return None
    return {
        "surah": surah,
        "ayah": ayah,
        "slug": canonical_slug,
        "tafsirName": entry["name"],
        "sourceUrl": q_url,
        "text": cleaned,
    }


async def _try_spa5k_tafsir(
    surah: int,
    ayah: int,
    canonical_slug: str,
    entry: dict[str, Any],
    http_client: httpx.AsyncClient | None,
) -> dict[str, Any] | None:
    spa_slug = entry["spa5k_slug"]
    spa_url = f"https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/{spa_slug}/{surah}/{ayah}.json"
    status, payload = await _get_json(spa_url, http_client=http_client)
    if status != 200 or not isinstance(payload, dict):
        return None
    cleaned = clean_tafsir_html(str(payload.get("text") or ""))
    if not cleaned:
        return None
    return {
        "surah": surah,
        "ayah": ayah,
        "slug": canonical_slug,
        "tafsirName": entry["name"],
        "sourceUrl": spa_url,
        "text": cleaned,
    }


async def _load_tafsir(
    surah: int,
    ayah: int,
    canonical_slug: str,
    entry: dict[str, Any],
    http_client: httpx.AsyncClient | None,
    quran_com_base: str,
) -> dict[str, Any]:
    primary = await _try_qurancom_tafsir(
        surah, ayah, canonical_slug, entry, http_client, quran_com_base
    )
    if primary is not None:
        return primary
    fallback = await _try_spa5k_tafsir(
        surah, ayah, canonical_slug, entry, http_client
    )
    if fallback is not None:
        return fallback
    raise RuntimeError(f"Tafsir unavailable for {surah}:{ayah} ({canonical_slug})")


async def fetch_tafsir(
    surah: int,
    ayah: int,
    slug: str = "en-tafisr-ibn-kathir",
    http_client: httpx.AsyncClient | None = None,
    cache: TTLCache | None = None,
    quran_com_base: str = "https://api.quran.com/api/v4",
) -> dict[str, Any]:
    """Fetch classical tafsir with Quran.com v4 primary and spa5k CDN fallback."""
    ok, err = validate_reference(surah, ayah)
    if not ok:
        raise ValueError(err or "Invalid Quran reference")

    canonical_slug = resolve_tafsir_slug(slug)
    entry = TAFSIR_REGISTRY[canonical_slug]
    cache_key = f"tafsir:{canonical_slug}:{surah}:{ayah}"
    loader = functools.partial(
        _load_tafsir,
        surah,
        ayah,
        canonical_slug,
        entry,
        http_client,
        quran_com_base,
    )
    if cache is not None:
        return await cache.get_or_set(cache_key, loader, ttl=3600)
    return await loader()


@function_tool
async def get_tafsir(
    ctx: RunContextWrapper[GroundingContext],
    surah_number: int,
    ayah_number: int,
    tafsir_slug: str = "en-tafisr-ibn-kathir",
) -> str:
    """Fetch classical Tafsir commentary for a specific Surah and Ayah."""
    gctx = ctx.context
    gctx.tool_calls.append(f"get_tafsir:{surah_number}:{ayah_number}")

    ok, err = validate_reference(surah_number, ayah_number)
    if not ok:
        return f"INVALID_REFERENCE: {err}"

    try:
        async with asyncio.timeout(gctx.http_timeout):
            data = await fetch_tafsir(
                surah_number,
                ayah_number,
                slug=tafsir_slug,
                http_client=gctx.http_client,
                cache=gctx.cache,
                quran_com_base=gctx.quran_com_api_base,
            )
    except ValueError as val_err:
        return f"INVALID_TAFSIR_SLUG: {val_err}"
    except Exception as exc:
        logger.warning("get_tafsir error for %s:%s: %s", surah_number, ayah_number, exc)
        return f"TAFSIR_UNAVAILABLE: Could not fetch tafsir for {surah_number}:{ayah_number}."

    text = data["text"]
    excerpt = text[:3500] + ("..." if len(text) > 3500 else "")
    gctx.tafsir_records.append(
        TafsirRecord(
            surah=surah_number,
            ayah=ayah_number,
            tafsir_name=data["tafsirName"],
            slug=data["slug"],
            source_url=data["sourceUrl"],
            text=excerpt,
        )
    )
    return (
        f"VERIFIED TAFSIR ({data['tafsirName']}) FOR {surah_number}:{ayah_number}\n"
        f"Source: {data['sourceUrl']}\n"
        f"{excerpt}"
    )
