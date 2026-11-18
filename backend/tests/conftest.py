"""Shared offline fixtures, FakeModel, MockHttpTransport, and FakeTavilyClient."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from agents import RunConfig
from agents.items import ModelResponse
from agents.models.interface import Model, ModelTracing
from agents.usage import Usage
from openai.types.responses import (
    ResponseFunctionToolCall,
    ResponseOutputMessage,
    ResponseOutputText,
)

from backend.llm_agents import GROUNDING_MODEL_SETTINGS
from backend.config import Settings

CANONICAL_2_255_ARABIC = (
    "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ "
    "لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ"
)
CANONICAL_2_255_EN = (
    "Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence."
)
CANONICAL_1_1_ARABIC = "\ufeffبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"
CANONICAL_2_1_ARABIC_WITH_BISMILLAH = (
    "\ufeffبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ"
)


class FakeModel(Model):
    """Scripted offline Model implementing `agents.models.interface.Model`."""

    def __init__(self, responses: list[ModelResponse] | None = None) -> None:
        self._queue: list[ModelResponse] = list(responses or [])
        self.calls: int = 0
        self.recorded_inputs: list[Any] = []
        self.recorded_instructions: list[str | None] = []

    @staticmethod
    def text_response(text: str, resp_id: str = "resp_text") -> ModelResponse:
        msg = ResponseOutputMessage(
            id=f"msg_{resp_id}",
            type="message",
            role="assistant",
            status="completed",
            content=[ResponseOutputText(type="output_text", text=text, annotations=[])],
        )
        return ModelResponse(output=[msg], usage=Usage(), response_id=resp_id)

    @staticmethod
    def tool_call_response(
        name: str,
        arguments: dict[str, Any],
        call_id: str = "call_1",
    ) -> ModelResponse:
        tc = ResponseFunctionToolCall(
            id=f"fc_{call_id}",
            call_id=call_id,
            type="function_call",
            name=name,
            arguments=json.dumps(arguments),
        )
        return ModelResponse(output=[tc], usage=Usage(), response_id=f"resp_{call_id}")

    async def get_response(
        self,
        system_instructions: str | None,
        input: Any,
        model_settings: Any,
        tools: Any,
        output_schema: Any,
        handoffs: Any,
        tracing: ModelTracing,
        *,
        previous_response_id: str | None = None,
        conversation_id: str | None = None,
        prompt: Any = None,
    ) -> ModelResponse:
        self.calls += 1
        self.recorded_instructions.append(system_instructions)
        self.recorded_inputs.append(input)
        if not self._queue:
            return self.text_response("I cannot verify further details.", resp_id=f"fallback_{self.calls}")
        return self._queue.pop(0)

    async def stream_response(
        self,
        system_instructions: str | None,
        input: Any,
        model_settings: Any,
        tools: Any,
        output_schema: Any,
        handoffs: Any,
        tracing: ModelTracing,
        *,
        previous_response_id: str | None = None,
        conversation_id: str | None = None,
        prompt: Any = None,
    ) -> AsyncIterator[Any]:
        if False:
            yield None
        raise NotImplementedError("Non-streamed Runner.run is used with FakeModel.")


class FakeAsyncTavilyClient:
    """Async Tavily mock returning configurable domain results or raising."""

    def __init__(
        self,
        results: list[dict[str, Any]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self._results = results if results is not None else []
        self._error = error
        self.calls: int = 0
        self.last_kwargs: dict[str, Any] | None = None

    async def search(self, **kwargs: Any) -> dict[str, Any]:
        self.calls += 1
        self.last_kwargs = kwargs
        if self._error is not None:
            raise self._error
        return {"results": self._results}


class FakeSyncTavilyClient:
    """Sync Tavily mock verifying asyncio.to_thread non-blocking execution."""

    def __init__(self, results: list[dict[str, Any]] | None = None) -> None:
        self._results = results if results is not None else []
        self.calls: int = 0

    def search(self, **kwargs: Any) -> dict[str, Any]:
        self.calls += 1
        return {"results": self._results}


def make_mock_transport(
    *,
    fail_qurancom_tafsir: bool = False,
) -> tuple[httpx.MockTransport, dict[str, int]]:
    """Create an offline httpx.MockTransport covering Al-Quran Cloud, Quran.com, and spa5k."""
    call_counts: dict[str, int] = {}

    def _handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        call_counts[url] = call_counts.get(url, 0) + 1

        if "/v1/ayah/2:255/editions/" in url:
            return httpx.Response(
                200,
                json={
                    "code": 200,
                    "status": "OK",
                    "data": [
                        {
                            "number": 262,
                            "text": CANONICAL_2_255_ARABIC,
                            "edition": {"identifier": "quran-uthmani", "language": "ar", "englishName": "Uthmani"},
                            "surah": {"number": 2, "englishName": "Al-Baqara", "revelationType": "Medinan"},
                            "numberInSurah": 255,
                            "juz": 3,
                            "page": 42,
                            "hizbQuarter": 17,
                        },
                        {
                            "number": 262,
                            "text": CANONICAL_2_255_EN,
                            "edition": {"identifier": "en.sahih", "language": "en", "englishName": "Saheeh International"},
                            "surah": {"number": 2, "englishName": "Al-Baqara", "revelationType": "Medinan"},
                            "numberInSurah": 255,
                            "juz": 3,
                            "page": 42,
                            "hizbQuarter": 17,
                        },
                    ],
                },
            )

        if "/v1/surah/1/editions/" in url:
            return httpx.Response(
                200,
                json={
                    "code": 200,
                    "status": "OK",
                    "data": [
                        {
                            "number": 1,
                            "name": "سُورَةُ ٱلْفَاتِحَةِ",
                            "englishName": "Al-Faatiha",
                            "englishNameTranslation": "The Opening",
                            "revelationType": "Meccan",
                            "numberOfAyahs": 7,
                            "edition": {"identifier": "quran-uthmani", "language": "ar", "englishName": "Uthmani"},
                            "ayahs": [
                                {
                                    "number": idx,
                                    "text": CANONICAL_1_1_ARABIC if idx == 1 else f"آية {idx}",
                                    "numberInSurah": idx,
                                    "juz": 1,
                                    "page": 1,
                                    "hizbQuarter": 1,
                                    "sajda": False,
                                }
                                for idx in range(1, 8)
                            ],
                        },
                        {
                            "number": 1,
                            "edition": {"identifier": "en.sahih", "language": "en", "englishName": "Saheeh International"},
                            "ayahs": [
                                {"number": idx, "numberInSurah": idx, "text": f"Fatihah verse {idx}"}
                                for idx in range(1, 8)
                            ],
                        },
                        {
                            "number": 1,
                            "edition": {"identifier": "ar.alafasy", "language": "ar", "englishName": "Alafasy"},
                            "ayahs": [
                                {"number": idx, "numberInSurah": idx, "audio": f"https://cdn.islamic.network/quran/audio/128/ar.alafasy/{idx}.mp3"}
                                for idx in range(1, 8)
                            ],
                        },
                    ],
                },
            )

        if "/v1/surah/2/editions/" in url:
            return httpx.Response(
                200,
                json={
                    "code": 200,
                    "status": "OK",
                    "data": [
                        {
                            "number": 2,
                            "edition": {"identifier": "quran-uthmani", "language": "ar", "englishName": "Uthmani"},
                            "ayahs": [
                                {
                                    "number": 7 + idx,
                                    "text": CANONICAL_2_1_ARABIC_WITH_BISMILLAH if idx == 1 else (CANONICAL_2_255_ARABIC if idx == 255 else f"نص {idx}"),
                                    "numberInSurah": idx,
                                    "juz": 1 if idx < 142 else 3,
                                    "page": 2 if idx < 10 else 42,
                                    "hizbQuarter": 1,
                                    "sajda": False,
                                }
                                for idx in range(1, 287)
                            ],
                        },
                        {
                            "number": 2,
                            "edition": {"identifier": "en.sahih", "language": "en", "englishName": "Saheeh International"},
                            "ayahs": [
                                {
                                    "number": 7 + idx,
                                    "numberInSurah": idx,
                                    "text": CANONICAL_2_255_EN if idx == 255 else f"Baqarah verse {idx}",
                                }
                                for idx in range(1, 287)
                            ],
                        },
                    ],
                },
            )

        if "/v1/search/zzzznonexistent" in url:
            return httpx.Response(
                404,
                json={"code": 404, "status": "NOT FOUND", "data": "Nothing matching your search was found.."},
            )

        if "/v1/search/mercy/all/" in url:
            return httpx.Response(
                200,
                json={
                    "code": 200,
                    "status": "OK",
                    "data": {
                        "count": 1,
                        "matches": [
                            {
                                "number": 262,
                                "text": CANONICAL_2_255_EN,
                                "surah": {"number": 2, "englishName": "Al-Baqara"},
                                "numberInSurah": 255,
                            }
                        ],
                    },
                },
            )

        if "/verses/by_key/2:255" in url:
            return httpx.Response(
                200,
                json={
                    "verse": {
                        "id": 262,
                        "verse_key": "2:255",
                        "words": [
                            {
                                "id": 1,
                                "position": 1,
                                "char_type_name": "word",
                                "text_uthmani": "ٱللَّهُ",
                                "audio_url": "wbw/002_255_001.mp3",
                                "transliteration": {"text": "allāhu"},
                                "translation": {"text": "Allah"},
                            },
                            {
                                "id": 2,
                                "position": 2,
                                "char_type_name": "end",
                                "text_uthmani": "٢٥٥",
                                "audio_url": None,
                                "transliteration": {"text": None},
                                "translation": {"text": "(255)"},
                            },
                        ],
                    }
                },
            )

        if "/api/v4/tafsirs/169/by_ayah/2:255" in url:
            if fail_qurancom_tafsir:
                return httpx.Response(500, json={"error": "upstream error"})
            return httpx.Response(
                200,
                json={
                    "tafsir": {
                        "resource_id": 169,
                        "slug": "en-tafisr-ibn-kathir",
                        "text": "<h2>Ayat Al-Kursi</h2><p>This is the greatest ayah &amp; pillar of Tawhid.</p>",
                    }
                },
            )

        if "spa5k/tafsir_api@main/tafsir/en-tafisr-ibn-kathir/2/255.json" in url:
            return httpx.Response(
                200,
                json={"text": "Fallback Ibn Kathir commentary on Ayat al-Kursi."},
            )

        if "spa5k/tafsir_api@main/tafsir/en-al-jalalayn/2/255.json" in url:
            return httpx.Response(
                200,
                json={"surah": 2, "ayah": 255, "text": "Al-Jalalayn concise commentary on 2:255."},
            )

        return httpx.Response(404, json={"error": f"Unmocked URL: {url}"})

    return httpx.MockTransport(_handler), call_counts


@pytest.fixture
def test_settings() -> Settings:
    """Explicit Settings fixture that never reads `.env`."""
    return Settings(
        openrouter_api_key="test-openrouter-key",
        openrouter_model="meta-llama/llama-3.3-70b-instruct:free",
        tavily_api_key="test-tavily-key",
        cors_origins=("http://localhost:3000",),
        http_timeout_seconds=5.0,
        cache_ttl_seconds=300,
        cache_max_entries=64,
        max_agent_turns=6,
    )


def make_fake_run_config(model: FakeModel) -> RunConfig:
    return RunConfig(
        model=model,
        model_settings=GROUNDING_MODEL_SETTINGS,
        tracing_disabled=True,
    )
