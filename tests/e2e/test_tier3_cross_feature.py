"""Tier 3: Pairwise cross-feature Playwright E2E flows (>= 14 tests)."""

from __future__ import annotations

import json
import re

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import assert_ayah_active

pytestmark = pytest.mark.tier3


def test_t3_home_meccan_filter_to_surah_reader_and_prev_next(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("link", name=re.compile(r"View all Meccan", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah\?type=meccan"))
    page.get_by_role("link", name=re.compile(r"112\.\s*Al-Ikhla+s", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/112"))
    page.get_by_role("link", name=re.compile(r"Next Surah", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/113"))
    page.get_by_role("link", name=re.compile(r"Previous Surah", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/112"))


def test_t3_ctrl_k_jump_to_2_255_explain_and_bookmark(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.keyboard.press("Control+k")
    dlg = page.locator("dialog[open]")
    dlg.get_by_placeholder(re.compile(r"Jump to", re.I)).fill("2:255")
    dlg.get_by_role("button", name=re.compile(r"^Go$", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/2\?ayah=255"))
    assert_ayah_active(page, 255, inactive_num=1)

    page.get_by_role("button", name="Explain with AI Ayah 255").click()
    expect(page.locator("dialog[open]")).to_contain_text("Al-Baqara")
    page.keyboard.press("Escape")

    page.get_by_role("button", name="Bookmark Ayah 255").click()
    page.goto(f"{base_url}/bookmarks")
    page.get_by_role("tab", name=re.compile(r"Ayah", re.I)).click()
    expect(page.get_by_role("link", name=re.compile(r"2:255"))).to_be_visible()


def test_t3_search_to_reader_tafsir_wbw_and_notes(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/search?q=patience")
    page.get_by_role("link", name=re.compile(r"2:153")).click()
    expect(page).to_have_url(re.compile(r"/surah/2\?ayah=153"))

    page.get_by_role("button", name="Tafsir for Ayah 153").click()
    expect(page.locator("dialog[open]")).to_contain_text("Tafsir Ibn Kathir")
    page.keyboard.press("Escape")

    page.get_by_role("button", name="Word by Word for Ayah 153").click()
    expect(page.locator("dialog[open]")).to_be_visible()
    expect(page.locator("dialog[open]")).to_contain_text(re.compile(r"[\u0600-\u06FF]"))
    page.keyboard.press("Escape")

    page.get_by_role("button", name="More options for Ayah 153").click()
    page.locator("#more-menu-153").get_by_role("button", name="Add Study Note").click()
    dlg = page.locator("dialog[open]")
    dlg.get_by_label(re.compile(r"^Note$", re.I)).fill("Seek help with patience and prayer.")
    dlg.get_by_label(re.compile(r"Tags", re.I)).fill("Patience")
    dlg.get_by_role("button", name=re.compile(r"Save Note", re.I)).click()

    page.goto(f"{base_url}/bookmarks")
    page.get_by_role("tab", name=re.compile(r"Study Notes", re.I)).click()
    page.get_by_label(re.compile(r"Filter by collection tag", re.I)).select_option("Patience")
    expect(page.get_by_text("Seek help with patience and prayer.")).to_be_visible()


def test_t3_topics_to_reader_and_verse_card(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/topics")
    page.get_by_role("button", name=re.compile(r"Rabbana Duas", re.I)).click()
    page.get_by_role("link", name=re.compile(r"Quran 2:201")).click()
    expect(page).to_have_url(re.compile(r"/surah/2\?ayah=201"))

    page.get_by_role("button", name="More options for Ayah 201", exact=True).click()
    page.locator("#more-menu-201").get_by_role("button", name="Verse Card").click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_contain_text("Quran 2:201")
    dlg.get_by_role("button", name=re.compile(r"Copy Card", re.I)).click()
    expect(dlg.get_by_role("button", name="Copied!")).to_be_visible()


def test_t3_khatam_reading_progress_end_to_end(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name="Mark Ayah 1 Read").click()
    page.get_by_role("button", name="Mark Ayah 2 Read").click()
    page.goto(base_url)
    expect(page.get_by_text(re.compile(r"2\s*/\s*6236\s*ayahs"))).to_be_visible()
    page.reload()
    expect(page.get_by_text(re.compile(r"2\s*/\s*6236\s*ayahs"))).to_be_visible()


def test_t3_multi_translation_urdu_font_and_theme_persistence(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name=re.compile(r"Toggle Theme", re.I)).click()
    page.get_by_role("button", name=re.compile(r"Settings", re.I)).click()
    page.locator("dialog[open]").get_by_label(re.compile(r"Language", re.I)).select_option("ur")
    page.keyboard.press("Escape")

    page.get_by_role("button", name=re.compile(r"Select translations", re.I)).click()
    page.get_by_role("checkbox", name=re.compile(r"Fateh Muhammad Jalandhry", re.I)).check()
    page.reload()

    assert page.evaluate("() => document.documentElement.classList.contains('dark')") is False
    assert page.evaluate("() => document.documentElement.lang") == "ur"
    expect(page.locator("[data-edition='ur.jalandhry']").first).to_be_visible()


def test_t3_audio_autoplay_from_surah_card_to_ab_loop_and_non_overlap(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah")
    page.get_by_role("button", name=re.compile(r"Play Surah Al-Fa+tihah?", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/1\?autoplay=1"))
    page.get_by_role("button", name=re.compile(r"Repeat Loop", re.I)).click()
    page.get_by_label(re.compile(r"Playback Speed", re.I)).select_option("1.25")
    audio_box = page.locator("#audio-player-bar").bounding_box()
    fab_box = page.get_by_role("button", name=re.compile(r"Open chat|Close chat", re.I)).bounding_box()
    assert audio_box is not None and fab_box is not None
    assert fab_box["y"] + fab_box["height"] <= audio_box["y"]


def test_t3_chat_widget_multi_turn_and_citation_navigation(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Open chat", re.I)).click()
    inp = page.get_by_placeholder(re.compile(r"Ask", re.I))
    send = page.get_by_role("button", name=re.compile(r"Send", re.I))

    inp.fill("Which Quranic verses talk about Allah's mercy?")
    send.click()
    expect(page.get_by_role("link", name=re.compile(r"39:53")).first).to_be_visible(timeout=15_000)

    inp.fill("Give the exact reference of the first verse you mentioned.")
    send.click()
    cite = page.get_by_role("link", name=re.compile(r"39:53")).last
    expect(cite).to_be_visible(timeout=15_000)
    cite.click()
    expect(page).to_have_url(re.compile(r"/surah/39\?ayah=53"))


def test_t3_juz_directory_to_sidebar_juz_page_jump(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/juz")
    page.get_by_role("link", name=re.compile(r"Juz 30\b", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/78\?ayah=1"))

    sidebar = page.get_by_role("complementary")
    sidebar.get_by_role("tab", name=re.compile(r"^Page$", re.I)).click()
    sidebar.get_by_label(re.compile(r"Filter sidebar", re.I)).fill("604")
    sidebar.get_by_role("link", name="Page 604").click()
    expect(page).to_have_url(re.compile(r"/surah/112"))


def test_t3_hifz_memorization_session_with_audio(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/112")
    hifz_btn = page.get_by_role("button", name=re.compile(r"Hifz mode", re.I))
    hifz_btn.click()
    page.locator("#ayah-1 .hifz-blurred").first.click()
    expect(page.locator("#ayah-1 .hifz-revealed").first).to_be_visible()
    page.get_by_role("button", name=re.compile(r"^Listen$", re.I)).click()
    expect(page.locator("#audio-player-bar")).to_be_visible()
    hifz_btn.click()
    expect(hifz_btn).to_have_attribute("aria-pressed", "false")


def test_t3_bookmarks_legacy_migration_note_edit_and_export(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.evaluate(
        """() => {
            localStorage.setItem('quran-ayah-bookmarks', JSON.stringify(['1:1']));
            localStorage.setItem('quran-study-notes', JSON.stringify({
                '1:1': { note: 'Legacy migrated reflection', tags: ['Opening'], updatedAt: 1700000000000 }
            }));
        }"""
    )
    page.goto(f"{base_url}/bookmarks")
    page.get_by_role("tab", name=re.compile(r"Ayah", re.I)).click()
    expect(page.get_by_role("link", name=re.compile(r"1:1"))).to_be_visible()
    page.get_by_role("button", name=re.compile(r"Export JSON", re.I)).click()
    exported = json.loads(page.locator("#bm-export-preview").inner_text())
    assert exported["ayahBookmarks"][0]["key"] == "1:1"
    assert exported["studyNotes"]["1:1"]["note"] == "Legacy migrated reflection"


def test_t3_about_and_privacy_navigation_cycle(page: Page, base_url: str) -> None:
    page.goto(base_url)
    page.get_by_role("link", name=re.compile(r"About", re.I)).click()
    expect(page).to_have_url(re.compile(r"/about"))
    expect(page.get_by_role("main")).to_contain_text("Al-Quran Cloud")
    page.get_by_role("link", name=re.compile(r"Home", re.I)).click()
    page.get_by_role("link", name=re.compile(r"Privacy", re.I)).click()
    expect(page).to_have_url(re.compile(r"/privacy"))
    expect(page.get_by_role("main")).to_contain_text(re.compile(r"localStorage", re.I))


def test_t3_ask_ai_about_ayah_context_handoff(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/2?ayah=255")
    page.get_by_role("button", name="Ask AI about this Ayah 255").click()
    panel = page.get_by_role("region", name=re.compile(r"Quran AI", re.I))
    expect(panel).to_be_visible()
    expect(panel).to_contain_text("Context: Quran 2:255")
    page.get_by_role("button", name=re.compile(r"Send", re.I)).click()
    expect(panel).to_contain_text("Al-Baqara", timeout=15_000)


def test_t3_tajweed_toggle_and_sidebar_search_journey(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/surah/1")
    sidebar = page.get_by_role("complementary")
    sidebar.get_by_label(re.compile(r"Filter sidebar", re.I)).fill("Kahf")
    sidebar.get_by_role("link", name=re.compile(r"18\.\s*Al-Kahf", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/18"))
    page.get_by_role("button", name=re.compile(r"Tajweed mode", re.I)).click()
    expect(page.locator("#ayah-1 .tajweed-script")).to_be_visible()
