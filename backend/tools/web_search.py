"""Non-blocking Tavily web search restricted to curated Islamic scholarly domains."""

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Any
from urllib.parse import urlparse

from agents import RunContextWrapper, function_tool

from backend.grounding import GroundingContext, WebSourceRecord

logger = logging.getLogger(__name__)

CURATED_ISLAMIC_DOMAINS: tuple[str, ...] = (
    "quran.com",
    "sunnah.com",
    "islamqa.info",
    "seekersguidance.org",
    "altafsir.com",
    "yaqeeninstitute.org",
)
MAX_EXCERPT_CHARS = 1200


def _is_curated_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    return any(host == dom or host.endswith(f".{dom}") for dom in CURATED_ISLAMIC_DOMAINS)


async def _execute_search(tavily_client: Any, query: str) -> dict[str, Any]:
    search_fn = getattr(tavily_client, "search")
    kwargs = {
        "query": query,
        "search_depth": "basic",
        "max_results": 5,
        "include_domains": list(CURATED_ISLAMIC_DOMAINS),
    }
    if inspect.iscoroutinefunction(search_fn):
        return await search_fn(**kwargs)
    return await asyncio.to_thread(search_fn, **kwargs)


@function_tool
async def search_islamic_sources(
    ctx: RunContextWrapper[GroundingContext],
    query: str,
) -> str:
    """Search curated Islamic scholarly domains via Tavily without blocking the event loop."""
    gctx = ctx.context
    clean_query = " ".join(query.strip().split())[:400]
    if not clean_query:
        return "SEARCH_EMPTY: Search query cannot be empty."

    gctx.search_queries_run.append(clean_query)
    tavily_client = gctx.tavily_client

    if tavily_client is None:
        gctx.search_unavailable = True
        gctx.search_unavailable_reason = "Tavily search is not configured"
        gctx.tool_calls.append("search_islamic_sources:UNAVAILABLE")
        return (
            "SEARCH_UNAVAILABLE: External Islamic web search is not configured. "
            "Do NOT answer from memory or fabricate hadith, historical narrations, "
            "or scholarly rulings. Inform the user clearly that external sources "
            "could not be searched."
        )

    gctx.tool_calls.append(f"search_islamic_sources:{clean_query[:60]}")
    try:
        raw_response = await _execute_search(tavily_client, clean_query)
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        gctx.search_unavailable = True
        gctx.search_unavailable_reason = "External search request failed"
        return (
            "SEARCH_UNAVAILABLE: External Islamic web search failed. "
            "Do NOT fabricate sources or answer unverified scholarly claims from memory."
        )

    results = (raw_response or {}).get("results") or []
    verified_entries: list[str] = []
    for item in results:
        url = str(item.get("url") or "").strip()
        if not _is_curated_url(url):
            continue
        title = str(item.get("title") or "Untitled").strip()
        content = str(item.get("content") or "").strip()[:MAX_EXCERPT_CHARS]
        gctx.web_sources.append(
            WebSourceRecord(
                title=title,
                url=url,
                excerpt=content,
                query=clean_query,
            )
        )
        verified_entries.append(
            f"Title: {title}\nURL: {url}\nExcerpt: {content}"
        )

    if not verified_entries:
        gctx.empty_search_queries.append(clean_query)
        return (
            "SEARCH_EMPTY: No verified results were found on curated Islamic domains. "
            "State clearly that no matching scholarly source was found."
        )

    return "--- VERIFIED ISLAMIC SOURCES ---\n\n" + "\n\n".join(verified_entries)
