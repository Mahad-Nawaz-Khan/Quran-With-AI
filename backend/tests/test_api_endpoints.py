"""Offline FastAPI endpoint contract tests via TestClient."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app
from backend.tests.conftest import (
    CANONICAL_2_255_ARABIC,
    CANONICAL_2_255_EN,
    FakeModel,
    make_fake_run_config,
    make_mock_transport,
)


def test_health_degraded_and_ok_without_reading_dotenv(test_settings: Settings) -> None:
    degraded_app = create_app(settings=Settings())
    with TestClient(degraded_app) as client:
        res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "degraded"
    assert body["version"] == "3.0"
    assert body["tavilyConfigured"] is False

    ok_app = create_app(settings=test_settings)
    with TestClient(ok_app) as client:
        res_ok = client.get("/health")
    assert res_ok.status_code == 200
    assert res_ok.json()["status"] == "ok"
    assert res_ok.json()["tavilyConfigured"] is True


def test_cors_restricted_origins(test_settings: Settings) -> None:
    app = create_app(settings=test_settings)
    with TestClient(app) as client:
        allowed = client.options(
            "/health",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        blocked = client.options(
            "/health",
            headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
        )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in blocked.headers


def test_explain_invalid_reference_deterministic_refusal_no_llm_call(test_settings: Settings) -> None:
    fake_model = FakeModel()
    app = create_app(settings=test_settings, run_config=make_fake_run_config(fake_model))
    with TestClient(app) as client:
        res = client.post(
            "/explain",
            json={"ayahText": "Explain", "surahNumber": 115, "ayahNumber": 1},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["refusal"] is True
    assert data["verified"] is True
    assert data["canonicalVerse"] is None
    assert fake_model.calls == 0


def test_explain_valid_verse_and_history_and_422_validation(test_settings: Settings) -> None:
    transport, _ = make_mock_transport()
    fake_model = FakeModel(
        [
            FakeModel.tool_call_response("get_tafsir", {"surah_number": 2, "ayah_number": 255}),
            FakeModel.text_response("Ayat al-Kursi (2:255) highlights divine sovereignty per Ibn Kathir."),
        ]
    )
    async_client = httpx.AsyncClient(transport=transport)
    app = create_app(
        settings=test_settings,
        http_client=async_client,
        run_config=make_fake_run_config(fake_model),
    )
    with TestClient(app) as client:
        bad_empty = client.post("/explain", json={"ayahText": ""})
        assert bad_empty.status_code == 422

        bad_long = client.post("/explain", json={"ayahText": "x" * 2001})
        assert bad_long.status_code == 422

        res = client.post(
            "/explain",
            json={
                "ayahText": "SPOOFED ARABIC",
                "translation": "SPOOFED TRANSLATION",
                "surahNumber": 2,
                "ayahNumber": 255,
                "history": [{"role": "user", "content": "Tell me about Al-Baqarah"}],
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["verified"] is True
    assert data["refusal"] is False
    assert data["canonicalVerse"]["arabic"] == CANONICAL_2_255_ARABIC
    assert data["canonicalVerse"]["translation"] == CANONICAL_2_255_EN
    assert any(s["type"] == "tafsir" for s in data["sources"])
    assert len(fake_model.recorded_inputs[0]) == 2  # history turn + current turn


def test_explain_stream_sse_status_token_metadata_done(test_settings: Settings) -> None:
    transport, _ = make_mock_transport()
    fake_model = FakeModel(
        [
            FakeModel.tool_call_response("get_tafsir", {"surah_number": 2, "ayah_number": 255}),
            FakeModel.text_response("Grounded explanation of 2:255 from Ibn Kathir."),
        ]
    )
    async_client = httpx.AsyncClient(transport=transport)
    app = create_app(
        settings=test_settings,
        http_client=async_client,
        run_config=make_fake_run_config(fake_model),
    )
    events: list[dict] = []
    with TestClient(app) as client:
        with client.stream(
            "POST",
            "/explain-stream",
            json={"ayahText": "Explain", "surahNumber": 2, "ayahNumber": 255},
        ) as resp:
            assert resp.status_code == 200
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))

    statuses = [e["status"] for e in events if "status" in e]
    tokens = "".join(e["token"] for e in events if "token" in e)
    metadata = [e["metadata"] for e in events if "metadata" in e]
    dones = [e for e in events if e.get("done") is True]

    assert any("Validating" in s for s in statuses)
    assert any("Checking classical tafsir" in s for s in statuses)
    assert "Grounded explanation of 2:255" in tokens
    assert len(metadata) == 1
    assert metadata[0]["verified"] is True
    assert metadata[0]["canonicalVerse"]["surah"] == 2
    assert len(dones) == 1


def test_explain_stream_sanitized_error_hides_internal_exception(test_settings: Settings) -> None:
    class CrashingModel(FakeModel):
        async def get_response(self, *args, **kwargs):
            raise RuntimeError("SECRET_INTERNAL_STACK_TRACE_XYZ")

    transport, _ = make_mock_transport()
    async_client = httpx.AsyncClient(transport=transport)
    app = create_app(
        settings=test_settings,
        http_client=async_client,
        run_config=make_fake_run_config(CrashingModel()),
    )
    with TestClient(app) as client:
        res = client.post(
            "/explain",
            json={"ayahText": "Explain", "surahNumber": 2, "ayahNumber": 255},
        )
        assert res.status_code == 500
        assert "SECRET_INTERNAL_STACK_TRACE_XYZ" not in res.text

        sse_res = client.post(
            "/explain-stream",
            json={"ayahText": "Explain", "surahNumber": 2, "ayahNumber": 255},
        )
        assert "SECRET_INTERNAL_STACK_TRACE_XYZ" not in sse_res.text
        assert "internal error" in sse_res.text.lower()


def test_quran_rest_endpoints_contracts(test_settings: Settings) -> None:
    transport, _ = make_mock_transport()
    async_client = httpx.AsyncClient(transport=transport)
    app = create_app(settings=test_settings, http_client=async_client)

    with TestClient(app) as client:
        surah = client.get("/quran/surah/1?editions=en.sahih&reciter=ar.alafasy")
        assert surah.status_code == 200
        s_data = surah.json()
        assert s_data["surah"]["number"] == 1
        assert len(s_data["ayahs"]) == 7

        bad_surah = client.get("/quran/surah/115")
        assert bad_surah.status_code == 400

        search = client.get("/quran/search?q=mercy&edition=en.sahih")
        assert search.status_code == 200
        assert search.json()["totalAyahMatches"] == 1

        tafsir = client.get("/quran/tafsir/2/255?slug=en-tafsir-ibn-kathir")
        assert tafsir.status_code == 200
        assert "Ayat Al-Kursi" in tafsir.json()["text"]

        bad_tafsir = client.get("/quran/tafsir/2/300")
        assert bad_tafsir.status_code == 400

        wbw = client.get("/quran/word-by-word/2/255")
        assert wbw.status_code == 200
        assert len(wbw.json()["words"]) == 1
        assert wbw.json()["words"][0]["root"] is None

        bad_wbw = client.get("/quran/word-by-word/115/1")
        assert bad_wbw.status_code == 400


def test_explain_stream_invalid_reference_and_503_when_unconfigured() -> None:
    app = create_app(settings=Settings())
    events: list[dict] = []
    with TestClient(app) as client:
        res_503 = client.post("/explain", json={"ayahText": "What is mercy?", "isSearch": True})
        assert res_503.status_code == 503

        with client.stream(
            "POST",
            "/explain-stream",
            json={"ayahText": "Explain 2:300", "isSearch": True},
        ) as resp:
            assert resp.status_code == 200
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))

    meta = [e["metadata"] for e in events if "metadata" in e][0]
    assert meta["refusal"] is True
    assert meta["verified"] is True
    tokens = "".join(e["token"] for e in events if "token" in e)
    assert "286" in tokens


def test_no_forbidden_strings_or_fake_sleep_in_backend() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    main_src = (backend_dir / "main.py").read_text(encoding="utf-8")
    agents_src = (backend_dir / "llm_agents.py").read_text(encoding="utf-8")
    web_src = (backend_dir / "tools" / "web_search.py").read_text(encoding="utf-8")

    assert not (backend_dir / "agents.py").exists()
    assert "Use your scholarly knowledge" not in web_src
    assert "Al-Quran Cloud API — Sahih International Translation" not in agents_src
    assert "asyncio.sleep(" not in main_src


def test_incomplete_is_search_false_and_ayah_without_surah_contracts(test_settings: Settings) -> None:
    fake_model = FakeModel()
    app = create_app(settings=test_settings, run_config=make_fake_run_config(fake_model))

    with TestClient(app) as client:
        # ayahNumber supplied without surahNumber -> 400 Bad Request
        res_400 = client.post("/explain", json={"ayahText": "Explain", "ayahNumber": 1})
        assert res_400.status_code == 400

        stream_400 = client.post("/explain-stream", json={"ayahText": "Explain", "ayahNumber": 1})
        assert stream_400.status_code == 400

        # isSearch=False without both surahNumber & ayahNumber -> deterministic refusal, 0 LLM calls
        for payload in (
            {"ayahText": "Explain something", "isSearch": False},
            {"ayahText": "Explain something", "surahNumber": 2, "isSearch": False},
        ):
            res = client.post("/explain", json=payload)
            assert res.status_code == 200
            body = res.json()
            assert body["refusal"] is True
            assert body["verified"] is True
            assert body["canonicalVerse"] is None

            events: list[dict] = []
            with client.stream("POST", "/explain-stream", json=payload) as resp:
                assert resp.status_code == 200
                for line in resp.iter_lines():
                    if line.startswith("data: "):
                        events.append(json.loads(line[6:]))
            meta = [e["metadata"] for e in events if "metadata" in e][0]
            assert meta["refusal"] is True
            assert meta["verified"] is True

    assert fake_model.calls == 0


def test_upstream_html_200_returns_502_not_400(test_settings: Settings) -> None:
    def _html_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>Bad Gateway HTML</html>", headers={"content-type": "text/html"})

    async_client = httpx.AsyncClient(transport=httpx.MockTransport(_html_handler))
    app = create_app(settings=test_settings, http_client=async_client)

    with TestClient(app) as client:
        for path in (
            "/quran/surah/1",
            "/quran/search?q=mercy",
            "/quran/tafsir/2/255?slug=en-al-jalalayn",
            "/quran/word-by-word/2/255",
        ):
            res = client.get(path)
            assert res.status_code == 502, f"Expected 502 for {path}, got {res.status_code}"
            assert "Expecting value" not in res.text

        bad_slug = client.get("/quran/tafsir/2/255?slug=unsupported-slug")
        assert bad_slug.status_code == 400


def test_dual_entrypoint_from_backend_dir_without_shadowing() -> None:
    import os
    import subprocess
    import sys

    backend_dir = Path(__file__).resolve().parent.parent
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)
    proc = subprocess.run(
        [
            sys.executable,
            "-c",
            "import main; from uvicorn.importer import import_from_string; "
            "app = import_from_string('main:app'); assert app.title == 'Quran-AI Backend'",
        ],
        cwd=str(backend_dir),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}"


def test_create_app_cors_consistency_with_env_and_settings(monkeypatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "https://quran.example.com")
    env_app = create_app()
    with TestClient(env_app) as client:
        allowed = client.options(
            "/health",
            headers={"Origin": "https://quran.example.com", "Access-Control-Request-Method": "GET"},
        )
    assert allowed.headers.get("access-control-allow-origin") == "https://quran.example.com"


def test_explain_stream_early_disconnect_cancels_tasks(test_settings: Settings) -> None:
    import asyncio
    from backend.main import _explain_event_stream, ExplainRequest

    cancelled = False
    sleeping = asyncio.Event()

    class SlowModel(FakeModel):
        async def get_response(self, *args, **kwargs):
            nonlocal cancelled
            self.calls += 1
            if self.calls == 1:
                return self.tool_call_response("get_tafsir", {"surah_number": 2, "ayah_number": 255})
            sleeping.set()
            try:
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                cancelled = True
                raise
            return self.text_response("Done")

    async def _run() -> None:
        transport, _ = make_mock_transport()
        async with httpx.AsyncClient(transport=transport) as client:
            from backend.cache import TTLCache

            gen = _explain_event_stream(
                ExplainRequest(ayahText="Explain", surahNumber=2, ayahNumber=255),
                test_settings,
                TTLCache(),
                client,
                None,
                make_fake_run_config(SlowModel()),
            )
            frames = []
            async for frame in gen:
                frames.append(frame)
                if "Checking classical tafsir" in frame:
                    await sleeping.wait()
                    break
            await gen.aclose()
        assert cancelled is True

    asyncio.run(_run())
