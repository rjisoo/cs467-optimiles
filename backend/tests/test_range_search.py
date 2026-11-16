from datetime import date, datetime, timedelta
from unittest.mock import ANY, Mock

import pytest

from backend import search

REAL_FETCH = search._fetch_availability
REQUEST = {"origin": ["JFK", "LGA"], "destination": ["LHR", "CDG"],
           "departure_date": "2026-12-01", "departure_date_end": "2026-12-03",
           "cabins": ["economy", "business"], "passengers": 2}


def row(day="2026-12-01", **overrides):
    return {"ID": f"availability-{day}", "Date": day, "Source": "united",
            "Route": {"OriginAirport": "JFK", "DestinationAirport": "LHR"},
            "YAvailable": True, "YMileageCost": "20000", "YRemainingSeats": 3,
            **overrides}


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setenv("SEATSAERO_TOKEN", "test-token")
    provider = Mock(return_value={"data": [], "hasMore": False})
    monkeypatch.setattr(search, "_fetch_availability", REAL_FETCH)
    monkeypatch.setattr(search.seatsaero_api, "cached_search", provider)
    return provider


@pytest.mark.parametrize(("start", "end"), [
    ("2026-12-01", "2026-12-01"),
    ("2026-11-30", "2026-12-02"), ("2026-12-31", "2027-01-02"),
    ("2028-02-28", "2028-03-01"), ("2026-12-01", "2027-11-26"),
    ("2026-12-01", "2027-12-01"),
])
def test_range_uses_one_combined_request_and_preserves_dates_ids_and_cabins(client, monkeypatch, provider, start, end):
    monkeypatch.setattr("backend.airports.utc_now", lambda: datetime.fromisoformat(f"{start}T12:00:00+00:00"))
    days = [date.fromisoformat(start) + timedelta(days=offset)
            for offset in range((date.fromisoformat(end) - date.fromisoformat(start)).days + 1)]
    rows = [row(day.isoformat(), Route={"OriginAirport": REQUEST["origin"][index % 2],
                                       "DestinationAirport": REQUEST["destination"][index % 2]},
                JAvailable=True, JMileageCost="40000", JRemainingSeats=2,
                WAvailable=True, WMileageCost="30000", WRemainingSeats=9)
            for index, day in enumerate(days)]
    provider.return_value = {"data": rows, "hasMore": False}
    response = client.post("/api/search", json={**REQUEST, "departure_date": start, "departure_date_end": end})
    assert response.status_code == 200
    body = response.get_json()
    assert set(body) == {"results", "message", "partial", "warnings"} and body["message"] is None
    assert body["partial"] is False and body["warnings"] == []
    assert {(result["availability_id"], result["departure_date"], result["origin"], result["destination"], result["cabin"])
            for result in body["results"]} == {
        (item["ID"], item["Date"], item["Route"]["OriginAirport"], item["Route"]["DestinationAirport"], cabin)
        for item in rows for cabin in REQUEST["cabins"]
    }
    assert len(body["results"]) == len(days) * 2
    provider.assert_called_once_with({"origin_airport": "JFK,LGA", "destination_airport": "LHR,CDG",
                                      "start_date": start, "end_date": end, "take": 500}, timeout=ANY)


@pytest.mark.parametrize("with_match", [False, True])
def test_unselected_routes_and_outside_dates_do_not_affect_results_or_empty_reason(client, provider, with_match):
    ignored = [row("2026-11-30", YRemainingSeats="invalid"), row("2026-12-04", YRemainingSeats="invalid"),
               row(None, Route={"OriginAirport": "SEA", "DestinationAirport": "LHR"}),
               row("invalid", Route={"OriginAirport": "JFK", "DestinationAirport": "HND"}),
               row(None, YAvailable=False)]
    provider.return_value = {"data": ignored + ([row("2026-12-02")] if with_match else []), "hasMore": False}
    response = client.post("/api/search", json=REQUEST)
    assert response.status_code == 200
    body = response.get_json()
    assert [result["departure_date"] for result in body["results"]] == (["2026-12-02"] if with_match else [])
    assert body["message"] == (None if with_match else (
        "No award availability found from JFK, LGA to LHR, CDG between 2026-12-01 and 2026-12-03."
    ))


@pytest.mark.parametrize("date_fields", [{}, {"Date": None}, {"Date": ""}, {"Date": "2026-02-30"},
                                        {"Date": "20261201"}, {"Date": "2026-12-01T00:00:00Z"},
                                        {"Date": 0}, {"Date": {}}])
@pytest.mark.parametrize("with_valid_row", [False, True])
def test_bad_provider_dates_fail_safely_instead_of_becoming_empty_or_partial_results(client, provider, date_fields, with_valid_row):
    invalid = row(ID="invalid-date-record")
    del invalid["Date"]
    invalid.update(date_fields)
    provider.return_value = {"data": ([row()] if with_valid_row else []) + [invalid], "hasMore": False}
    response = client.post("/api/search", json=REQUEST)
    assert response.status_code == 502
    assert response.get_json() == {"error": "Award search is unavailable right now. Please try again later."}
    provider.assert_called_once()


def test_exact_date_search_does_not_invent_missing_provider_date(client, provider):
    invalid = row()
    del invalid["Date"]
    provider.return_value = {"data": [invalid], "hasMore": False}
    response = client.post("/api/search", json={"origin": "JFK", "destination": "LHR", "departure_date": "2026-12-01"})
    assert response.status_code == 502


@pytest.mark.parametrize(("cabins", "passengers", "data", "message"), [
    (["economy"], 1, [], "No award availability found {trip}."),
    (["economy"], 4, [row()], "Economy award seats exist {trip}, but no program reports 4 seats available."),
    (["business"], 1, [row()], "No business award seats {trip}. Other cabins have availability."),
])
def test_range_empty_messages_include_both_dates_and_existing_reasons(client, provider, cabins, passengers, data, message):
    provider.return_value = {"data": data, "hasMore": False}
    response = client.post("/api/search", json={**REQUEST, "cabins": cabins, "passengers": passengers})
    assert response.status_code == 200
    trip = "from JFK, LGA to LHR, CDG between 2026-12-01 and 2026-12-03"
    assert response.get_json() == {"results": [], "message": message.format(trip=trip), "partial": False, "warnings": []}
