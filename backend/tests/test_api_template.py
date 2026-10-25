import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

import backend.ext_api.api_template as api_template_module
from backend.ext_api import (
    APIRouterError,
    APIStatusError,
    APITimeout,
)
from backend.ext_api.api_template import APIRouterTemplate
from utils import bridge_run

from backend.ext_api.api_exceptions import RateLimiterError


class FakeRateLimiter:
    def __init__(self, config_path: Path):
        self.config_path = config_path
        self.request_count = 0
        self.usage_tokens = []
        self.request_error = None

    async def request(self):
        self.request_count += 1
        if self.request_error is not None:
            raise self.request_error

    async def record_usage(self, token):
        self.usage_tokens.append(token)

    async def close(self):
        pass


class DummyAPI(APIRouterTemplate):
    async def _async_auth(self):
        self.default_headers["Authorization"] = "test-token"


@pytest.fixture(autouse=True)
def fake_rate_limiter(monkeypatch):
    monkeypatch.setattr(api_template_module, "RateLimiter", FakeRateLimiter)


def _make_async_client(handler, headers=None):
    return httpx.AsyncClient(
        base_url="https://example.com",
        headers=headers or {"Accept": "application/json"},
        timeout=1.0,
        transport=httpx.MockTransport(handler),
    )


def _make_api(**kwargs):
    return DummyAPI("test-api", "https://example.com", **kwargs)


def test_constructor_copies_default_headers():
    headers = {"X-Test": "one"}

    api = _make_api(headers=headers)
    headers["X-Test"] = "changed"

    assert api.default_headers == {"X-Test": "one"}
    assert api.rate_limiter.config_path.name == "test-api.json"


def test_context_manager_initializes_and_closes_client():
    api = _make_api(headers={"X-Test": "one"}, timeout=1.0)

    async def exercise():
        async with api:
            client = api.client
            assert client is not None
            assert api.default_headers["X-Test"] == "one"
            assert "X-Test" not in client.headers

        assert client.is_closed
        assert api.client is None

    bridge_run(exercise())


def test_request_initializes_client_when_missing(monkeypatch):
    api = _make_api()
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True})

    async def create_client():
        return _make_async_client(handler)

    monkeypatch.setattr(api, "create_httpx_client", create_client)

    async def exercise():
        result = await api._async_request("GET", "/health")
        client = api.client
        await api.close()
        return result, client

    result, client = bridge_run(exercise())

    assert result == {"ok": True}
    assert len(requests) == 1
    assert client is not None
    assert client.is_closed
    assert api.client is None
    assert api.rate_limiter.request_count == 1


def test_oauth_auth_runs_before_request_and_updates_default_headers():
    api = _make_api(headers={"X-Trace": "base"}, oauth=True)
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"status": "ok"})

    async def exercise():
        api.client = _make_async_client(handler, headers=api.default_headers)
        try:
            result = await api._async_request("GET", "/health")
        finally:
            await api.client.aclose()

        assert result == {"status": "ok"}

    bridge_run(exercise())

    assert requests[0].headers["Authorization"] == "test-token"
    assert requests[0].headers["X-Trace"] == "base"
    assert api.rate_limiter.request_count == 1


def test_header_override_merges_with_client_defaults():
    api = _make_api(
        headers={"Authorization": "default-token", "X-Default": "default"},
        oauth=True,
    )
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"status": "ok"})

    async def exercise():
        api.client = _make_async_client(
            handler,
            headers={
                "Authorization": "default-token",
                "X-Default": "default",
            },
        )
        try:
            result = await api._async_request(
                "GET",
                "/health",
                headers_override={
                    "Authorization": "oauth-override",
                    "X-Trace": "override",
                },
            )
        finally:
            await api.client.aclose()

        assert result == {"status": "ok"}

    bridge_run(exercise())

    headers = requests[0].headers
    assert headers["Authorization"] == "oauth-override"
    assert headers["X-Trace"] == "override"
    assert headers["X-Default"] == "default"


@pytest.mark.parametrize(
    ("method", "wrapper", "kwargs", "expected_body", "expected_query"),
    [
        ("GET", "get", {"params": {"limit": 10}}, b"", "limit=10"),
        (
            "POST",
            "post",
            {"payload": {"key": "value"}, "params": {"dry_run": "true"}},
            b'{"key":"value"}',
            "dry_run=true",
        ),
        (
            "PUT",
            "put",
            {"payload": {"key": "updated"}},
            b'{"key":"updated"}',
            "",
        ),
    ],
)
def test_http_method_wrappers_forward_request_data(
    method, wrapper, kwargs, expected_body, expected_query
):
    api = _make_api(oauth=True)
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"method": method})

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            result = await getattr(api, f"async_{wrapper}")("/resource", **kwargs)
        finally:
            await api.client.aclose()

        assert result == {"method": method}

    bridge_run(exercise())

    assert requests[0].method == method
    assert requests[0].url.path == "/resource"
    assert requests[0].url.query.decode() == expected_query
    assert requests[0].content == expected_body
    assert api.rate_limiter.request_count == 1


@pytest.mark.parametrize(
    ("method", "request_method"),
    [("get", "GET"), ("post", "POST"), ("put", "PUT")],
)
def test_sync_http_method_wrappers_delegate_to_async_methods(
    method, request_method, monkeypatch
):
    api = _make_api()
    async_method = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(api, f"async_{method}", async_method)
    monkeypatch.setattr(api_template_module, "bridge_run", lambda coro: asyncio.run(coro))

    result = getattr(api, method)(
        "/resource",
        payload={"key": "value"},
        params={"limit": 10},
        bypass_rate_limiter=True,
    )

    assert result == {"ok": True}
    async_method.assert_awaited_once_with(
        "/resource",
        payload={"key": "value"},
        params={"limit": 10},
        bypass_rate_limiter=True,
    )


def test_sync_request_wrapper_delegates_to_async_request(monkeypatch):
    api = _make_api()
    async_request = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(api, "_async_request", async_request)
    monkeypatch.setattr(api_template_module, "bridge_run", lambda coro: asyncio.run(coro))
    headers = {"Authorization": "test-token"}

    result = api._request(
        "PATCH",
        "/resource",
        {"key": "value"},
        {"limit": 10},
        headers,
        True,
    )

    assert result == {"ok": True}
    async_request.assert_awaited_once_with(
        "PATCH",
        "/resource",
        {"key": "value"},
        {"limit": 10},
        headers,
        True,
    )


def test_bypass_rate_limiter_sends_request_without_acquiring_quota():
    api = _make_api(oauth=True)
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True})

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            result = await api.async_get("/health", bypass_rate_limiter=True)
        finally:
            await api.client.aclose()

        assert result == {"ok": True}

    bridge_run(exercise())

    assert len(requests) == 1
    assert api.rate_limiter.request_count == 0


def test_rate_limiter_failure_prevents_outbound_request():
    api = _make_api(oauth=True)
    api.rate_limiter.request_error = RateLimiterError("quota exceeded")
    requests = []

    async def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True})

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            with pytest.raises(RateLimiterError, match="quota exceeded"):
                await api.async_get("/health")
        finally:
            await api.client.aclose()

    bridge_run(exercise())

    assert requests == []
    assert api.rate_limiter.request_count == 1


def test_http_status_error_is_wrapped_with_response_and_request_context():
    api = _make_api(oauth=True)

    async def handler(request):
        return httpx.Response(
            500,
            json={"error": "bad"},
            request=request,
        )

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            with pytest.raises(APIStatusError) as exc_info:
                await api.async_post("/status", payload={"sent": True})
        finally:
            await api.client.aclose()

        error = exc_info.value
        assert error.status_code == 500
        assert error.base_url == "https://example.com"
        assert error.endpoint == "/status"
        assert error.request_body == {"sent": True}
        assert '"error":"bad"' in error.response_body

    bridge_run(exercise())


def test_timeout_error_raises_api_timeout():
    api = _make_api(oauth=True)

    async def handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            with pytest.raises(APITimeout):
                await api.async_get("/slow")
        finally:
            await api.client.aclose()

    bridge_run(exercise())


def test_request_error_raises_api_router_error():
    api = _make_api(oauth=True)

    async def handler(request):
        raise httpx.ConnectError("connection failed", request=request)

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            with pytest.raises(APIRouterError):
                await api.async_get("/fail")
        finally:
            await api.client.aclose()

    bridge_run(exercise())


def test_invalid_json_response_propagates_decode_error():
    api = _make_api(oauth=True)

    async def handler(request):
        return httpx.Response(200, content=b"not-json", request=request)

    async def exercise():
        api.client = _make_async_client(handler)
        try:
            with pytest.raises(ValueError):
                await api.async_get("/invalid-json")
        finally:
            await api.client.aclose()

    bridge_run(exercise())


def test_record_usage_awaits_rate_limiter_recording():
    api = _make_api()

    bridge_run(api.async_record_usage(4))

    assert api.rate_limiter.usage_tokens == [4]


def test_sync_record_usage_delegates_to_async_method(monkeypatch):
    api = _make_api()
    async_record_usage = AsyncMock(return_value=None)
    monkeypatch.setattr(api, "async_record_usage", async_record_usage)
    monkeypatch.setattr(
        api_template_module, "bridge_run", lambda coro: asyncio.run(coro)
    )

    result = api.record_usage(4)

    assert result is None
    async_record_usage.assert_awaited_once_with(4)
