"""Offline tests for Quran/Tafsir/WebSearch tools and TTLCache."""

from __future__ import annotations

import httpx
import pytest
from agents.tool_context import ToolContext

from backend.cache import TTLCache
from backend.grounding import GroundingContext
from backend.tests.conftest import (
    FakeAsyncTavilyClient,
    FakeSyncTavilyClient,
    make_mock_transport,
)
from backend.tools.quran_api import (
    fetch_ayah_editions,
    fetch_ayah_range,
    fetch_word_by_word,
    search_quran_text,
)
from backend.tools.tafsir_api import clean_tafsir_html, fetch_tafsir
from backend.tools.web_search import search_islamic_sources


@pytest.mark.asyncio
async def test_ttl_cache_deduplicates_calls() -> None:
    transport, counts = make_mock_transport()
    cache = TTLCache(max_entries=16, default_ttl=300)
    async with httpx.AsyncClient(transport=transport) as client:
        first = await fetch_ayah_editions(2, 255, http_client=client, cache=cache)
        second = await fetch_ayah_editions(2, 255, http_client=client, cache=cache)

    assert first["arabic"] == second["arabic"]
    assert sum(counts.values()) == 1


@pytest.mark.asyncio
async def test_search_quran_maps_404_to_empty() -> None:
    transport, _ = make_mock_transport()
    async with httpx.AsyncClient(transport=transport) as client:
        res = await search_quran_text("zzzznonexistent", http_client=client)
    assert res["ayahMatches"] == []
    assert res["totalAyahMatches"] == 0


@pytest.mark.asyncio
async def test_fetch_word_by_word_filters_end_token_and_sets_root_none() -> None:
    transport, _ = make_mock_transport()
    async with httpx.AsyncClient(transport=transport) as client:
        res = await fetch_word_by_word(2, 255, http_client=client)
    assert len(res["words"]) == 1
    assert res["words"][0]["arabic"] == "ٱللَّهُ"
    assert res["words"][0]["root"] is None


@pytest.mark.asyncio
async def test_fetch_ayah_range_validates_bounds() -> None:
    transport, _ = make_mock_transport()
    async with httpx.AsyncClient(transport=transport) as client:
        res = await fetch_ayah_range(2, 255, 255, http_client=client)
        assert len(res["ayahs"]) == 1
        with pytest.raises(ValueError):
            await fetch_ayah_range(2, 1, 25, http_client=client)


@pytest.mark.asyncio
async def test_tafsir_slug_normalization_html_clean_and_spa5k_fallback() -> None:
    assert clean_tafsir_html("<h2>Title</h2><p>Line &amp; more</p>") == "Title\n\nLine & more"
    assert clean_tafsir_html("<script type=\"text/javascript\">alert(1);</script ><style >body{}</style ><h2>Title</h2><p>Line &amp; more</p>") == "Title\n\nLine & more"

    transport, _ = make_mock_transport(fail_qurancom_tafsir=True)
    async with httpx.AsyncClient(transport=transport) as client:
        res = await fetch_tafsir(2, 255, slug="en-tafsir-ibn-kathir", http_client=client)
    assert res["slug"] == "en-tafisr-ibn-kathir"
    assert "Fallback Ibn Kathir" in res["text"]
    assert "spa5k/tafsir_api" in res["sourceUrl"]

    async with httpx.AsyncClient(transport=transport) as client:
        jal = await fetch_tafsir(2, 255, slug="jalalayn", http_client=client)
    assert jal["slug"] == "en-al-jalalayn"
    assert "Al-Jalalayn" in jal["text"]


@pytest.mark.asyncio
async def test_web_search_unconfigured_returns_search_unavailable_never_memory_fallback() -> None:
    gctx = GroundingContext(tavily_client=None)
    args = '{"query": "hadith on intention"}'
    ctx = ToolContext(
        context=gctx,
        tool_name="search_islamic_sources",
        tool_call_id="call_unavail",
        tool_arguments=args,
    )
    out = await search_islamic_sources.on_invoke_tool(ctx, args)

    assert "SEARCH_UNAVAILABLE" in out
    assert "Use your scholarly knowledge" not in out
    assert gctx.search_unavailable is True


@pytest.mark.asyncio
async def test_web_search_filters_curated_domains_and_keeps_1200_chars_and_sync_works() -> None:
    long_content = "A" * 1100 + "B" * 300
    async_tavily = FakeAsyncTavilyClient(
        results=[
            {"title": "Untrusted", "url": "https://evil.example.com/x", "content": "bad"},
            {"title": "Bukhari 1", "url": "https://sunnah.com/bukhari:1", "content": long_content},
        ]
    )
    gctx = GroundingContext(tavily_client=async_tavily)
    args1 = '{"query": "Bukhari intention"}'
    ctx1 = ToolContext(
        context=gctx,
        tool_name="search_islamic_sources",
        tool_call_id="call_async",
        tool_arguments=args1,
    )
    out = await search_islamic_sources.on_invoke_tool(ctx1, args1)
    assert "sunnah.com/bukhari:1" in out
    assert "evil.example.com" not in out
    assert len(gctx.web_sources) == 1
    assert len(gctx.web_sources[0].excerpt) == 1200

    sync_tavily = FakeSyncTavilyClient(
        results=[{"title": "Quran.com", "url": "https://quran.com/2/255", "content": "Valid"}]
    )
    gctx_sync = GroundingContext(tavily_client=sync_tavily)
    args2 = '{"query": "Ayat al-Kursi"}'
    ctx2 = ToolContext(
        context=gctx_sync,
        tool_name="search_islamic_sources",
        tool_call_id="call_sync",
        tool_arguments=args2,
    )
    out_sync = await search_islamic_sources.on_invoke_tool(ctx2, args2)
    assert "https://quran.com/2/255" in out_sync
    assert sync_tavily.calls == 1


@pytest.mark.asyncio
async def test_tafsir_m1_slugs_unsupported_slug_and_script_style_strip() -> None:
    from backend.tools.tafsir_api import TAFSIR_REGISTRY, resolve_tafsir_slug

    cleaned = clean_tafsir_html(
        "<script>alert(1)</script><style>.x{color:red}</style><p>Text &amp; quote</p>"
    )
    assert cleaned == "Text & quote"

    for slug in (
        "tazkirul-quran-en",
        "ar-tafsir-al-tabari",
        "tafseer-ibn-e-kaseer-urdu",
        "en-tafisr-ibn-kathir",
        "en-tafsir-ibn-kathir",
        "en-al-jalalayn",
    ):
        assert slug in TAFSIR_REGISTRY
        assert resolve_tafsir_slug(slug) in TAFSIR_REGISTRY

    with pytest.raises(ValueError, match="Unsupported tafsir slug"):
        resolve_tafsir_slug("nonexistent-tafsir-slug")


@pytest.mark.asyncio
async def test_search_quran_collapses_whitespace_and_matches_contract_fields() -> None:
    requested_urls: list[str] = []

    def _handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        return httpx.Response(
            200,
            json={
                "code": 200,
                "status": "OK",
                "data": {
                    "count": 1,
                    "matches": [
                        {
                            "number": 262,
                            "text": "Mercy verse text",
                            "surah": {"number": 2, "englishName": "Al-Baqara"},
                            "numberInSurah": 255,
                        }
                    ],
                },
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(_handler)) as client:
        res = await search_quran_text("100% mercy? / # spaces", http_client=client)
        surah_res = await search_quran_text("Al-Baqarah", http_client=client)

    assert any("100%25%20mercy%20spaces/all/en.sahih" in u for u in requested_urls)
    assert "%20%20" not in requested_urls[0]

    ayah_match = res["ayahMatches"][0]
    assert set(("surahNumber", "surahName", "ayahNumber", "text", "edition")).issubset(ayah_match.keys())
    assert ayah_match["text"] == "Mercy verse text"

    surah_match = surah_res["surahMatches"][0]
    assert set(
        ("number", "name", "englishName", "englishNameTranslation", "numberOfAyahs", "revelationType")
    ).issubset(surah_match.keys())


@pytest.mark.asyncio
async def test_malformed_json_raises_runtime_error_not_value_error() -> None:
    def _html_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>Bad Gateway</html>", headers={"content-type": "text/html"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(_html_handler)) as client:
        with pytest.raises(RuntimeError):
            await fetch_ayah_editions(2, 255, http_client=client)
        with pytest.raises(RuntimeError):
            await fetch_word_by_word(2, 255, http_client=client)
        with pytest.raises(RuntimeError):
            await fetch_tafsir(2, 255, slug="en-al-jalalayn", http_client=client)
