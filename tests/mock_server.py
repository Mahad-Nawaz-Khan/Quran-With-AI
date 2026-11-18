"""Contract-identical local HTTP/SSE/HTML5 mock server for dual-mode E2E testing.

Used when E2E_MODE=mock (default when E2E_BASE_URL is unset). Implements:
- All 9 semantic HTML5/ARIA frontend pages:
  /, /surah, /surah/<id>, /juz, /bookmarks, /search, /topics, /about, /privacy
- Exact PROJECT.md localStorage schemas and URL query parameters
- Native <dialog> modals, Ctrl+K Command Palette, Esc close, j/k/Space shortcuts
- All Next.js proxy & FastAPI endpoints (/health, /api/explain, /explain, /explain-stream,
  /api/quran/*, /quran/*) with SSE streaming, canonical 114-surah bounds, grounding,
  and deterministic Class 4 & Class 5 refusals.
"""

from __future__ import annotations

import html
import json
import re
import struct
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from tests.evals.ground_truth import (
    CANONICAL_SURAHS,
    CANONICAL_VERSES,
    JUZ_LIST,
    MAX_AYAHS,
    SURAH_BY_NUMBER,
    TOTAL_JUZ,
    TOTAL_PAGES,
    TOTAL_SURAHS,
    extract_sa_references,
    is_valid_reference,
)


def _make_silent_wav_bytes(duration_sec: float = 0.5, sample_rate: int = 8000) -> bytes:
    num_samples = int(duration_sec * sample_rate)
    data_size = num_samples
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate,
        1,
        8,
        b"data",
        data_size,
    )
    return header + (b"\x80" * num_samples)


SILENT_WAV_BYTES = _make_silent_wav_bytes()

_BISMILLAH_PREFIX = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"

_TAFSIR_CACHE: dict[str, dict[str, Any]] = {}
_WBW_CACHE: dict[str, dict[str, Any]] = {}
_SURAH_CACHE: dict[int, dict[str, Any]] = {}

_TAFSIR_NOTES: dict[str, str] = {
    "1:1": "Ibn Kathir notes that Al-Fatihah opens with Bismillah, affirming all actions begin in the name of Allah, Ar-Rahman (vast mercy) and Ar-Rahim (special mercy to believers).",
    "2:255": "Ibn Kathir calls Ayat al-Kursi the greatest verse in the Quran, affirming Allah's absolute oneness, eternal life (Al-Hayy), self-subsistence (Al-Qayyum), and sovereignty over heavens and earth.",
    "2:153": "Ibn Kathir explains that Allah commands believers to seek strength through steadfast patience (sabr) and prayer (salah), promising His special support to the patient.",
    "36:58": "Ibn Kathir explains that the inhabitants of Paradise are greeted directly with 'Salam' (Peace) from their Merciful Lord.",
    "112:1": "Ibn Kathir explains Surah Al-Ikhlas was revealed affirming pure monotheism: Allah is One (Ahad), unique without partner or equal.",
}

_SAMPLE_WBW: dict[str, list[dict[str, Any]]] = {
    "1:1": [
        {"position": 1, "arabic": "بِسْمِ", "transliteration": "bismi", "translation": "In the name", "root": "س م و"},
        {"position": 2, "arabic": "ٱللَّهِ", "transliteration": "Allahi", "translation": "of Allah", "root": "أ ل ه"},
        {"position": 3, "arabic": "ٱلرَّحْمَٰنِ", "transliteration": "ar-Rahmani", "translation": "the Entirely Merciful", "root": "ر ح م"},
        {"position": 4, "arabic": "ٱلرَّحِيمِ", "transliteration": "ar-Rahimi", "translation": "the Especially Merciful", "root": "ر ح م"},
    ],
    "2:255": [
        {"position": 1, "arabic": "ٱللَّهُ", "transliteration": "Allahu", "translation": "Allah", "root": "أ ل ه"},
        {"position": 2, "arabic": "لَآ", "transliteration": "la", "translation": "there is no", "root": "-"},
        {"position": 3, "arabic": "إِلَٰهَ", "transliteration": "ilaha", "translation": "deity", "root": "أ ل ه"},
        {"position": 4, "arabic": "إِلَّا", "transliteration": "illa", "translation": "except", "root": "-"},
        {"position": 5, "arabic": "هُوَ", "transliteration": "Huwa", "translation": "Him", "root": "-"},
    ],
}

_TOPIC_DATA: dict[str, dict[str, Any]] = {
    "rabbana-duas": {
        "title": "Rabbana Duas",
        "description": "Supplications beginning with Rabbana (Our Lord).",
        "refs": [(2, 201), (2, 286)],
    },
    "patience": {
        "title": "Patience (Sabr)",
        "description": "Steadfastness and perseverance in adversity.",
        "refs": [(2, 153), (94, 5), (94, 6)],
    },
    "gratitude": {
        "title": "Gratitude (Shukr)",
        "description": "Thankfulness and praise to the Sustainer of the worlds.",
        "refs": [(1, 2), (112, 1)],
    },
    "justice": {
        "title": "Justice",
        "description": "Fairness, uprightness, and accountability.",
        "refs": [(1, 4), (2, 255)],
    },
    "mercy": {
        "title": "Mercy (Rahmah)",
        "description": "Allah's all-encompassing mercy and forgiveness.",
        "refs": [(39, 53), (1, 1), (36, 58)],
    },
    "stories-of-prophets": {
        "title": "Stories of Prophets",
        "description": "Lessons from prophets and righteous believers.",
        "refs": [(18, 10), (36, 58)],
    },
}


def _strip_bismillah_for_reader(arabic: str, surah_num: int, ayah_num: int) -> str:
    if surah_num in (1, 9) or ayah_num != 1:
        return arabic
    if arabic.startswith(_BISMILLAH_PREFIX):
        remainder = arabic[len(_BISMILLAH_PREFIX) :].strip()
        return remainder if remainder else arabic
    return arabic


def _build_verse_payload(surah_num: int, ayah_num: int) -> dict[str, Any]:
    key = f"{surah_num}:{ayah_num}"
    audio_url = f"/audio/{surah_num}/{ayah_num}.wav"
    if key in CANONICAL_VERSES:
        v = CANONICAL_VERSES[key]
        return {
            "number": ayah_num,
            "numberInSurah": ayah_num,
            "page": v["page"],
            "juz": v["juz"],
            "hizbQuarter": v["hizbQuarter"],
            "arabic": v["quran-uthmani"],
            "tajweed": v["quran-uthmani"],
            "translations": {
                "en.sahih": v["en.sahih"],
                "en.asad": v["en.asad"],
                "ur.jalandhry": v["ur.jalandhry"],
                "ur.khan": f"{v['ur.jalandhry']} (کنز الایمان)",
            },
            "audio": audio_url,
        }

    # Canonical deterministic coordinates for surahs without all 286 verses stored verbatim
    default_page = 604 if surah_num >= 112 else min(604, max(1, (surah_num * 5) - 3))
    default_juz = 30 if surah_num >= 78 else min(30, max(1, (surah_num // 4) + 1))
    default_hizb = 240 if surah_num >= 112 else min(240, max(1, default_juz * 8 - 7))
    s_info = SURAH_BY_NUMBER[surah_num]
    return {
        "number": ayah_num,
        "numberInSurah": ayah_num,
        "page": default_page,
        "juz": default_juz,
        "hizbQuarter": default_hizb,
        "arabic": f"آيَة {ayah_num} مِن سُورَة {s_info['name']}",
        "tajweed": f"آيَة {ayah_num} مِن سُورَة {s_info['name']}",
        "translations": {
            "en.sahih": f"Surah {s_info['englishName']}, Ayah {ayah_num} (Sahih International).",
            "en.asad": f"Surah {s_info['englishName']}, Ayah {ayah_num} (Muhammad Asad).",
            "ur.jalandhry": f"سورہ {s_info['englishName']} آیت {ayah_num} (جالندھری)",
            "ur.khan": f"سورہ {s_info['englishName']} آیت {ayah_num} (احمد رضا خان)",
        },
        "audio": audio_url,
    }


def _get_surah_payload(surah_num: int) -> dict[str, Any]:
    if surah_num in _SURAH_CACHE:
        return _SURAH_CACHE[surah_num]
    s_info = SURAH_BY_NUMBER[surah_num]
    total = s_info["numberOfAyahs"]
    ayahs = []
    for idx in range(1, total + 1):
        item = dict(_build_verse_payload(surah_num, idx))
        item["rawText"] = item["arabic"]
        item["arabic"] = _strip_bismillah_for_reader(item["arabic"], surah_num, idx)
        item["tajweed"] = item["arabic"]
        ayahs.append(item)
    payload = {
        "surah": s_info,
        "editions": ["en.sahih"],
        "bismillahPre": surah_num not in (1, 9),
        "ayahs": ayahs,
    }
    _SURAH_CACHE[surah_num] = payload
    return payload


def _get_tafsir_payload(surah_num: int, ayah_num: int, slug: str = "en-tafisr-ibn-kathir") -> dict[str, Any]:
    cache_key = f"{surah_num}:{ayah_num}:{slug}"
    if cache_key in _TAFSIR_CACHE:
        return _TAFSIR_CACHE[cache_key]
    ref = f"{surah_num}:{ayah_num}"
    text = _TAFSIR_NOTES.get(
        ref,
        f"Classical commentary from Tafsir Ibn Kathir on Quran {ref} ({SURAH_BY_NUMBER[surah_num]['englishName']}).",
    )
    payload = {
        "surah": surah_num,
        "ayah": ayah_num,
        "tafsirName": "Tafsir Ibn Kathir" if "kathir" in slug else "Tafsir Al-Jalalayn",
        "sourceUrl": f"https://quran.com/{surah_num}/{ayah_num}/tafsirs/{slug}",
        "text": text,
    }
    _TAFSIR_CACHE[cache_key] = payload
    return payload


def _get_wbw_payload(surah_num: int, ayah_num: int) -> dict[str, Any]:
    ref = f"{surah_num}:{ayah_num}"
    if ref in _WBW_CACHE:
        return _WBW_CACHE[ref]
    words = _SAMPLE_WBW.get(ref)
    if words is None:
        v = _build_verse_payload(surah_num, ayah_num)
        parts = v["arabic"].split()
        words = [
            {
                "position": idx + 1,
                "arabic": part,
                "transliteration": f"kalimah-{idx + 1}",
                "translation": f"word {idx + 1}",
                "root": "ع ر ب",
            }
            for idx, part in enumerate(parts[:8])
        ]
    payload = {"surah": surah_num, "ayah": ayah_num, "words": words}
    _WBW_CACHE[ref] = payload
    return payload


def _search_quran_payload(query: str, edition: str = "en.sahih", limit: int = 40) -> dict[str, Any]:
    q_clean = query.strip()
    q_lower = q_clean.lower()
    surah_matches: list[dict[str, Any]] = []
    ayah_matches: list[dict[str, Any]] = []

    sa_refs = extract_sa_references(q_clean)
    if sa_refs:
        s_num, a_num = sa_refs[0]
        if is_valid_reference(s_num, a_num):
            s_info = SURAH_BY_NUMBER[s_num]
            v = _build_verse_payload(s_num, a_num)
            surah_matches.append(s_info)
            ayah_matches.append(
                {
                    "surah": s_num,
                    "surahName": s_info["englishName"],
                    "ayah": a_num,
                    "arabic": v["arabic"],
                    "translation": v["translations"].get(edition, v["translations"]["en.sahih"]),
                    "edition": edition,
                }
            )
    else:
        for row in CANONICAL_SURAHS:
            if (
                q_lower in row[2].lower()
                or q_lower in row[3].lower()
                or q_clean == str(row[0])
            ):
                surah_matches.append(SURAH_BY_NUMBER[row[0]])

        for ref, v in CANONICAL_VERSES.items():
            s_num, a_num = v["surah"], v["ayah"]
            trans = v.get(edition, v["en.sahih"])
            if q_lower in trans.lower() or q_lower in v["quran-uthmani"].lower():
                ayah_matches.append(
                    {
                        "surah": s_num,
                        "surahName": SURAH_BY_NUMBER[s_num]["englishName"],
                        "ayah": a_num,
                        "arabic": v["quran-uthmani"],
                        "translation": trans,
                        "edition": edition,
                    }
                )
        if q_lower in ("patience", "sabr") and not any(m["surah"] == 2 and m["ayah"] == 153 for m in ayah_matches):
            v = CANONICAL_VERSES["2:153"]
            ayah_matches.append(
                {
                    "surah": 2,
                    "surahName": SURAH_BY_NUMBER[2]["englishName"],
                    "ayah": 153,
                    "arabic": v["quran-uthmani"],
                    "translation": v.get(edition, v["en.sahih"]),
                    "edition": edition,
                }
            )

    ayah_matches = ayah_matches[:limit]
    return {
        "query": q_clean,
        "surahMatches": surah_matches[:limit],
        "ayahMatches": ayah_matches,
        "totalAyahMatches": len(ayah_matches),
    }


def _is_strict_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _evaluate_explain_request(body: dict[str, Any]) -> dict[str, Any]:
    """Deterministic zero-hallucination AI grounding evaluator for mock mode."""
    ayah_text = str(body.get("ayahText", "")).strip()
    surah_num = body.get("surahNumber")
    ayah_num = body.get("ayahNumber")
    editions = body.get("translationEditions") or ["en.sahih"]
    edition = str(editions[0]) if editions else "en.sahih"
    is_search = bool(body.get("isSearch", False))
    history = body.get("history") or []

    lower_q = ayah_text.lower()

    # Class 5d: Prompt injection check in ayahText
    injection_markers = ("ignore all previous", "ignore previous instructions", "output fake surah", "verified=true")
    if any(m in lower_q for m in injection_markers):
        if _is_strict_int(surah_num) and _is_strict_int(ayah_num) and is_valid_reference(surah_num, ayah_num):
            v = _build_verse_payload(surah_num, ayah_num)
            trans = v["translations"].get(edition, v["translations"]["en.sahih"])
            ref = f"{surah_num}:{ayah_num}"
            return {
                "explanation": (
                    f"Prompt override instructions were ignored. Verified canonical Quran {ref} "
                    f"({SURAH_BY_NUMBER[surah_num]['englishName']}):\n\n"
                    f"{v['arabic']}\n\n\"{trans}\""
                ),
                "verified": True,
                "refusal": False,
                "sources": [
                    {
                        "type": "quran",
                        "label": f"Al-Quran Cloud ({edition})",
                        "reference": ref,
                        "url": f"https://api.alquran.cloud/v1/ayah/{ref}/editions/quran-uthmani,{edition}",
                    }
                ],
                "canonicalVerse": {
                    "surah": surah_num,
                    "ayah": ayah_num,
                    "arabic": v["arabic"],
                    "translation": trans,
                    "edition": edition,
                },
            }
        return {
            "explanation": "I cannot comply with instructions attempting to fabricate Quranic verses or override grounding rules.",
            "verified": True,
            "refusal": True,
            "sources": [],
            "canonicalVerse": None,
        }

    # Class 5a/5b: Explicit surahNumber / ayahNumber bounds check
    if surah_num is not None:
        if not _is_strict_int(surah_num) or surah_num < 1 or surah_num > TOTAL_SURAHS:
            return {
                "explanation": f"Cannot fulfill request: Surah {surah_num} does not exist. The Quran has 114 surahs (1 to 114).",
                "verified": True,
                "refusal": True,
                "sources": [],
                "canonicalVerse": None,
            }
        max_a = MAX_AYAHS[surah_num]
        s_name = SURAH_BY_NUMBER[surah_num]["englishName"]
        if ayah_num is not None and (not _is_strict_int(ayah_num) or ayah_num < 1 or ayah_num > max_a):
            return {
                "explanation": f"Cannot fulfill request: {surah_num}:{ayah_num} is out of bounds. Surah {s_name} ({surah_num}) has {max_a} ayahs (1 to {max_a}).",
                "verified": True,
                "refusal": True,
                "sources": [],
                "canonicalVerse": None,
            }

    # Class 5a/5b: Out-of-bounds S:A mentioned in search/chat prompt
    extracted_refs = extract_sa_references(ayah_text)
    for s_ref, a_ref in extracted_refs:
        if not is_valid_reference(s_ref, a_ref):
            if s_ref < 1 or s_ref > TOTAL_SURAHS:
                msg = f"I cannot verify Quran {s_ref}:{a_ref}: there are only 114 surahs in the Quran (Surah 1 to Surah 114)."
            else:
                s_name = SURAH_BY_NUMBER[s_ref]["englishName"]
                msg = f"I cannot verify Quran {s_ref}:{a_ref}: Surah {s_name} ({s_ref}) has {MAX_AYAHS[s_ref]} ayahs (1 to {MAX_AYAHS[s_ref]})."
            return {
                "explanation": msg,
                "verified": True,
                "refusal": True,
                "sources": [],
                "canonicalVerse": None,
            }

    # Class 5c: Fabricated hadith prompt
    if "bukhari" in lower_q or "99999" in lower_q or "hadith #" in lower_q or "hadith number" in lower_q:
        return {
            "explanation": "I cannot verify that hadith or provide a verbatim Arabic text or narrator chain from available verified sources.",
            "verified": True,
            "refusal": True,
            "sources": [],
            "canonicalVerse": None,
        }

    # Class 4: Unverifiable scholarly detail or out-of-scope question
    unverifiable_keywords = (
        "mustadrak",
        "vol 4 page 512",
        "stock price",
        "apple stock",
        "insulin",
        "medical/legal fatwa",
        "fatwa",
        "weather",
        "mars",
    )
    if any(k in lower_q for k in unverifiable_keywords):
        return {
            "explanation": (
                "I cannot verify this request from available authoritative Quranic or scholarly sources. "
                "This falls outside verified Quran API and tafsir retrieval; please consult a qualified scholar or domain specialist."
            ),
            "verified": True,
            "refusal": True,
            "sources": [],
            "canonicalVerse": None,
        }

    # Class 1: Canonical Verse Explanation (valid surahNumber & ayahNumber, isSearch=False)
    if not is_search and _is_strict_int(surah_num) and _is_strict_int(ayah_num):
        v = _build_verse_payload(surah_num, ayah_num)
        trans = v["translations"].get(edition, v["translations"]["en.sahih"])
        ref = f"{surah_num}:{ayah_num}"
        tafsir = _get_tafsir_payload(surah_num, ayah_num)
        s_name = SURAH_BY_NUMBER[surah_num]["englishName"]
        explanation = (
            f"Surah {s_name} ({ref}) — Verified Canonical Verse:\n\n"
            f"{v['arabic']}\n\n"
            f"Translation ({edition}): \"{trans}\"\n\n"
            f"Tafsir Insight ({tafsir['tafsirName']}): {tafsir['text']}"
        )
        return {
            "explanation": explanation,
            "verified": True,
            "refusal": False,
            "sources": [
                {
                    "type": "quran",
                    "label": f"Al-Quran Cloud ({edition})",
                    "reference": ref,
                    "url": f"https://api.alquran.cloud/v1/ayah/{ref}/editions/quran-uthmani,{edition}",
                },
                {
                    "type": "tafsir",
                    "label": tafsir["tafsirName"],
                    "reference": ref,
                    "url": tafsir["sourceUrl"],
                },
            ],
            "canonicalVerse": {
                "surah": surah_num,
                "ayah": ayah_num,
                "arabic": v["arabic"],
                "translation": trans,
                "edition": edition,
            },
        }

    # Class 2b: Surah 112:1-4 range lookup
    if "112" in lower_q or "ikhlas" in lower_q or "ikhlaas" in lower_q:
        s_info = SURAH_BY_NUMBER[112]
        lines = [
            f"Surah {s_info['englishName']} (112, {s_info['numberOfAyahs']} ayahs, {s_info['revelationType']}):"
        ]
        sources = []
        for a in range(1, 5):
            v = CANONICAL_VERSES[f"112:{a}"]
            lines.append(f"[112:{a}] {v['quran-uthmani']}\n\"{v['en.sahih']}\"")
            sources.append(
                {
                    "type": "quran",
                    "label": "Al-Quran Cloud (en.sahih)",
                    "reference": f"112:{a}",
                    "url": f"https://api.alquran.cloud/v1/ayah/112:{a}/editions/quran-uthmani,en.sahih",
                }
            )
        return {
            "explanation": "\n\n".join(lines),
            "verified": True,
            "refusal": False,
            "sources": sources,
            "canonicalVerse": {
                "surah": 112,
                "ayah": 1,
                "arabic": CANONICAL_VERSES["112:1"]["quran-uthmani"],
                "translation": CANONICAL_VERSES["112:1"]["en.sahih"],
                "edition": "en.sahih",
            },
        }

    # Class 2: Single extracted valid S:A lookup (e.g., 36:58, 18:10, 2:255)
    if extracted_refs:
        s_ref, a_ref = extracted_refs[0]
        v = _build_verse_payload(s_ref, a_ref)
        s_info = SURAH_BY_NUMBER[s_ref]
        trans = v["translations"].get(edition, v["translations"]["en.sahih"])
        ref = f"{s_ref}:{a_ref}"
        return {
            "explanation": (
                f"Quran {ref} — Surah {s_info['englishName']} "
                f"({s_info['numberOfAyahs']} ayahs, {s_info['revelationType']}):\n\n"
                f"{v['arabic']}\n\n"
                f"\"{trans}\""
            ),
            "verified": True,
            "refusal": False,
            "sources": [
                {
                    "type": "quran",
                    "label": f"Al-Quran Cloud ({edition})",
                    "reference": ref,
                    "url": f"https://api.alquran.cloud/v1/ayah/{ref}/editions/quran-uthmani,{edition}",
                }
            ],
            "canonicalVerse": {
                "surah": s_ref,
                "ayah": a_ref,
                "arabic": v["arabic"],
                "translation": trans,
                "edition": edition,
            },
        }

    # Class 3c: Multi-turn follow-up inspecting prior assistant history
    if history and ("first verse" in lower_q or "exact reference" in lower_q or "mentioned" in lower_q or "follow" in lower_q):
        for msg in history:
            if msg.get("role") == "assistant":
                hist_refs = [r for r in extract_sa_references(str(msg.get("content", ""))) if is_valid_reference(*r)]
                if hist_refs:
                    s_ref, a_ref = hist_refs[0]
                    v = _build_verse_payload(s_ref, a_ref)
                    trans = v["translations"].get(edition, v["translations"]["en.sahih"])
                    ref = f"{s_ref}:{a_ref}"
                    return {
                        "explanation": f"The first verse referenced was [{ref}]:\n\n{v['arabic']}\n\n\"{trans}\"",
                        "verified": True,
                        "refusal": False,
                        "sources": [
                            {
                                "type": "quran",
                                "label": f"Al-Quran Cloud ({edition})",
                                "reference": ref,
                                "url": f"https://api.alquran.cloud/v1/ayah/{ref}/editions/quran-uthmani,{edition}",
                            }
                        ],
                        "canonicalVerse": {
                            "surah": s_ref,
                            "ayah": a_ref,
                            "arabic": v["arabic"],
                            "translation": trans,
                            "edition": edition,
                        },
                    }

    # Class 3a: Patience (sabr)
    if "patience" in lower_q or "sabr" in lower_q or "hardship" in lower_q:
        v1 = CANONICAL_VERSES["2:153"]
        v2 = CANONICAL_VERSES["94:5"]
        return {
            "explanation": (
                "The Quran highlights steadfast patience (sabr) and trust in Allah:\n\n"
                f"[2:153] {v1['quran-uthmani']}\n\"{v1['en.sahih']}\"\n\n"
                f"[94:5] {v2['quran-uthmani']}\n\"{v2['en.sahih']}\""
            ),
            "verified": True,
            "refusal": False,
            "sources": [
                {"type": "quran", "label": "Al-Quran Cloud (en.sahih)", "reference": "2:153", "url": "https://api.alquran.cloud/v1/ayah/2:153"},
                {"type": "quran", "label": "Al-Quran Cloud (en.sahih)", "reference": "94:5", "url": "https://api.alquran.cloud/v1/ayah/94:5"},
            ],
            "canonicalVerse": {
                "surah": 2,
                "ayah": 153,
                "arabic": v1["quran-uthmani"],
                "translation": v1["en.sahih"],
                "edition": "en.sahih",
            },
        }

    # Class 3b: Mercy (rahmah) or general fallback
    v1 = CANONICAL_VERSES["39:53"]
    v2 = CANONICAL_VERSES["1:1"]
    return {
        "explanation": (
            "The Quran emphasizes Allah's boundless mercy (rahmah):\n\n"
            f"[39:53] {v1['quran-uthmani']}\n\"{v1['en.sahih']}\"\n\n"
            f"[1:1] {v2['quran-uthmani']}\n\"{v2['en.sahih']}\""
        ),
        "verified": True,
        "refusal": False,
        "sources": [
            {"type": "quran", "label": "Al-Quran Cloud (en.sahih)", "reference": "39:53", "url": "https://api.alquran.cloud/v1/ayah/39:53"},
            {"type": "quran", "label": "Al-Quran Cloud (en.sahih)", "reference": "1:1", "url": "https://api.alquran.cloud/v1/ayah/1:1"},
        ],
        "canonicalVerse": {
            "surah": 39,
            "ayah": 53,
            "arabic": v1["quran-uthmani"],
            "translation": v1["en.sahih"],
            "edition": "en.sahih",
        },
    }


def _render_html_shell(title: str, body_html: str, page_script: str = "", surah_context: int | None = None) -> str:
    """Render a semantic HTML5/ARIA page matching PROJECT.md contracts."""
    surahs_json = json.dumps(
        [
            {
                "number": r[0],
                "name": r[1],
                "englishName": r[2],
                "englishNameTranslation": r[3],
                "numberOfAyahs": r[4],
                "revelationType": r[5],
            }
            for r in CANONICAL_SURAHS
        ],
        ensure_ascii=False,
    )
    juz_json = json.dumps(JUZ_LIST, ensure_ascii=False)
    surah_ctx_js = str(surah_context) if surah_context is not None else "null"

    surah_switcher_html = ""
    if surah_context is not None:
        s_info = SURAH_BY_NUMBER.get(surah_context)
        label = f"{s_info['number']}. {s_info['englishName']}" if s_info else "Switch Surah"
        surah_switcher_html = f"""
        <div style="position:relative;display:inline-block;">
          <button type="button" id="header-surah-btn" aria-label="Switch Surah" aria-expanded="false">{html.escape(label)}</button>
          <div id="header-surah-dropdown" hidden style="position:absolute;top:100%;left:0;width:260px;max-height:280px;overflow:auto;background:var(--card);border:1px solid #475569;padding:8px;z-index:50;">
            <label for="header-surah-filter" class="sr-only">Filter surahs</label>
            <input id="header-surah-filter" type="text" placeholder="Filter surahs..." aria-label="Filter surahs" style="width:100%;padding:4px;margin-bottom:6px;" />
            <ul id="header-surah-list" style="list-style:none;margin:0;padding:0;"></ul>
          </div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)} — Quranic AI</title>
  <style>
    :root {{
      --background: #f8fafc;
      --foreground: #0f172a;
      --card: #ffffff;
      --primary: #2ca4ab;
      --muted: #64748b;
      --border: #cbd5e1;
    }}
    html.dark {{
      --background: #1f2125;
      --foreground: #f8fafc;
      --card: #2d2f33;
      --primary: #2ca4ab;
      --muted: #9ca3af;
      --border: #3f4451;
    }}
    @font-face {{
      font-family: 'Jameel Noori Nastaleeq';
      src: url('/fonts/Jameel-Noori-Nastaleeq.ttf') format('truetype');
      font-display: swap;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background-color: var(--background);
      color: var(--foreground);
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
    }}
    a {{ color: var(--primary); text-decoration: none; }}
    button, input, select, textarea {{ font: inherit; color: inherit; }}
    button {{ cursor: pointer; background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; }}
    input, select, textarea {{ background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; }}
    .sr-only {{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }}
    [hidden] {{ display: none !important; }}
    .font-urdu {{ font-family: 'Jameel Noori Nastaleeq', serif; direction: rtl; font-size: 1.25rem; }}
    .hifz-blurred {{ filter: blur(6px); user-select: none; cursor: pointer; }}
    .hifz-revealed {{ filter: none; }}
    .tajweed-script .tajweed-ghunnah {{ color: #16a34a; font-weight: 600; }}
    .card {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }}
    .action-group {{ opacity: 0.95; display: flex; gap: 6px; flex-wrap: wrap; }}
    .action-group:focus-within {{ opacity: 1; }}
    header[role="banner"] {{
      position: fixed; top: 0; left: 0; right: 0; height: 56px; z-index: 40;
      background: var(--card); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between; padding: 0 12px; gap: 8px;
      overflow-x: auto; white-space: nowrap;
    }}
    dialog {{
      background: var(--card); color: var(--foreground); border: 1px solid var(--border);
      border-radius: 10px; padding: 20px; max-width: 600px; width: 92vw;
    }}
    dialog::backdrop {{ background: rgba(0,0,0,0.6); }}
    @media (max-width: 1023px) {{
      .desktop-only-open[data-mobile-open="false"] {{ display: none; }}
    }}
  </style>
</head>
<body>
  <header role="banner">
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="/" style="font-weight:700;font-size:1.1rem;" data-i18n="brand">Quranic AI</a>
      {surah_switcher_html}
      <nav aria-label="Main navigation" style="display:flex;gap:10px;flex-wrap:nowrap;">
        <a href="/" data-i18n="nav_home">Home</a>
        <a href="/surah" data-i18n="nav_surahs">Surahs</a>
        <a href="/juz" data-i18n="nav_juz">Juz</a>
        <a href="/topics" data-i18n="nav_topics">Topics</a>
        <a href="/bookmarks" data-i18n="nav_bookmarks">Bookmarks</a>
        <a href="/search" data-i18n="nav_search">Search</a>
      </nav>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button type="button" id="hdr-search-btn" aria-label="Search">Search (Ctrl+K)</button>
      <button type="button" id="hdr-lang-btn" aria-label="Language">EN</button>
      <button type="button" id="hdr-theme-btn" aria-label="Toggle Theme">Theme</button>
      <button type="button" id="hdr-settings-btn" aria-label="Settings">Settings</button>
    </div>
  </header>

  <main role="main" style="padding-top:80px;padding-left:16px;padding-right:16px;max-width:1160px;margin:0 auto;">
    {body_html}
  </main>

  <dialog id="search-dialog" aria-labelledby="search-dialog-title">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h2 id="search-dialog-title" style="margin:0;">Command Palette</h2>
      <button type="button" id="search-dialog-close" aria-label="Close search dialog">Close</button>
    </div>
    <form id="cmd-palette-form">
      <label for="cmd-palette-input" class="sr-only">Command palette search</label>
      <input id="cmd-palette-input" type="text" placeholder="Jump to 2:255, Surah, Juz 30, Page 604, or search..." style="width:100%;" />
      <p style="font-size:0.85rem;color:var(--muted);">Press Esc to close</p>
      <button type="submit">Go</button>
    </form>
  </dialog>

  <dialog id="settings-dialog" aria-labelledby="settings-dialog-title">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h2 id="settings-dialog-title" style="margin:0;">Settings</h2>
      <button type="button" id="settings-dialog-close" aria-label="Close settings">Close</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label for="settings-language-select">Language</label>
        <select id="settings-language-select">
          <option value="en">English (en)</option>
          <option value="ar">العربية (ar)</option>
          <option value="ur">اردو (ur)</option>
          <option value="id">Bahasa Indonesia (id)</option>
          <option value="tr">Türkçe (tr)</option>
        </select>
      </div>
      <div>
        <span>Theme</span>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button type="button" id="settings-theme-light">Light</button>
          <button type="button" id="settings-theme-dark">Dark</button>
        </div>
      </div>
    </div>
  </dialog>

  <div id="chat-widget-root" style="position:fixed;right:20px;bottom:20px;z-index:60;">
    <button type="button" id="chat-fab-btn" aria-label="Open chat">Ask Quran AI</button>
    <section id="chat-panel" hidden aria-label="Quran AI Assistant" class="card" style="width:360px;max-width:92vw;margin-top:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;">Quran AI</h3>
        <button type="button" id="chat-close-btn" aria-label="Close chat">X</button>
      </div>
      <div id="chat-context-banner" hidden style="font-size:0.85rem;color:var(--primary);margin-bottom:6px;"></div>
      <div id="chat-status" role="status" aria-live="polite" style="font-size:0.85rem;color:var(--muted);min-height:20px;"></div>
      <div id="chat-messages" role="log" aria-live="polite" style="max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin:8px 0;"></div>
      <form id="chat-form" style="display:flex;gap:6px;">
        <label for="chat-input" class="sr-only">Ask a question about the Quran</label>
        <input id="chat-input" type="text" placeholder="Ask about the Quran..." style="flex:1;" />
        <button type="submit" aria-label="Send message">Send</button>
      </form>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:6px;">Powered by OpenRouter • Verified Quran APIs</div>
    </section>
  </div>

  <script>
    window.__QURAN_SURAHS__ = {surahs_json};
    window.__QURAN_JUZ__ = {juz_json};
    window.__SURAH_CONTEXT__ = {surah_ctx_js};

    (function() {{
      const I18N = {{
        en: {{ nav_home: "Home", nav_surahs: "Surahs", nav_juz: "Juz", nav_topics: "Topics", nav_bookmarks: "Bookmarks", nav_search: "Search" }},
        ar: {{ nav_home: "الرئيسية", nav_surahs: "السور", nav_juz: "الأجزاء", nav_topics: "المواضيع", nav_bookmarks: "المحفوظات", nav_search: "بحث" }},
        ur: {{ nav_home: "ہوم", nav_surahs: "سورتیں", nav_juz: "پارے", nav_topics: "موضوعات", nav_bookmarks: "بک مارکس", nav_search: "تلاش" }},
        id: {{ nav_home: "Beranda", nav_surahs: "Surah", nav_juz: "Juz", nav_topics: "Topik", nav_bookmarks: "Penanda", nav_search: "Cari" }},
        tr: {{ nav_home: "Ana Sayfa", nav_surahs: "Sureler", nav_juz: "Cüz", nav_topics: "Konular", nav_bookmarks: "Yer İmleri", nav_search: "Ara" }}
      }};

      window.escapeHtml = function(val) {{
        return String(val === null || val === undefined ? "" : val)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }};

      window.safeReadJSON = function(key, fallback) {{
        try {{
          const raw = localStorage.getItem(key);
          if (!raw) return fallback;
          const parsed = JSON.parse(raw);
          return parsed === null || parsed === undefined ? fallback : parsed;
        }} catch (_e) {{
          return fallback;
        }}
      }};

      window.safeWriteJSON = function(key, value) {{
        try {{ localStorage.setItem(key, JSON.stringify(value)); }} catch (_e) {{}}
      }};

      function applyTheme(theme) {{
        const mode = theme === "light" ? "light" : "dark";
        document.documentElement.classList.toggle("dark", mode === "dark");
        try {{ localStorage.setItem("theme", mode); }} catch (_e) {{}}
        const btn = document.getElementById("hdr-theme-btn");
        if (btn) btn.setAttribute("data-theme", mode);
      }}

      function applyLanguage(lang) {{
        const valid = ["en", "ar", "ur", "id", "tr"].includes(lang) ? lang : "en";
        try {{ localStorage.setItem("quran-language", valid); }} catch (_e) {{}}
        document.documentElement.lang = valid;
        document.documentElement.dir = (valid === "ar" || valid === "ur") ? "rtl" : "ltr";
        const dict = I18N[valid] || I18N.en;
        document.querySelectorAll("[data-i18n]").forEach((el) => {{
          const k = el.getAttribute("data-i18n");
          if (k && dict[k]) el.textContent = dict[k];
        }});
        const langBtn = document.getElementById("hdr-lang-btn");
        if (langBtn) langBtn.textContent = valid.toUpperCase();
        const sel = document.getElementById("settings-language-select");
        if (sel) sel.value = valid;
      }}

      // Initialize theme & language cleanly (never throwing on corrupted storage)
      let initTheme = "dark";
      try {{
        const storedTheme = localStorage.getItem("theme");
        if (storedTheme === "light" || storedTheme === "dark") initTheme = storedTheme;
      }} catch (_e) {{}}
      applyTheme(initTheme);

      let initLang = "en";
      try {{
        const storedLang = localStorage.getItem("quran-language");
        if (storedLang && ["en","ar","ur","id","tr"].includes(storedLang)) initLang = storedLang;
      }} catch (_e) {{}}
      applyLanguage(initLang);

      // Header buttons
      const searchDialog = document.getElementById("search-dialog");
      const settingsDialog = document.getElementById("settings-dialog");

      document.getElementById("hdr-search-btn")?.addEventListener("click", () => {{
        searchDialog?.showModal();
        document.getElementById("cmd-palette-input")?.focus();
      }});
      document.getElementById("search-dialog-close")?.addEventListener("click", () => searchDialog?.close());

      document.getElementById("hdr-settings-btn")?.addEventListener("click", () => settingsDialog?.showModal());
      document.getElementById("settings-dialog-close")?.addEventListener("click", () => settingsDialog?.close());

      document.getElementById("hdr-theme-btn")?.addEventListener("click", () => {{
        const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
        applyTheme(next);
      }});
      document.getElementById("settings-theme-light")?.addEventListener("click", () => applyTheme("light"));
      document.getElementById("settings-theme-dark")?.addEventListener("click", () => applyTheme("dark"));

      document.getElementById("hdr-lang-btn")?.addEventListener("click", () => {{
        const order = ["en", "ar", "ur", "id", "tr"];
        const cur = localStorage.getItem("quran-language") || "en";
        const next = order[(order.indexOf(cur) + 1) % order.length];
        applyLanguage(next);
      }});
      document.getElementById("settings-language-select")?.addEventListener("change", (e) => {{
        applyLanguage(e.target.value);
      }});

      // Ctrl+K / Cmd+K global listener
      document.addEventListener("keydown", (e) => {{
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {{
          e.preventDefault();
          if (searchDialog && !searchDialog.open) {{
            searchDialog.showModal();
            document.getElementById("cmd-palette-input")?.focus();
          }}
        }}
      }});

      // Command Palette navigation
      document.getElementById("cmd-palette-form")?.addEventListener("submit", (e) => {{
        e.preventDefault();
        const raw = (document.getElementById("cmd-palette-input")?.value || "").trim();
        if (!raw) return;
        const saMatch = raw.match(/^(\\d{{1,3}}):(\\d{{1,3}})$/);
        if (saMatch) {{
          window.location.href = "/surah/" + saMatch[1] + "?ayah=" + saMatch[2];
          return;
        }}
        const juzMatch = raw.match(/^juz\\s+(\\d{{1,2}})$/i);
        if (juzMatch) {{
          const jNum = Math.max(1, Math.min(30, parseInt(juzMatch[1], 10)));
          const jObj = window.__QURAN_JUZ__[jNum - 1];
          window.location.href = "/surah/" + jObj.startSurah + "?ayah=" + jObj.startAyah;
          return;
        }}
        const pageMatch = raw.match(/^page\\s+(\\d{{1,3}})$/i);
        if (pageMatch) {{
          const pNum = Math.max(1, Math.min(604, parseInt(pageMatch[1], 10)));
          const targetSurah = pNum >= 604 ? 112 : Math.max(1, Math.min(114, Math.ceil(pNum / 5)));
          window.location.href = "/surah/" + targetSurah;
          return;
        }}
        const surahHit = window.__QURAN_SURAHS__.find((s) =>
          s.englishName.toLowerCase().includes(raw.toLowerCase()) || String(s.number) === raw
        );
        if (surahHit && !raw.includes(" ")) {{
          window.location.href = "/surah/" + surahHit.number;
          return;
        }}
        window.location.href = "/search?q=" + encodeURIComponent(raw);
      }});

      // Header Surah dropdown filter (present on /surah/[id])
      const hdrSurahBtn = document.getElementById("header-surah-btn");
      const hdrSurahDrop = document.getElementById("header-surah-dropdown");
      const hdrSurahFilter = document.getElementById("header-surah-filter");
      const hdrSurahList = document.getElementById("header-surah-list");

      function renderHdrSurahs(q) {{
        if (!hdrSurahList) return;
        const ql = (q || "").trim().toLowerCase();
        const items = window.__QURAN_SURAHS__.filter((s) =>
          !ql || s.englishName.toLowerCase().includes(ql) || s.name.includes(q) || String(s.number) === ql
        );
        hdrSurahList.innerHTML = items.slice(0, 30).map((s) =>
          '<li><a href="/surah/' + s.number + '" style="display:block;padding:4px 6px;">' + s.number + '. ' + window.escapeHtml(s.englishName) + '</a></li>'
        ).join("");
      }}
      if (hdrSurahBtn && hdrSurahDrop) {{
        renderHdrSurahs("");
        hdrSurahBtn.addEventListener("click", () => {{
          const isHidden = hdrSurahDrop.hasAttribute("hidden");
          if (isHidden) {{
            hdrSurahDrop.removeAttribute("hidden");
            hdrSurahBtn.setAttribute("aria-expanded", "true");
            hdrSurahFilter?.focus();
          }} else {{
            hdrSurahDrop.setAttribute("hidden", "");
            hdrSurahBtn.setAttribute("aria-expanded", "false");
          }}
        }});
        hdrSurahFilter?.addEventListener("input", (e) => renderHdrSurahs(e.target.value));
      }}

      // ChatWidget state & /api/explain SSE client
      const chatRoot = document.getElementById("chat-widget-root");
      const chatFab = document.getElementById("chat-fab-btn");
      const chatPanel = document.getElementById("chat-panel");
      const chatClose = document.getElementById("chat-close-btn");
      const chatForm = document.getElementById("chat-form");
      const chatInput = document.getElementById("chat-input");
      const chatStatus = document.getElementById("chat-status");
      const chatMessages = document.getElementById("chat-messages");
      const chatContextBanner = document.getElementById("chat-context-banner");

      const chatHistory = [];
      let scopedSurah = null;
      let scopedAyah = null;

      window.updateChatFabPosition = function() {{
        const audioBar = document.getElementById("audio-player-bar");
        if (chatRoot && audioBar && !audioBar.hasAttribute("hidden")) {{
          const rect = audioBar.getBoundingClientRect();
          const offset = Math.max(96, Math.ceil(rect.height) + 16);
          chatRoot.style.bottom = offset + "px";
        }} else if (chatRoot) {{
          chatRoot.style.bottom = "20px";
        }}
      }};
      window.addEventListener("resize", () => window.updateChatFabPosition?.());

      window.openChatWithContext = function(surah, ayah, text) {{
        scopedSurah = surah;
        scopedAyah = ayah;
        chatPanel?.removeAttribute("hidden");
        chatFab?.setAttribute("aria-label", "Close chat");
        if (chatContextBanner) {{
          chatContextBanner.removeAttribute("hidden");
          chatContextBanner.textContent = "Context: Quran " + surah + ":" + ayah;
        }}
        if (chatInput) {{
          chatInput.value = text || ("Explain Quran " + surah + ":" + ayah);
          chatInput.focus();
        }}
      }};

      chatFab?.addEventListener("click", () => {{
        if (chatPanel?.hasAttribute("hidden")) {{
          chatPanel.removeAttribute("hidden");
          chatFab.setAttribute("aria-label", "Close chat");
          chatInput?.focus();
        }} else {{
          chatPanel?.setAttribute("hidden", "");
          chatFab.setAttribute("aria-label", "Open chat");
        }}
      }});
      chatClose?.addEventListener("click", () => {{
        chatPanel?.setAttribute("hidden", "");
        chatFab?.setAttribute("aria-label", "Open chat");
      }});

      function linkifyCitations(text) {{
        const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return safe.replace(/\\[(\\d{{1,3}}):(\\d{{1,3}})\\]/g, function(_m, s, a) {{
          return '<a href="/surah/' + s + '?ayah=' + a + '">[' + s + ':' + a + ']</a>';
        }});
      }}

      chatForm?.addEventListener("submit", async (e) => {{
        e.preventDefault();
        const prompt = (chatInput?.value || "").trim();
        if (!prompt) return;
        chatInput.value = "";
        const userEl = document.createElement("div");
        userEl.textContent = "You: " + prompt;
        chatMessages?.appendChild(userEl);

        const botEl = document.createElement("div");
        chatMessages?.appendChild(botEl);
        if (chatStatus) chatStatus.textContent = "Connecting to verification pipeline...";

        try {{
          const resp = await fetch("/api/explain", {{
            method: "POST",
            headers: {{ "Content-Type": "application/json", "Accept": "text/event-stream" }},
            body: JSON.stringify({{
              ayahText: prompt,
              translation: "",
              surahNumber: scopedSurah,
              ayahNumber: scopedAyah,
              isSearch: scopedSurah === null,
              history: chatHistory.slice(-6)
            }})
          }});
          if (!resp.ok) {{
            let errText = "AI service is temporarily unavailable. Please retry.";
            try {{
              const errJson = await resp.json();
              if (errJson && errJson.error) errText = errJson.error;
            }} catch (e) {{}}
            if (chatStatus) chatStatus.textContent = "Error";
            botEl.textContent = errText;
            botEl.classList.add("error-message");
            return;
          }}
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let fullText = "";
          let meta = null;
          while (true) {{
            const chunk = await reader.read();
            if (chunk.done) break;
            buf += decoder.decode(chunk.value, {{ stream: true }});
            const lines = buf.split("\\n");
            buf = lines.pop() || "";
            for (const ln of lines) {{
              const trimmed = ln.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = JSON.parse(trimmed.slice(5).trim());
              if (payload.status && chatStatus) chatStatus.textContent = payload.status;
              if (payload.token) {{
                fullText += payload.token;
                botEl.innerHTML = linkifyCitations(fullText);
              }}
              if (payload.metadata) meta = payload.metadata;
            }}
          }}
          if (chatStatus) chatStatus.textContent = meta && meta.verified ? "Verified response" : "Done";
          if (meta && Array.isArray(meta.sources) && meta.sources.length > 0) {{
            const badgeWrap = document.createElement("div");
            badgeWrap.style.fontSize = "0.75rem";
            badgeWrap.innerHTML = "<span>" + (meta.refusal ? "Refusal" : "Verified") + "</span> • " +
              meta.sources.map((s) => {{
                const refParts = String(s.reference || "1:1").split(":");
                const sPart = encodeURIComponent(refParts[0] || "1");
                const aPart = encodeURIComponent(refParts[1] || "1");
                return '<a href="/surah/' + sPart + '?ayah=' + aPart + '">[' + window.escapeHtml(s.reference) + ']</a> (' + window.escapeHtml(s.label) + ')';
              }}).join(" ");
            botEl.appendChild(badgeWrap);
          }}
          chatHistory.push({{ role: "user", content: prompt }});
          chatHistory.push({{ role: "assistant", content: fullText }});
        }} catch (_err) {{
          if (chatStatus) chatStatus.textContent = "Unable to reach AI service.";
        }}
      }});
    }})();
  </script>
  {page_script}
</body>
</html>"""


def _render_home_page() -> str:
    popular_cards = []
    for num in (1, 2, 18, 36, 55, 67, 112, 114):
        s = SURAH_BY_NUMBER[num]
        popular_cards.append(
            f"""
            <article class="card" style="display:flex;justify-content:space-between;align-items:center;">
              <a href="/surah/{s['number']}" style="font-weight:600;">{s['number']}. {html.escape(s['englishName'])} ({s['numberOfAyahs']} ayahs)</a>
              <div class="action-group">
                <button type="button" class="card-bookmark-btn" data-surah="{s['number']}" aria-label="Bookmark Surah {html.escape(s['englishName'])}">Bookmark</button>
                <button type="button" class="card-play-btn" data-surah="{s['number']}" aria-label="Play Surah {html.escape(s['englishName'])}">Play</button>
              </div>
            </article>"""
        )

    body = f"""
    <section>
      <h1 style="font-size:2rem;margin:0 0 8px 0;">الْقُرْآنُ</h1>
      <p>Read, listen, and explore with verified zero-hallucination AI grounding.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;">
        <span class="card"><strong>114</strong> Surahs</span>
        <span class="card"><strong>30</strong> Juz</span>
        <span class="card"><strong>6,236</strong> Ayahs</span>
      </div>
      <div class="card" id="khatam-card" style="margin:12px 0;">
        <h2 style="margin-top:0;">Continue Reading &amp; Khatam Progress</h2>
        <p id="continue-reading-text">No reading progress recorded yet. Start from Surah 1.</p>
        <p id="khatam-percent-text">Khatam Progress: 0.0% (0 / 6236 ayahs)</p>
        <a id="continue-reading-link" href="/surah/1?ayah=1">Start Reading</a>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;">
        <a class="card" href="/surah">Browse Surahs</a>
        <a class="card" href="/juz">Juz Index</a>
        <a class="card" href="/topics">Topics Explorer</a>
        <a class="card" href="/bookmarks">Bookmarks</a>
        <a class="card" href="/search">Search Quran</a>
      </div>
      <h2>Popular Surahs</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
        {''.join(popular_cards)}
      </div>
      <div style="display:flex;gap:16px;margin-top:20px;">
        <div>
          <h2>Meccan Surahs</h2>
          <a href="/surah?type=meccan">View all Meccan</a>
        </div>
        <div>
          <h2>Medinan Surahs</h2>
          <a href="/surah?type=medinan">View all Medinan</a>
        </div>
      </div>
      <footer style="margin-top:32px;padding:16px 0;border-top:1px solid var(--border);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <span>AI explanations powered by OpenRouter &amp; authoritative Quran APIs</span>
        <div style="display:flex;gap:12px;">
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
        </div>
      </footer>
    </section>
    """
    script = """
    <script>
      (function() {
        const prog = window.safeReadJSON("quran-reading-progress", { lastRead: null, completedAyahs: [], dailyGoal: 10 });
        const completed = Array.isArray(prog.completedAyahs) ? prog.completedAyahs.length : 0;
        const pct = ((completed / 6236) * 100).toFixed(1);
        const pctEl = document.getElementById("khatam-percent-text");
        if (pctEl) pctEl.textContent = "Khatam Progress: " + pct + "% (" + completed + " / 6236 ayahs)";
        if (prog.lastRead && prog.lastRead.surah) {
          const s = window.__QURAN_SURAHS__.find((x) => x.number === prog.lastRead.surah);
          const sName = s ? s.englishName : ("Surah " + prog.lastRead.surah);
          const txtEl = document.getElementById("continue-reading-text");
          const lnkEl = document.getElementById("continue-reading-link");
          if (txtEl) txtEl.textContent = "Last read: " + sName + " (" + prog.lastRead.surah + ":" + (prog.lastRead.ayah || 1) + ")";
          if (lnkEl) {
            lnkEl.href = "/surah/" + prog.lastRead.surah + "?ayah=" + (prog.lastRead.ayah || 1);
            lnkEl.textContent = "Continue Reading";
          }
        }
        document.querySelectorAll(".card-play-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            window.location.href = "/surah/" + btn.getAttribute("data-surah") + "?autoplay=1";
          });
        });
        document.querySelectorAll(".card-bookmark-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = parseInt(btn.getAttribute("data-surah"), 10);
            const cur = window.safeReadJSON("quran-bookmarks", []);
            const arr = Array.isArray(cur) ? cur : [];
            if (!arr.includes(id)) arr.push(id);
            window.safeWriteJSON("quran-bookmarks", arr);
            btn.textContent = "Bookmarked";
          });
        });
      })();
    </script>
    """
    return _render_html_shell("Home", body, script)


def _render_surah_directory_page() -> str:
    body = """
    <section>
      <h1>All Surahs</h1>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;">
        <div>
          <label for="surah-dir-search">Search Surahs</label>
          <input id="surah-dir-search" type="text" placeholder="Search..." />
        </div>
        <div>
          <label for="surah-dir-type">Revelation Type</label>
          <select id="surah-dir-type">
            <option value="all">All</option>
            <option value="meccan">Meccan</option>
            <option value="medinan">Medinan</option>
          </select>
        </div>
      </div>
      <p id="surah-dir-count">Showing 114 surahs</p>
      <div id="surah-dir-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;"></div>
    </section>
    """
    script = """
    <script>
      (function() {
        const params = new URLSearchParams(window.location.search);
        const typeParam = (params.get("type") || "all").toLowerCase();
        const searchEl = document.getElementById("surah-dir-search");
        const typeEl = document.getElementById("surah-dir-type");
        const gridEl = document.getElementById("surah-dir-grid");
        const countEl = document.getElementById("surah-dir-count");
        if (typeEl && ["all","meccan","medinan"].includes(typeParam)) typeEl.value = typeParam;

        function render() {
          const q = (searchEl?.value || "").trim().toLowerCase();
          const t = (typeEl?.value || "all").toLowerCase();
          const list = window.__QURAN_SURAHS__.filter((s) => {
            const matchType = t === "all" || s.revelationType.toLowerCase() === t;
            const matchQ = !q || s.englishName.toLowerCase().includes(q) || s.name.includes(q) || String(s.number) === q;
            return matchType && matchQ;
          });
          if (countEl) countEl.textContent = "Showing " + list.length + " surahs";
          if (gridEl) {
            gridEl.innerHTML = list.map((s) =>
              '<article class="card" style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div><a href="/surah/' + s.number + '" style="font-weight:600;">' + s.number + '. ' + window.escapeHtml(s.englishName) + '</a>' +
              '<div style="font-size:0.85rem;color:var(--muted);">' + window.escapeHtml(s.name) + ' • ' + s.numberOfAyahs + ' ayahs • ' + window.escapeHtml(s.revelationType) + '</div></div>' +
              '<div class="action-group">' +
              '<button type="button" class="dir-bookmark-btn" data-surah="' + s.number + '" aria-label="Bookmark Surah ' + window.escapeHtml(s.englishName) + '">Bookmark</button>' +
              '<button type="button" class="dir-play-btn" data-surah="' + s.number + '" aria-label="Play Surah ' + window.escapeHtml(s.englishName) + '">Play</button>' +
              '</div></article>'
            ).join("");
            gridEl.querySelectorAll(".dir-play-btn").forEach((b) => {
              b.addEventListener("click", () => {
                window.location.href = "/surah/" + b.getAttribute("data-surah") + "?autoplay=1";
              });
            });
          }
        }
        render();
        searchEl?.addEventListener("input", render);
        typeEl?.addEventListener("change", render);
      })();
    </script>
    """
    return _render_html_shell("All Surahs", body, script)


def _render_juz_page() -> str:
    cards = []
    for j in JUZ_LIST:
        cards.append(
            f"""
            <a class="card" href="/surah/{j['startSurah']}?ayah={j['startAyah']}">
              <strong>Juz {j['juz']}</strong> — {html.escape(j['name'])} (Starts {j['startSurah']}:{j['startAyah']})
            </a>"""
        )
    body = f"""
    <section>
      <h1>Juz Index</h1>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">
        {''.join(cards)}
      </div>
    </section>
    """
    return _render_html_shell("Juz Index", body)


def _render_bookmarks_page() -> str:
    body = """
    <section>
      <h1>Bookmarks</h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;" role="tablist" aria-label="Bookmark views">
        <button type="button" role="tab" aria-selected="true" id="tab-bm-surahs">Surah Bookmarks</button>
        <button type="button" role="tab" aria-selected="false" id="tab-bm-ayahs">Ayah Bookmarks</button>
        <button type="button" role="tab" aria-selected="false" id="tab-bm-notes">Study Notes</button>
        <label for="bm-tag-filter" class="sr-only">Filter by collection tag</label>
        <select id="bm-tag-filter" aria-label="Filter by collection tag"><option value="all">All Tags</option></select>
        <button type="button" id="bm-export-btn">Export JSON</button>
      </div>
      <div id="bm-content"></div>
      <pre id="bm-export-preview" hidden></pre>
    </section>
    """
    script = """
    <script>
      (function() {
        let activeTab = "surahs";
        const contentEl = document.getElementById("bm-content");
        const tagSelect = document.getElementById("bm-tag-filter");
        const exportPreview = document.getElementById("bm-export-preview");

        function normalizeAyahBookmarks(raw) {
          if (!Array.isArray(raw)) return [];
          return raw.map((item) => {
            if (typeof item === "string") return { key: item, savedAt: 1700000000000 };
            if (item && typeof item.key === "string") return { key: item.key, savedAt: Number(item.savedAt) || 1700000000000 };
            return null;
          }).filter(Boolean);
        }

        function refreshTagOptions() {
          const notes = window.safeReadJSON("quran-study-notes", {});
          const tags = new Set();
          Object.values(notes || {}).forEach((n) => {
            if (n && Array.isArray(n.tags)) n.tags.forEach((t) => tags.add(t));
          });
          if (tagSelect) {
            const cur = tagSelect.value || "all";
            tagSelect.innerHTML = '<option value="all">All Tags</option>' +
              Array.from(tags).map((t) => '<option value="' + window.escapeHtml(t) + '">' + window.escapeHtml(t) + '</option>').join("");
            if (Array.from(tags).includes(cur)) tagSelect.value = cur;
          }
        }

        function render() {
          refreshTagOptions();
          const surahBms = window.safeReadJSON("quran-bookmarks", []);
          const ayahBms = normalizeAyahBookmarks(window.safeReadJSON("quran-ayah-bookmarks", []));
          const notes = window.safeReadJSON("quran-study-notes", {});
          const selectedTag = tagSelect?.value || "all";

          if (!contentEl) return;
          if (activeTab === "surahs") {
            const arr = Array.isArray(surahBms) ? surahBms : [];
            contentEl.innerHTML = '<h2>Bookmarked Surahs (' + arr.length + ')</h2>' +
              (arr.length === 0 ? '<p>No bookmarked surahs yet.</p>' : arr.map((id) => {
                const sid = Number(id) || 0;
                const s = window.__QURAN_SURAHS__.find((x) => x.number === sid);
                return '<div class="card" style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
                  '<a href="/surah/' + sid + '">' + sid + '. ' + window.escapeHtml(s ? s.englishName : ("Surah " + sid)) + '</a>' +
                  '<button type="button" class="rm-surah-bm" data-id="' + sid + '" aria-label="Remove bookmark">Remove</button></div>';
              }).join(""));
          } else if (activeTab === "ayahs") {
            contentEl.innerHTML = '<h2>Bookmarked Ayahs (' + ayahBms.length + ')</h2>' +
              (ayahBms.length === 0 ? '<p>No bookmarked ayahs yet.</p>' : ayahBms.map((b) => {
                const parts = b.key.split(":");
                const dateStr = new Date(b.savedAt).toISOString().slice(0, 10);
                return '<div class="card" style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
                  '<div><a href="/surah/' + encodeURIComponent(parts[0] || "1") + '?ayah=' + encodeURIComponent(parts[1] || "1") + '">Quran ' + window.escapeHtml(b.key) + '</a>' +
                  '<span style="margin-left:10px;color:var(--muted);">Saved on ' + window.escapeHtml(dateStr) + '</span></div>' +
                  '<button type="button" class="rm-ayah-bm" data-key="' + window.escapeHtml(b.key) + '" aria-label="Remove bookmark">Remove</button></div>';
              }).join(""));
          } else {
            const entries = Object.entries(notes || {}).filter(([, val]) => {
              if (!val || typeof val.note !== "string") return false;
              if (selectedTag === "all") return true;
              return Array.isArray(val.tags) && val.tags.includes(selectedTag);
            });
            contentEl.innerHTML = '<h2>Study Notes (' + entries.length + ')</h2>' +
              (entries.length === 0 ? '<p>No study notes yet.</p>' : entries.map(([k, v]) => {
                const parts = k.split(":");
                return '<div class="card" style="margin-bottom:8px;">' +
                  '<a href="/surah/' + encodeURIComponent(parts[0] || "1") + '?ayah=' + encodeURIComponent(parts[1] || "1") + '">Quran ' + window.escapeHtml(k) + '</a>' +
                  '<p>' + window.escapeHtml(v.note) + '</p>' +
                  '<div>Tags: ' + (Array.isArray(v.tags) ? v.tags.map((t) => window.escapeHtml(t)).join(", ") : "") + '</div></div>';
              }).join(""));
          }
          contentEl.querySelectorAll(".rm-surah-bm").forEach((btn) => {
            btn.addEventListener("click", () => {
              const id = parseInt(btn.getAttribute("data-id"), 10);
              const next = (Array.isArray(surahBms) ? surahBms : []).filter((x) => x !== id);
              window.safeWriteJSON("quran-bookmarks", next);
              render();
            });
          });
          contentEl.querySelectorAll(".rm-ayah-bm").forEach((btn) => {
            btn.addEventListener("click", () => {
              const key = btn.getAttribute("data-key");
              const next = ayahBms.filter((x) => x.key !== key);
              window.safeWriteJSON("quran-ayah-bookmarks", next);
              render();
            });
          });
        }

        function setTab(name) {
          activeTab = name;
          document.getElementById("tab-bm-surahs")?.setAttribute("aria-selected", String(name === "surahs"));
          document.getElementById("tab-bm-ayahs")?.setAttribute("aria-selected", String(name === "ayahs"));
          document.getElementById("tab-bm-notes")?.setAttribute("aria-selected", String(name === "notes"));
          render();
        }
        document.getElementById("tab-bm-surahs")?.addEventListener("click", () => setTab("surahs"));
        document.getElementById("tab-bm-ayahs")?.addEventListener("click", () => setTab("ayahs"));
        document.getElementById("tab-bm-notes")?.addEventListener("click", () => setTab("notes"));
        tagSelect?.addEventListener("change", render);

        document.getElementById("bm-export-btn")?.addEventListener("click", () => {
          const payload = {
            surahBookmarks: window.safeReadJSON("quran-bookmarks", []),
            ayahBookmarks: normalizeAyahBookmarks(window.safeReadJSON("quran-ayah-bookmarks", [])),
            studyNotes: window.safeReadJSON("quran-study-notes", {})
          };
          if (exportPreview) {
            exportPreview.removeAttribute("hidden");
            exportPreview.textContent = JSON.stringify(payload, null, 2);
          }
        });

        render();
      })();
    </script>
    """
    return _render_html_shell("Bookmarks", body, script)


def _render_search_page() -> str:
    body = """
    <section>
      <h1>Quranic Search</h1>
      <form id="quran-search-form" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
        <label for="quran-search-input" class="sr-only">Search the Quran</label>
        <input id="quran-search-input" type="text" placeholder="Search verses or references (e.g. 2:255, mercy)..." style="flex:1;min-width:240px;" />
        <button type="button" id="quran-search-clear" aria-label="Clear search">Clear</button>
        <button type="submit">Search</button>
      </form>
      <div id="search-error" role="alert" hidden class="card">
        <span id="search-error-msg"></span>
        <button type="button" id="search-retry-btn">Retry</button>
      </div>
      <div id="search-results"></div>
    </section>
    """
    script = """
    <script>
      (function() {
        const params = new URLSearchParams(window.location.search);
        const initialQ = params.get("q") || "";
        const inputEl = document.getElementById("quran-search-input");
        const resultsEl = document.getElementById("search-results");
        const errBox = document.getElementById("search-error");
        const errMsg = document.getElementById("search-error-msg");
        let lastQuery = initialQ;

        async function runSearch(q) {
          lastQuery = q;
          if (!q.trim()) {
            if (resultsEl) resultsEl.innerHTML = "<p>Enter a keyword, Surah name, or S:A reference.</p>";
            return;
          }
          errBox?.setAttribute("hidden", "");
          try {
            const res = await fetch("/api/quran/search?q=" + encodeURIComponent(q) + "&edition=en.sahih&limit=40");
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            let htmlOut = "";
            if (data.surahMatches && data.surahMatches.length > 0) {
              htmlOut += "<h2>Surah Matches</h2>" + data.surahMatches.map((s) =>
                '<div class="card" style="margin-bottom:8px;"><a href="/surah/' + s.number + '">' + s.number + '. ' + window.escapeHtml(s.englishName) + ' (' + s.numberOfAyahs + ' ayahs)</a></div>'
              ).join("");
            }
            if (data.ayahMatches && data.ayahMatches.length > 0) {
              htmlOut += "<h2>Ayah Matches (" + data.totalAyahMatches + ")</h2>" + data.ayahMatches.map((a) =>
                '<div class="card" style="margin-bottom:8px;"><a href="/surah/' + a.surah + '?ayah=' + a.ayah + '">' + a.surah + ':' + a.ayah + ' — ' + window.escapeHtml(a.surahName) + '</a>' +
                '<p dir="rtl" lang="ar">' + window.escapeHtml(a.arabic) + '</p><p>' + window.escapeHtml(a.translation) + '</p></div>'
              ).join("");
            }
            if (!htmlOut) htmlOut = "<p>No matching verses found.</p>";
            if (resultsEl) resultsEl.innerHTML = htmlOut;
          } catch (_err) {
            if (errMsg) errMsg.textContent = "Search failed. Please retry.";
            errBox?.removeAttribute("hidden");
          }
        }

        document.getElementById("quran-search-form")?.addEventListener("submit", (e) => {
          e.preventDefault();
          runSearch(inputEl?.value || "");
        });
        document.getElementById("quran-search-clear")?.addEventListener("click", () => {
          if (inputEl) inputEl.value = "";
          if (resultsEl) resultsEl.innerHTML = "";
        });
        document.getElementById("search-retry-btn")?.addEventListener("click", () => {
          runSearch(lastQuery || inputEl?.value || "");
        });
        if (initialQ && inputEl) {
          inputEl.value = initialQ;
          runSearch(initialQ);
        }
      })();
    </script>
    """
    return _render_html_shell("Search", body, script)


def _render_topics_page() -> str:
    topic_buttons = "".join(
        f'<button type="button" class="topic-btn" data-topic="{k}">{html.escape(v["title"])}</button>'
        for k, v in _TOPIC_DATA.items()
    )
    topics_json = json.dumps(_TOPIC_DATA, ensure_ascii=False)
    body = f"""
    <section>
      <h1>Quranic Topics Explorer</h1>
      <p>Browse curated themes with verified verses fetched from authoritative Quran APIs.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
        {topic_buttons}
      </div>
      <div id="topic-verses"></div>
    </section>
    """
    script = f"""
    <script>
      (function() {{
        const TOPICS = {topics_json};
        const out = document.getElementById("topic-verses");
        async function loadTopic(slug) {{
          const t = TOPICS[slug] || TOPICS["rabbana-duas"];
          if (!out) return;
          out.innerHTML = "<h2>" + window.escapeHtml(t.title) + "</h2><p>" + window.escapeHtml(t.description) + "</p>";
          for (const pair of t.refs) {{
            const s = pair[0], a = pair[1];
            const res = await fetch("/api/quran/surah/" + s);
            const data = await res.json();
            const ayahObj = (data.ayahs || []).find((x) => x.numberInSurah === a);
            const surahMeta = data.surah || data;
            if (ayahObj) {{
              const card = document.createElement("div");
              card.className = "card";
              card.style.marginBottom = "8px";
              card.innerHTML = '<a href="/surah/' + s + '?ayah=' + a + '">Quran ' + s + ':' + a + ' — ' + window.escapeHtml(surahMeta.englishName) + '</a>' +
                '<p dir="rtl" lang="ar">' + window.escapeHtml(ayahObj.arabic) + '</p>' +
                '<p>' + window.escapeHtml(ayahObj.translations["en.sahih"]) + '</p>';
              out.appendChild(card);
            }}
          }}
        }}
        document.querySelectorAll(".topic-btn").forEach((btn) => {{
          btn.addEventListener("click", () => loadTopic(btn.getAttribute("data-topic")));
        }});
        loadTopic("rabbana-duas");
      }})();
    </script>
    """
    return _render_html_shell("Topics", body, script)


def _render_about_page() -> str:
    body = """
    <section class="card">
      <h1>About Quranic AI</h1>
      <p>Quranic AI delivers authentic Quran reading, study tools, and zero-hallucination AI assistance.</p>
      <h2>Authoritative Data Sources</h2>
      <ul>
        <li>Al-Quran Cloud API (verified Uthmani Arabic script and translations)</li>
        <li>Quran.com v4 API (classical Tafsir and Word-by-Word morphology)</li>
        <li>OpenRouter LLM inference with strict server-side verse grounding and Tavily scholarly search</li>
      </ul>
    </section>
    """
    return _render_html_shell("About", body)


def _render_privacy_page() -> str:
    body = """
    <section class="card">
      <h1>Privacy Policy</h1>
      <p>Your bookmarks, study notes, reading progress, and preferences are stored locally in your browser's localStorage.</p>
      <p>AI queries are proxied through our backend API solely to retrieve grounded Quranic explanations without exposing API secrets.</p>
    </section>
    """
    return _render_html_shell("Privacy Policy", body)


def _render_surah_reader_page(surah_id_raw: str) -> str:
    try:
        surah_id = int(surah_id_raw)
    except ValueError:
        surah_id = -1

    if surah_id < 1 or surah_id > TOTAL_SURAHS:
        body = f"""
        <section class="card">
          <h1>Invalid Surah ({html.escape(surah_id_raw)})</h1>
          <p>Surah {html.escape(surah_id_raw)} is outside the canonical 114 surahs of the Quran (1 to 114).</p>
          <a href="/surah">Return to All Surahs</a>
        </section>
        """
        return _render_html_shell("Surah Not Found", body)

    s_info = SURAH_BY_NUMBER[surah_id]
    prev_link = f'<a href="/surah/{surah_id - 1}">Previous Surah</a>' if surah_id > 1 else '<span>Start of Quran</span>'
    next_link = f'<a href="/surah/{surah_id + 1}">Next Surah</a>' if surah_id < 114 else '<span>End of Quran</span>'

    body = f"""
    <div style="display:flex;gap:16px;align-items:flex-start;padding-bottom:112px;">
      <aside id="reader-sidebar" aria-label="Surah navigation" class="card desktop-only-open" data-mobile-open="false" style="width:260px;flex-shrink:0;">
        <div role="tablist" aria-label="Navigation tabs" style="display:flex;gap:6px;margin-bottom:8px;">
          <button type="button" role="tab" aria-selected="true" id="sb-tab-surah">Surah</button>
          <button type="button" role="tab" aria-selected="false" id="sb-tab-juz">Juz</button>
          <button type="button" role="tab" aria-selected="false" id="sb-tab-page">Page</button>
        </div>
        <label for="sidebar-search-input" class="sr-only">Filter sidebar list</label>
        <input id="sidebar-search-input" type="text" placeholder="Filter..." style="width:100%;margin-bottom:6px;" />
        <div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px;">Tip: Press Ctrl+K</div>
        <ul id="sidebar-list" style="list-style:none;margin:0;padding:0;max-height:360px;overflow:auto;"></ul>
      </aside>

      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button type="button" id="sidebar-toggle-btn" aria-label="Toggle sidebar">Sidebar</button>
            <h1 style="margin:0;">{surah_id}. {html.escape(s_info['englishName'])}</h1>
            <button type="button" id="surah-info-btn" aria-label="Surah info">Info</button>
          </div>
          <div id="surah-meta-bar" style="color:var(--muted);">Page 1 • Juz 1 / Hizb 1</div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0;position:relative;">
          <button type="button" id="listen-surah-btn" aria-label="Listen">Listen</button>
          <button type="button" id="translation-selector-btn" aria-label="Select translations">Translation: Saheeh International</button>
          <button type="button" id="hifz-toggle-btn" aria-label="Hifz mode" aria-pressed="false">Hifz Mode</button>
          <button type="button" id="tajweed-toggle-btn" aria-label="Tajweed mode" aria-pressed="false">Tajweed</button>
          <label for="arabic-font-slider">Arabic Size</label>
          <input id="arabic-font-slider" type="range" min="20" max="48" value="28" aria-label="Arabic font size" />
          <div id="translation-selector-panel" hidden class="card" style="position:absolute;top:100%;left:80px;z-index:45;width:300px;">
            <p style="margin-top:0;font-size:0.85rem;">Select up to 3 translations:</p>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label><input type="checkbox" class="trans-cb" value="en.sahih" /> Saheeh International</label>
              <label><input type="checkbox" class="trans-cb" value="en.asad" /> Muhammad Asad</label>
              <label><input type="checkbox" class="trans-cb" value="ur.jalandhry" /> Fateh Muhammad Jalandhry</label>
              <label><input type="checkbox" class="trans-cb" value="ur.khan" /> Ahmed Raza Khan</label>
            </div>
            <p id="trans-limit-msg" style="font-size:0.75rem;color:var(--muted);margin-bottom:0;">Max 3 translations active.</p>
          </div>
        </div>

        <div id="reader-error" role="alert" hidden class="card">
          <span id="reader-error-msg"></span>
          <button type="button" id="reader-retry-btn">Retry</button>
        </div>

        <div id="bismillah-banner" hidden class="card" style="text-align:center;font-size:1.4rem;margin-bottom:12px;" dir="rtl" lang="ar">
          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </div>

        <div id="ayahs-container" style="display:flex;flex-direction:column;gap:12px;"></div>

        <nav aria-label="Surah pagination" style="display:flex;justify-content:space-between;margin-top:20px;">
          {prev_link}
          {next_link}
        </nav>
      </div>
    </div>

    <dialog id="surah-info-dialog" aria-labelledby="surah-info-title">
      <h2 id="surah-info-title">{surah_id}. {html.escape(s_info['englishName'])} ({html.escape(s_info['name'])})</h2>
      <p>Translation: {html.escape(s_info['englishNameTranslation'])}</p>
      <p>Revelation Type: {html.escape(s_info['revelationType'])} • Total Ayahs: {s_info['numberOfAyahs']}</p>
      <button type="button" id="surah-info-close">Close</button>
    </dialog>

    <dialog id="explain-dialog" aria-labelledby="explain-dialog-title">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 id="explain-dialog-title" style="margin:0;">AI Verse Explanation</h2>
        <button type="button" id="explain-dialog-close" aria-label="Close explanation">Close</button>
      </div>
      <div id="explain-status" role="status" aria-live="polite" style="font-size:0.85rem;color:var(--muted);margin:8px 0;"></div>
      <div id="explain-body" style="white-space:pre-wrap;"></div>
      <div id="explain-sources" style="margin-top:10px;font-size:0.85rem;"></div>
    </dialog>

    <dialog id="tafsir-dialog" aria-labelledby="tafsir-dialog-title">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 id="tafsir-dialog-title" style="margin:0;">Classical Tafsir</h2>
        <button type="button" id="tafsir-dialog-close">Close</button>
      </div>
      <div id="tafsir-content"></div>
    </dialog>

    <dialog id="wbw-dialog" aria-labelledby="wbw-dialog-title">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 id="wbw-dialog-title" style="margin:0;">Word-by-Word Morphology</h2>
        <button type="button" id="wbw-dialog-close">Close</button>
      </div>
      <div id="wbw-content"></div>
    </dialog>

    <dialog id="note-dialog" aria-labelledby="note-dialog-title">
      <h2 id="note-dialog-title" style="margin-top:0;">Personal Study Note</h2>
      <form id="note-form" style="display:flex;flex-direction:column;gap:8px;">
        <label for="note-text-input">Note</label>
        <textarea id="note-text-input" rows="3"></textarea>
        <label for="note-tags-input">Tags (comma-separated)</label>
        <input id="note-tags-input" type="text" placeholder="Patience, Duas" />
        <div style="display:flex;gap:8px;">
          <button type="submit">Save Note</button>
          <button type="button" id="note-dialog-close">Cancel</button>
        </div>
      </form>
    </dialog>

    <dialog id="verse-card-dialog" aria-labelledby="verse-card-title">
      <h2 id="verse-card-title" style="margin-top:0;">Verified Verse Card</h2>
      <div id="verse-card-preview" class="card"></div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button type="button" id="verse-card-copy">Copy Card</button>
        <button type="button" id="verse-card-close">Close</button>
      </div>
    </dialog>

    <section id="audio-player-bar" role="region" aria-label="Audio Player" hidden style="position:fixed;bottom:0;left:0;right:0;background:var(--card);border-top:1px solid var(--border);padding:10px 16px;z-index:55;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;">
      <audio id="quran-audio" preload="metadata"></audio>
      <div style="display:flex;gap:6px;align-items:center;">
        <button type="button" id="audio-prev-btn" aria-label="Previous Ayah">Prev</button>
        <button type="button" id="audio-play-btn" aria-label="Play Audio">Play</button>
        <button type="button" id="audio-next-btn" aria-label="Next Ayah">Next</button>
        <span id="audio-track-label">Ayah 1</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="range" id="audio-seek-slider" min="0" max="100" value="0" aria-label="Seek Audio" />
        <button type="button" id="audio-repeat-btn" aria-label="Repeat Loop" aria-pressed="false">Repeat</button>
        <label for="audio-loop-start" class="sr-only">Loop Start Ayah</label>
        <input type="number" id="audio-loop-start" min="1" value="1" style="width:56px;" aria-label="Loop Start Ayah" />
        <label for="audio-loop-end" class="sr-only">Loop End Ayah</label>
        <input type="number" id="audio-loop-end" min="1" value="3" style="width:56px;" aria-label="Loop End Ayah" />
        <select id="audio-speed-select" aria-label="Playback Speed">
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
        </select>
        <select id="audio-reciter-select" aria-label="Reciter">
          <option value="ar.alafasy">Alafasy</option>
          <option value="ar.abdulbasitmurattal">Abdul Basit</option>
        </select>
        <button type="button" id="audio-mute-btn" aria-label="Mute">Mute</button>
        <input type="range" id="audio-volume-slider" min="0" max="1" step="0.1" value="1" aria-label="Volume" />
      </div>
      <div id="audio-error-msg" role="alert" hidden style="color:#ef4444;font-size:0.85rem;"></div>
    </section>
    """
    script = f"""
    <script>
      (function() {{
        const SURAH_ID = {surah_id};
        const MAX_AYAHS = {s_info['numberOfAyahs']};
        const params = new URLSearchParams(window.location.search);
        const deepLinkAyah = parseInt(params.get("ayah") || "0", 10);
        const autoplay = params.get("autoplay") === "1";

        let surahData = null;
        let activeAyah = deepLinkAyah >= 1 && deepLinkAyah <= MAX_AYAHS ? deepLinkAyah : 1;
        let hifzMode = false;
        let tajweedMode = false;
        let arabicFontSize = 28;
        let explainAbort = null;
        let activeNoteKey = null;
        let sbTab = "surah";
        let repeatEnabled = false;

        // Sidebar tab & toggle logic
        const sidebar = document.getElementById("reader-sidebar");
        const sidebarList = document.getElementById("sidebar-list");
        const sbSearch = document.getElementById("sidebar-search-input");

        function renderSidebarList() {{
          if (!sidebarList) return;
          const q = (sbSearch?.value || "").trim().toLowerCase();
          if (sbTab === "surah") {{
            const items = window.__QURAN_SURAHS__.filter((s) => !q || s.englishName.toLowerCase().includes(q) || String(s.number) === q);
            sidebarList.innerHTML = items.map((s) => '<li><a href="/surah/' + s.number + '">' + s.number + '. ' + window.escapeHtml(s.englishName) + '</a></li>').join("");
          }} else if (sbTab === "juz") {{
            const items = window.__QURAN_JUZ__.filter((j) => !q || String(j.juz) === q || j.name.toLowerCase().includes(q));
            sidebarList.innerHTML = items.map((j) => '<li><a href="/surah/' + j.startSurah + '?ayah=' + j.startAyah + '">Juz ' + j.juz + ' — ' + window.escapeHtml(j.name) + '</a></li>').join("");
          }} else {{
            const pages = [];
            for (let p = 1; p <= 604; p++) {{
              if (!q || String(p) === q) pages.push(p);
              if (pages.length >= 40 && !q) break;
            }}
            sidebarList.innerHTML = pages.map((p) => {{
              const ts = p >= 604 ? 112 : Math.max(1, Math.min(114, Math.ceil(p / 5)));
              return '<li><a href="/surah/' + ts + '">Page ' + p + '</a></li>';
            }}).join("");
          }}
        }}

        function setSbTab(tab) {{
          sbTab = tab;
          document.getElementById("sb-tab-surah")?.setAttribute("aria-selected", String(tab === "surah"));
          document.getElementById("sb-tab-juz")?.setAttribute("aria-selected", String(tab === "juz"));
          document.getElementById("sb-tab-page")?.setAttribute("aria-selected", String(tab === "page"));
          renderSidebarList();
        }}
        document.getElementById("sb-tab-surah")?.addEventListener("click", () => setSbTab("surah"));
        document.getElementById("sb-tab-juz")?.addEventListener("click", () => setSbTab("juz"));
        document.getElementById("sb-tab-page")?.addEventListener("click", () => setSbTab("page"));
        sbSearch?.addEventListener("input", renderSidebarList);
        renderSidebarList();

        document.getElementById("sidebar-toggle-btn")?.addEventListener("click", () => {{
          if (!sidebar) return;
          const isMobile = window.innerWidth < 1024;
          if (isMobile) {{
            const cur = sidebar.getAttribute("data-mobile-open") === "true";
            sidebar.setAttribute("data-mobile-open", String(!cur));
            sidebar.style.display = cur ? "none" : "block";
          }} else {{
            const hiddenNow = sidebar.hasAttribute("hidden");
            if (hiddenNow) sidebar.removeAttribute("hidden");
            else sidebar.setAttribute("hidden", "");
          }}
        }});

        // Dialog controls
        const infoDlg = document.getElementById("surah-info-dialog");
        document.getElementById("surah-info-btn")?.addEventListener("click", () => infoDlg?.showModal());
        document.getElementById("surah-info-close")?.addEventListener("click", () => infoDlg?.close());

        const explainDlg = document.getElementById("explain-dialog");
        document.getElementById("explain-dialog-close")?.addEventListener("click", () => {{
          if (explainAbort) explainAbort.abort();
          explainDlg?.close();
        }});
        document.getElementById("tafsir-dialog-close")?.addEventListener("click", () => document.getElementById("tafsir-dialog")?.close());
        document.getElementById("wbw-dialog-close")?.addEventListener("click", () => document.getElementById("wbw-dialog")?.close());
        document.getElementById("note-dialog-close")?.addEventListener("click", () => document.getElementById("note-dialog")?.close());
        document.getElementById("verse-card-close")?.addEventListener("click", () => document.getElementById("verse-card-dialog")?.close());

        // Translations selector (1..3 editions)
        function getActiveTranslations() {{
          const stored = window.safeReadJSON("quran-translations", ["en.sahih"]);
          if (!Array.isArray(stored) || stored.length === 0) return ["en.sahih"];
          return stored.slice(0, 3);
        }}
        function syncTranslationCheckboxes() {{
          const active = getActiveTranslations();
          const btn = document.getElementById("translation-selector-btn");
          if (btn) btn.textContent = "Translation: " + active.join(", ");
          document.querySelectorAll(".trans-cb").forEach((cb) => {{
            cb.checked = active.includes(cb.value);
            cb.disabled = !cb.checked && active.length >= 3;
          }});
        }}
        document.getElementById("translation-selector-btn")?.addEventListener("click", () => {{
          const panel = document.getElementById("translation-selector-panel");
          if (panel?.hasAttribute("hidden")) panel.removeAttribute("hidden");
          else panel?.setAttribute("hidden", "");
        }});
        document.querySelectorAll(".trans-cb").forEach((cb) => {{
          cb.addEventListener("change", () => {{
            const checked = Array.from(document.querySelectorAll(".trans-cb")).filter((x) => x.checked).map((x) => x.value);
            if (checked.length === 0) {{
              cb.checked = true;
              return;
            }}
            if (checked.length > 3) {{
              cb.checked = false;
              return;
            }}
            window.safeWriteJSON("quran-translations", checked);
            syncTranslationCheckboxes();
            renderAyahs();
          }});
        }});
        syncTranslationCheckboxes();

        // Hifz, Tajweed, Font Size
        document.getElementById("hifz-toggle-btn")?.addEventListener("click", (e) => {{
          hifzMode = !hifzMode;
          e.currentTarget.setAttribute("aria-pressed", String(hifzMode));
          renderAyahs();
        }});
        document.getElementById("tajweed-toggle-btn")?.addEventListener("click", (e) => {{
          tajweedMode = !tajweedMode;
          e.currentTarget.setAttribute("aria-pressed", String(tajweedMode));
          renderAyahs();
        }});
        document.getElementById("arabic-font-slider")?.addEventListener("input", (e) => {{
          arabicFontSize = parseInt(e.target.value, 10) || 28;
          document.querySelectorAll(".ayah-arabic-text").forEach((el) => {{
            el.style.fontSize = arabicFontSize + "px";
          }});
        }});

        // Audio player
        const audioBar = document.getElementById("audio-player-bar");
        const audioEl = document.getElementById("quran-audio");
        const prevBtn = document.getElementById("audio-prev-btn");
        const nextBtn = document.getElementById("audio-next-btn");
        const playBtn = document.getElementById("audio-play-btn");
        const trackLbl = document.getElementById("audio-track-label");
        const errAudio = document.getElementById("audio-error-msg");

        function updateAudioBounds() {{
          if (prevBtn) prevBtn.disabled = activeAyah <= 1;
          if (nextBtn) nextBtn.disabled = activeAyah >= MAX_AYAHS;
          if (trackLbl) trackLbl.textContent = "Ayah " + activeAyah;
          const seek = document.getElementById("audio-seek-slider");
          if (seek) seek.value = "0";
        }}

        function startAudioForAyah(ayahNum, shouldPlay) {{
          activeAyah = Math.max(1, Math.min(MAX_AYAHS, ayahNum));
          updateAudioBounds();
          audioBar?.removeAttribute("hidden");
          window.updateChatFabPosition?.();
          if (errAudio) errAudio.setAttribute("hidden", "");
          if (audioEl) {{
            const src = surahData?.ayahs?.[activeAyah - 1]?.audio || "";
            if (audioEl.getAttribute("src") !== src) {{
              audioEl.setAttribute("src", src);
            }}
            const speedSel = document.getElementById("audio-speed-select");
            if (speedSel) audioEl.playbackRate = parseFloat(speedSel.value) || 1;
            if (shouldPlay) {{
              const p = audioEl.play();
              if (p && typeof p.catch === "function") p.catch(() => {{}});
              if (playBtn) playBtn.textContent = "Pause";
            }}
          }}
        }}

        audioEl?.addEventListener("error", () => {{
          if (errAudio) {{
            errAudio.removeAttribute("hidden");
            errAudio.textContent = "Audio playback error: unable to load recitation stream.";
          }}
        }});

        audioEl?.addEventListener("ended", () => {{
          const start = parseInt(document.getElementById("audio-loop-start")?.value || "1", 10);
          const end = parseInt(document.getElementById("audio-loop-end")?.value || String(MAX_AYAHS), 10);
          if (repeatEnabled) {{
            const nextInLoop = activeAyah + 1 <= end ? activeAyah + 1 : start;
            startAudioForAyah(nextInLoop, true);
          }} else if (playBtn) {{
            playBtn.textContent = "Play";
          }}
        }});

        document.getElementById("listen-surah-btn")?.addEventListener("click", () => startAudioForAyah(activeAyah, true));
        playBtn?.addEventListener("click", () => {{
          if (!audioEl) return;
          if (audioEl.paused) {{
            startAudioForAyah(activeAyah, true);
          }} else {{
            audioEl.pause();
            playBtn.textContent = "Play";
          }}
        }});
        prevBtn?.addEventListener("click", () => startAudioForAyah(activeAyah - 1, true));
        nextBtn?.addEventListener("click", () => startAudioForAyah(activeAyah + 1, true));
        document.getElementById("audio-repeat-btn")?.addEventListener("click", (e) => {{
          repeatEnabled = !repeatEnabled;
          e.currentTarget.setAttribute("aria-pressed", String(repeatEnabled));
        }});
        document.getElementById("audio-speed-select")?.addEventListener("change", (e) => {{
          if (audioEl) audioEl.playbackRate = parseFloat(e.target.value) || 1;
        }});
        document.getElementById("audio-reciter-select")?.addEventListener("change", (e) => {{
          try {{ localStorage.setItem("quran-reciter", e.target.value); }} catch (_e) {{}}
        }});
        document.getElementById("audio-mute-btn")?.addEventListener("click", () => {{
          if (audioEl) audioEl.muted = !audioEl.muted;
        }});
        document.getElementById("audio-volume-slider")?.addEventListener("input", (e) => {{
          if (audioEl) audioEl.volume = parseFloat(e.target.value);
        }});

        async function runExplainModal(ayahObj) {{
          if (explainAbort) explainAbort.abort();
          explainAbort = new AbortController();
          const statusEl = document.getElementById("explain-status");
          const bodyEl = document.getElementById("explain-body");
          const srcEl = document.getElementById("explain-sources");
          if (bodyEl) bodyEl.textContent = "";
          if (srcEl) srcEl.innerHTML = "";
          if (statusEl) statusEl.textContent = "Requesting canonical explanation...";
          explainDlg?.showModal();
          try {{
            const resp = await fetch("/api/explain", {{
              method: "POST",
              signal: explainAbort.signal,
              headers: {{ "Content-Type": "application/json", "Accept": "text/event-stream" }},
              body: JSON.stringify({{
                ayahText: ayahObj.arabic,
                translation: ayahObj.translations["en.sahih"],
                surahNumber: SURAH_ID,
                ayahNumber: ayahObj.numberInSurah,
                translationEditions: getActiveTranslations(),
                isSearch: false,
                history: []
              }})
            }});
            if (!resp.ok) {{
              let errText = "AI service is temporarily unavailable. Please retry.";
              try {{
                const errJson = await resp.json();
                if (errJson && errJson.error) errText = errJson.error;
              }} catch (e) {{}}
              if (statusEl) statusEl.textContent = "Error";
              if (bodyEl) bodyEl.textContent = errText;
              return;
            }}
          const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let text = "";
            let meta = null;
            while (true) {{
              const chunk = await reader.read();
              if (chunk.done) break;
              buf += decoder.decode(chunk.value, {{ stream: true }});
              const lines = buf.split("\\n");
              buf = lines.pop() || "";
              for (const ln of lines) {{
                const t = ln.trim();
                if (!t.startsWith("data:")) continue;
                const p = JSON.parse(t.slice(5).trim());
                if (p.status && statusEl) statusEl.textContent = p.status;
                if (p.token) {{
                  text += p.token;
                  if (bodyEl) bodyEl.textContent = text;
                }}
                if (p.metadata) meta = p.metadata;
              }}
            }}
            if (statusEl) statusEl.textContent = meta && meta.verified ? "Verified" : "Done";
            if (srcEl && meta && Array.isArray(meta.sources)) {{
              srcEl.innerHTML = "<strong>Sources:</strong> " + meta.sources.map((s) => window.escapeHtml(s.label) + " (" + window.escapeHtml(s.reference) + ")").join(" • ");
            }}
          }} catch (err) {{
            if (err && err.name === "AbortError") return;
            if (statusEl) statusEl.textContent = "Error loading explanation.";
          }}
        }}

        function renderAyahs() {{
          const container = document.getElementById("ayahs-container");
          if (!container || !surahData) return;
          const activeEditions = getActiveTranslations();
          const bismillahBanner = document.getElementById("bismillah-banner");
          if (bismillahBanner) {{
            if (SURAH_ID !== 1 && SURAH_ID !== 9) bismillahBanner.removeAttribute("hidden");
            else bismillahBanner.setAttribute("hidden", "");
          }}

          const first = surahData.ayahs[0];
          const metaBar = document.getElementById("surah-meta-bar");
          if (metaBar && first) {{
            metaBar.textContent = "Page " + first.page + " • Juz " + first.juz + " / Hizb " + first.hizbQuarter;
          }}

          container.innerHTML = surahData.ayahs.map((a) => {{
            const isHighlighted = (deepLinkAyah === a.numberInSurah || activeAyah === a.numberInSurah);
            const blurClass = hifzMode ? "hifz-blurred" : "";
            const tajweedClass = tajweedMode ? "tajweed-script" : "";
            const safeArabic = window.escapeHtml(a.arabic);
            const arabicHtml = tajweedMode
              ? '<span class="tajweed-ghunnah">' + safeArabic + '</span>'
              : safeArabic;
            const transHtml = activeEditions.map((ed) => {{
              const isUrdu = ed.startsWith("ur.");
              const cls = isUrdu ? "font-urdu " + blurClass : blurClass;
              const langAttrs = isUrdu ? ' lang="ur" dir="rtl"' : '';
              return '<p class="' + cls + '"' + langAttrs + ' data-edition="' + window.escapeHtml(ed) + '">' + window.escapeHtml(a.translations[ed] || a.translations["en.sahih"]) + '</p>';
            }}).join("");

            const curAttr = isHighlighted ? ' aria-current="true"' : '';
            const cardStyle = isHighlighted ? ' style="border-color:var(--primary);"' : '';
            return '<article id="ayah-' + a.numberInSurah + '" aria-label="Ayah ' + a.numberInSurah + '" data-ayah="' + a.numberInSurah + '"' + curAttr + cardStyle + ' class="card">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                '<strong>' + SURAH_ID + ':' + a.numberInSurah + '</strong>' +
                '<div class="action-group">' +
                  '<button type="button" class="btn-play-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Play Ayah ' + a.numberInSurah + '">Play</button>' +
                  '<button type="button" class="btn-bm-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Bookmark Ayah ' + a.numberInSurah + '" aria-pressed="false">Bookmark</button>' +
                  '<button type="button" class="btn-read-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Mark Ayah ' + a.numberInSurah + ' Read">Mark Read</button>' +
                  '<button type="button" class="btn-copy-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Copy Ayah ' + a.numberInSurah + '">Copy</button>' +
                  '<button type="button" class="btn-tafsir-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Tafsir for Ayah ' + a.numberInSurah + '">Tafsir</button>' +
                  '<button type="button" class="btn-wbw-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Word by Word for Ayah ' + a.numberInSurah + '">Word-by-Word</button>' +
                  '<button type="button" class="btn-explain-ayah" data-ayah="' + a.numberInSurah + '" aria-label="Explain with AI Ayah ' + a.numberInSurah + '">Explain with AI</button>' +
                  '<button type="button" class="btn-ask-chat" data-ayah="' + a.numberInSurah + '" aria-label="Ask AI about this Ayah ' + a.numberInSurah + '">Ask AI about this Ayah</button>' +
                  '<button type="button" class="btn-more-ayah" data-ayah="' + a.numberInSurah + '" aria-label="More options for Ayah ' + a.numberInSurah + '">More</button>' +
                '</div>' +
              '</div>' +
              '<p class="ayah-arabic-text ' + blurClass + ' ' + tajweedClass + '" dir="rtl" lang="ar" style="font-size:' + arabicFontSize + 'px;">' + arabicHtml + '</p>' +
              transHtml +
              '<div class="more-menu" id="more-menu-' + a.numberInSurah + '" hidden style="margin-top:8px;display:flex;gap:8px;">' +
                '<button type="button" class="btn-note-ayah" data-ayah="' + a.numberInSurah + '">Add Study Note</button>' +
                '<button type="button" class="btn-card-ayah" data-ayah="' + a.numberInSurah + '">Verse Card</button>' +
              '</div>' +
            '</article>';
          }}).join("");

          // Reveal on click in Hifz mode
          container.querySelectorAll(".hifz-blurred").forEach((el) => {{
            el.addEventListener("click", () => {{
              el.classList.remove("hifz-blurred");
              el.classList.add("hifz-revealed");
            }});
          }});

          container.querySelectorAll(".btn-play-ayah").forEach((b) => {{
            b.addEventListener("click", () => startAudioForAyah(parseInt(b.getAttribute("data-ayah"), 10), true));
          }});

          container.querySelectorAll(".btn-bm-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = b.getAttribute("data-ayah");
              const key = SURAH_ID + ":" + n;
              const raw = window.safeReadJSON("quran-ayah-bookmarks", []);
              const arr = Array.isArray(raw) ? raw : [];
              if (!arr.some((x) => (typeof x === "string" ? x : x?.key) === key)) {{
                arr.push({{ key: key, savedAt: Date.now() }});
              }}
              window.safeWriteJSON("quran-ayah-bookmarks", arr);
              b.setAttribute("aria-pressed", "true");
              b.textContent = "Bookmarked";
            }});
          }});

          container.querySelectorAll(".btn-read-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              const key = SURAH_ID + ":" + n;
              const prog = window.safeReadJSON("quran-reading-progress", {{ lastRead: null, completedAyahs: [], dailyGoal: 10 }});
              const completed = Array.isArray(prog.completedAyahs) ? prog.completedAyahs : [];
              if (!completed.includes(key)) completed.push(key);
              window.safeWriteJSON("quran-reading-progress", {{
                lastRead: {{ surah: SURAH_ID, ayah: n, updatedAt: Date.now() }},
                completedAyahs: completed,
                dailyGoal: Number(prog.dailyGoal) || 10
              }});
              b.textContent = "Read";
            }});
          }});

          container.querySelectorAll(".btn-copy-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              const a = surahData.ayahs[n - 1];
              const txt = a.arabic + "\\n\\n" + a.translations["en.sahih"] + "\\n— Quran " + SURAH_ID + ":" + n;
              if (navigator.clipboard && navigator.clipboard.writeText) {{
                navigator.clipboard.writeText(txt).catch(() => {{}});
              }}
              b.textContent = "Copied!";
            }});
          }});

          container.querySelectorAll(".btn-tafsir-ayah").forEach((b) => {{
            b.addEventListener("click", async () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              const dlg = document.getElementById("tafsir-dialog");
              const out = document.getElementById("tafsir-content");
              if (out) out.innerHTML = "<p>Loading tafsir...</p>";
              dlg?.showModal();
              try {{
                const res = await fetch("/api/quran/tafsir/" + SURAH_ID + "/" + n);
                if (!res.ok) throw new Error("HTTP " + res.status);
                const d = await res.json();
                const safeUrl = window.escapeHtml(d.sourceUrl);
                if (out) out.innerHTML = '<h3>' + window.escapeHtml(d.tafsirName) + '</h3><p>' + window.escapeHtml(d.text) + '</p><a href="' + safeUrl + '" target="_blank" rel="noreferrer">' + safeUrl + '</a>';
              }} catch (_err) {{
                if (out) out.innerHTML = '<p>Failed to load Tafsir.</p><button type="button" id="tafsir-retry-btn">Retry</button>';
              }}
            }});
          }});

          container.querySelectorAll(".btn-wbw-ayah").forEach((b) => {{
            b.addEventListener("click", async () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              const dlg = document.getElementById("wbw-dialog");
              const out = document.getElementById("wbw-content");
              if (out) out.innerHTML = "<p>Loading words...</p>";
              dlg?.showModal();
              try {{
                const res = await fetch("/api/quran/word-by-word/" + SURAH_ID + "/" + n);
                if (!res.ok) throw new Error("HTTP " + res.status);
                const d = await res.json();
                if (out) out.innerHTML = (d.words || []).map((w) =>
                  '<div class="card" style="margin-bottom:6px;"><strong dir="rtl">' + window.escapeHtml(w.arabic) + '</strong> (' + window.escapeHtml(w.transliteration) + ') — ' + window.escapeHtml(w.translation) + '</div>'
                ).join("");
              }} catch (_err) {{
                if (out) out.innerHTML = "<p>Failed to load word-by-word data.</p>";
              }}
            }});
          }});

          container.querySelectorAll(".btn-explain-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              runExplainModal(surahData.ayahs[n - 1]);
            }});
          }});

          container.querySelectorAll(".btn-ask-chat").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              window.openChatWithContext?.(SURAH_ID, n, "Explain Quran " + SURAH_ID + ":" + n);
            }});
          }});

          container.querySelectorAll(".btn-more-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = b.getAttribute("data-ayah");
              const menu = document.getElementById("more-menu-" + n);
              if (menu?.hasAttribute("hidden")) menu.removeAttribute("hidden");
              else menu?.setAttribute("hidden", "");
            }});
          }});

          container.querySelectorAll(".btn-note-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = b.getAttribute("data-ayah");
              activeNoteKey = SURAH_ID + ":" + n;
              const notes = window.safeReadJSON("quran-study-notes", {{}});
              const existing = notes[activeNoteKey] || {{ note: "", tags: [] }};
              document.getElementById("note-text-input").value = existing.note || "";
              document.getElementById("note-tags-input").value = (existing.tags || []).join(", ");
              document.getElementById("note-dialog")?.showModal();
            }});
          }});

          container.querySelectorAll(".btn-card-ayah").forEach((b) => {{
            b.addEventListener("click", () => {{
              const n = parseInt(b.getAttribute("data-ayah"), 10);
              const a = surahData.ayahs[n - 1];
              const preview = document.getElementById("verse-card-preview");
              if (preview) {{
                preview.innerHTML = '<p dir="rtl" lang="ar">' + window.escapeHtml(a.arabic) + '</p><p>' + window.escapeHtml(a.translations["en.sahih"]) + '</p><footer>— Quran ' + SURAH_ID + ':' + n + ' (Al-Quran Cloud)</footer>';
              }}
              document.getElementById("verse-card-dialog")?.showModal();
            }});
          }});
        }}

        document.getElementById("note-form")?.addEventListener("submit", (e) => {{
          e.preventDefault();
          if (!activeNoteKey) return;
          const noteTxt = document.getElementById("note-text-input").value.trim();
          const tags = document.getElementById("note-tags-input").value.split(",").map((x) => x.trim()).filter(Boolean);
          const notes = window.safeReadJSON("quran-study-notes", {{}});
          notes[activeNoteKey] = {{ note: noteTxt, tags: tags, updatedAt: Date.now() }};
          window.safeWriteJSON("quran-study-notes", notes);
          document.getElementById("note-dialog")?.close();
        }});

        document.getElementById("verse-card-copy")?.addEventListener("click", (e) => {{
          const txt = document.getElementById("verse-card-preview")?.textContent || "";
          if (navigator.clipboard && navigator.clipboard.writeText) {{
            navigator.clipboard.writeText(txt).catch(() => {{}});
          }}
          e.currentTarget.textContent = "Copied!";
        }});

        // Keyboard shortcuts: j / k / Space (strictly ignored inside inputs)
        document.addEventListener("keydown", (e) => {{
          const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
          if (e.key.toLowerCase() === "j") {{
            activeAyah = Math.min(MAX_AYAHS, activeAyah + 1);
            renderAyahs();
            document.getElementById("ayah-" + activeAyah)?.scrollIntoView?.();
          }} else if (e.key.toLowerCase() === "k") {{
            activeAyah = Math.max(1, activeAyah - 1);
            renderAyahs();
            document.getElementById("ayah-" + activeAyah)?.scrollIntoView?.();
          }} else if (e.code === "Space") {{
            e.preventDefault();
            if (audioBar?.hasAttribute("hidden") || audioEl?.paused) startAudioForAyah(activeAyah, true);
            else {{ audioEl.pause(); if (playBtn) playBtn.textContent = "Play"; }}
          }}
        }});

        async function loadSurah() {{
          const errBox = document.getElementById("reader-error");
          const errMsg = document.getElementById("reader-error-msg");
          errBox?.setAttribute("hidden", "");
          try {{
            const res = await fetch("/api/quran/surah/" + SURAH_ID);
            if (!res.ok) throw new Error("HTTP " + res.status);
            surahData = await res.json();
            renderAyahs();
            // Record lastRead automatically on visit
            const prog = window.safeReadJSON("quran-reading-progress", {{ lastRead: null, completedAyahs: [], dailyGoal: 10 }});
            window.safeWriteJSON("quran-reading-progress", {{
              lastRead: {{ surah: SURAH_ID, ayah: activeAyah, updatedAt: Date.now() }},
              completedAyahs: Array.isArray(prog.completedAyahs) ? prog.completedAyahs : [],
              dailyGoal: Number(prog.dailyGoal) || 10
            }});
            if (deepLinkAyah >= 1 && deepLinkAyah <= MAX_AYAHS) {{
              document.getElementById("ayah-" + deepLinkAyah)?.scrollIntoView?.();
            }}
            if (autoplay) startAudioForAyah(activeAyah, true);
          }} catch (_err) {{
            if (errMsg) errMsg.textContent = "Failed to load Surah " + SURAH_ID + ".";
            errBox?.removeAttribute("hidden");
          }}
        }}
        document.getElementById("reader-retry-btn")?.addEventListener("click", () => loadSurah());
        loadSurah();
      }})();
    </script>
    """
    return _render_html_shell(f"Surah {s_info['englishName']}", body, script, surah_context=surah_id)


class MockRequestHandler(BaseHTTPRequestHandler):
    """Thread-safe HTTP/SSE request handler implementing frontend + backend contracts."""

    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        # Keep pytest output clean
        return

    def _is_origin_allowed(self, origin: str | None) -> bool:
        if not origin:
            return False
        return origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")

    def _write_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if self._is_origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")

    def _send_json(self, status: int, data: Any) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._write_cors_headers()
        self.end_headers()
        self.wfile.write(raw)

    def _send_html(self, status: int, content: str) -> None:
        raw = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._write_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._send_json(
                200,
                {
                    "status": "ok",
                    "provider": "OpenRouter",
                    "model": "meta-llama/llama-3.3-70b-instruct:free",
                    "tavilyConfigured": False,
                    "version": "3.0",
                },
            )
            return

        if path == "/fonts/Jameel-Noori-Nastaleeq.ttf":
            payload = b"\x00\x01\x00\x00" + b"\x00" * 16
            self.send_response(200)
            self.send_header("Content-Type", "font/ttf")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if re.match(r"^/audio/\d+/\d+\.wav$", path):
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(SILENT_WAV_BYTES)))
            self.end_headers()
            self.wfile.write(SILENT_WAV_BYTES)
            return

        # Quran API endpoints (/api/quran/* and /quran/*)
        if path in ("/api/quran/search", "/quran/search"):
            q = qs.get("q", [""])[0]
            if not q.strip():
                self._send_json(400, {"error": "Query parameter 'q' is required"})
                return
            edition = qs.get("edition", ["en.sahih"])[0]
            limit = int(qs.get("limit", ["40"])[0])
            self._send_json(200, _search_quran_payload(q, edition, limit))
            return

        surah_api_match = re.match(r"^/(?:api/)?quran/surah/([^/]+)$", path)
        if surah_api_match:
            raw_id = surah_api_match.group(1)
            try:
                sid = int(raw_id)
            except ValueError:
                self._send_json(400, {"error": "Surah ID must be an integer between 1 and 114"})
                return
            if sid < 1 or sid > TOTAL_SURAHS:
                self._send_json(404, {"error": f"Surah {sid} not found; valid range is 1 to 114"})
                return
            self._send_json(200, _get_surah_payload(sid))
            return

        tafsir_match = re.match(r"^/(?:api/)?quran/tafsir/([^/]+)/([^/]+)$", path)
        if tafsir_match:
            try:
                s_num, a_num = int(tafsir_match.group(1)), int(tafsir_match.group(2))
            except ValueError:
                self._send_json(400, {"error": "Invalid surah/ayah parameter"})
                return
            if not is_valid_reference(s_num, a_num):
                self._send_json(404, {"error": f"Reference {s_num}:{a_num} out of canonical bounds"})
                return
            slug = qs.get("slug", ["en-tafisr-ibn-kathir"])[0]
            self._send_json(200, _get_tafsir_payload(s_num, a_num, slug))
            return

        wbw_match = re.match(r"^/(?:api/)?quran/word-by-word/([^/]+)/([^/]+)$", path)
        if wbw_match:
            try:
                s_num, a_num = int(wbw_match.group(1)), int(wbw_match.group(2))
            except ValueError:
                self._send_json(400, {"error": "Invalid surah/ayah parameter"})
                return
            if not is_valid_reference(s_num, a_num):
                self._send_json(404, {"error": f"Reference {s_num}:{a_num} out of canonical bounds"})
                return
            self._send_json(200, _get_wbw_payload(s_num, a_num))
            return

        # HTML5 Pages
        if path == "/":
            self._send_html(200, _render_home_page())
        elif path == "/surah":
            self._send_html(200, _render_surah_directory_page())
        elif path.startswith("/surah/"):
            raw_sid = path.split("/surah/", 1)[1].split("/")[0]
            self._send_html(200, _render_surah_reader_page(raw_sid))
        elif path == "/juz":
            self._send_html(200, _render_juz_page())
        elif path == "/bookmarks":
            self._send_html(200, _render_bookmarks_page())
        elif path == "/search":
            self._send_html(200, _render_search_page())
        elif path == "/topics":
            self._send_html(200, _render_topics_page())
        elif path == "/about":
            self._send_html(200, _render_about_page())
        elif path == "/privacy":
            self._send_html(200, _render_privacy_page())
        else:
            self._send_html(404, _render_html_shell("Not Found", "<h1>404 Not Found</h1><a href='/'>Go Home</a>"))

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path not in ("/api/explain", "/explain", "/explain-stream"):
            self._send_json(404, {"error": "Not found"})
            return

        content_len = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_len) if content_len > 0 else b""
        try:
            body = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        if not isinstance(body, dict):
            self._send_json(422, {"error": "Request body must be a JSON object"})
            return

        ayah_text = body.get("ayahText")
        translation = body.get("translation", "")
        history = body.get("history", [])
        surah_num = body.get("surahNumber")
        ayah_num = body.get("ayahNumber")
        if not isinstance(ayah_text, str) or len(ayah_text.strip()) < 1 or len(ayah_text) > 2000:
            self._send_json(422, {"error": "ayahText must be a string between 1 and 2000 characters"})
            return
        if not isinstance(translation, str) or len(translation) > 2000:
            self._send_json(422, {"error": "translation must be a string of at most 2000 characters"})
            return
        if not isinstance(history, list):
            self._send_json(422, {"error": "history must be a list"})
            return
        if "isSearch" in body and not isinstance(body["isSearch"], bool):
            self._send_json(400, {"error": "isSearch must be a boolean."})
            return
        if surah_num is not None and not _is_strict_int(surah_num):
            self._send_json(400, {"error": "surahNumber must be null or an integer."})
            return
        if ayah_num is not None and (not _is_strict_int(ayah_num) or surah_num is None):
            self._send_json(400, {"error": "ayahNumber requires a valid surahNumber and must be an integer."})
            return

        result = _evaluate_explain_request(body)
        accept = (self.headers.get("Accept") or "").lower()
        wants_stream = path == "/explain-stream" or "text/event-stream" in accept

        if not wants_stream:
            self._send_json(200, result)
            return

        frames: list[bytes] = []
        frames.append(
            f"data: {json.dumps({'status': 'Validating canonical reference & retrieving verse...'}, ensure_ascii=False)}\n\n".encode("utf-8")
        )
        frames.append(
            f"data: {json.dumps({'status': 'Checking authoritative tafsir & citations...'}, ensure_ascii=False)}\n\n".encode("utf-8")
        )
        text = result["explanation"]
        chunk_size = 64
        for idx in range(0, len(text), chunk_size):
            frames.append(
                f"data: {json.dumps({'token': text[idx : idx + chunk_size]}, ensure_ascii=False)}\n\n".encode("utf-8")
            )
        metadata_payload = {
            "verified": result["verified"],
            "refusal": result["refusal"],
            "sources": result["sources"],
            "canonicalVerse": result["canonicalVerse"],
        }
        frames.append(
            f"data: {json.dumps({'metadata': metadata_payload}, ensure_ascii=False)}\n\n".encode("utf-8")
        )
        frames.append(b'data: {"done": true}\n\n')
        payload_bytes = b"".join(frames)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(payload_bytes)))
        self._write_cors_headers()
        self.end_headers()
        self.wfile.write(payload_bytes)


class MockServer:
    """Lifecycle wrapper around ThreadingHTTPServer on 127.0.0.1:0."""

    def __init__(self) -> None:
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), MockRequestHandler)
        self._server.daemon_threads = True
        self.port = self._server.server_port
        self.base_url = f"http://127.0.0.1:{self.port}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def start(self) -> str:
        self._thread.start()
        return self.base_url

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=3.0)
