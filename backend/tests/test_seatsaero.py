import asyncio
import pytest
from unittest.mock import AsyncMock, Mock

from ext_api import APIStatusError, SeatsAeroAPI


@pytest.mark.parametrize(
    ("method", "test_args", "endpoint", "request_kwargs"),
    [
        ("async_cached_search", ({},), "/search", {"params": {}}),
        ("async_get_trips", ("trip-id", {}), "/trips/trip-id", {"params": {}}),
        ("async_get_routes", ({},), "/routes", {"params": {}}),
        ("async_get_destinations", ({},), "/destinations", {"params": {}}),
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
        response = {"success": True}
        request = AsyncMock(return_value=response)
        api.async_get = request
        api.async_post = request
        api.async_record_usage = AsyncMock()

        result = await getattr(api, method)(*test_args)
        assert result == response
        request.assert_awaited_once_with(endpoint, **request_kwargs)
        api.async_record_usage.assert_awaited_once_with(1)

    asyncio.run(exercise())


@pytest.mark.parametrize(
    ("method", "test_args", "endpoint", "request_kwargs"),
    [
        ("cached_search", ({},), "/search", {"params": {}}),
        ("get_trips", ("trip-id", {}), "/trips/trip-id", {"params": {}}),
        ("get_routes", ({},), "/routes", {"params": {}}),
        ("get_destinations", ({},), "/destinations", {"params": {}}),
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
    method, test_args, endpoint, request_kwargs
):
    api = object.__new__(SeatsAeroAPI)
    response = {"success": True}
    request = Mock(return_value=response)
    api.get = request
    api.post = request
    api.record_usage = Mock()

    result = getattr(api, method)(*test_args)
    assert result == response
    request.assert_called_once_with(endpoint, **request_kwargs)
    api.record_usage.assert_called_once_with(1)


def test_sync_cached_search_records_usage_and_reraises_status_error():
    api = object.__new__(SeatsAeroAPI)
    error = APIStatusError(
        "request failed",
        status_code=500,
        base_url="https://example.test",
        endpoint="/search",
    )
    api.get = Mock(side_effect=error)
    api.record_usage = Mock()

    with pytest.raises(APIStatusError) as raised:
        api.cached_search({})

    assert raised.value is error
    api.record_usage.assert_called_once_with(1)
