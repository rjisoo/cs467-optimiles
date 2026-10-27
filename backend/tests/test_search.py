from datetime import date
from unittest.mock import Mock

import pytest

from backend import search
from backend.ext_api import APIRouterError
from backend.models import SearchCriteria
from backend.search import cents_per_point, search_awards

# Captured at import, before the autouse fake_seats_aero fixture replaces it.
REAL_FETCH = search._fetch_availability


def criteria(**overrides):
    fields = {"origin": "SFO", "destination": "NRT", "departure_date": date(2026, 12, 1)}
    return SearchCriteria(**{**fields, **overrides})


def test_cents_per_point():
    assert cents_per_point(420.00, 5.60, 30000) == 1.38


def test_cents_per_point_is_none_without_cash_price():
    assert cents_per_point(None, 5.60, 30000) is None


def test_maps_rows_for_requested_cabin_cheapest_first():
    results = search_awards(criteria(cabin="business"))
    assert [(r.program, r.points_cost, r.airline) for r in results] == [
        ("Air Canada Aeroplan", 75000, "NH"),
        ("United MileagePlus", 88000, "UA"),
    ]
    assert all(r.cabin == "business" and r.origin == "SFO" for r in results)


def test_unreported_values_are_null_not_invented():
    results = {r.program: r for r in search_awards(criteria())}
    aeroplan = results["Air Canada Aeroplan"]
    assert aeroplan.seats_available is None
    assert aeroplan.cash_fees_usd is None
    assert aeroplan.cents_per_point is None


def test_usd_taxes_become_cash_fees():
    results = {r.program: r for r in search_awards(criteria(cabin="business"))}
    assert results["United MileagePlus"].cash_fees_usd == 5.60


def test_non_usd_taxes_are_not_converted(monkeypatch, seats_aero_row):
    row = seats_aero_row(
        "aeroplan", origin="SFO", destination="NRT", day="2026-12-01",
        TaxesCurrency="CAD", YAvailable=True, YMileageCost="51879", YTotalTaxes=9560,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    [result] = search_awards(criteria())
    assert result.cash_fees_usd is None


def test_unavailable_cabin_with_raw_pricing_is_skipped(monkeypatch, seats_aero_row):
    # Live data: seats.aero zeroes the filtered fields and keeps dynamic pricing in *Raw.
    row = seats_aero_row(
        "united", origin="SFO", destination="NRT", day="2026-12-01",
        JAvailableRaw=True, JMileageCostRaw=360000, JRemainingSeatsRaw=9,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    assert search_awards(criteria(cabin="business")) == []


def test_filters_by_known_seat_count():
    programs = {r.program for r in search_awards(criteria(passengers=5))}
    # United has 7 seats; Flying Blue has 3; Aeroplan's count is unknown, so it stays.
    assert programs == {"United MileagePlus", "Air Canada Aeroplan"}


def test_unknown_source_falls_back_to_raw_key(monkeypatch, seats_aero_row):
    row = seats_aero_row(
        "newprogram", origin="SFO", destination="NRT", day="2026-12-01",
        FAvailable=True, FMileageCost="120000", FRemainingSeats=1,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    [result] = search_awards(criteria(cabin="first"))
    assert result.program == "newprogram"
    assert result.airline == "Not reported"


def test_empty_response_gives_no_results(monkeypatch):
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": None})
    assert search_awards(criteria()) == []


def test_sends_route_and_date_to_seats_aero(monkeypatch):
    monkeypatch.setenv("SEATSAERO_TOKEN", "test-token")
    cached_search = Mock(return_value={"data": []})
    monkeypatch.setattr(search.seatsaero_api, "cached_search", cached_search)
    assert REAL_FETCH(criteria()) == {"data": []}
    cached_search.assert_called_once_with(
        {
            "origin_airport": "SFO",
            "destination_airport": "NRT",
            "start_date": "2026-12-01",
            "end_date": "2026-12-01",
        }
    )


def test_missing_token_raises_router_error(monkeypatch):
    monkeypatch.delenv("SEATSAERO_TOKEN", raising=False)
    with pytest.raises(APIRouterError):
        REAL_FETCH(criteria())


def test_missing_token_is_a_502_from_the_api(client, monkeypatch):
    monkeypatch.delenv("SEATSAERO_TOKEN", raising=False)
    monkeypatch.setattr(search, "_fetch_availability", REAL_FETCH)
    response = client.post(
        "/api/search", json={"origin": "SFO", "destination": "NRT", "departure_date": "2026-12-01"}
    )
    assert response.status_code == 502
    assert "unavailable" in response.get_json()["error"]
