"""
Quran-AI Python Backend — Optimised for speed
FastAPI server using OpenAI Agents SDK with OpenRouter.
Grounding tools: Al-Quran Cloud API + Tavily Web Search

Streaming: Uses Runner.run() then simulates streaming by chunking the
final output into SSE events.
"""

import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import AsyncOpenAI
from agents import Agent, Runner, OpenAIChatCompletionsModel, RunConfig, function_tool

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Load environment ──────────────────────────────────────────────────────────
load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY is not set in backend/.env")

# ── Singleton OpenAI + model ─────────────────────────────────────────────────
custom_client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

model = OpenAIChatCompletionsModel(
    model="meta-llama/llama-3.3-70b-instruct:free",
    openai_client=custom_client,
)

config = RunConfig(
    model=model,
    tracing_disabled=True,
)

# ── Singleton httpx client (connection pooling) ──────────────────────────────
http_client: httpx.AsyncClient | None = None

# ── Singleton Tavily client ──────────────────────────────────────────────────
tavily_client = None
if TAVILY_API_KEY and TAVILY_API_KEY != "your_tavily_api_key_here":
    try:
        from tavily import TavilyClient
        tavily_client = TavilyClient(api_key=TAVILY_API_KEY)
        logger.info("Tavily client initialised")
    except Exception as e:
        logger.warning(f"Tavily not available: {e}")


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=10.0)
    logger.info("httpx client started")
    yield
    await http_client.aclose()
    logger.info("httpx client closed")


# ── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="Quran-AI Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────────────────────────
class ExplainRequest(BaseModel):
    ayahText: str
    translation: str = ""
    surahNumber: int | None = None
    ayahNumber: int | None = None
    isSearch: bool = False


class ExplainResponse(BaseModel):
    explanation: str


# ── Grounding Tools ──────────────────────────────────────────────────────────

@function_tool
async def get_quran_data(surah_number: int, ayah_number: int) -> str:
    """
    Fetches Quranic data from the Al-Quran Cloud API for a specific ayah.

    Args:
        surah_number: The Surah number (1-114).
        ayah_number: The Ayah number within the Surah.

    Returns:
        Formatted string with Arabic text, English + Urdu translations.
    """
    logger.info(f"Tool get_quran_data: {surah_number}:{ayah_number}")
    url = (
        f"https://api.alquran.cloud/v1/ayah/{surah_number}:{ayah_number}"
        f"/editions/quran-uthmani,en.sahih,ur.ahmedali"
    )
    try:
        resp = await http_client.get(url)
        resp.raise_for_status()
        data = resp.json()

        if data.get("code") != 200 or "data" not in data:
            return f"Could not fetch data for {surah_number}:{ayah_number}."

        editions = data["data"]
        arabic, english, urdu = editions[0], editions[1], editions[2]
        surah_name = arabic["surah"]["englishName"]

        return (
            f"--- QURAN DATA {surah_number}:{ayah_number} ---\n"
            f"Surah: {surah_name} | Type: {arabic['surah']['revelationType']}\n\n"
            f"Arabic: {arabic['text']}\n\n"
            f"English (Sahih International): {english['text']}\n\n"
            f"Urdu (Ahmed Ali): {urdu['text']}\n"
        )
    except Exception as e:
        logger.error(f"get_quran_data error: {e}")
        return f"Error fetching Quran data: {e}"


@function_tool
async def search_web(query: str) -> str:
    """
    Searches the internet for Islamic scholarly context.

    Args:
        query: A specific search query about the Quran or Islam.

    Returns:
        Summary of relevant search results.
    """
    logger.info(f"Tool search_web: {query}")
    if not tavily_client:
        return "Web search not configured. Use your scholarly knowledge."

    try:
        results = tavily_client.search(
            query=query,
            search_depth="basic",
            max_results=3,
            include_domains=[
                "islamqa.info", "sunnah.com", "quran.com",
                "islamicstudies.info",
            ],
        )
        if not results.get("results"):
            return "No relevant results found."

        formatted = "--- WEB SEARCH RESULTS ---\n"
        for r in results["results"]:
            formatted += (
                f"\n🔗 {r.get('title', 'Untitled')}\n"
                f"   Source: {r.get('url', '')}\n"
                f"   {r.get('content', '')[:300]}\n"
            )
        return formatted
    except Exception as e:
        logger.error(f"search_web error: {e}")
        return f"Web search error: {e}"


# ── System Prompts ────────────────────────────────────────────────────────────

EXPLAIN_SYSTEM_PROMPT = """You are a knowledgeable Islamic scholar AI.
Explain Quranic verses with accuracy and respect. Be concise.

RESPONSE FORMAT:

📖 **Verse Context**
[Surah name, number:ayah]

✨ **Explanation**
[2-3 concise paragraphs: moral lesson, historical context, spiritual significance]

🕌 **Key Themes**
- Theme 1
- Theme 2
- Theme 3

📚 **Source**
[Al-Quran Cloud API — Sahih International Translation]"""

SEARCH_SYSTEM_PROMPT = """You are a knowledgeable Islamic scholar AI.
Answer questions about the Quran with accuracy and respect.

RULES:
1. ALWAYS use search_web tool first to find scholarly sources.
2. Never fabricate hadith or scholarly opinions.
3. Cite sources at the end.
Keep answers under 4 paragraphs."""


# ── Singleton Agents ──────────────────────────────────────────────────────────
explain_agent = Agent(
    name="Quran Explainer",
    instructions=EXPLAIN_SYSTEM_PROMPT,
    tools=[get_quran_data, search_web],
)

search_agent = Agent(
    name="Quran Scholar",
    instructions=SEARCH_SYSTEM_PROMPT,
    tools=[search_web, get_quran_data],
)


# ── Helper: build user message ───────────────────────────────────────────────

def build_user_message(req: ExplainRequest) -> tuple[Agent, str]:
    """Returns (agent, user_message). For verse explanations, injects
    the data directly so the agent can skip the API call."""

    if req.isSearch:
        msg = (
            f"Answer this question about the Quran: {req.ayahText}\n\n"
            f"Use search_web to find reliable sources."
        )
        return search_agent, msg

    # For verse explanations — inject the data the frontend already has
    surah_ref = (
        f"Surah {req.surahNumber}, Ayah {req.ayahNumber}"
        if req.surahNumber and req.ayahNumber
        else "the verse"
    )
    msg = (
        f"Explain {surah_ref}.\n\n"
        f"--- VERSE DATA (already fetched) ---\n"
        f"Arabic: {req.ayahText}\n"
        f"English translation: {req.translation}\n"
        f"---\n\n"
        f"Use the data above to provide a thorough explanation. "
        f"You may call get_quran_data only if you need additional context "
        f"like Urdu translation."
    )
    return explain_agent, msg


# ── Streaming endpoint (primary) — uses Runner.run then simulates stream ─────

@app.post("/explain-stream")
async def explain_stream(req: ExplainRequest):
    """
    SSE endpoint. Runs the agent to completion, then streams the final
    output in small chunks — reliable with Z.ai's proxy API.
    """
    logger.info(f"/explain-stream: surah={req.surahNumber}, ayah={req.ayahNumber}, isSearch={req.isSearch}")

    agent, user_message = build_user_message(req)

    async def event_generator():
        try:
            # Run agent to completion (fast with smart prompting)
            result = await Runner.run(
                agent,
                input=user_message,
                run_config=config,
            )

            final_output = result.final_output or "No explanation generated."
            logger.info(f"Agent done. Length: {len(final_output)}")

            # Simulate streaming by chunking the final output
            chunk_size = 12
            for i in range(0, len(final_output), chunk_size):
                chunk = final_output[i:i + chunk_size]
                yield f"data: {json.dumps({'token': chunk})}\n\n"
                await asyncio.sleep(0.02)

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            logger.error(f"Stream error: {type(e).__name__}: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Non-streaming endpoint (fallback) ────────────────────────────────────────

@app.post("/explain", response_model=ExplainResponse)
async def explain_ayah(req: ExplainRequest) -> ExplainResponse:
    """Non-streaming endpoint — still faster thanks to smart prompting."""
    logger.info(f"/explain: surah={req.surahNumber}, ayah={req.ayahNumber}, isSearch={req.isSearch}")

    agent, user_message = build_user_message(req)

    try:
        result = await Runner.run(agent, input=user_message, run_config=config)
        explanation = result.final_output or "No explanation generated."
        return ExplainResponse(explanation=explanation)
    except Exception as e:
        logger.error(f"Agent error: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")


@app.get("/health")
async def health_check():
    return {"status": "ok", "model": "meta-llama/llama-3.3-70b-instruct:free", "provider": "OpenRouter", "version": "2.0-fast"}
