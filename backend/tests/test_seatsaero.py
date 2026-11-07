import asyncio
import pytest
import json
from unittest.mock import AsyncMock, Mock

from backend.ext_api import APIStatusError, SeatsAeroAPI
from backend.ext_api.seatsaero_models import (
    RawCachedSearchResponse,
    RawGetTripResponse,
    validate_availability_on_reward_value,
)
from backend.ext_api.reward_eval import get_reward_value
from backend.models import CachedSearchResponse

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


resp_raw = """{
    "data": [
        {
            "ID": "test-availability-1",
            "RouteID": "test-route-1",
            "Route": {
                "ID": "test-route-1",
                "OriginAirport": "AAA",
                "OriginRegion": "Test Region",
                "DestinationAirport": "BBB",
                "DestinationRegion": "Test Region",
                "Distance": 100,
                "Source": "test-provider",
                "Connecting": false
            },
            "Date": "2030-01-01",
            "ParsedDate": "2030-01-01T00:00:00Z",
            "YAvailable": true,
            "WAvailable": false,
            "JAvailable": true,
            "FAvailable": false,
            "YAvailableRaw": true,
            "WAvailableRaw": false,
            "JAvailableRaw": true,
            "FAvailableRaw": false,
            "YMileageCost": "16000",
            "WMileageCost": "0",
            "JMileageCost": "74000",
            "FMileageCost": "0",
            "YDirectMileageCost": 16000,
            "WDirectMileageCost": 0,
            "JDirectMileageCost": 74000,
            "FDirectMileageCost": 0,
            "TaxesCurrency": "USD",
            "YTotalTaxes": 50,
            "WTotalTaxes": 0,
            "JTotalTaxes": 25,
            "FTotalTaxes": 0,
            "YDirectTotalTaxes": "50",
            "WDirectTotalTaxes": 0,
            "JDirectTotalTaxes": 25,
            "FDirectTotalTaxes": 0,
            "YRemainingSeats": 7,
            "WRemainingSeats": 0,
            "JRemainingSeats": 1,
            "FRemainingSeats": 0,
            "YDirectRemainingSeats": 2,
            "WDirectRemainingSeats": 0,
            "JDirectRemainingSeats": 1,
            "FDirectRemainingSeats": 0,
            "YAirlines": "TEST-A, TEST-B",
            "WAirlines": "",
            "JAirlines": "TEST-B",
            "FAirlines": "",
            "YDirectAirlines": "TEST-A",
            "WDirectAirlines": "",
            "JDirectAirlines": "TEST-B",
            "FDirectAirlines": "",
            "YDirect": true,
            "WDirect": false,
            "JDirect": true,
            "FDirect": false,
            "YDirectRaw": true,
            "WDirectRaw": false,
            "JDirectRaw": true,
            "FDirectRaw": false,
            "Source": "test-provider",
            "CreatedAt": "2030-01-01T07:43:25Z",
            "UpdatedAt": "2030-01-01T21:15:58Z",
            "AvailabilityTrips": []
        }
    ],
    "count": 1,
    "hasMore": false,
    "cursor": 123456
}"""


def test_parses_and_validates_raw_response():
    response = RawCachedSearchResponse.model_validate(json.loads(resp_raw))

    assert response.count == 1
    assert response.has_more is False
    assert response.cursor == 123456
    assert response.data[0].availability_id == "test-availability-1"
    assert response.data[0].route.origin_airport == "AAA"
    assert response.data[0].raw_cabins["economy"].available is True
    assert response.data[0].raw_cabins["economy"].available_raw is True
    assert response.data[0].raw_cabins["economy"].airlines == "TEST-A, TEST-B"
    assert response.data[0].raw_cabins["economy"].airlines_direct == "TEST-A"
    assert response.data[0].raw_cabins["economy"].from_points == "16000"
    assert response.data[0].raw_cabins["economy"].from_points_direct == 16000


def test_maps_validated_raw_response_to_client_json():
    response = RawCachedSearchResponse.model_validate(json.loads(resp_raw))

    client_json = response.to_client_json()
    validated_client_json = json.loads(json.dumps(client_json))

    assert validated_client_json == {
        "results": [
            {
                "availability_id": "test-availability-1",
                "date": "2030-01-01",
                "origin_airport": "AAA",
                "destination_airport": "BBB",
                "taxes_currency": "USD",
                "source": "test-provider",
                "provider_updated_at": "2030-01-01T21:15:58+00:00",
                "cabins": {
                    "economy": {
                        "available": True,
                        "airlines": ["TEST-A", "TEST-B"],
                        "remaining_seats": 7,
                        "from_points": 16000,
                        "from_points_cash_value": get_reward_value(16000),
                        "taxes_fees": 50,
                        "direct_available": True,
                        "direct_airlines": ["TEST-A"],
                        "direct_remaining_seats": 2,
                        "direct_from_points": 16000,
                        "direct_from_points_cash_value": get_reward_value(16000),
                        "direct_taxes_fees": 50,
                    },
                    "premium": {
                        "available": False,
                        "airlines": [],
                        "remaining_seats": None,
                        "from_points": None,
                        "from_points_cash_value": None,
                        "taxes_fees": None,
                        "direct_available": False,
                        "direct_airlines": [],
                        "direct_remaining_seats": None,
                        "direct_from_points": None,
                        "direct_from_points_cash_value": None,
                        "direct_taxes_fees": None,
                    },
                    "business": {
                        "available": True,
                        "airlines": ["TEST-B"],
                        "remaining_seats": 1,
                        "from_points": 74000,
                        "from_points_cash_value": get_reward_value(74000),
                        "taxes_fees": 25,
                        "direct_available": True,
                        "direct_airlines": ["TEST-B"],
                        "direct_remaining_seats": 1,
                        "direct_from_points": 74000,
                        "direct_from_points_cash_value": get_reward_value(74000),
                        "direct_taxes_fees": 25,
                    },
                    "first": {
                        "available": False,
                        "airlines": [],
                        "remaining_seats": None,
                        "from_points": None,
                        "from_points_cash_value": None,
                        "taxes_fees": None,
                        "direct_available": False,
                        "direct_airlines": [],
                        "direct_remaining_seats": None,
                        "direct_from_points": None,
                        "direct_from_points_cash_value": None,
                        "direct_taxes_fees": None,
                    },
                },
            }
        ],
        "has_more": False,
        "cursor": 123456,
        "count": 1,
    }

    validated_response = CachedSearchResponse.model_validate(validated_client_json)
    assert validated_response.model_dump(mode="json") == validated_client_json


def test_map_get_trip_raw_response_to_client_json():
    response = RawGetTripResponse.model_validate(
        {
            "booking_links": [
                {
                    "label": "Open United booking search",
                    "url": "https://www.united.com/en/us/book-flight/united-reservations",
                    "primary": True,
                }
            ],
            "trips": [
                {
                    "trip_id": "trip-demo-1",
                    "availability_id": "avail-demo-1",
                    "source": "united",
                    "cabin": "economy",
                    "points": 15000,
                    "taxes_minor": 560,
                    "taxes_currency": "USD",
                    "reported_seats": 2,
                    "departs_at_local": "2026-10-31T09:00:00",
                    "arrives_at_local": "2026-10-31T12:10:00",
                    "duration_minutes": 370,
                    "stops": 0,
                    "carriers": ["UA"],
                    "provider_updated_at": "2026-10-28T12:00:00Z",
                    "flight_numbers": ["UA123"],
                    "segments": [
                        {
                            "flight_number": "UA123",
                            "origin_airport": "JFK",
                            "destination_airport": "SEA",
                            "departs_at_local": "2026-10-31T09:00:00",
                            "arrives_at_local": "2026-10-31T12:10:00",
                        }
                    ],
                }
            ],
        }
    )

    assert response.to_client_json() == {
        "booking_links": [
            {
                "label": "Open United booking search",
                "url": "https://www.united.com/en/us/book-flight/united-reservations",
                "primary": True,
            }
        ],
        "trips": [
            {
                "trip_id": "trip-demo-1",
                "availability_id": "avail-demo-1",
                "source": "united",
                "cabin": "economy",
                "points": 15000,
                "points_cash_value": get_reward_value(15000),
                "taxes_minor": 560,
                "taxes_currency": "USD",
                "reported_seats": 2,
                "departs_at_local": "2026-10-31T09:00:00",
                "arrives_at_local": "2026-10-31T12:10:00",
                "duration_minutes": 370,
                "stops": 0,
                "carriers": ["UA"],
                "provider_updated_at": "2026-10-28T12:00:00Z",
                "flight_numbers": ["UA123"],
                "segments": [
                    {
                        "flight_number": "UA123",
                        "origin_airport": "JFK",
                        "destination_airport": "SEA",
                        "departs_at_local": "2026-10-31T09:00:00",
                        "arrives_at_local": "2026-10-31T12:10:00",
                    }
                ],
            }
        ],
    }


def test_single_entry_and_normalizes_trip_fields():
    response = RawGetTripResponse.model_validate(
        {
            "data": [
                {
                    "ID": "trip-demo-1",
                    "AvailabilityID": "avail-demo-1",
                    "Source": "united",
                    "Cabin": "economy",
                    "MileageCost": 15000,
                    "TotalTaxes": 0,
                    "RemainingSeats": 2,
                    "DepartsAt": "2026-10-31T09:00:00Z",
                    "ArrivesAt": "2026-10-31T12:10:00Z",
                    "TotalDuration": 370,
                    "Stops": 0,
                    "Carriers": "UA",
                    "UpdatedAt": "2026-10-28T12:00:00Z",
                    "FlightNumbers": "UA123",
                    "AvailabilitySegments": [
                        {
                            "FlightNumber": "UA123",
                            "OriginAirport": "JFK",
                            "DestinationAirport": "SEA",
                            "DepartsAt": "2026-10-31T09:00:00Z",
                            "ArrivesAt": "2026-10-31T12:10:00Z",
                        }
                    ],
                }
            ],
            "booking_links": [
                {
                    "label": "Open booking",
                    "link": "https://example.com/book",
                    "primary": True,
                }
            ],
        }
    )

    result = response.to_client_json()

    assert result["trips"][0]["trip_id"] == "trip-demo-1"
    assert result["trips"][0]["availability_id"] == "avail-demo-1"
    assert result["trips"][0]["taxes_minor"] == 0
    assert result["trips"][0]["taxes_currency"] is None
    assert result["trips"][0]["departs_at_local"] == "2026-10-31T09:00:00Z"
    assert result["trips"][0]["carriers"] == ["UA"]
    assert result["trips"][0]["flight_numbers"] == ["UA123"]
    assert result["booking_links"][0]["url"] == "https://example.com/book"
    assert result["trips"][0]["segments"][0]["origin_airport"] == "JFK"
    assert result["trips"][0]["segments"][0]["arrives_at_local"] == (
        "2026-10-31T12:10:00Z"
    )


def test_empty_get_trips_response_to_client_json():
    response = RawGetTripResponse.model_validate(
        {
            "data": [],
            "booking_links": [],
        }
    )

    assert response.to_client_json() == {
        "booking_links": [],
        "trips": [],
    }

def test_validate_availability_on_reward_value():

    # Test when available is False
    assert validate_availability_on_reward_value(100, False) is None

    # Test when value is 0
    assert validate_availability_on_reward_value(0, True) is None

    # Test when available is True and value is non-zero
    result = validate_availability_on_reward_value(100, True)
    assert result is not None
    assert isinstance(result, dict)
    assert result == get_reward_value(100)