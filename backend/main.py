"""Quran-AI FastAPI application factory, SSE streaming, and grounded REST APIs."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import aclosing, asynccontextmanager
from pathlib import Path
from typing import Any, Literal

if __package__ in (None, ""):
    _backend_parent = str(Path(__file__).resolve().parent.parent)
    if _backend_parent not in sys.path:
        sys.path.insert(0, _backend_parent)

import httpx
from agents import RunConfig
from agents.lifecycle import RunHooksBase
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from backend.cache import TTLCache
from backend.config import Settings, load_settings
from backend.grounding import (
    GroundingContext,
    build_agent_input,
    prefetch_canonical_verse,
    prefetch_search_references,
    validate_request_references,
)
from backend.llm_agents import (
    ConfigurationError,
    build_run_config,
    explain_agent,
    run_grounded_agent,
    search_agent,
)
from backend.tools.quran_api import (
    fetch_surah_editions,
    fetch_word_by_word,
    search_quran_text,
)
from backend.tools.tafsir_api import fetch_tafsir

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_TOOL_STATUS_LABELS: dict[str, str] = {
    "get_quran_ayah": "Retrieving verified Quranic verse...",
    "get_quran_range": "Retrieving verified Quranic passage...",
    "search_quran": "Searching Quran text...",
    "get_tafsir": "Checking classical tafsir...",
    "search_islamic_sources": "Searching curated Islamic sources...",
}

router = APIRouter()


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)


class ExplainRequest(BaseModel):
    ayahText: str = Field(..., min_length=1, max_length=2000)
    translation: str = Field(default="", max_length=2000)
    surahNumber: int | None = None
    ayahNumber: int | None = None
    translationEditions: list[str] = Field(default_factory=lambda: ["en.sahih"], max_length=3)
    isSearch: bool = False
    history: list[HistoryMessage] = Field(default_factory=list, max_length=20)

    @field_validator("ayahText")
    @classmethod
    def _validate_ayah_text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ayahText cannot be blank.")
        return value

    @field_validator("surahNumber", "ayahNumber", mode="before")
    @classmethod
    def _reject_bool_ref(cls, value: Any) -> Any:
        if isinstance(value, bool):
            raise ValueError("Reference numbers must be integers, not booleans.")
        return value


class SourceCitation(BaseModel):
    type: Literal["quran", "tafsir", "web"]
    label: str
    reference: str
    url: str = ""


class CanonicalVersePayload(BaseModel):
    surah: int
    ayah: int
    arabic: str
    translation: str
    edition: str


class ExplainResponse(BaseModel):
    explanation: str
    verified: bool
    refusal: bool
    sources: list[SourceCitation] = Field(default_factory=list)
    canonicalVerse: CanonicalVersePayload | None = None


class SSEStatusHooks(RunHooksBase[GroundingContext, Any]):
    """Emits real-time status events when agent tools begin executing."""

    def __init__(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._queue = queue

    async def on_tool_start(self, context: Any, agent: Any, tool: Any) -> None:
        tool_name = getattr(tool, "name", "")
        label = _TOOL_STATUS_LABELS.get(tool_name, "Verifying scholarly sources...")
        await self._queue.put({"status": label})


def _sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _init_tavily_client(active_settings: Settings) -> Any:
    if not active_settings.tavily_configured:
        return None
    try:
        from tavily import AsyncTavilyClient

        return AsyncTavilyClient(api_key=active_settings.tavily_api_key)
    except Exception as exc:
        logger.warning("Tavily client initialization failed: %s", exc)
        return None


def _resolve_run_config(
    explicit_run_config: RunConfig | None,
    active_settings: Settings,
) -> RunConfig | None:
    if explicit_run_config is not None or not active_settings.ai_configured:
        return explicit_run_config
    try:
        return build_run_config(active_settings)
    except ConfigurationError:
        return None


@asynccontextmanager
async def _app_lifespan(fastapi_app: FastAPI) -> AsyncIterator[None]:
    state = fastapi_app.state
    explicit_settings: Settings | None = state.explicit_settings
    active_settings = (
        explicit_settings
        if explicit_settings is not None
        else load_settings(load_dotenv_file=True)
    )
    explicit_http: httpx.AsyncClient | None = state.explicit_http_client
    owned_http = explicit_http is None
    active_http = (
        explicit_http
        if explicit_http is not None
        else httpx.AsyncClient(timeout=httpx.Timeout(active_settings.http_timeout_seconds))
    )
    explicit_tavily = state.explicit_tavily_client
    active_tavily = (
        explicit_tavily
        if explicit_tavily is not None
        else _init_tavily_client(active_settings)
    )

    state.settings = active_settings
    state.http_client = active_http
    state.tavily_client = active_tavily
    state.run_config = _resolve_run_config(state.explicit_run_config, active_settings)
    try:
        yield
    finally:
        if owned_http:
            await active_http.aclose()


def _get_runtime(
    request: Request,
) -> tuple[Settings, TTLCache, httpx.AsyncClient | None, Any, RunConfig | None]:
    state = request.app.state
    return (
        state.settings,
        state.cache,
        state.http_client,
        state.tavily_client,
        state.run_config,
    )


def _validate_explain_request_shape(req: ExplainRequest) -> None:
    if req.surahNumber is None and req.ayahNumber is not None:
        raise HTTPException(
            status_code=400,
            detail="surahNumber is required when ayahNumber is supplied.",
        )


def _build_grounding_context(
    req: ExplainRequest,
    active_settings: Settings,
    cache: TTLCache,
    active_http: httpx.AsyncClient | None,
    active_tavily: Any,
) -> GroundingContext:
    return GroundingContext(
        http_client=active_http,
        cache=cache,
        settings=active_settings,
        tavily_client=active_tavily,
        surah_number=req.surahNumber,
        ayah_number=req.ayahNumber,
        is_search=req.isSearch,
        user_query=req.ayahText,
    )


async def _cancel_task(task: asyncio.Task[Any] | None) -> None:
    if task is None:
        return
    if not task.done():
        task.cancel()
    await asyncio.gather(task, return_exceptions=True)


async def _pump_agent_events(
    agent_task: asyncio.Task[tuple[str, bool, bool, list[dict[str, str]]]],
    status_queue: asyncio.Queue[dict[str, Any]],
) -> AsyncIterator[str]:
    queue_task: asyncio.Task[dict[str, Any]] | None = None
    try:
        while not agent_task.done():
            queue_task = asyncio.create_task(status_queue.get())
            done_set, _ = await asyncio.wait(
                {agent_task, queue_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if queue_task in done_set:
                yield _sse_event(queue_task.result())
            else:
                await _cancel_task(queue_task)
            queue_task = None

        while not status_queue.empty():
            yield _sse_event(status_queue.get_nowait())
    finally:
        await _cancel_task(queue_task)
        if not agent_task.done():
            await _cancel_task(agent_task)


async def _build_agent_input_with_prefetch(
    req: ExplainRequest,
    ctx: GroundingContext,
) -> list[dict[str, str]]:
    history_dicts = [m.model_dump() for m in req.history]
    if req.isSearch and (req.surahNumber is None or req.ayahNumber is None):
        await prefetch_search_references(
            req.ayahText, req.translationEditions, history_dicts, ctx
        )
    return build_agent_input(req.ayahText, req.isSearch, history_dicts, ctx)


_AGENTS_BY_SEARCH_MODE: dict[bool, Any] = {
    True: search_agent,
    False: explain_agent,
}


async def _prepare_stream_context(
    req: ExplainRequest,
    active_settings: Settings,
    cache: TTLCache,
    active_http: httpx.AsyncClient | None,
    active_tavily: Any,
) -> tuple[GroundingContext | None, list[str]]:
    events: list[str] = [_sse_event({"status": "Validating reference bounds..."})]
    refusal_outcome = validate_request_references(
        req.surahNumber,
        req.ayahNumber,
        req.ayahText,
        is_search=req.isSearch,
    )
    if refusal_outcome is not None:
        events.append(_sse_event({"token": refusal_outcome.explanation}))
        events.append(
            _sse_event(
                {
                    "metadata": {
                        "verified": True,
                        "refusal": True,
                        "sources": [],
                        "canonicalVerse": None,
                    }
                }
            )
        )
        events.append(_sse_event({"done": True}))
        return None, events

    ctx = _build_grounding_context(req, active_settings, cache, active_http, active_tavily)
    if req.surahNumber is not None and req.ayahNumber is not None:
        events.append(_sse_event({"status": "Retrieving canonical verse..."}))
        ok, err_msg = await prefetch_canonical_verse(
            req.surahNumber,
            req.ayahNumber,
            req.translationEditions,
            req.ayahText,
            req.translation,
            req.isSearch,
            ctx,
        )
        if not ok:
            events.append(_sse_event({"error": err_msg or "Unable to retrieve verified Quran text."}))
            return None, events

    return ctx, events


async def _emit_stream_result(
    explanation: str,
    verified: bool,
    refusal: bool,
    sources: list[dict[str, str]],
    canonical_verse: dict[str, Any] | None,
) -> AsyncIterator[str]:
    yield _sse_event({"status": "Verifying citations & Arabic text..."})
    chunk_size = 80
    for idx in range(0, len(explanation), chunk_size):
        yield _sse_event({"token": explanation[idx : idx + chunk_size]})
    yield _sse_event(
        {
            "metadata": {
                "verified": verified,
                "refusal": refusal,
                "sources": sources,
                "canonicalVerse": canonical_verse,
            }
        }
    )
    yield _sse_event({"done": True})


async def _explain_event_stream(
    req: ExplainRequest,
    active_settings: Settings,
    cache: TTLCache,
    active_http: httpx.AsyncClient | None,
    active_tavily: Any,
    active_run_config: RunConfig | None,
) -> AsyncIterator[str]:
    agent_task: asyncio.Task[tuple[str, bool, bool, list[dict[str, str]]]] | None = None
    try:
        ctx, prep_events = await _prepare_stream_context(
            req, active_settings, cache, active_http, active_tavily
        )
        for frame in prep_events:
            yield frame
        if ctx is None:
            return

        if active_run_config is None:
            yield _sse_event({"error": "AI service is not configured on the server."})
            return

        yield _sse_event({"status": "Analyzing with grounded sources..."})
        status_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        hooks = SSEStatusHooks(status_queue)
        agent = _AGENTS_BY_SEARCH_MODE[req.isSearch]
        input_items = await _build_agent_input_with_prefetch(req, ctx)

        agent_task = asyncio.create_task(
            run_grounded_agent(
                agent,
                input_items,
                ctx,
                active_run_config,
                max_turns=active_settings.max_agent_turns,
                hooks=hooks,
            )
        )
        async with aclosing(_pump_agent_events(agent_task, status_queue)) as events_stream:
            async for status_frame in events_stream:
                yield status_frame

        explanation, verified, refusal, sources = await agent_task
        async for result_frame in _emit_stream_result(
            explanation, verified, refusal, sources, ctx.canonical_verse
        ):
            yield result_frame
    except Exception:
        logger.exception("Unhandled error in /explain-stream")
        yield _sse_event(
            {"error": "An internal error occurred while generating the explanation."}
        )
    finally:
        if agent_task is not None and not agent_task.done():
            await _cancel_task(agent_task)


@router.get("/health")
async def health_check(request: Request) -> dict[str, Any]:
    active_settings, _, _, active_tavily, active_run_config = _get_runtime(request)
    ai_ready = active_run_config is not None or active_settings.ai_configured
    return {
        "status": "ok" if ai_ready else "degraded",
        "provider": "OpenRouter",
        "model": active_settings.openrouter_model,
        "tavilyConfigured": active_tavily is not None or active_settings.tavily_configured,
        "version": active_settings.app_version,
    }


@router.post("/explain", response_model=ExplainResponse)
async def explain_ayah(req: ExplainRequest, request: Request) -> ExplainResponse:
    _validate_explain_request_shape(req)
    refusal_outcome = validate_request_references(
        req.surahNumber,
        req.ayahNumber,
        req.ayahText,
        is_search=req.isSearch,
    )
    if refusal_outcome is not None:
        return ExplainResponse(
            explanation=refusal_outcome.explanation,
            verified=True,
            refusal=True,
            sources=[],
            canonicalVerse=None,
        )

    active_settings, cache, active_http, active_tavily, active_run_config = _get_runtime(request)
    ctx = _build_grounding_context(req, active_settings, cache, active_http, active_tavily)

    if req.surahNumber is not None and req.ayahNumber is not None:
        ok, err_msg = await prefetch_canonical_verse(
            req.surahNumber,
            req.ayahNumber,
            req.translationEditions,
            req.ayahText,
            req.translation,
            req.isSearch,
            ctx,
        )
        if not ok:
            return ExplainResponse(
                explanation=err_msg or "Unable to retrieve canonical verse.",
                verified=False,
                refusal=True,
                sources=[],
                canonicalVerse=None,
            )

    if active_run_config is None:
        raise HTTPException(status_code=503, detail="AI service is not configured on the server.")

    agent = _AGENTS_BY_SEARCH_MODE[req.isSearch]
    input_items = await _build_agent_input_with_prefetch(req, ctx)

    try:
        explanation, verified, refusal, sources = await run_grounded_agent(
            agent,
            input_items,
            ctx,
            active_run_config,
            max_turns=active_settings.max_agent_turns,
        )
    except Exception:
        logger.exception("Unhandled error in /explain")
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while generating the explanation.",
        )

    canonical_payload = (
        CanonicalVersePayload(**ctx.canonical_verse)
        if ctx.canonical_verse is not None
        else None
    )
    return ExplainResponse(
        explanation=explanation,
        verified=verified,
        refusal=refusal,
        sources=[SourceCitation(**s) for s in sources],
        canonicalVerse=canonical_payload,
    )


@router.post("/explain-stream")
async def explain_stream(req: ExplainRequest, request: Request) -> StreamingResponse:
    _validate_explain_request_shape(req)
    active_settings, cache, active_http, active_tavily, active_run_config = _get_runtime(request)
    return StreamingResponse(
        _explain_event_stream(
            req, active_settings, cache, active_http, active_tavily, active_run_config
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/quran/surah/{surah_id}")
async def get_surah(
    surah_id: int,
    request: Request,
    editions: str = Query("en.sahih", max_length=120),
    reciter: str = Query("ar.alafasy", max_length=60),
) -> dict[str, Any]:
    active_settings, cache, active_http, _, _ = _get_runtime(request)
    raw_eds = [e.strip() for e in editions.split(",") if e.strip() and e.strip() != "quran-uthmani"]
    translations = tuple(raw_eds[:3]) if raw_eds else ("en.sahih",)
    try:
        return await fetch_surah_editions(
            surah_id,
            translations=translations,
            reciter=reciter,
            http_client=active_http,
            cache=cache,
            base_url=active_settings.alquran_api_base,
            timeout=active_settings.http_timeout_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Upstream error in /quran/surah/%s", surah_id)
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch surah data from upstream Quran service.",
        )


@router.get("/quran/search")
async def search_quran_endpoint(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    edition: str = Query("en.sahih", max_length=40),
    limit: int = Query(40, ge=1, le=100),
) -> dict[str, Any]:
    active_settings, cache, active_http, _, _ = _get_runtime(request)
    try:
        return await search_quran_text(
            q,
            edition=edition,
            limit=limit,
            http_client=active_http,
            cache=cache,
            base_url=active_settings.alquran_api_base,
            timeout=active_settings.http_timeout_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Upstream error in /quran/search")
        raise HTTPException(
            status_code=502,
            detail="Failed to search upstream Quran service.",
        )


@router.get("/quran/tafsir/{surah}/{ayah}")
async def get_tafsir_endpoint(
    surah: int,
    ayah: int,
    request: Request,
    slug: str = Query("en-tafisr-ibn-kathir", max_length=80),
) -> dict[str, Any]:
    active_settings, cache, active_http, _, _ = _get_runtime(request)
    try:
        return await fetch_tafsir(
            surah,
            ayah,
            slug=slug,
            http_client=active_http,
            cache=cache,
            quran_com_base=active_settings.quran_com_api_base,
            timeout=active_settings.http_timeout_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Upstream error in /quran/tafsir/%s/%s", surah, ayah)
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch tafsir from upstream service.",
        )


@router.get("/quran/word-by-word/{surah}/{ayah}")
async def get_word_by_word_endpoint(
    surah: int,
    ayah: int,
    request: Request,
) -> dict[str, Any]:
    active_settings, cache, active_http, _, _ = _get_runtime(request)
    try:
        return await fetch_word_by_word(
            surah,
            ayah,
            http_client=active_http,
            cache=cache,
            quran_com_base=active_settings.quran_com_api_base,
            timeout=active_settings.http_timeout_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Upstream error in /quran/word-by-word/%s/%s", surah, ayah)
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch word-by-word analysis from upstream service.",
        )


def create_app(
    settings: Settings | None = None,
    http_client: httpx.AsyncClient | None = None,
    tavily_client: Any = None,
    run_config: RunConfig | None = None,
) -> FastAPI:
    """Create and configure a FastAPI application instance cleanly without import-time side effects."""
    initial_settings = settings if settings is not None else load_settings(load_dotenv_file=False)
    shared_cache = TTLCache(
        max_entries=initial_settings.cache_max_entries,
        default_ttl=initial_settings.cache_ttl_seconds,
    )
    fastapi_app = FastAPI(
        title="Quran-AI Backend",
        version=initial_settings.app_version,
        lifespan=_app_lifespan,
    )
    fastapi_app.state.explicit_settings = settings
    fastapi_app.state.explicit_http_client = http_client
    fastapi_app.state.explicit_tavily_client = tavily_client
    fastapi_app.state.explicit_run_config = run_config

    # Fallback state when TestClient or ASGI caller does not enter lifespan
    fastapi_app.state.settings = initial_settings
    fastapi_app.state.cache = shared_cache
    fastapi_app.state.http_client = http_client
    fastapi_app.state.tavily_client = tavily_client
    fastapi_app.state.run_config = run_config

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=list(initial_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept", "Authorization"],
    )
    fastapi_app.include_router(router)
    return fastapi_app


app = create_app()
