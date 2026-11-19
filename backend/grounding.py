"""Zero-hallucination grounding ledger, pre-LLM guards, and post-LLM verifier."""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

import httpx
from agents import GuardrailFunctionOutput, RunContextWrapper, output_guardrail

from backend.quran_metadata import (
    SURAHS,
    extract_references,
    extract_surah_mentions,
    get_surah_meta,
    strip_bismillah_prefix,
    validate_reference,
)

logger = logging.getLogger(__name__)

DEFAULT_TRANSLATION_EDITION = "en.sahih"
_UNVERIFIED_CITATION_PLACEHOLDER = "[unverified citation removed]"
_UNVERIFIED_ATTRIBUTION_REFUSAL = (
    "I cannot verify the claimed hadith or scholarly attribution from retrieved sources."
)

_EDITION_RE = re.compile(r"^[a-z]{2}\.[a-z0-9-]+$")
_URL_RE = re.compile(r"https?://[^\s\)\]>\"']+")
_DELIMITER_RE = re.compile(
    r"</?\s*(?:VERIFIED_CANONICAL_VERSE|USER_QUESTION|SYSTEM|INSTRUCTIONS)\s*>",
    re.IGNORECASE,
)
_FAKE_FOOTER_RE = re.compile(
    r"\s*(?:📚\s*)?(?:\*{0,2}Sources?:?\*{0,2}:?\s*\n*)?"
    r"\[Al-Quran Cloud API\s*[—–-]\s*Sahih International Translation\]\s*",
    re.IGNORECASE,
)
_ARABIC_SPAN_RE = re.compile(r"[\u0600-\u06FF][\u0600-\u06FF\s]{4,}")
_ARABIC_DIACRITICS_RE = re.compile(r"[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]")
_WHITESPACE_RE = re.compile(r"\s+")
_PLACEHOLDER_RE = re.compile(r"\[unverified [^\]]+ removed\]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
_ABBREVIATION_RE = re.compile(
    r"\b(?:vol|vols|p|pp|no|nos|ch|ed|eds|v|vs|dr|mr|mrs|prof)\.",
    re.IGNORECASE,
)

_HADITH_ATTRIBUTION_RE = re.compile(
    r"\b(?:sahih\s+(?:al-)?bukhari|sahih\s+muslim|sunan\s+abu\s+dawud|"
    r"(?:sunan|jami['’]?)\s+a[lt]-tirmidhi|sunan\s+an-nasa'?i|sunan\s+ibn\s+majah|"
    r"musnad\s+ahmad|al-mustadrak|sahih\s+ibn\s+hibban|(?:sunan\s+)?al-bayhaqi|"
    r"muwatta\s+malik|hadith\s*#\s*\d+|narrated\s+by)\b",
    re.IGNORECASE,
)
_TAFSIR_ATTRIBUTION_RE = re.compile(
    r"\b(?:tafsir\s+ibn\s+kathir|ibn\s+kathir|al-jalalayn|jalalayn|al-tabari|qurtubi|"
    r"ma'?arif\s+al-qur'?an|al-wahidi|asbab\s+al-nuzul|tafsir\s+muyassar|tazkirul\s+quran)\b",
    re.IGNORECASE,
)

_UNCERTAINTY_PHRASES: tuple[str, ...] = (
    "cannot verify",
    "unable to verify",
    "could not verify",
    "not configured",
    "search is unavailable",
    "currently unavailable",
    "could not find",
    "not found in",
    "does not appear",
    "does not exist",
    "no such",
    "there is no",
    "no record of",
    "unable to locate",
    "cannot authenticate",
    "cannot fulfill",
    "cannot comply",
    "outside the scope",
    "outside verified",
    "consult a qualified",
    "no verified",
    "no verified sources",
    "do not have verified",
    "no matching",
    "cannot confirm",
    "unable to confirm",
    "unverifiable",
    "no scholarly source",
)

_SPECIFIC_HADITH_NUM_RE = re.compile(r"\bhadith\s*#\s*(\d+)\b", re.IGNORECASE)
_AYAT_KURSI_RE = re.compile(r"[AaĀā]yat\s+al[\s\-\u2010-\u2015]*[Kk]urs[iī]")
_TYPO_HYPHEN_TRANS = str.maketrans({
    "\u2010": "-",
    "\u2011": "-",
    "\u2012": "-",
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": "'",
    "\u2019": "'",
})
_TRANSLATION_FUZZ_TRANS = str.maketrans({
    "\u201c": '"',
    "\u201d": '"',
    "\u2018": '"',
    "\u2019": '"',
    "'": '"',
    "\u2010": "-",
    "\u2011": "-",
    "\u2012": "-",
    "\u2013": "-",
    "\u2014": "-",
})

_ALLOWED_ARABIC_PHRASES: frozenset[str] = frozenset(
    {
        "السلام عليكم",
        "السلام عليكم ورحمه الله وبركاته",
        "جزاكم الله خيرا",
        "ان شاء الله",
        "الحمد لله",
        "سبحان الله",
        "الله اعلم",
        "ما شاء الله",
    }
)

_TAFSIR_FAMILY_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("kathir", "ibn_kathir"),
    ("kaseer", "ibn_kathir"),
    ("jalalayn", "jalalayn"),
    ("tabari", "tabari"),
    ("qurtubi", "qurtubi"),
    ("maarif", "maarif"),
    ("ma'arif", "maarif"),
    ("wahidi", "wahidi"),
    ("asbab", "wahidi"),
    ("muyassar", "muyassar"),
    ("tazkirul", "tazkirul"),
)

_SURAH_ARABIC_NORMALIZED: frozenset[str] | None = None


def normalize_arabic(text: str) -> str:
    """Normalize Arabic script by removing diacritics/tatweel and unifying alef/ya/ta."""
    cleaned = _ARABIC_DIACRITICS_RE.sub("", text.lstrip("\ufeff"))
    cleaned = (
        cleaned.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ٱ", "ا")
        .replace("ى", "ي")
        .replace("ة", "ه")
    )
    return _WHITESPACE_RE.sub(" ", cleaned).strip()


def _get_surah_arabic_names() -> frozenset[str]:
    global _SURAH_ARABIC_NORMALIZED
    if _SURAH_ARABIC_NORMALIZED is None:
        names: set[str] = set()
        for s in SURAHS:
            names.add(normalize_arabic(s.arabic_name))
            names.add(normalize_arabic(s.arabic_full_name))
            names.add(normalize_arabic(f"سورة {s.arabic_name}"))
        _SURAH_ARABIC_NORMALIZED = frozenset(names)
    return _SURAH_ARABIC_NORMALIZED


@dataclass
class VerifiedAyahRecord:
    """Tool-verified canonical ayah record stored in `GroundingContext`."""

    surah: int
    ayah: int
    surah_name: str
    arabic: str
    translations: dict[str, str]
    source_url: str


@dataclass
class TafsirRecord:
    """Tool-verified tafsir record stored in `GroundingContext`."""

    surah: int
    ayah: int
    tafsir_name: str
    slug: str
    source_url: str
    text: str


@dataclass
class WebSourceRecord:
    """Tool-verified curated web source record stored in `GroundingContext`."""

    title: str
    url: str
    excerpt: str
    query: str


@dataclass
class RefusalOutcome:
    """Deterministic pre-LLM refusal payload."""

    explanation: str
    verified: bool = True
    refusal: bool = True


@dataclass
class GroundingCheckResult:
    """Result of deterministic post-generation verification."""

    invalid_citations: list[str] = field(default_factory=list)
    unverified_citations: list[str] = field(default_factory=list)
    unverified_urls: list[str] = field(default_factory=list)
    unverified_arabic: list[str] = field(default_factory=list)
    unverified_attributions: list[str] = field(default_factory=list)
    ungrounded_when_unavailable: bool = False

    @property
    def passed(self) -> bool:
        return not (
            self.invalid_citations
            or self.unverified_citations
            or self.unverified_urls
            or self.unverified_arabic
            or self.unverified_attributions
            or self.ungrounded_when_unavailable
        )


@dataclass
class GroundingContext:
    """Per-request audit ledger passed to OpenAI Agents SDK via `RunContextWrapper`."""

    http_client: httpx.AsyncClient | None = field(default=None, repr=False)
    cache: Any = field(default=None, repr=False)
    settings: Any = field(default=None, repr=False)
    tavily_client: Any = field(default=None, repr=False)

    surah_number: int | None = None
    ayah_number: int | None = None
    requested_editions: list[str] = field(
        default_factory=lambda: [DEFAULT_TRANSLATION_EDITION]
    )
    is_search: bool = False
    user_query: str = ""

    canonical_verse: dict[str, Any] | None = None
    verified_ayahs: dict[tuple[int, int], VerifiedAyahRecord] = field(default_factory=dict)
    tafsir_records: list[TafsirRecord] = field(default_factory=list)
    web_sources: list[WebSourceRecord] = field(default_factory=list)
    search_queries_run: list[str] = field(default_factory=list)
    empty_search_queries: list[str] = field(default_factory=list)
    search_unavailable: bool = False
    search_unavailable_reason: str | None = None
    client_text_mismatch: bool = False
    tool_calls: list[str] = field(default_factory=list)
    verification_notes: list[str] = field(default_factory=list)

    @property
    def alquran_api_base(self) -> str:
        if self.settings is not None:
            return self.settings.alquran_api_base
        return "https://api.alquran.cloud/v1"

    @property
    def quran_com_api_base(self) -> str:
        if self.settings is not None:
            return self.settings.quran_com_api_base
        return "https://api.quran.com/api/v4"

    @property
    def http_timeout(self) -> float:
        if self.settings is not None:
            return float(self.settings.http_timeout_seconds)
        return 12.0


def _validate_text_references(ayah_text: str) -> RefusalOutcome | None:
    for surah_ref, ayah_ref in extract_references(ayah_text):
        ok, err = validate_reference(surah_ref, ayah_ref)
        if not ok and err is not None:
            return RefusalOutcome(explanation=err)

    for surah_mention in extract_surah_mentions(ayah_text):
        ok, err = validate_reference(surah_mention, None)
        if not ok and err is not None:
            return RefusalOutcome(explanation=err)

    return None


def validate_request_references(
    surah_number: int | None,
    ayah_number: int | None,
    ayah_text: str,
    *,
    is_search: bool = True,
) -> RefusalOutcome | None:
    """Deterministically reject invalid or incomplete references before calling an LLM."""
    if surah_number is not None:
        ok, err = validate_reference(surah_number, ayah_number)
        if not ok and err is not None:
            return RefusalOutcome(explanation=err)
    elif ayah_number is not None:
        return RefusalOutcome(
            explanation="A valid Surah number (1–114) is required alongside an Ayah number."
        )

    text_refusal = _validate_text_references(ayah_text)
    if text_refusal is not None:
        return text_refusal

    if not is_search and (surah_number is None or ayah_number is None):
        return RefusalOutcome(
            explanation=(
                "Both a valid Surah number (1–114) and Ayah number are required to explain a specific verse. "
                "For general Quranic questions, use search mode (isSearch=true)."
            )
        )

    return None


def sanitize_translation_editions(editions: list[str] | None) -> list[str]:
    """Validate and bound requested translation edition identifiers."""
    if not editions:
        return [DEFAULT_TRANSLATION_EDITION]
    cleaned: list[str] = []
    for raw in editions:
        candidate = raw.strip().lower()
        if _EDITION_RE.match(candidate) and candidate not in cleaned:
            cleaned.append(candidate)
        if len(cleaned) >= 3:
            break
    return cleaned if cleaned else [DEFAULT_TRANSLATION_EDITION]


def _detect_client_mismatch(
    client_ayah_text: str,
    client_translation: str,
    canonical_arabic: str,
    primary_translation: str,
) -> bool:
    if normalize_arabic(client_ayah_text) != normalize_arabic(canonical_arabic):
        return True
    if client_translation.strip() and primary_translation:
        return client_translation.strip() != primary_translation.strip()
    return False


async def prefetch_canonical_verse(
    surah_number: int,
    ayah_number: int,
    translation_editions: list[str] | None,
    client_ayah_text: str,
    client_translation: str,
    is_search: bool,
    ctx: GroundingContext,
) -> tuple[bool, str | None]:
    """Fetch canonical Arabic + translation server-side and record into GroundingContext."""
    from backend.tools.quran_api import fetch_ayah_editions

    editions = sanitize_translation_editions(translation_editions)
    ctx.requested_editions = editions

    try:
        async with asyncio.timeout(ctx.http_timeout):
            payload = await fetch_ayah_editions(
                surah_number,
                ayah_number,
                editions=("quran-uthmani", *editions),
                http_client=ctx.http_client,
                cache=ctx.cache,
                base_url=ctx.alquran_api_base,
            )
    except Exception as exc:
        logger.warning("Canonical verse prefetch failed for %s:%s: %s", surah_number, ayah_number, exc)
        return False, "Unable to retrieve verified Quran text from authoritative sources."

    canonical_arabic: str = payload["arabic"]
    translations_list: list[dict[str, str]] = payload.get("translations", [])
    translations_map = {t["edition"]: t["text"] for t in translations_list}
    primary_edition = translations_list[0]["edition"] if translations_list else editions[0]
    primary_translation = payload.get("primaryTranslation", "")

    if not is_search:
        ctx.client_text_mismatch = _detect_client_mismatch(
            client_ayah_text, client_translation, canonical_arabic, primary_translation
        )

    meta = get_surah_meta(surah_number)
    surah_name = meta.english_name if meta else payload.get("surahName", f"Surah {surah_number}")

    ctx.canonical_verse = {
        "surah": surah_number,
        "ayah": ayah_number,
        "arabic": canonical_arabic,
        "translation": primary_translation,
        "edition": primary_edition,
    }
    ctx.verified_ayahs[(surah_number, ayah_number)] = VerifiedAyahRecord(
        surah=surah_number,
        ayah=ayah_number,
        surah_name=surah_name,
        arabic=canonical_arabic,
        translations=translations_map,
        source_url=payload["sourceUrl"],
    )
    return True, None


def strip_prompt_delimiters(text: str) -> str:
    """Strip internal prompt boundary tags from untrusted user inputs."""
    return _DELIMITER_RE.sub("", text).strip()


def _sanitize_history_items(history: list[dict[str, str]] | None) -> list[dict[str, str]]:
    if not history:
        return []
    items: list[dict[str, str]] = []
    for msg in history[-10:]:
        role = msg.get("role", "")
        content = strip_prompt_delimiters(str(msg.get("content", "")))
        if role in ("user", "assistant") and content:
            items.append({"role": role, "content": content[:2000]})
    return items


def _format_canonical_verse_section(ctx: GroundingContext) -> str | None:
    cv = ctx.canonical_verse
    if cv is None:
        return None
    rec = ctx.verified_ayahs.get((cv["surah"], cv["ayah"]))
    meta = get_surah_meta(cv["surah"])
    surah_label = meta.english_name if meta else f"Surah {cv['surah']}"
    verse_lines = [
        "<VERIFIED_CANONICAL_VERSE>",
        f"Reference: Surah {surah_label} ({cv['surah']}:{cv['ayah']})",
        f"Arabic (quran-uthmani): {cv['arabic']}",
    ]
    if rec is not None:
        for ed, tr_text in rec.translations.items():
            verse_lines.append(f"Translation ({ed}): {tr_text}")
    else:
        verse_lines.append(f"Translation ({cv['edition']}): {cv['translation']}")
    verse_lines.append("</VERIFIED_CANONICAL_VERSE>")
    return "\n".join(verse_lines)


async def prefetch_search_references(
    query_text: str,
    translation_editions: list[str] | None,
    history: list[dict[str, str]] | None,
    ctx: GroundingContext,
) -> None:
    """Pre-fetch verified Quran verses for explicit or follow-up S:A refs in search mode."""
    from backend.tools.quran_api import fetch_ayah_editions

    refs = _collect_search_prefetch_refs(query_text, history)
    if not refs:
        return

    editions = sanitize_translation_editions(translation_editions)
    ctx.requested_editions = editions
    for s_num, a_num in refs[:3]:
        try:
            async with asyncio.timeout(ctx.http_timeout):
                payload = await fetch_ayah_editions(
                    s_num,
                    a_num,
                    editions=("quran-uthmani", *editions),
                    http_client=ctx.http_client,
                    cache=ctx.cache,
                    base_url=ctx.alquran_api_base,
                )
            tr_map = {t["edition"]: t["text"] for t in payload.get("translations", [])}
            ctx.verified_ayahs[(s_num, a_num)] = VerifiedAyahRecord(
                surah=s_num,
                ayah=a_num,
                surah_name=payload["surahName"],
                arabic=payload["arabic"],
                translations=tr_map,
                source_url=payload["sourceUrl"],
            )
        except Exception as exc:
            logger.warning("Search reference prefetch skipped for %s:%s: %s", s_num, a_num, exc)


def _collect_search_prefetch_refs(
    query_text: str,
    history: list[dict[str, str]] | None,
) -> list[tuple[int, int]]:
    q_lower = query_text.lower()
    is_hadith_only = any(
        w in q_lower for w in ("hadith", "bukhari", "muslim", "tirmidhi", "mustadrak")
    ) and not any(w in q_lower for w in ("quran", "surah", "ayah"))
    if is_hadith_only:
        return []

    direct = [
        (s, a) for s, a in extract_references(query_text) if validate_reference(s, a)[0]
    ]
    if direct or not history:
        return direct

    followup_cues = (
        "verse", "ayah", "reference", "first", "second",
        "mentioned", "above", "quote", "translation", "arabic",
    )
    if not any(cue in q_lower for cue in followup_cues):
        return []

    for msg in reversed(history):
        if msg.get("role") == "assistant" and msg.get("content"):
            hist_refs = [
                (s, a)
                for s, a in extract_references(str(msg["content"]))
                if validate_reference(s, a)[0]
            ]
            if hist_refs:
                return hist_refs
    return []


def _format_referenced_verses_section(ctx: GroundingContext) -> str | None:
    if not ctx.is_search or not ctx.verified_ayahs or ctx.canonical_verse is not None:
        return None
    blocks: list[str] = ["<VERIFIED_REFERENCED_VERSES>"]
    for (s_num, a_num), rec in ctx.verified_ayahs.items():
        blocks.append(f"[{s_num}:{a_num} - {rec.surah_name}] Arabic: {rec.arabic}")
        for ed, tr_txt in rec.translations.items():
            blocks.append(f"Translation ({ed}): {tr_txt}")
    blocks.append("</VERIFIED_REFERENCED_VERSES>")
    return "\n".join(blocks)


def build_agent_input(
    ayah_text: str,
    is_search: bool,
    history: list[dict[str, str]] | None,
    ctx: GroundingContext,
) -> list[dict[str, str]]:
    """Construct prompt-isolated conversation items for `Runner.run`."""
    items = _sanitize_history_items(history)
    sections: list[str] = []

    verse_section = _format_canonical_verse_section(ctx)
    if verse_section is not None:
        sections.append(verse_section)

    ref_section = _format_referenced_verses_section(ctx)
    if ref_section is not None:
        sections.append(ref_section)

    if is_search:
        safe_query = strip_prompt_delimiters(ayah_text)
        sections.append(
            f"<USER_QUESTION>\n{safe_query}\n</USER_QUESTION>\n\n"
            "Answer strictly using the verified verses above (if provided) and tool outputs "
            "(`get_quran_ayah`, `get_quran_range`, `search_quran`, `get_tafsir`, `search_islamic_sources`). "
            "If tools return `SEARCH_UNAVAILABLE` or no matching evidence, explicitly state that you cannot verify it."
        )
    else:
        sections.append(
            "Explain the verified verse above directly and concisely without calling any tools "
            "(unless the user explicitly requested tafsir or commentary). "
            "Do not cite other verses, hadith, or URLs unless retrieved via tools."
        )

    items.append({"role": "user", "content": "\n\n".join(sections)})
    return items


def _check_arabic_spans(text: str, ctx: GroundingContext) -> list[str]:
    surah_names = _get_surah_arabic_names()
    verified_arabic = [normalize_arabic(r.arabic) for r in ctx.verified_ayahs.values()]
    unverified: list[str] = []

    for match in _ARABIC_SPAN_RE.finditer(text):
        raw_span = match.group(0).strip()
        norm_span = normalize_arabic(raw_span)
        letter_count = len(norm_span.replace(" ", ""))
        word_count = len(norm_span.split())
        if word_count < 4 and letter_count < 15:
            continue
        if norm_span in surah_names or norm_span in _ALLOWED_ARABIC_PHRASES:
            continue
        if any(norm_span in va for va in verified_arabic) or norm_span in " ".join(verified_arabic):
            continue
        unverified.append(raw_span)
    return unverified


def _has_explicit_uncertainty(text: str) -> bool:
    lower = text.lower()
    return any(phrase in lower for phrase in _UNCERTAINTY_PHRASES)


def _identify_tafsir_family(text: str) -> str:
    lower = text.lower()
    for keyword, family in _TAFSIR_FAMILY_KEYWORDS:
        if keyword in lower:
            return family
    return ""


def _fetched_tafsir_families(ctx: GroundingContext) -> set[str]:
    families: set[str] = set()
    for rec in ctx.tafsir_records:
        fam = _identify_tafsir_family(rec.slug) or _identify_tafsir_family(rec.tafsir_name)
        if fam:
            families.add(fam)
    for web in ctx.web_sources:
        combined = f"{web.title} {web.url} {web.excerpt}".lower()
        for keyword, fam in _TAFSIR_FAMILY_KEYWORDS:
            if keyword in combined:
                families.add(fam)
    return families


def _has_no_evidence(ctx: GroundingContext) -> bool:
    return not ctx.verified_ayahs and not ctx.tafsir_records and not ctx.web_sources


def _append_unique_str(items: list[str], value: str) -> None:
    if value not in items:
        items.append(value)


def _check_attributions(text: str, ctx: GroundingContext) -> tuple[list[str], bool]:
    attributions: list[str] = []
    if not ctx.web_sources:
        for m in _HADITH_ATTRIBUTION_RE.finditer(text):
            _append_unique_str(attributions, m.group(0))

    fetched_families = _fetched_tafsir_families(ctx)
    for m in _TAFSIR_ATTRIBUTION_RE.finditer(text):
        fam = _identify_tafsir_family(m.group(0))
        if not fam or fam not in fetched_families:
            _append_unique_str(attributions, m.group(0))

    no_evidence = _has_no_evidence(ctx)
    ungrounded = (
        (ctx.is_search and no_evidence and not _has_explicit_uncertainty(text))
        or (ctx.search_unavailable and bool(attributions))
    )

    return attributions, ungrounded


def _check_citations(text: str, ctx: GroundingContext, result: GroundingCheckResult) -> None:
    for surah, ayah in extract_references(text):
        ok, _ = validate_reference(surah, ayah)
        ref = f"{surah}:{ayah}"
        if not ok:
            _append_unique_str(result.invalid_citations, ref)
        elif (surah, ayah) not in ctx.verified_ayahs:
            _append_unique_str(result.unverified_citations, ref)

    for surah_num in extract_surah_mentions(text):
        ok, _ = validate_reference(surah_num, None)
        if not ok:
            _append_unique_str(result.invalid_citations, f"Surah {surah_num}")


def _check_urls(text: str, ctx: GroundingContext, result: GroundingCheckResult) -> None:
    allowed_urls = (
        {r.source_url for r in ctx.verified_ayahs.values()}
        | {t.source_url for t in ctx.tafsir_records}
        | {w.url for w in ctx.web_sources}
    )
    for match in _URL_RE.finditer(text):
        url = match.group(0).rstrip(".,;:")
        if url not in allowed_urls:
            _append_unique_str(result.unverified_urls, url)


def verify_response(text: str, ctx: GroundingContext) -> GroundingCheckResult:
    """Deterministically verify citations, URLs, Arabic quotes, and scholarly attributions."""
    result = GroundingCheckResult()
    _check_citations(text, ctx, result)
    _check_urls(text, ctx, result)
    result.unverified_arabic = _check_arabic_spans(text, ctx)
    attributions, ungrounded = _check_attributions(text, ctx)
    result.unverified_attributions = attributions
    result.ungrounded_when_unavailable = ungrounded
    return result


@output_guardrail(name="grounding_output_guardrail")
def grounding_output_guardrail(
    ctx: RunContextWrapper[GroundingContext],
    _agent: Any,
    output: Any,
) -> GuardrailFunctionOutput:
    """SDK OutputGuardrail that trips whenever ungrounded claims appear."""
    check = verify_response(str(output or ""), ctx.context)
    return GuardrailFunctionOutput(
        output_info=check,
        tripwire_triggered=not check.passed,
    )


def strip_fabricated_source_footers(text: str) -> str:
    """Remove any hardcoded Al-Quran Cloud footer inherited from legacy prompts."""
    return _FAKE_FOOTER_RE.sub("", text).strip()


def _redact_matching_ranges(text: str, surah_s: str, target_ayah: int) -> str:
    range_re = re.compile(
        rf"(?:\b(?:surah|sura|chapter)\s+)?\b{re.escape(surah_s)}\s*:\s*(\d{{1,4}})\s*[-–]\s*(\d{{1,4}})\b",
        re.IGNORECASE,
    )

    def _replace_if_contains(match: re.Match[str]) -> str:
        start_a = int(match.group(1))
        end_a = int(match.group(2))
        if start_a <= target_ayah <= end_a:
            return _UNVERIFIED_CITATION_PLACEHOLDER
        return match.group(0)

    return range_re.sub(_replace_if_contains, text)


def _replace_citation(text: str, ref: str) -> str:
    if ":" not in ref:
        surah_s = ref.split()[-1]
        mention_re = re.compile(
            rf"\b(?:surah|sura|chapter)\s+{re.escape(surah_s)}\b(?!\d)",
            re.IGNORECASE,
        )
        return mention_re.sub(_UNVERIFIED_CITATION_PLACEHOLDER, text)

    surah_s, ayah_s = ref.split(":", 1)
    redacted = _redact_matching_ranges(text, surah_s, int(ayah_s))
    colon_re = re.compile(
        rf"(?:\b(?:surah|sura|chapter)\s+)?\b{re.escape(surah_s)}\s*:\s*{re.escape(ayah_s)}\b(?!\d)",
        re.IGNORECASE,
    )
    redacted = colon_re.sub(_UNVERIFIED_CITATION_PLACEHOLDER, redacted)

    word_range_re = re.compile(
        rf"\b(?:surah|sura|chapter)\s+{re.escape(surah_s)}\s*,?\s*(?:ayahs?|ayat|verses?)\s+(\d{{1,4}})\s*[-–]\s*(\d{{1,4}})\b",
        re.IGNORECASE,
    )

    def _replace_word_range(match: re.Match[str]) -> str:
        start_a = int(match.group(1))
        end_a = int(match.group(2))
        if start_a <= int(ayah_s) <= end_a:
            return _UNVERIFIED_CITATION_PLACEHOLDER
        return match.group(0)

    redacted = word_range_re.sub(_replace_word_range, redacted)

    word_re = re.compile(
        rf"\b(?:surah|sura|chapter)\s+{re.escape(surah_s)}\s*,?\s*(?:ayahs?|ayat|verses?)\s+{re.escape(ayah_s)}\b(?!\d)",
        re.IGNORECASE,
    )
    return word_re.sub(_UNVERIFIED_CITATION_PLACEHOLDER, redacted)


def _split_into_sentences(text: str) -> list[str]:
    protected = _ABBREVIATION_RE.sub(lambda m: m.group(0).replace(".", "§DOT§"), text)
    raw_segments = _SENTENCE_SPLIT_RE.split(protected)
    return [seg.replace("§DOT§", ".") for seg in raw_segments]


def _redact_unverified_attributions(text: str, attributions: list[str]) -> str:
    if not attributions:
        return text
    attr_patterns = [re.compile(rf"\b{re.escape(a)}\b", re.IGNORECASE) for a in attributions]
    segments = _split_into_sentences(text)
    kept: list[str] = []
    for seg in segments:
        stripped = seg.strip()
        if not stripped:
            continue
        if any(pat.search(stripped) for pat in attr_patterns):
            if not kept or kept[-1] != "[unverified scholarly attribution removed]":
                kept.append("[unverified scholarly attribution removed]")
        else:
            kept.append(stripped)
    return " ".join(kept)


def _search_refusal_message(ctx: GroundingContext) -> str:
    if ctx.search_unavailable:
        return (
            "I cannot verify this question from external Islamic sources right now because "
            "web search is currently unavailable and no matching Quranic verse was retrieved. "
            "Please ask about a specific Surah:Ayah reference (e.g., 2:255) or retry later."
        )
    return (
        "I cannot verify this question because no verified Quranic verses, tafsir, or curated "
        "scholarly sources were retrieved to support an answer. Please ask about a specific "
        "Surah:Ayah reference (e.g., 2:255) or rephrase your search query."
    )


def _apply_redactions(
    cleaned: str,
    ctx: GroundingContext,
    check: GroundingCheckResult,
) -> str:
    for ref in check.invalid_citations:
        cleaned = _replace_citation(cleaned, ref)
        ctx.verification_notes.append(f"Removed invalid reference {ref}")

    for ref in check.unverified_citations:
        cleaned = _replace_citation(cleaned, ref)
        ctx.verification_notes.append(f"Removed unretrieved reference {ref}")

    for url in check.unverified_urls:
        cleaned = cleaned.replace(url, "[unverified link removed]")
        ctx.verification_notes.append(f"Removed unverified URL {url}")

    for span in check.unverified_arabic:
        cleaned = cleaned.replace(span, "[unverified Arabic quote removed]")
        ctx.verification_notes.append("Removed unverified Arabic quote")

    if check.unverified_attributions:
        attrs = ", ".join(check.unverified_attributions)
        cleaned = _redact_unverified_attributions(cleaned, check.unverified_attributions)
        ctx.verification_notes.append(f"Removed unverified attributions: {attrs}")

    return cleaned


def _prepend_canonical_if_needed(
    cleaned: str,
    ctx: GroundingContext,
    check: GroundingCheckResult,
) -> str:
    cv = ctx.canonical_verse
    if cv is None or not check.unverified_arabic:
        return cleaned
    norm_out = normalize_arabic(cleaned)
    norm_canon = normalize_arabic(cv["arabic"])
    if norm_canon and norm_canon not in norm_out:
        return (
            f"**Verified Verse ({cv['surah']}:{cv['ayah']})**\n"
            f"{cv['arabic']}\n\n"
            f"*{cv['translation']}* ({cv['edition']})\n\n"
            f"{cleaned}"
        )
    return cleaned


def _has_unverified_specific_hadith(ctx: GroundingContext) -> bool:
    """Return True if user asked for a specific `Hadith #N` not present in web excerpts."""
    if not ctx.is_search or not ctx.user_query:
        return False
    match = _SPECIFIC_HADITH_NUM_RE.search(ctx.user_query)
    if not match:
        return False
    num_re = re.compile(rf"(?<!\d){re.escape(match.group(1))}(?!\d)")
    for w in ctx.web_sources:
        haystack = f"{w.title} {w.url} {w.excerpt}"
        if num_re.search(haystack):
            return False
    return True


def _normalize_ascii_titles(text: str) -> str:
    """Replace Unicode typographic quotes/hyphens and diacritic variants in titles."""
    normalized = text.translate(_TYPO_HYPHEN_TRANS)
    return _AYAT_KURSI_RE.sub("Ayat al-Kursi", normalized)


def _canonical_arabic_lookup(ctx: GroundingContext) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for rec in ctx.verified_ayahs.values():
        full_nfc = unicodedata.normalize("NFC", rec.arabic.strip())
        if full_nfc:
            lookup[normalize_arabic(full_nfc)] = full_nfc
        if rec.surah != 1 and rec.ayah == 1:
            body_nfc = unicodedata.normalize(
                "NFC", strip_bismillah_prefix(rec.arabic, rec.surah, rec.ayah).strip()
            )
            if body_nfc:
                lookup.setdefault(normalize_arabic(body_nfc), body_nfc)
    return lookup


def _canonicalize_arabic_spans(text: str, ctx: GroundingContext) -> str:
    """Snap letter-identical verified Arabic spans back to canonical Uthmani NFC."""
    lookup = _canonical_arabic_lookup(ctx)
    if not lookup:
        return text
    parts: list[str] = []
    last = 0
    for match in _ARABIC_SPAN_RE.finditer(text):
        raw_span = match.group(0).strip()
        canon = lookup.get(normalize_arabic(raw_span))
        if canon is None or unicodedata.normalize("NFC", raw_span) == canon:
            continue
        parts.append(text[last:match.start()])
        parts.append(canon)
        last = match.end()
    if last == 0:
        return text
    parts.append(text[last:])
    return "".join(parts)


_LEADING_BRACKET_RE = re.compile(r"^\[[^\]]{1,25}\]\s+")


def _try_replace_candidate(updated: str, clean_tr: str, cand: str, fuzz_out: str) -> str | None:
    fuzz_tr = cand.translate(_TRANSLATION_FUZZ_TRANS)
    idx = fuzz_out.find(fuzz_tr)
    if idx != -1:
        return f"{updated[:idx]}{clean_tr}{updated[idx + len(fuzz_tr):]}"
    fuzz_core = fuzz_tr.rstrip('.,"\'')
    if len(cand) < 16 or fuzz_core == fuzz_tr:
        return None
    core_idx = fuzz_out.find(fuzz_core)
    if core_idx == -1:
        return None
    end = core_idx + len(fuzz_core)
    if end < len(updated) and updated[end].isalnum():
        return None
    return f"{updated[:core_idx]}{clean_tr}{updated[end:]}"


def _match_translation_span(updated: str, clean_tr: str) -> str:
    fuzz_out = updated.translate(_TRANSLATION_FUZZ_TRANS)
    candidates = [clean_tr]
    stripped = _LEADING_BRACKET_RE.sub("", clean_tr)
    if stripped != clean_tr and len(stripped) >= 16:
        candidates.append(stripped)

    for cand in candidates:
        replaced = _try_replace_candidate(updated, clean_tr, cand, fuzz_out)
        if replaced is not None:
            return replaced
    return updated


def _canonicalize_translation_spans(text: str, ctx: GroundingContext) -> str:
    """Restore canonical quotes/dashes on verified verbatim English translations."""
    if not ctx.verified_ayahs:
        return text
    updated = text
    for rec in ctx.verified_ayahs.values():
        for tr_text in rec.translations.values():
            clean_tr = unicodedata.normalize("NFC", tr_text.strip())
            if len(clean_tr) >= 12:
                updated = _match_translation_span(updated, clean_tr)
    return updated


def _remediate_search_uncertainty(
    cleaned: str,
    ctx: GroundingContext,
    check: GroundingCheckResult,
) -> tuple[str, bool, bool] | None:
    if not ctx.is_search or ctx.verified_ayahs or ctx.tafsir_records:
        return None
    if _has_unverified_specific_hadith(ctx):
        return (
            _UNVERIFIED_ATTRIBUTION_REFUSAL,
            True,
            True,
        )
    if _has_explicit_uncertainty(cleaned):
        msg = (
            cleaned.strip()
            if check.passed and cleaned.strip()
            else _UNVERIFIED_ATTRIBUTION_REFUSAL
        )
        return msg, True, True
    return None


def remediate_response(
    raw_text: str,
    ctx: GroundingContext,
    check: GroundingCheckResult,
) -> tuple[str, bool, bool]:
    """Remediate or refuse ungrounded output. Returns `(explanation, verified, refusal)`."""
    cleaned = _normalize_ascii_titles(strip_fabricated_source_footers(raw_text))

    if ctx.is_search and _has_no_evidence(ctx):
        if (
            not _has_unverified_specific_hadith(ctx)
            and check.passed
            and cleaned.strip()
            and _has_explicit_uncertainty(cleaned)
        ):
            return cleaned.strip(), True, True
        return _search_refusal_message(ctx), True, True

    if check.ungrounded_when_unavailable and _has_no_evidence(ctx):
        return _search_refusal_message(ctx), True, True

    cleaned = _apply_redactions(cleaned, ctx, check)
    cleaned = _prepend_canonical_if_needed(cleaned, ctx, check)
    cleaned = _canonicalize_arabic_spans(cleaned, ctx)
    cleaned = _canonicalize_translation_spans(cleaned, ctx)

    uncertainty_outcome = _remediate_search_uncertainty(cleaned, ctx, check)
    if uncertainty_outcome is not None:
        return uncertainty_outcome

    non_placeholder = _PLACEHOLDER_RE.sub("", cleaned).strip(" \t\r\n.,;:!?-*")
    if not cleaned.strip() or (check.unverified_attributions and not non_placeholder and ctx.canonical_verse is None):
        return (
            _UNVERIFIED_ATTRIBUTION_REFUSAL,
            True,
            True,
        )

    return cleaned.strip(), check.passed, False


def build_sources(ctx: GroundingContext) -> list[dict[str, str]]:
    """Build structured citations strictly from retrieved tool outputs."""
    sources: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    for (surah, ayah), rec in ctx.verified_ayahs.items():
        editions_label = ", ".join(rec.translations.keys()) or "quran-uthmani"
        key = ("quran", f"{surah}:{ayah}", rec.source_url)
        if key not in seen:
            seen.add(key)
            sources.append(
                {
                    "type": "quran",
                    "label": f"Al-Quran Cloud — Surah {rec.surah_name} ({editions_label})",
                    "reference": f"{surah}:{ayah}",
                    "url": rec.source_url,
                }
            )

    for t in ctx.tafsir_records:
        ref = f"{t.surah}:{t.ayah}"
        key = ("tafsir", ref, t.source_url)
        if key not in seen:
            seen.add(key)
            sources.append(
                {
                    "type": "tafsir",
                    "label": t.tafsir_name,
                    "reference": ref,
                    "url": t.source_url,
                }
            )

    for w in ctx.web_sources:
        key = ("web", w.title, w.url)
        if key not in seen:
            seen.add(key)
            sources.append(
                {
                    "type": "web",
                    "label": w.title or "Islamic Source",
                    "reference": w.query,
                    "url": w.url,
                }
            )

    return sources
