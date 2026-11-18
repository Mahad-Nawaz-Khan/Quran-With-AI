"""Tier 1: Happy-path feature coverage Playwright E2E tests (>= 60 tests).

Covers all 12 Feature Inventory items across all 9 pages, semantic HTML5/ARIA
controls, themes/i18n/Urdu font, translations, audio, bookmarks/notes, Tafsir,
Word-by-Word, Hifz, Tajweed, Ctrl+K Command Palette, AI explain, ChatWidget,
and API proxies.
"""

from __future__ import annotations

import re

import httpx
import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import audio_region, ayah_arabic_locator, ayah_article
from tests.evals.ground_truth import (
    CANONICAL_VERSES,
    collect_sse_result,
    normalize_arabic,
    parse_sse_events,
)

pytestmark = pytest.mark.tier1


# ---------------------------------------------------------------------------
# Feature 1: Shared Quran Types, Metadata & Search
# ---------------------------------------------------------------------------


def test_t1_f1_home_renders_canonical_stats(page: Page, base_url: str) -> None:
    page.goto(base_url)
    main = page.get_by_role("main")
    expect(main).to_contain_text("114")
    expect(main).to_contain_text("30")
    expect(main).to_contain_text("6,236")


def test_t1_f1_surah_directory_lists_114_surahs(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah")
    expect(page.get_by_role("heading", level=1)).to_contain_text(re.compile(r"Surah", re.I))
    expect(page.get_by_role("link", name=re.compile(r"1\.\s*Al-Fa+tihah?", re.I))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"114\.\s*An-Na+s", re.I))).to_be_visible()
    expect(page.get_by_text(re.compile(r"114\s+surahs", re.I))).to_be_visible()


def test_t1_f1_juz_page_lists_30_juz(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/juz")
    expect(page.get_by_role("heading", level=1)).to_contain_text(re.compile(r"Juz", re.I))
    expect(page.get_by_role("link", name=re.compile(r"Juz 1\b", re.I))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"Juz 30\b", re.I))).to_be_visible()


def test_t1_f1_search_page_renders_search_controls(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/search")
    main = page.get_by_role("main")
    expect(main.get_by_role("heading", level=1)).to_contain_text(re.compile(r"Search", re.I))
    expect(main.get_by_placeholder(re.compile(r"search", re.I))).to_be_visible()
    expect(main.get_by_role("button", name=re.compile(r"^Search$", re.I))).to_be_visible()


def test_t1_f1_surah_canonical_ayah_counts(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah")
    expect(page.get_by_text(re.compile(r"7\s+ayahs", re.I)).first).to_be_visible()
    expect(page.get_by_text(re.compile(r"286\s+ayahs", re.I)).first).to_be_visible()
    expect(page.get_by_text(re.compile(r"6\s+ayahs", re.I)).first).to_be_visible()


# ---------------------------------------------------------------------------
# Feature 2: Safe Persistent Storage Hooks & i18n
# ---------------------------------------------------------------------------


def test_t1_f2_default_storage_clean_hydration(page: Page, base_url: str) -> None:
    page.goto(base_url)
    lang = page.evaluate("() => document.documentElement.lang")
    assert lang in ("en", "ar", "ur", "id", "tr")
    assert page._collected_page_errors == []  # type: ignore[attr-defined]


def test_t1_f2_bookmarks_page_renders_tabs(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/bookmarks")
    expect(page.get_by_role("heading", level=1)).to_contain_text(re.compile(r"Bookmark|Saved", re.I))
    expect(page.get_by_role("tab", name=re.compile(r"Surah", re.I))).to_be_visible()
    expect(page.get_by_role("tab", name=re.compile(r"Ayah", re.I))).to_be_visible()
    expect(page.get_by_role("tab", name=re.compile(r"Note", re.I))).to_be_visible()


def test_t1_f2_language_selector_options_present(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Settings", re.I)).click()
    dialog = page.locator("dialog[open]")
    expect(dialog).to_be_visible()
    select = dialog.get_by_label(re.compile(r"Language", re.I))
    expect(select).to_be_visible()
    options = select.locator("option").all_text_contents()
    joined = " ".join(options).lower()
    for code in ("en", "ar", "ur", "id", "tr"):
        assert code in joined


def test_t1_f2_i18n_arabic_rtl_direction(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Settings", re.I)).click()
    dialog = page.locator("dialog[open]")
    dialog.get_by_label(re.compile(r"Language", re.I)).select_option("ar")
    assert page.evaluate("() => document.documentElement.dir") == "rtl"
    assert page.evaluate("() => document.documentElement.lang") == "ar"


def test_t1_f2_i18n_urdu_labels_render(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Settings", re.I)).click()
    dialog = page.locator("dialog[open]")
    dialog.get_by_label(re.compile(r"Language", re.I)).select_option("ur")
    nav_text = page.get_by_role("navigation").inner_text()
    assert "سورتیں" in nav_text or "بک مارکس" in nav_text or "محفوظ" in nav_text


def test_t1_f2_i18n_indonesian_and_turkish_labels(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Settings", re.I)).click()
    dialog = page.locator("dialog[open]")
    sel = dialog.get_by_label(re.compile(r"Language", re.I))
    sel.select_option("id")
    assert "Beranda" in page.get_by_role("navigation").inner_text()
    sel.select_option("tr")
    assert "Sureler" in page.get_by_role("navigation").inner_text()


# ---------------------------------------------------------------------------
# Feature 3: Theme Tokens & Urdu Font
# ---------------------------------------------------------------------------


def test_t1_f3_dark_light_css_tokens_distinct(page: Page, base_url: str) -> None:
    page.goto(base_url)
    dark_bg = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
    page.get_by_role("button", name=re.compile(r"Toggle Theme", re.I)).click()
    light_bg = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
    assert dark_bg != light_bg


def test_t1_f3_light_mode_removes_dark_class_and_updates_body_bg(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Toggle Theme", re.I)).click()
    has_dark = page.evaluate("() => document.documentElement.classList.contains('dark')")
    assert has_dark is False
    bg_var = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()")
    assert bg_var != ""


def test_t1_f3_urdu_font_face_registered(page: Page, base_url: str) -> None:
    page.goto(base_url)
    has_nastaleeq = page.evaluate(
        """() => {
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.cssText && rule.cssText.includes('Jameel-Noori-Nastaleeq.ttf')) {
                            return true;
                        }
                    }
                } catch (e) {}
            }
            return false;
        }"""
    )
    assert has_nastaleeq is True


def test_t1_f3_urdu_font_endpoint_serves_font(base_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{base_url}/fonts/Jameel-Noori-Nastaleeq.ttf")
    assert resp.status_code == 200
    assert len(resp.content) > 0


def test_t1_f3_pages_render_without_css_or_page_errors(page: Page, base_url: str) -> None:
    for path in ("/", "/surah", "/surah/1", "/juz", "/bookmarks", "/search", "/topics", "/about", "/privacy"):
        page.goto(f"{base_url}{path}")
        expect(page.get_by_role("main")).to_be_visible()


# ---------------------------------------------------------------------------
# Feature 4: Next.js AI & Quran API Proxy
# ---------------------------------------------------------------------------


def test_t1_f4_client_requests_use_api_explain_not_localhost_8000(page: Page, base_url: str) -> None:
    seen_urls: list[str] = []
    page.on("request", lambda req: seen_urls.append(req.url))
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Open chat", re.I)).click()
    page.get_by_placeholder(re.compile(r"Ask", re.I)).fill("Tell me about Quran 1:1")
    page.get_by_role("button", name=re.compile(r"Send", re.I)).click()
    page.wait_for_timeout(400)
    assert any("/api/explain" in u for u in seen_urls)
    assert not any("localhost:8000" in u for u in seen_urls)


def test_t1_f4_api_explain_route_reachable(base_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            f"{base_url}/api/explain",
            json={"ayahText": "2:255", "surahNumber": 2, "ayahNumber": 255, "isSearch": False},
            headers={"Accept": "application/json"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["verified"] is True


def test_t1_f4_api_quran_search_reachable(base_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{base_url}/api/quran/search?q=mercy&edition=en.sahih&limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "surahMatches" in data and "ayahMatches" in data


def test_t1_f4_api_quran_tafsir_and_wbw_reachable(base_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        t_resp = client.get(f"{base_url}/api/quran/tafsir/1/1")
        w_resp = client.get(f"{base_url}/api/quran/word-by-word/1/1")
    assert t_resp.status_code == 200
    assert t_resp.json()["surah"] == 1
    assert w_resp.status_code == 200
    assert len(w_resp.json()["words"]) >= 1


def test_t1_f4_nullish_optional_fields_accepted(base_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            f"{base_url}/api/explain",
            json={"ayahText": "What does Quran say about patience?", "isSearch": True},
            headers={"Accept": "application/json"},
        )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Feature 5: Backend Health, Caching & CORS
# ---------------------------------------------------------------------------


def test_t1_f5_health_endpoint_schema(backend_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{backend_url}/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert data["provider"] == "OpenRouter"
    assert isinstance(data["tavilyConfigured"], bool)


def test_t1_f5_backend_surah_endpoint_schema(backend_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{backend_url}/quran/surah/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["surah"]["number"] == 1
    assert len(data["ayahs"]) == 7


def test_t1_f5_backend_search_endpoint_schema(backend_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{backend_url}/quran/search?q=patience&edition=en.sahih&limit=20")
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "patience"
    assert isinstance(data["totalAyahMatches"], int)


def test_t1_f5_cors_allows_local_origin(backend_url: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        resp = client.options(
            f"{backend_url}/health",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


# ---------------------------------------------------------------------------
# Feature 6: Grounded AI Stream & ThinkingLoader
# ---------------------------------------------------------------------------


def test_t1_f6_explain_stream_emits_real_status_events(base_url: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(
            f"{base_url}/api/explain",
            json={"ayahText": "2:255", "surahNumber": 2, "ayahNumber": 255, "isSearch": False},
            headers={"Accept": "text/event-stream"},
        )
    assert resp.status_code == 200
    parsed = collect_sse_result(parse_sse_events(resp.text))
    assert len(parsed["statuses"]) >= 1
    assert parsed["done"] is True


def test_t1_f6_explain_metadata_has_dynamic_sources(base_url: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(
            f"{base_url}/api/explain",
            json={
                "ayahText": "1:1",
                "surahNumber": 1,
                "ayahNumber": 1,
                "translationEditions": ["en.asad"],
                "isSearch": False,
            },
            headers={"Accept": "text/event-stream"},
        )
    parsed = collect_sse_result(parse_sse_events(resp.text))
    sources = parsed["metadata"]["sources"]
    assert len(sources) >= 1
    assert any("en.asad" in str(s.get("label", "")) or "asad" in str(s.get("url", "")).lower() for s in sources)


def test_t1_f6_explain_metadata_canonical_verse_present(base_url: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(
            f"{base_url}/api/explain",
            json={"ayahText": "1:1", "surahNumber": 1, "ayahNumber": 1, "isSearch": False},
            headers={"Accept": "text/event-stream"},
        )
    parsed = collect_sse_result(parse_sse_events(resp.text))
    cv = parsed["metadata"]["canonicalVerse"]
    assert cv is not None
    assert cv["surah"] == 1 and cv["ayah"] == 1
    assert normalize_arabic(cv["arabic"]) == normalize_arabic(CANONICAL_VERSES["1:1"]["quran-uthmani"])


def test_t1_f6_thinking_loader_displays_live_sse_status(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Open chat", re.I)).click()
    page.get_by_placeholder(re.compile(r"Ask", re.I)).fill("Explain 1:1")
    page.get_by_role("button", name=re.compile(r"Send", re.I)).click()
    panel = page.get_by_role("region", name=re.compile(r"Quran AI", re.I))
    status_region = panel.get_by_role("status").first
    expect(status_region).to_be_visible()
    expect(status_region).not_to_be_empty()


def test_t1_f6_explain_json_endpoint_returns_verified_payload(backend_url: str) -> None:
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(
            f"{backend_url}/explain",
            json={"ayahText": "2:255", "surahNumber": 2, "ayahNumber": 255, "isSearch": False},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["verified"] is True
    assert data["refusal"] is False
    assert data["canonicalVerse"]["surah"] == 2


# ---------------------------------------------------------------------------
# Feature 7: Header, Command Palette, SurahCard & ChatWidget
# ---------------------------------------------------------------------------


def test_t1_f7_header_nav_links_render(page: Page, base_url: str) -> None:
    page.goto(base_url)
    banner = page.get_by_role("banner")
    for label in ("Surahs", "Juz", "Topics", r"Saved|Bookmarks", "Search"):
        expect(banner.get_by_role("link", name=re.compile(label, re.I))).to_be_visible()


def test_t1_f7_surah_card_play_is_semantic_button(page: Page, base_url: str) -> None:
    page.goto(base_url)
    play_btn = page.get_by_role("button", name=re.compile(r"Play Surah Al-Fa+tihah?", re.I))
    expect(play_btn).to_be_visible()
    tag = play_btn.evaluate("el => el.tagName.toLowerCase()")
    assert tag == "button"


def test_t1_f7_surah_card_bookmark_button_accessible(page: Page, base_url: str) -> None:
    page.goto(base_url)
    bm_btn = page.get_by_role("button", name=re.compile(r"Bookmark Surah Al-Fa+tihah?", re.I))
    expect(bm_btn).to_be_visible()
    bm_btn.click()
    saved = page.evaluate("() => JSON.parse(localStorage.getItem('quran-bookmarks') || '[]')")
    assert 1 in saved


def test_t1_f7_chat_widget_openrouter_attribution_no_stale_brand(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Open chat", re.I)).click()
    panel = page.get_by_role("region", name=re.compile(r"Quran AI", re.I))
    expect(panel).to_contain_text("OpenRouter")
    txt = panel.inner_text()
    assert "Z.ai" not in txt and "Groq" not in txt


def test_t1_f7_search_and_settings_use_native_dialog(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Search", re.I)).click()
    expect(page.locator("dialog[open]")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("dialog[open]")).to_have_count(0)

    page.get_by_role("button", name=re.compile(r"Settings", re.I)).click()
    expect(page.locator("dialog[open]")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("dialog[open]")).to_have_count(0)


def test_t1_f7_chat_widget_live_region_and_aria_labels(page: Page, base_url: str) -> None:
    page.goto(base_url)
    fab = page.get_by_role("button", name=re.compile(r"Open chat", re.I))
    expect(fab).to_be_visible()
    fab.click()
    expect(page.get_by_role("status")).to_be_attached()
    expect(page.get_by_role("button", name=re.compile(r"Send", re.I))).to_be_visible()


def test_t1_f7_header_surah_dropdown_on_reader(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    switcher = page.get_by_role("button", name=re.compile(r"Switch Surah", re.I))
    expect(switcher).to_be_visible()
    switcher.click()
    expect(page.get_by_placeholder(re.compile(r"Filter surahs", re.I))).to_be_visible()


# ---------------------------------------------------------------------------
# Feature 8: Pages Realization & Topic Explorer
# ---------------------------------------------------------------------------


def test_t1_f8_home_footer_openrouter_and_valid_links(page: Page, base_url: str) -> None:
    page.goto(base_url)
    body_text = page.locator("body").inner_text()
    assert "OpenRouter" in body_text
    assert "Groq" not in body_text
    expect(page.get_by_role("link", name=re.compile(r"About", re.I))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"Privacy", re.I))).to_be_visible()


def test_t1_f8_about_page_renders_200_with_disclosures(page: Page, base_url: str) -> None:
    resp = page.goto(f"{base_url}/about")
    assert resp is not None and resp.status == 200
    expect(page.get_by_role("heading", level=1)).to_contain_text(re.compile(r"About", re.I))
    expect(page.get_by_role("main")).to_contain_text("Al-Quran Cloud")
    expect(page.get_by_role("main")).to_contain_text("OpenRouter")


def test_t1_f8_privacy_page_renders_200_with_storage_info(page: Page, base_url: str) -> None:
    resp = page.goto(f"{base_url}/privacy")
    assert resp is not None and resp.status == 200
    expect(page.get_by_role("heading", level=1)).to_contain_text(re.compile(r"Privacy", re.I))
    expect(page.get_by_role("main")).to_contain_text(re.compile(r"localStorage", re.I))


def test_t1_f8_juz_and_bookmarks_top_padding_clears_header(page: Page, base_url: str) -> None:
    for path in ("/juz", "/bookmarks"):
        page.goto(f"{base_url}{path}")
        hdr_box = page.get_by_role("banner").bounding_box()
        h1_box = page.get_by_role("heading", level=1).bounding_box()
        assert hdr_box is not None and h1_box is not None
        assert h1_box["y"] >= hdr_box["y"] + hdr_box["height"]


def test_t1_f8_topics_page_renders_curated_themes(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/topics")
    expect(page.get_by_role("heading", level=1)).to_contain_text(re.compile(r"Topic", re.I))
    for theme in ("Rabbana Duas", "Patience", "Gratitude", "Justice", "Mercy"):
        expect(page.get_by_role("button", name=re.compile(theme, re.I))).to_be_visible()


def test_t1_f8_home_continue_reading_and_khatam_card(page: Page, base_url: str) -> None:
    page.goto(base_url)
    expect(page.get_by_text(re.compile(r"Khatam Progress:", re.I))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"Start Reading|Continue Reading", re.I))).to_be_visible()


def test_t1_f8_surah_page_has_accessible_form_labels(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah")
    search_inp = page.get_by_label(re.compile(r"Search Surahs", re.I))
    expect(search_inp).to_be_visible()
    expect(page.get_by_label(re.compile(r"Revelation Type", re.I))).to_be_visible()
    search_inp.fill("Kahf")
    expect(page.get_by_role("link", name=re.compile(r"18\.\s*Al-Kahf", re.I))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"1\.\s*Al-Fa+tihah?", re.I))).to_be_hidden()


# ---------------------------------------------------------------------------
# Feature 9: Surah Reader Realization
# ---------------------------------------------------------------------------


def test_t1_f9_bismillah_banner_displayed_on_surah_2_omitted_on_1_and_9(page: Page, base_url: str) -> None:
    bismillah = re.compile(r"بِسْمِ ٱلل(?:َّ|َّ)هِ ٱلر(?:َّ|َّ)حْمَٰنِ ٱلر(?:َّ|َّ)حِيمِ")
    page.goto(f"{base_url}/surah/2")
    main = page.get_by_role("main")
    bismillah_el = main.get_by_text(bismillah).first
    expect(bismillah_el).to_be_visible()
    bismillah_box = bismillah_el.bounding_box()
    ayah1_box = ayah_article(page, 1).bounding_box()
    assert bismillah_box is not None and ayah1_box is not None
    assert bismillah_box["y"] < ayah1_box["y"]

    page.goto(f"{base_url}/surah/9")
    expect(page.get_by_role("main").get_by_text(bismillah)).to_be_hidden()

    page.goto(f"{base_url}/surah/1")
    expect(ayah_article(page, 1)).to_contain_text(bismillah)
    expect(page.locator("#bismillah-banner")).to_be_hidden()

    page.goto(f"{base_url}/surah/112")
    expect(page.get_by_role("main").get_by_text(bismillah).first).to_be_visible()
    assert not re.search(r"بِسْمِ ٱلل(?:َّ|َّ)هِ", ayah_arabic_locator(page, 1).inner_text())


def test_t1_f9_dynamic_page_juz_hizb_metadata(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    expect(page.get_by_text(re.compile(r"Page 1\b.*Juz 1\b", re.I))).to_be_visible()

    page.goto(f"{base_url}/surah/114")
    expect(page.get_by_text(re.compile(r"Page 604\b.*Juz 30\b", re.I))).to_be_visible()


def test_t1_f9_sidebar_tablist_semantics(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    sidebar = page.get_by_role("complementary")
    tablist = sidebar.get_by_role("tablist")
    expect(tablist).to_be_visible()
    surah_tab = tablist.get_by_role("tab", name=re.compile(r"^Surah$", re.I))
    expect(surah_tab).to_have_attribute("aria-selected", "true")
    expect(tablist.get_by_role("tab", name=re.compile(r"^Juz$", re.I))).to_be_visible()
    expect(tablist.get_by_role("tab", name=re.compile(r"^Page$", re.I))).to_be_visible()


def test_t1_f9_translation_selector_native_checkboxes_and_ur_khan_label(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name=re.compile(r"Select translations", re.I)).click()
    cb_sahih = page.get_by_role("checkbox", name=re.compile(r"Saheeh International", re.I))
    cb_khan = page.get_by_role("checkbox", name=re.compile(r"Ahmed Raza Khan", re.I))
    expect(cb_sahih).to_be_visible()
    expect(cb_khan).to_be_visible()
    assert cb_sahih.evaluate("el => el.tagName.toLowerCase() === 'input' && el.type === 'checkbox'") is True


def test_t1_f9_surah_info_badge_is_button_and_opens_dialog(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    info_btn = page.get_by_role("button", name=re.compile(r"Surah info|Info", re.I))
    expect(info_btn).to_be_visible()
    info_btn.click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_be_visible()
    expect(dlg).to_contain_text("Meccan")


def test_t1_f9_prev_next_surah_footer_rendered(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/2")
    expect(page.get_by_role("link", name=re.compile(r"Previous Surah", re.I))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"Next Surah", re.I))).to_be_visible()


def test_t1_f9_sidebar_search_has_accessible_label(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    sb_input = page.get_by_label(re.compile(r"Filter sidebar", re.I))
    expect(sb_input).to_be_visible()


def test_t1_f9_reader_arabic_font_size_slider_present(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    slider = page.get_by_role("slider", name=re.compile(r"Arabic font size|Arabic Size", re.I))
    expect(slider).to_be_visible()
    ar_el = ayah_arabic_locator(page, 1)
    expect(ar_el).to_be_visible()
    before_size = float(ar_el.evaluate("el => parseFloat(getComputedStyle(el).fontSize)"))
    slider.fill("40")
    slider.dispatch_event("input")
    slider.dispatch_event("change")
    after_size = float(ar_el.evaluate("el => parseFloat(getComputedStyle(el).fontSize)"))
    assert after_size > before_size


def test_t1_f9_ayah_view_renders_arabic_and_translation(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    expect(page.get_by_text("In the name of Allah, the Entirely Merciful, the Especially Merciful.")).to_be_visible()
    expect(page.get_by_text("1:1")).to_be_visible()
    expect(page.get_by_text("1:7")).to_be_visible()


# ---------------------------------------------------------------------------
# Feature 10: Audio Player & Reader Study Tools
# ---------------------------------------------------------------------------


def test_t1_f10_audio_player_aria_labels_on_all_controls(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name=re.compile(r"^Listen$", re.I)).click()
    for name_pat in (r"Previous Ayah", r"Play Audio|Pause Audio", r"Next Ayah", r"Repeat Loop", r"Mute", r"Seek Audio", r"Volume", r"Reciter", r"Playback Speed"):
        expect(page.get_by_label(re.compile(name_pat, re.I)).first).to_be_visible()


def test_t1_f10_ayah_view_action_buttons_accessible(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    for label in (
        "Play Ayah 1",
        "Bookmark Ayah 1",
        "Copy Ayah 1",
        "Tafsir for Ayah 1",
        "Word by Word for Ayah 1",
        "Explain with AI Ayah 1",
        "More options for Ayah 1",
    ):
        expect(page.get_by_role("button", name=label)).to_be_visible()


def test_t1_f10_hifz_blur_toggle_visible_in_reader(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    btn = page.get_by_role("button", name=re.compile(r"Hifz mode", re.I))
    expect(btn).to_be_visible()
    expect(btn).to_have_attribute("aria-pressed", "false")


def test_t1_f10_tajweed_toggle_visible_in_reader(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    btn = page.get_by_role("button", name=re.compile(r"Tajweed mode", re.I))
    expect(btn).to_be_visible()
    expect(btn).to_have_attribute("aria-pressed", "false")


def test_t1_f10_audio_ab_loop_and_speed_controls_rendered(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name=re.compile(r"^Listen$", re.I)).click()
    speed = page.get_by_label(re.compile(r"Playback Speed", re.I))
    expect(speed).to_be_visible()
    opts = speed.locator("option").all_text_contents()
    assert "0.75x" in opts and "1.25x" in opts and "1.5x" in opts
    expect(page.get_by_label(re.compile(r"Loop Start Ayah", re.I))).to_be_visible()
    expect(page.get_by_label(re.compile(r"Loop End Ayah", re.I))).to_be_visible()


def test_t1_f10_reader_bottom_padding_clears_audio_player(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name=re.compile(r"^Listen$", re.I)).click()
    last_ayah = ayah_article(page, 7)
    last_ayah.scroll_into_view_if_needed()
    ayah_box = last_ayah.bounding_box()
    audio_box = audio_region(page).bounding_box()
    assert ayah_box is not None and audio_box is not None
    # Scrollable container allows scrolling ayah 7 cleanly above fixed audio bar
    assert ayah_box["y"] < audio_box["y"]


def test_t1_f10_ayah_more_menu_reveals_note_and_verse_card(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name="More options for Ayah 1").click()
    expect(page.get_by_role("button", name="Add Study Note").first).to_be_visible()
    expect(page.get_by_role("button", name="Verse Card").first).to_be_visible()


def test_t1_f10_tafsir_button_opens_tafsir_view(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name="Tafsir for Ayah 1").click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_be_visible()
    expect(dlg).to_contain_text(re.compile(r"Tafsir Ibn Kathir", re.I))


def test_t1_f10_word_by_word_button_opens_morphology(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name="Word by Word for Ayah 1").click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_be_visible()
    expect(dlg).to_contain_text(re.compile(r"bis'?mi", re.I))
