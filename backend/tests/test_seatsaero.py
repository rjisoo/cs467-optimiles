import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from ext_api import seatsaero_api, APIRouterError, APIStatusError, SeatsAeroAPI
from utils import bridge_run


@pytest.mark.parametrize(
    ("method", "test_args", "endpoint", "request_kwargs"),
    [
        ("async_cached_search", ({},), "/search", {"params": {}}),
        (
            "async_get_availability",
            ({"source": "american"},),
            "/availability",
            {"params": {"source": "american"}},
        ),
        ("async_get_alerts", (), "/alerts", {}),
        (
            "async_live_search",
            ({"origin_airport": "SFO"},),
            "/live",
            {"payload": {"origin_airport": "SFO"}},
        ),
        (
            "async_refresh_cached_data",
            ({"availability_ids": ["example"]},),
            "/refresh",
            {"payload": {"availability_ids": ["example"]}},
        ),
    ],
)
def test_async_flight_endpoints_dispatch_and_record_usage(
    method, test_args, endpoint, request_kwargs
):
    async def exercise():
        api = object.__new__(SeatsAeroAPI)
        api.cache_lock = asyncio.Lock()
        response = {"success": True}
        request = AsyncMock(return_value=response)
        api.get = request
        api.post = request
        api.record_usage = AsyncMock()

        result = await getattr(api, method)(*test_args)
        assert result == response
        request.assert_awaited_once_with(endpoint, **request_kwargs)
        api.record_usage.assert_awaited_once_with(1)

    asyncio.run(exercise())


@pytest.mark.parametrize(
    ("method", "test_args", "endpoint", "request_kwargs"),
    [
        ("cached_search", ({},), "/search", {"params": {}}),
        (
            "get_availability",
            ({"source": "american"},),
            "/availability",
            {"params": {"source": "american"}},
        ),
        ("get_alerts", (), "/alerts", {}),
        (
            "live_search",
            ({"origin_airport": "SFO"},),
            "/live",
            {"payload": {"origin_airport": "SFO"}},
        ),
        (
            "refresh_cached_data",
            ({"availability_ids": ["example"]},),
            "/refresh",
            {"payload": {"availability_ids": ["example"]}},
        ),
    ],
)
def test_flight_endpoints_dispatch_and_record_usage(
    method, test_args, endpoint, request_kwargs, mocker
):
    api = object.__new__(SeatsAeroAPI)
    api.cache_lock = asyncio.Lock()
    request = AsyncMock(return_value={"success": True})
    api.get = request
    api.post = request
    api.record_usage = AsyncMock()

    result = getattr(api, method)(*test_args)
    assert result == {"success": True}
    request.assert_awaited_once_with(endpoint, **request_kwargs)
    api.record_usage.assert_awaited_once_with(1)
