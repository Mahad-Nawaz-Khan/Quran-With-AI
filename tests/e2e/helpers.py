"""Shared resilient opaque-box Playwright helpers for Tiers 1–4 E2E tests."""

from __future__ import annotations

import json
import re
from typing import Any

from playwright.sync_api import Locator, Page, expect


def ayah_article(page: Page, ayah_num: int) -> Locator:
    """Locate the semantic <article> container for Ayah N."""
    return page.get_by_role("article", name=re.compile(rf"^Ayah\s+{ayah_num}\b", re.I))


def audio_region(page: Page) -> Locator:
    """Locate the semantic Audio Player region landmark."""
    return page.get_by_role("region", name=re.compile(r"Audio", re.I))


def ayah_arabic_locator(page: Page, ayah_num: int) -> Locator:
    """Locate the Arabic script element inside Ayah N's <article>."""
    return ayah_article(page, ayah_num).locator("[lang='ar'], [dir='rtl']").first


def assert_ayah_active(page: Page, ayah_num: int, inactive_num: int | None = None) -> None:
    """Verify Ayah N is marked active via aria-current or distinct computed visual highlight."""
    target = ayah_article(page, ayah_num)
    expect(target).to_be_visible()
    aria_cur = target.get_attribute("aria-current")
    if aria_cur in ("true", "location", "step", "page"):
        return
    if inactive_num is not None:
        other = ayah_article(page, inactive_num)
        style_js = (
            "el => { const s = getComputedStyle(el); "
            "return s.borderColor + '|' + s.backgroundColor + '|' + s.boxShadow + '|' + s.outlineColor; }"
        )
        if target.evaluate(style_js) != other.evaluate(style_js):
            return
    raise AssertionError(f"Ayah {ayah_num} is neither marked aria-current nor visually highlighted")


def install_clipboard_spy(page: Page) -> None:
    """Wrap navigator.clipboard.writeText via add_init_script to capture copied text portably."""
    page.add_init_script(
        """(() => {
            window.__testClipboardCapture = [];
            const spy = (text) => {
                window.__testClipboardCapture.push(String(text));
                return Promise.resolve();
            };
            try {
                if (typeof Clipboard !== 'undefined' && Clipboard.prototype) {
                    Clipboard.prototype.writeText = spy;
                }
            } catch (_e) {}
            try {
                const mockClip = {
                    writeText: spy,
                    readText: () => Promise.resolve(window.__testClipboardCapture[window.__testClipboardCapture.length - 1] || "")
                };
                Object.defineProperty(Navigator.prototype, 'clipboard', {
                    get: () => mockClip,
                    configurable: true
                });
            } catch (_e) {}
        })()"""
    )


def get_captured_clipboard_texts(page: Page) -> list[str]:
    """Return all strings passed to navigator.clipboard.writeText during the page session."""
    return page.evaluate("() => window.__testClipboardCapture || []")


def trigger_and_read_bookmarks_export(page: Page) -> dict[str, Any]:
    """Click Export JSON and parse output from either browser download or visible JSON preview."""
    btn = page.get_by_role("button", name=re.compile(r"Export JSON", re.I))
    downloaded: list[dict[str, Any]] = []

    def _on_download(dl: Any) -> None:
        path = dl.path()
        if path:
            with open(path, encoding="utf-8") as fh:
                downloaded.append(json.load(fh))

    page.once("download", _on_download)
    btn.click()
    page.wait_for_timeout(300)
    if downloaded:
        return downloaded[0]

    for selector in ("pre", "output", "textarea", "code"):
        loc = page.locator(selector)
        for idx in range(loc.count()):
            el = loc.nth(idx)
            if el.is_visible():
                raw = (el.input_value() if selector == "textarea" else el.inner_text()).strip()
                if raw.startswith("{"):
                    return json.loads(raw)

    raise AssertionError("Export JSON neither triggered a file download nor rendered visible JSON output")
