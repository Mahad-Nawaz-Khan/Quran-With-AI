# Quranic AI — Zero-Hallucination Quran Study Platform

A full-stack Quran reading, study, and AI companion application built with **Next.js (App Router)**, **FastAPI**, and the **OpenAI Agents SDK**. All Quranic Arabic text, translations, morphology, and tafsir are fetched server-side from authoritative APIs (**Al-Quran Cloud** and **Quran.com v4**) with deterministic grounding checks so verses, citations, and scholarly attributions are never fabricated from LLM memory.

---

## Features

- **114-Surah & 30-Juz Reader (`/surah`, `/surah/[id]`, `/juz`):**
  - Complete Uthmani Arabic script, **Tajweed color-coded mode**, adjustable Arabic font sizes, and **Hifz memorization mode** (blur/reveal recall per ayah).
  - Canonical **Bismillah banner** separation, deep links (`?ayah=N`, `?autoplay=1`), dynamic **Page / Juz / Hizb** metadata, and sidebar navigation across **Surah | Juz | Page** tabs.
  - Up to **3 parallel translations** (including English, Urdu with Nastaleeq font support, Indonesian, Turkish, and transliteration).
- **Audio Recitation & Memorization Player:**
  - Verse-by-verse recitation with reciter selection (Alafasy, Husary, Minshawi, Sudais), playback speeds (`0.75x`–`1.5x`), repeat loop, and **A–B ayah range looping**.
- **Classical Tafsir & Word-by-Word Morphology:**
  - **Tafsir Drawer** (`/api/quran/tafsir/[surah]/[ayah]`) supporting Ibn Kathir, Al-Jalalayn, Al-Tabari, Al-Qurtubi, Maarif-ul-Quran, and Asbab al-Nuzul.
  - **Word-by-Word Modal** (`/api/quran/word-by-word/[surah]/[ayah]`) displaying per-word Arabic, transliteration, English gloss, morphological root, and audio.
- **Grounded AI Study Companion (`ChatWidget` & Ayah Explanation Modal):**
  - Streaming SSE responses via `/api/explain` -> FastAPI `/explain-stream` with live verification steps, multi-turn history, clickable `[Surah:Ayah]` navigation chips, and programmatic source badges.
  - Pre- and post-generation verification pipeline ([backend/grounding.py](backend/grounding.py)) validating `1–114` Surah / Ayah bounds, overriding tampered client text with canonical API payloads, canonicalizing Uthmani script/translations, and returning deterministic refusals on out-of-bounds references or unverified external claims.
- **Study Workspace & Accessibility:**
  - Local bookmarks, **Study Notes & Collections**, **Verified Verse Cards**, reading progress / **Khatam tracker** (`/bookmarks`), curated **Thematic Explorer** (`/topics`), full-text/reference **Search** (`/search`), **`Ctrl+K` Command Palette**, **Light/Dark themes**, and **5-language UI** (`en`, `ar`, `ur`, `id`, `tr`).

---

## Architecture & Project Structure

```text
├── app/
│   ├── api/
│   │   ├── explain/                 # Next.js proxy -> FastAPI /explain & /explain-stream
│   │   └── quran/                   # Proxies for search, surah editions, tafsir, word-by-word
│   ├── components/                  # Header, Modals, AyahView, AudioPlayer, ChatWidget, etc.
│   ├── surah/[id]/page.tsx          # Main Surah Reader
│   ├── bookmarks/, juz/, search/, surah/, topics/, about/, privacy/
│   └── globals.css, layout.tsx, page.tsx
├── lib/
│   ├── ai/streamClient.ts           # Typed SSE streaming client
│   ├── browser/clipboard.ts         # Modal-aware clipboard copy helper
│   ├── hooks/usePersistentState.ts  # Schema-guarded localStorage store hooks
│   ├── i18n/translations.ts         # UI localization (en, ar, ur, id, tr)
│   └── quran/                       # Canonical metadata, Tajweed parser, search, topics, API
├── backend/
│   ├── config.py                    # Settings loader, model fallback defaults, CORS parser
│   ├── cache.py                     # Bounded async TTL LRU cache
│   ├── quran_metadata.py            # Canonical 114-Surah bounds & reference extractors
│   ├── grounding.py                 # Pre-LLM bounds checks, OutputGuardrail, remediation
│   ├── llm_agents.py                # OpenRouter Agents SDK setup & multi-model fallback
│   ├── tools/                       # quran_api.py, tafsir_api.py, web_search.py
│   ├── main.py                      # FastAPI app (/health, /explain, /explain-stream, /quran/*)
│   ├── tests/                       # Backend pytest suite (47 unit & integration tests)
│   └── Dockerfile                   # Non-root production container for FastAPI backend
└── tests/
    ├── e2e/                         # 4-tier Playwright + API E2E suite (mock & live modes)
    ├── evals/                       # Automated Zero-Hallucination AI grounding evals
    └── mock_server.py               # Offline deterministic fixture server for E2E mock mode
```

---

## Environment Configuration

The project uses two separate environment files (**never commit `.env` or `backend/.env`**):

### 1. Root `.env` (Next.js Server Proxy)
Copy [`.env.example`](.env.example) to `.env`:

```env
# Next.js Server-Side Proxy Target (never expose as NEXT_PUBLIC_*)
PYTHON_BACKEND_URL=http://127.0.0.1:8000
```

### 2. `backend/.env` (FastAPI Backend & AI Agent)
Copy [`backend/.env.example`](backend/.env.example) to `backend/.env`:

```env
# Required: OpenRouter API key for AI explanations and search
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: OpenRouter endpoint and model overrides
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free

# Optional: Tavily API key for curated Islamic scholarly web search
# Leave unset or blank if unused (search tool returns SEARCH_UNAVAILABLE)
TAVILY_API_KEY=

# Optional: Comma-separated allowed CORS origins for FastAPI
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

> **Note:** Optional backend overrides (`ALQURAN_API_BASE`, `QURAN_COM_API_BASE`, `HTTP_TIMEOUT_SECONDS`, `CACHE_TTL_SECONDS`, `CACHE_MAX_ENTRIES`, `MAX_AGENT_TURNS`) have built-in defaults in [backend/config.py](backend/config.py). On HTTP `400`/`404`/`429`/`502`/`503`, `llm_agents.py` automatically falls back across free tool-capable OpenRouter models.

---

## Local Development

### 1. Start the FastAPI Backend (`http://127.0.0.1:8000`)

```bash
cd backend
python -m venv venv
# Windows PowerShell: .\venv\Scripts\Activate.ps1
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Start the Next.js Frontend (`http://127.0.0.1:3000`)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (or `http://localhost:3000`).

### Production Deployment
- **Frontend:** Build with `npm run build` and run with `npm start` (set `PYTHON_BACKEND_URL` to your deployed FastAPI origin).
- **Backend:** Deploy via [`render.yaml`](render.yaml) and [`backend/Dockerfile`](backend/Dockerfile), configuring `OPENROUTER_API_KEY`, `CORS_ORIGINS`, and optional `TAVILY_API_KEY`.

---

## Verification & Test Suites

```bash
# Static typecheck, lint & production build
npx tsc --noEmit --noUnusedLocals --incremental false
npm run lint
npm run build

# Frontend pure unit tests (26 tests)
node --test lib/__tests__/m1.test.mjs

# Backend unit & grounding tests (47 tests)
pytest backend/tests -v

# Full offline Playwright E2E + AI Grounding Evals (mock server, 169 tests)
pytest tests/ -q

# Live end-to-end verification (requires running Next.js :3000 & FastAPI :8000 with OpenRouter key)
E2E_MODE=live pytest tests/evals -v   # 18 AI grounding evals
E2E_MODE=live pytest tests/e2e -q     # 151 browser + API E2E tests
```
