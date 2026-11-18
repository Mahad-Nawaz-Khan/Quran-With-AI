"""Zero-hallucination OpenAI Agents SDK definitions and grounded runner."""

from __future__ import annotations

import logging
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, RunConfig, Runner
from agents.exceptions import MaxTurnsExceeded, OutputGuardrailTripwireTriggered
from openai import APIStatusError, AsyncOpenAI, NotFoundError, RateLimitError

from backend.config import Settings
from backend.grounding import (
    GroundingCheckResult,
    GroundingContext,
    build_sources,
    grounding_output_guardrail,
    remediate_response,
    strip_fabricated_source_footers,
    verify_response,
)
from backend.tools.quran_api import get_quran_ayah, get_quran_range, search_quran
from backend.tools.tafsir_api import get_tafsir
from backend.tools.web_search import search_islamic_sources

logger = logging.getLogger(__name__)


class ConfigurationError(RuntimeError):
    """Raised at request execution time when required AI credentials are missing."""


GROUNDING_MODEL_SETTINGS = ModelSettings(
    temperature=0.0,
    top_p=0.1,
    max_tokens=1500,
)

EXPLAIN_SYSTEM_PROMPT = """You are a strictly source-grounded Islamic and Quranic study assistant.

ZERO-HALLUCINATION RULES:
1. NEVER generate Quranic Arabic text, translations, hadith, or historical narrations from memory.
2. Base your explanation strictly on the verified text inside <VERIFIED_CANONICAL_VERSE>. Only consult tool outputs if you were explicitly asked for classical tafsir or scholarly sources.
3. CRITICAL LATENCY RULE: For verse explanations (including "Explain Quran X:Y"), answer DIRECTLY and IMMEDIATELY from <VERIFIED_CANONICAL_VERSE> WITHOUT calling any tool. Call `get_tafsir` ONLY if the user explicitly asks for "tafsir", "commentary", "Ibn Kathir", "Jalalayn", "Tabari", or "Qurtubi" (at most once).
4. NEVER cite another Surah:Ayah reference or URL unless it was retrieved via a tool in this turn.
5. NEVER add a source footer at the end; citations are attached automatically from verified tool outputs.
6. Always include the canonical English Surah name (e.g. Al-Baqara) and exact Surah:Ayah reference in plain ASCII; for Surah 2:255 always write the exact plain ASCII title "Ayat al-Kursi" (no macrons or special hyphens).
7. If tafsir or web search is unavailable or returns empty, state clearly what could not be verified.

RESPONSE FORMAT (keep concise, ~100-160 words total):
📖 **Verse Context**
[Canonical Surah name, ASCII title if applicable (e.g., Ayat al-Kursi for 2:255), and Surah:Ayah reference]

✨ **Explanation**
[2 concise, grounded paragraphs based strictly on the verified verse]

🕌 **Key Themes**
- Theme 1
- Theme 2
- Theme 3"""

SEARCH_SYSTEM_PROMPT = """You are a strictly source-grounded Quranic research assistant.

ZERO-HALLUCINATION RULES:
1. For general Quranic topic queries, ALWAYS call `search_quran` ONCE using a concise English keyword (e.g., "patience", "mercy", "charity" — never Arabic transliterations like "sabr" or "rahmah"). Cite the FIRST verse returned by `search_quran` first.
2. ALWAYS call `get_quran_ayah` or `get_quran_range` for ANY explicit Surah:Ayah or range request AND on ANY multi-turn follow-up asking about a previously mentioned verse (every request runs a fresh verification audit, so you MUST call `get_quran_ayah(surah, ayah)` on THIS turn even when the verse already appeared in prior conversation history).
3. For out-of-scope non-Islamic questions (stock prices, personal medical/legal fatwas, modern finance), refuse immediately in 1 sentence ("I cannot fulfill this request as it is outside the scope of verified Islamic/Quranic sources.") without calling tools.
4. For specific numbered hadiths or book-page claims (e.g., Hadith #99999, Mustadrak vol 4 page 512), call `search_islamic_sources` at most once; if that exact reference is NOT explicitly verified in retrieved excerpts, refuse clearly: "I cannot verify this claim from retrieved sources."
5. CRITICAL VERBATIM RULE: NEVER wrap English translations in outer quotation marks (format translations directly without adding extra surrounding quotes, e.g., `112:1 — Translation text`). Preserve EVERY comma, period, hyphen `-`, and quote character-for-character from the tool output and NEVER use ellipses "...". For general topic queries, quote 1-2 verses in complete verbatim English (omit Arabic unless explicitly asked). For explicit Surah:Ayah/range lookups (e.g., 112:1-4 Al-Ikhlas, 36:58, 18:10), copy EVERY verse's exact character-for-character Arabic (including final pause marks) AND complete verbatim English translation plus canonical Surah name.
6. NEVER invent Arabic text, Surah:Ayah references, URLs, or hadith citations from memory, and NEVER append a hardcoded source footer.
Keep answers concise (2-3 brief paragraphs or bullets)."""

explain_agent = Agent(
    name="Quran Explainer",
    instructions=EXPLAIN_SYSTEM_PROMPT,
    tools=[get_quran_ayah, get_quran_range, get_tafsir, search_islamic_sources],
    model_settings=GROUNDING_MODEL_SETTINGS,
    output_guardrails=[grounding_output_guardrail],
)

search_agent = Agent(
    name="Quran Scholar",
    instructions=SEARCH_SYSTEM_PROMPT,
    tools=[get_quran_ayah, get_quran_range, search_quran, get_tafsir, search_islamic_sources],
    model_settings=GROUNDING_MODEL_SETTINGS,
    output_guardrails=[grounding_output_guardrail],
)


_REASONING_NONE_MODELS: frozenset[str] = frozenset({
    "nvidia/nemotron-3.5-lightning:free",
    "inclusionai/ling-3.2-flash:free",
    "cohere/north-mini-code:free",
})


def _model_settings_for(model_name: str) -> ModelSettings:
    if model_name in _REASONING_NONE_MODELS:
        return ModelSettings(
            temperature=0.0,
            top_p=0.1,
            max_tokens=1500,
            extra_body={"reasoning": {"effort": "none"}},
        )
    return GROUNDING_MODEL_SETTINGS


def build_run_config(settings: Settings) -> RunConfig:
    """Lazily construct OpenRouter-backed RunConfig at execution time."""
    if not settings.ai_configured:
        raise ConfigurationError("OPENROUTER_API_KEY is not configured.")

    client = AsyncOpenAI(
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )
    model = OpenAIChatCompletionsModel(
        model=settings.openrouter_model,
        openai_client=client,
    )
    return RunConfig(
        model=model,
        model_settings=_model_settings_for(settings.openrouter_model),
        tracing_disabled=True,
    )


FALLBACK_FREE_MODELS: tuple[str, ...] = (
    "nvidia/nemotron-3.5-lightning:free",
    "inclusionai/ling-3.2-flash:free",
    "cohere/north-mini-code:free",
    "baidu/ernie-5.5-flash-preview:free",
    "openrouter/free",
)

_RETRIABLE_STATUS_CODES: frozenset[int] = frozenset({400, 404, 429, 502, 503})


async def _run_fallback_models(
    agent: Agent[GroundingContext],
    input_items: list[dict[str, str]],
    ctx: GroundingContext,
    max_turns: int,
    hooks: Any,
    primary_name: str,
    status_code: int | None,
    initial_exc: Exception,
    openai_client: Any,
) -> Any:
    last_exc: Exception = initial_exc
    for alt_model in FALLBACK_FREE_MODELS:
        if alt_model == primary_name:
            continue
        logger.warning(
            "Primary OpenRouter model %s returned status %s; retrying with %s",
            primary_name,
            status_code,
            alt_model,
        )
        alt_config = RunConfig(
            model=OpenAIChatCompletionsModel(
                model=alt_model,
                openai_client=openai_client,
            ),
            model_settings=_model_settings_for(alt_model),
            tracing_disabled=True,
        )
        try:
            return await Runner.run(
                agent,
                input=input_items,
                context=ctx,
                max_turns=max_turns,
                hooks=hooks,
                run_config=alt_config,
            )
        except (NotFoundError, RateLimitError, APIStatusError) as alt_exc:
            if getattr(alt_exc, "status_code", None) not in _RETRIABLE_STATUS_CODES:
                raise
            last_exc = alt_exc
    raise last_exc


async def _run_with_model_fallback(
    agent: Agent[GroundingContext],
    input_items: list[dict[str, str]],
    ctx: GroundingContext,
    run_config: RunConfig,
    max_turns: int,
    hooks: Any,
) -> Any:
    try:
        return await Runner.run(
            agent,
            input=input_items,
            context=ctx,
            max_turns=max_turns,
            hooks=hooks,
            run_config=run_config,
        )
    except (NotFoundError, RateLimitError, APIStatusError) as exc:
        status_code = getattr(exc, "status_code", None)
        model_obj = run_config.model
        if status_code not in _RETRIABLE_STATUS_CODES or not isinstance(
            model_obj, OpenAIChatCompletionsModel
        ):
            raise

        primary_name = str(getattr(model_obj, "model", ""))
        openai_client = getattr(model_obj, "_client", None)
        if openai_client is None:
            raise
        return await _run_fallback_models(
            agent,
            input_items,
            ctx,
            max_turns,
            hooks,
            primary_name,
            status_code,
            exc,
            openai_client,
        )


async def run_grounded_agent(
    agent: Agent[GroundingContext],
    input_items: list[dict[str, str]],
    ctx: GroundingContext,
    run_config: RunConfig,
    max_turns: int = 6,
    hooks: Any = None,
) -> tuple[str, bool, bool, list[dict[str, str]]]:
    """Execute agent with OutputGuardrail enforcement and post-run remediation.

    Returns `(explanation, verified, refusal, sources)`.
    """
    try:
        result = await _run_with_model_fallback(
            agent,
            input_items,
            ctx,
            run_config,
            max_turns,
            hooks,
        )
        raw_text = strip_fabricated_source_footers(str(result.final_output or ""))
        check = verify_response(raw_text, ctx)
        explanation, verified, refusal = remediate_response(raw_text, ctx, check)
    except OutputGuardrailTripwireTriggered as exc:
        raw_text = str(exc.guardrail_result.agent_output or "")
        info = exc.guardrail_result.output.output_info
        check = (
            info
            if isinstance(info, GroundingCheckResult)
            else verify_response(raw_text, ctx)
        )
        explanation, verified, refusal = remediate_response(raw_text, ctx, check)
    except MaxTurnsExceeded:
        logger.warning("Agent exceeded max_turns=%s", max_turns)
        explanation = (
            "I reached the verification lookup limit before completing a grounded answer. "
            "Please ask about a specific Surah:Ayah reference."
        )
        verified = True
        refusal = True

    sources = [] if refusal else build_sources(ctx)
    return explanation, verified, refusal, sources
