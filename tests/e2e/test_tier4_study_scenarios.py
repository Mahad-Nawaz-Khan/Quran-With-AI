"""Tier 4: Real-world end-to-end Quran study scenarios (>= 8 scenarios)."""

from __future__ import annotations

import json
import re

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.helpers import assert_ayah_active, audio_region

pytestmark = pytest.mark.tier4


def test_t4_s1_daily_khatam_and_continue_reading_study_session(page: Page, base_url: str) -> None:
    """Scenario 1: Read Surah Al-Fatihah, mark ayahs read, verify Khatam % & Continue Reading on Home."""
    page.goto(base_url)
    page.get_by_role("link", name=re.compile(r"Start Reading", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/1"))

    for ayah_num in (1, 2, 3):
        page.get_by_role("button", name=f"Mark Ayah {ayah_num} Read").click()
        page.get_by_role("button", name=f"Bookmark Ayah {ayah_num}").click()

    page.goto(base_url)
    expect(page.get_by_text(re.compile(r"3\s*/\s*6236\s*ayahs"))).to_be_visible()
    expect(page.get_by_role("link", name=re.compile(r"Continue Reading", re.I))).to_have_attribute(
        "href", re.compile(r"/surah/1\?ayah=3")
    )

    page.reload()
    expect(page.get_by_text(re.compile(r"3\s*/\s*6236\s*ayahs"))).to_be_visible()


def test_t4_s2_deep_tafsir_word_by_word_and_tajweed_study(page: Page, base_url: str) -> None:
    """Scenario 2: Study Ayat al-Kursi (2:255) with Tajweed, Tafsir Drawer, Word-by-Word, and AI Explain."""
    page.goto(f"{base_url}/surah/2?ayah=255")
    expect(page.locator("#ayah-255")).to_be_visible()

    tajweed_btn = page.get_by_role("button", name=re.compile(r"Tajweed mode", re.I))
    tajweed_btn.click()
    expect(page.locator("#ayah-255 .tajweed-script")).to_be_visible()

    page.get_by_role("button", name="Tafsir for Ayah 255").click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_contain_text("Tafsir Ibn Kathir")
    expect(dlg).to_contain_text(re.compile(r"Ayat al-Kursi", re.I))
    page.keyboard.press("Escape")

    page.get_by_role("button", name="Word by Word for Ayah 255").click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_contain_text(re.compile(r"Allahu|al-lahu", re.I))
    page.keyboard.press("Escape")

    page.get_by_role("button", name="Explain with AI Ayah 255").click()
    dlg = page.locator("dialog[open]")
    expect(dlg).to_contain_text("Al-Baqara", timeout=15_000)
    expect(dlg).to_contain_text("Al-Quran Cloud", timeout=15_000)
    page.keyboard.press("Escape")


def test_t4_s3_hifz_memorization_with_blur_ab_loop_and_speed(page: Page, base_url: str) -> None:
    """Scenario 3: Memorize Surah Al-Ikhlas (112) using Hifz blur/reveal, A-B loop, and 0.75x speed."""
    page.goto(f"{base_url}/surah/112")
    page.get_by_role("button", name=re.compile(r"Hifz mode", re.I)).click()

    blurred = page.locator("#ayah-1 .hifz-blurred").first
    expect(blurred).to_be_visible()
    blurred.click()
    expect(page.locator("#ayah-1 .hifz-revealed").first).to_be_visible()

    page.get_by_role("button", name=re.compile(r"^Listen$", re.I)).click()
    page.get_by_label(re.compile(r"Loop Start Ayah", re.I)).fill("1")
    page.get_by_label(re.compile(r"Loop End Ayah", re.I)).fill("4")
    page.get_by_role("button", name=re.compile(r"Repeat Loop", re.I)).click()
    page.get_by_label(re.compile(r"Playback Speed", re.I)).select_option("0.75")

    rate = page.evaluate("() => document.getElementById('quran-audio').playbackRate")
    assert abs(rate - 0.75) < 0.01
    expect(page.get_by_role("button", name=re.compile(r"Repeat Loop", re.I))).to_have_attribute("aria-pressed", "true")


def test_t4_s4_thematic_research_to_notes_verse_card_and_export(page: Page, base_url: str) -> None:
    """Scenario 4: Browse /topics -> open verse -> add tagged note + copy Verse Card -> export JSON."""
    page.goto(f"{base_url}/topics")
    page.get_by_role("button", name=re.compile(r"Patience", re.I)).click()
    page.get_by_role("link", name=re.compile(r"Quran 2:153")).click()
    expect(page).to_have_url(re.compile(r"/surah/2\?ayah=153"))

    page.get_by_role("button", name="More options for Ayah 153").click()
    page.locator("#more-menu-153").get_by_role("button", name="Add Study Note").click()
    dlg = page.locator("dialog[open]")
    dlg.get_by_label(re.compile(r"^Note$", re.I)).fill("Patience and prayer anchor resilience.")
    dlg.get_by_label(re.compile(r"Tags", re.I)).fill("Patience, Resilience")
    dlg.get_by_role("button", name=re.compile(r"Save Note", re.I)).click()

    page.locator("#more-menu-153").get_by_role("button", name="Verse Card").click()
    card_dlg = page.locator("dialog[open]")
    expect(card_dlg).to_contain_text("Quran 2:153")
    card_dlg.get_by_role("button", name=re.compile(r"Copy Card", re.I)).click()
    expect(card_dlg.get_by_role("button", name="Copied!")).to_be_visible()
    page.keyboard.press("Escape")

    page.goto(f"{base_url}/bookmarks")
    page.get_by_role("tab", name=re.compile(r"Study Notes", re.I)).click()
    page.get_by_label(re.compile(r"Filter by collection tag", re.I)).select_option("Resilience")
    expect(page.get_by_text("Patience and prayer anchor resilience.")).to_be_visible()

    page.get_by_role("button", name=re.compile(r"Export JSON", re.I)).click()
    exported = json.loads(page.locator("#bm-export-preview").inner_text())
    assert exported["studyNotes"]["2:153"]["note"] == "Patience and prayer anchor resilience."


def test_t4_s5_multi_translation_english_urdu_light_mode_study(page: Page, base_url: str) -> None:
    """Scenario 5: Study in Light Mode with English (Sahih + Asad) and Urdu (Nastaleeq) translations."""
    page.goto(base_url)
    page.get_by_role("button", name=re.compile(r"Toggle Theme", re.I)).click()
    light_bg = page.evaluate("() => getComputedStyle(document.body).backgroundColor")

    page.goto(f"{base_url}/surah/1")
    page.get_by_role("button", name=re.compile(r"Select translations", re.I)).click()
    page.get_by_role("checkbox", name=re.compile(r"Muhammad Asad", re.I)).check()
    page.get_by_role("checkbox", name=re.compile(r"Fateh Muhammad Jalandhry", re.I)).check()

    expect(page.locator("[data-edition='en.sahih']").first).to_be_visible()
    expect(page.locator("[data-edition='en.asad']").first).to_be_visible()
    urdu = page.locator("[data-edition='ur.jalandhry']").first
    expect(urdu).to_be_visible()
    assert "Jameel Noori Nastaleeq" in urdu.evaluate("el => getComputedStyle(el).fontFamily")

    page.reload()
    assert page.evaluate("() => getComputedStyle(document.body).backgroundColor") == light_bg
    expect(page.locator("[data-edition='en.asad']").first).to_be_visible()
    expect(page.locator("[data-edition='ur.jalandhry']").first).to_be_visible()


def test_t4_s6_grounded_ai_companion_multi_turn_and_citation_jump(page: Page, base_url: str) -> None:
    """Scenario 6: Ask AI about Ayah -> multi-turn follow-up -> click verified citation link."""
    page.goto(f"{base_url}/surah/2?ayah=255")
    page.get_by_role("button", name="Ask AI about this Ayah 255").click()
    panel = page.get_by_role("region", name=re.compile(r"Quran AI", re.I))
    expect(panel).to_be_visible()
    page.get_by_role("button", name=re.compile(r"Send", re.I)).click()
    expect(panel).to_contain_text("Ayat al-Kursi", timeout=15_000)

    # Open general mercy query in chat and navigate via clickable citation
    inp = page.get_by_placeholder(re.compile(r"Ask", re.I))
    inp.fill("Give the exact reference of the first verse you mentioned.")
    page.get_by_role("button", name=re.compile(r"Send", re.I)).click()
    expect(panel).to_contain_text("2:255", timeout=15_000)
    page.get_by_role("link", name=re.compile(r"\[?2:255\]?")).first.click()
    expect(page).to_have_url(re.compile(r"/surah/2\?ayah=255"))


def test_t4_s7_command_palette_and_keyboard_only_navigation_journey(page: Page, base_url: str) -> None:
    """Scenario 7: Keyboard-only flow using Ctrl+K, j/k ayah stepping, Space play/pause, and Esc."""
    page.goto(base_url)
    page.keyboard.press("Control+k")
    dlg = page.locator("dialog[open]")
    expect(dlg).to_be_visible()
    dlg.get_by_placeholder(re.compile(r"Jump to", re.I)).fill("1:1")
    dlg.get_by_role("button", name=re.compile(r"^Go$", re.I)).click()
    expect(page).to_have_url(re.compile(r"/surah/1\?ayah=1"))

    page.keyboard.press("j")
    assert_ayah_active(page, 2, inactive_num=1)
    page.keyboard.press("k")
    assert_ayah_active(page, 1, inactive_num=2)
    page.keyboard.press("Space")
    expect(audio_region(page)).to_be_visible()

    page.keyboard.press("Control+k")
    expect(page.locator("dialog[open]")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("dialog[open]")).to_have_count(0)


def test_t4_s8_mobile_responsive_study_flow_375x812(page: Page, base_url: str) -> None:
    """Scenario 8: Mobile 375x812 flow — closed sidebar with toggle, audio controls, and chat non-overlap."""
    page.set_viewport_size({"width": 375, "height": 812})
    page.goto(f"{base_url}/surah/1")

    sidebar = page.locator("#reader-sidebar")
    expect(sidebar).to_be_hidden()
    page.get_by_role("button", name=re.compile(r"Toggle sidebar", re.I)).click()
    expect(sidebar).to_be_visible()
    page.get_by_role("button", name=re.compile(r"Toggle sidebar", re.I)).click()
    expect(sidebar).to_be_hidden()

    page.get_by_role("button", name=re.compile(r"^Listen$", re.I)).click()
    expect(page.get_by_role("button", name=re.compile(r"Repeat Loop", re.I))).to_be_visible()
    expect(page.get_by_label(re.compile(r"Playback Speed", re.I))).to_be_visible()

    audio_box = page.locator("#audio-player-bar").bounding_box()
    fab_box = page.get_by_role("button", name=re.compile(r"Open chat|Close chat", re.I)).bounding_box()
    assert audio_box is not None and fab_box is not None
    assert fab_box["y"] + fab_box["height"] <= audio_box["y"]
