"""Offline tests for canonical 114-surah metadata and reference validation."""

from __future__ import annotations

from backend.quran_metadata import (
    SURAHS,
    TOTAL_AYAHS,
    TOTAL_SURAHS,
    extract_references,
    extract_surah_mentions,
    find_surah_matches,
    strip_bismillah_prefix,
    validate_reference,
)


def test_canonical_114_surah_totals() -> None:
    assert len(SURAHS) == TOTAL_SURAHS == 114
    assert sum(s.ayah_count for s in SURAHS) == TOTAL_AYAHS == 6236
    assert SURAHS[0].number == 1 and SURAHS[0].ayah_count == 7
    assert SURAHS[1].number == 2 and SURAHS[1].ayah_count == 286
    assert SURAHS[8].number == 9 and SURAHS[8].ayah_count == 129
    assert SURAHS[113].number == 114 and SURAHS[113].ayah_count == 6


def test_validate_reference_bounds() -> None:
    assert validate_reference(1, 7) == (True, None)
    assert validate_reference(2, 286) == (True, None)
    assert validate_reference(114, 6) == (True, None)

    ok_115, msg_115 = validate_reference(115, 1)
    assert ok_115 is False and "114 Surahs" in (msg_115 or "")

    ok_300, msg_300 = validate_reference(2, 300)
    assert ok_300 is False and "286 ayahs" in (msg_300 or "")

    ok_zero, _ = validate_reference(0, 1)
    assert ok_zero is False

    ok_ayah_zero, _ = validate_reference(2, 0)
    assert ok_ayah_zero is False


def test_extract_references_and_ignores_timestamps() -> None:
    text = "Compare 2:255-257 and Surah 1, Ayah 7 at 12:30 pm or 12:30:05; ignore 115:1."
    refs = extract_references(text)
    assert (2, 255) in refs
    assert (2, 256) in refs
    assert (2, 257) in refs
    assert (1, 7) in refs
    assert (115, 1) in refs
    assert (12, 30) not in refs
    assert (30, 5) not in refs


def test_extract_surah_mentions() -> None:
    assert extract_surah_mentions("Tell me about Surah 115 and Chapter 0") == [115, 0]


def test_find_surah_matches() -> None:
    assert find_surah_matches("fatiha")[0].number == 1
    assert find_surah_matches("cow")[0].number == 2
    assert find_surah_matches("112")[0].english_name == "Al-Ikhlas"
    assert find_surah_matches("البقرة")[0].number == 2


def test_strip_bismillah_prefix_preserves_fatihah_and_strips_surah_2() -> None:
    assert strip_bismillah_prefix("\ufeffبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", 1, 1) == "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"
    assert strip_bismillah_prefix("\ufeffبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ", 2, 1) == "الٓمٓ"
    assert strip_bismillah_prefix("\ufeffالٓمٓ", 2, 1) == "الٓمٓ"


def test_extract_references_avoids_time_ip_and_url_backtracking_false_positives() -> None:
    from backend.grounding import validate_request_references

    for benign in (
        "12:30 pm",
        "12:30pm",
        "10:05 pm",
        "14:05:33",
        "9:59 am",
        "12:30:05",
        "12:30-1:00 pm",
        "14:30 p.m.",
        "14:55 UTC",
        "http://127.0.0.1:8080",
        "https://example.com:8080/path",
        "127.0.0.1:8080",
    ):
        assert extract_references(benign) == [], f"Unexpected match for {benign}"
        assert validate_request_references(None, None, benign) is None

    assert (2, 255) in extract_references("2:255")
    assert extract_references("2:255-260") == [(2, 255), (2, 256), (2, 257), (2, 258), (2, 259), (2, 260)]
    assert extract_references("Surah 2, Ayahs 255-257") == [(2, 255), (2, 256), (2, 257)]
    assert extract_references("Surah 2, verses 255-256") == [(2, 255), (2, 256)]
    assert extract_references("115:1") == [(115, 1)]
    assert extract_references("2:300") == [(2, 300)]
    assert extract_references("0:1") == [(0, 1)]
