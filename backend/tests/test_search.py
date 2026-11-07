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
    results = search_awards(criteria(cabin="business")).results
    assert [(r.program, r.points_cost, r.airline) for r in results] == [
        ("Air Canada Aeroplan", 75000, "NH"),
        ("United MileagePlus", 88000, "UA"),
    ]
    assert all(r.cabin == "business" and r.origin == "SFO" for r in results)


def test_unreported_values_are_null_not_invented():
    results = {r.program: r for r in search_awards(criteria(cabin="economy")).results}
    aeroplan = results["Air Canada Aeroplan"]
    assert aeroplan.seats_available is None
    assert aeroplan.cash_fees_usd is None
    assert aeroplan.cents_per_point is None


def test_usd_taxes_become_cash_fees():
    results = {r.program: r for r in search_awards(criteria(cabin="business")).results}
    assert results["United MileagePlus"].cash_fees_usd == 5.60


def test_non_usd_taxes_are_not_converted(monkeypatch, seats_aero_row):
    row = seats_aero_row(
        "aeroplan", origin="SFO", destination="NRT", day="2026-12-01",
        TaxesCurrency="CAD", YAvailable=True, YMileageCost="51879", YTotalTaxes=9560,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    [result] = search_awards(criteria()).results
    assert result.cash_fees_usd is None


def test_unavailable_cabin_with_raw_pricing_is_skipped(monkeypatch, seats_aero_row):
    # Live data: seats.aero zeroes the filtered fields and keeps dynamic pricing in *Raw.
    row = seats_aero_row(
        "united", origin="SFO", destination="NRT", day="2026-12-01",
        JAvailableRaw=True, JMileageCostRaw=360000, JRemainingSeatsRaw=9,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    assert search_awards(criteria(cabin="business")).results == []


def test_filters_by_known_seat_count():
    programs = {r.program for r in search_awards(criteria(passengers=5)).results}
    # United has 7 seats; Flying Blue has 3; Aeroplan's count is unknown, so it stays.
    assert programs == {"United MileagePlus", "Air Canada Aeroplan"}


@pytest.mark.parametrize("cabin_fields", [{}, {"cabin": None}])
def test_omitted_or_null_cabin_returns_all_priced_cabins_from_one_fetch(monkeypatch, seats_aero_row, cabin_fields):
    row = seats_aero_row(
        "united", origin="SFO", destination="NRT", day="2026-12-01",
        YAvailable=True, YMileageCost="18000", YRemainingSeats=3,
        WAvailable=True, WMileageCost="30000", WRemainingSeats=2,
        JAvailable=True, JMileageCost="25000", JRemainingSeats=1, JTotalTaxes=560,
        FAvailable=True, FMileageCost="90000", FRemainingSeats=0,
    )
    fetch = Mock(return_value={"data": [row]})
    monkeypatch.setattr(search, "_fetch_availability", fetch)
    request = criteria(**cabin_fields)
    response = search_awards(request)
    fetch.assert_called_once_with(request)
    assert [(r.cabin, r.points_cost) for r in response.results] == [
        ("economy", 18000), ("business", 25000), ("premium_economy", 30000), ("first", 90000),
    ]
    assert {r.availability_id for r in response.results} == {row["ID"]}
    assert response.results[1].cash_fees_usd == 5.60
    assert response.results[-1].seats_available is None
    assert response.message is None


def test_all_cabins_apply_party_size_and_ignore_unavailable_or_invalid_prices(monkeypatch, seats_aero_row):
    row = seats_aero_row(
        "united", origin="SFO", destination="NRT", day="2026-12-01",
        YAvailable=True, YMileageCost="18000", YRemainingSeats=1,
        WAvailable=True, WMileageCost="invalid", WRemainingSeats=9,
        JAvailable=False, JMileageCost="25000", JRemainingSeats=9,
        FAvailable=True, FMileageCost="90000", FRemainingSeats=0,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    results = search_awards(criteria(passengers=2)).results
    assert [(r.cabin, r.seats_available) for r in results] == [("first", None)]


def test_unknown_source_falls_back_to_raw_key(monkeypatch, seats_aero_row):
    row = seats_aero_row(
        "newprogram", origin="SFO", destination="NRT", day="2026-12-01",
        FAvailable=True, FMileageCost="120000", FRemainingSeats=1,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    [result] = search_awards(criteria(cabin="first")).results
    assert result.program == "newprogram"
    assert result.airline == "Not reported"


def test_empty_response_gives_no_results_and_says_why(monkeypatch):
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": None})
    response = search_awards(criteria())
    assert response.results == []
    assert response.message == "No award availability found from SFO to NRT on 2026-12-01."


def test_message_is_null_when_there_are_results():
    assert search_awards(criteria()).message is None


def test_message_when_only_other_cabins_are_available():
    response = search_awards(criteria(cabin="first"))
    assert response.results == []
    assert response.message == (
        "No first award seats from SFO to NRT on 2026-12-01. Other cabins have availability."
    )


def test_message_when_too_few_seats():
    response = search_awards(criteria(cabin="business", passengers=5))
    assert response.results == []
    assert response.message == (
        "Business award seats exist from SFO to NRT on 2026-12-01, "
        "but no program reports 5 seats available."
    )


def test_unspecified_cabin_explains_too_few_seats_without_naming_a_cabin(monkeypatch, seats_aero_row):
    row = seats_aero_row(
        "united", origin="SFO", destination="NRT", day="2026-12-01",
        JAvailable=True, JMileageCost="25000", JRemainingSeats=1,
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    response = search_awards(criteria(passengers=2))
    assert response.results == []
    assert response.message == (
        "Award seats exist from SFO to NRT on 2026-12-01, "
        "but no program reports 2 seats available."
    )


@pytest.mark.parametrize("cabin", [None, "business"])
def test_unpriced_cabins_do_not_claim_other_availability(monkeypatch, seats_aero_row, cabin):
    row = seats_aero_row(
        "united", origin="SFO", destination="NRT", day="2026-12-01",
        YAvailable=True, YMileageCost="invalid", JAvailable=True, JMileageCost="0",
    )
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    response = search_awards(criteria(cabin=cabin))
    assert response.results == []
    assert response.message == "No award availability found from SFO to NRT on 2026-12-01."


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
