"""Shared pytest fixtures for dual-mode Playwright E2E and AI Grounding Eval suites.

Implements browser/context/page fixtures directly via playwright.sync_api.sync_playwright
(because pytest-playwright plugin is not installed in this environment).
Supports E2E_MODE=mock (default when E2E_BASE_URL is unset) and E2E_MODE=live.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from typing import Any

import httpx
import pytest
from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright

from tests.mock_server import MockServer


def _resolve_e2e_mode() -> str:
    explicit = os.environ.get("E2E_MODE", "").strip().lower()
    if explicit in ("mock", "live"):
        return explicit
    if os.environ.get("E2E_BASE_URL", "").strip():
        return "live"
    return "mock"


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    mode = _resolve_e2e_mode()
    skip_live = pytest.mark.skip(reason="Requires E2E_MODE=live")
    skip_mock = pytest.mark.skip(reason="Mock-mode only test skipped in live mode")
    for item in items:
        if "live" in item.keywords and mode != "live":
            item.add_marker(skip_live)
        if "mock" in item.keywords and mode != "mock":
            item.add_marker(skip_mock)


@pytest.fixture(scope="session")
def e2e_mode() -> str:
    return _resolve_e2e_mode()


@pytest.fixture(scope="session")
def server_urls(e2e_mode: str) -> Generator[dict[str, str], None, None]:
    if e2e_mode == "mock":
        srv = MockServer()
        url = srv.start()
        try:
            yield {"base_url": url, "backend_url": url}
        finally:
            srv.stop()
    else:
        base_url = os.environ.get("E2E_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
        backend_url = os.environ.get("E2E_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
        # Readiness sanity check in live mode
        with httpx.Client(timeout=5.0) as client:
            fe_resp = client.get(base_url)
            assert fe_resp.status_code < 500, f"Live frontend {base_url} returned {fe_resp.status_code}"
            be_resp = client.get(f"{backend_url}/health")
            assert be_resp.status_code == 200, f"Live backend {backend_url}/health returned {be_resp.status_code}"
        yield {"base_url": base_url, "backend_url": backend_url}


@pytest.fixture(scope="session")
def base_url(server_urls: dict[str, str]) -> str:
    return server_urls["base_url"]


@pytest.fixture(scope="session")
def backend_url(server_urls: dict[str, str]) -> str:
    return server_urls["backend_url"]


@pytest.fixture(scope="session")
def playwright_instance() -> Generator[Playwright, None, None]:
    pw = sync_playwright().start()
    try:
        yield pw
    finally:
        pw.stop()


@pytest.fixture(scope="session")
def browser(playwright_instance: Playwright) -> Generator[Browser, None, None]:
    headless = os.environ.get("E2E_HEADLESS", "true").strip().lower() != "false"
    br = playwright_instance.chromium.launch(headless=headless)
    try:
        yield br
    finally:
        br.close()


@pytest.fixture
def context(browser: Browser) -> Generator[BrowserContext, None, None]:
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    try:
        yield ctx
    finally:
        ctx.close()


@pytest.fixture
def page(
    context: BrowserContext,
    request: pytest.FixtureRequest,
) -> Generator[Page, None, None]:
    pg = context.new_page()
    page_errors: list[str] = []
    console_errors: list[str] = []

    def _on_pageerror(err: Any) -> None:
        page_errors.append(str(err))

    def _on_console(msg: Any) -> None:
        if msg.type == "error":
            console_errors.append(msg.text)

    pg.on("pageerror", _on_pageerror)
    pg.on("console", _on_console)
    pg._collected_page_errors = page_errors  # type: ignore[attr-defined]
    pg._collected_console_errors = console_errors  # type: ignore[attr-defined]

    try:
        yield pg
    finally:
        try:
            if not request.node.get_closest_marker("allow_pageerror"):
                assert page_errors == [], f"Uncaught pageerror(s): {page_errors}"
            if not request.node.get_closest_marker("allow_console_error"):
                assert console_errors == [], f"Unexpected console.error(s): {console_errors}"
        finally:
            pg.close()
