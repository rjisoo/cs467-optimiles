from datetime import datetime, timedelta
from unittest.mock import Mock

import pytest

from backend import search
from backend.llm.tools import SEARCH_AWARDS_DECLARATION, run_search_tool
from backend.models import SearchCriteria, StructuredSearchCriteria

REAL_FETCH = search._fetch_availability
REQUEST = {"origin": [" jfk ", "LGA", "ewr"], "destination": ["lhr", " CDG "],
           "departure_date": "2026-12-01", "cabins": ["economy", "business"], "passengers": 2}


@pytest.mark.parametrize(("origin", "destination", "origin_param", "destination_param"), [
    (" jfk ", " lhr ", "JFK", "LHR"),
    ([" jfk "], [" lhr "], "JFK", "LHR"),
    (["jfk", " LGA ", "ewr"], "lhr", "JFK,LGA,EWR", "LHR"),
    ("jfk", [" lhr ", "cdg"], "JFK", "LHR,CDG"),
    (["jfk", "LGA", "EWR"], ["lhr", "CDG"], "JFK,LGA,EWR", "LHR,CDG"),
    (["JFK", "LGA", "EWR", "SFO", "SEA", "LAX"], ["LHR"], "JFK,LGA,EWR,SFO,SEA,LAX", "LHR"),
    ("JFK", ["LHR", "CDG", "FRA", "HND", "NRT", "ICN"], "JFK", "LHR,CDG,FRA,HND,NRT,ICN"),
])
def test_direct_search_makes_one_combined_request_without_chat(client, monkeypatch, origin, destination, origin_param, destination_param):
    monkeypatch.setenv("SEATSAERO_TOKEN", "test-token")
    provider = Mock(return_value={"data": [], "hasMore": True})
    chat = Mock(side_effect=AssertionError("Direct search must not use chat"))
    gemini = Mock(side_effect=AssertionError("Direct search must not use Gemini"))
    monkeypatch.setattr(search, "_fetch_availability", REAL_FETCH)
    monkeypatch.setattr(search.seatsaero_api, "cached_search", provider)
    monkeypatch.setattr("backend.app.handle_chat", chat)
    monkeypatch.setattr("backend.llm.gemini_chat.get_client", gemini)
    response = client.post("/api/search", json={**REQUEST, "origin": origin, "destination": destination})
    assert response.status_code == 200
    assert response.get_json() == {"results": [], "message": (
        f"No award availability found from {origin_param.replace(',', ', ')} "
        f"to {destination_param.replace(',', ', ')} on 2026-12-01."
    )}
    provider.assert_called_once_with({"origin_airport": origin_param, "destination_airport": destination_param,
                                      "start_date": "2026-12-01", "end_date": "2026-12-01"})
    chat.assert_not_called()
    gemini.assert_not_called()


@pytest.mark.parametrize("field", ["origin", "destination"])
@pytest.mark.parametrize("value", [None, [], ["JFK", " jfk "], ["QQQ"], ["NYC"], ["New York"],
                                  [1], [["JFK"]], {"code": "JFK"}, "JFK,LGA", [""],
                                  ["JFK", "LGA", "EWR", "SFO", "SEA", "LAX", "ORD"]])
def test_rejects_invalid_selections_before_search(client, monkeypatch, field, value):
    provider = Mock(side_effect=AssertionError("Invalid selections must not search"))
    monkeypatch.setattr("backend.app.search_awards", provider)
    response = client.post("/api/search", json={**REQUEST, field: value})
    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid request"
    provider.assert_not_called()


def test_openapi_documents_bounded_arrays_only_for_direct_search(client):
    spec = client.get("/openapi.json").get_json()
    request = spec["paths"]["/api/search"]["post"]["requestBody"]["content"]["application/json"]
    assert request["schema"] == {"$ref": "#/components/schemas/StructuredSearchCriteria"}
    schemas = spec["components"]["schemas"]
    for field in ["origin", "destination"]:
        choices = schemas["StructuredSearchCriteria"]["properties"][field]["anyOf"]
        array = next(choice for choice in choices if choice["type"] == "array")
        assert (array["minItems"], array["maxItems"]) == (1, 6)
        assert array["items"]["pattern"] == "^[A-Z]{3}$"
        assert schemas["SearchCriteria"]["properties"][field]["type"] == "string"


@pytest.mark.parametrize(("origin", "destination"), [
    ("JFK", ["jfk", "LHR"]), (["JFK", "LGA"], " lga "), (["JFK", "LGA"], ["LHR", "jfk"]),
])
def test_rejects_any_overlap(client, monkeypatch, origin, destination):
    provider = Mock()
    monkeypatch.setattr("backend.app.search_awards", provider)
    response = client.post("/api/search", json={**REQUEST, "origin": origin, "destination": destination})
    assert response.status_code == 400
    assert "overlap" in response.get_json()["details"][0]["msg"]
    provider.assert_not_called()


@pytest.mark.parametrize("origins", [["HNL", "HND"], ["HND", "HNL"]])
@pytest.mark.parametrize(("offset", "valid"), [(0, False), (1, True), (365, True), (366, False)])
def test_date_must_fit_every_origin_using_one_clock_instant(monkeypatch, origins, offset, valid):
    instant = datetime.fromisoformat("2028-03-01T00:30:00+00:00")
    clock = Mock(return_value=instant)
    monkeypatch.setattr("backend.airports.utc_now", clock)
    departure = (instant.date() - timedelta(days=1) + timedelta(days=offset)).isoformat()
    payload = {**REQUEST, "origin": origins, "departure_date": departure}
    if valid:
        criteria = StructuredSearchCriteria.model_validate(payload)
        assert criteria.origin_codes == origins
    else:
        with pytest.raises(ValueError, match="every origin"):
            StructuredSearchCriteria.model_validate(payload)
    clock.assert_called_once_with()


def test_results_keep_concrete_routes_ids_cabins_and_party_filtering(client, monkeypatch, seats_aero_row):
    rows = []
    for origin, destination in [("JFK", "LHR"), ("LGA", "CDG"), ("EWR", "LHR")]:
        rows.append(seats_aero_row("united", origin=origin, destination=destination, day="2026-12-01",
                                  YAvailable=True, YMileageCost="20000", YRemainingSeats=2,
                                  WAvailable=True, WMileageCost="30000", WRemainingSeats=4,
                                  JAvailable=True, JMileageCost="40000", JRemainingSeats=1))
    monkeypatch.setattr(search, "_fetch_availability", Mock(return_value={"data": rows}))
    response = client.post("/api/search", json=REQUEST)
    assert response.status_code == 200
    results = response.get_json()["results"]
    assert {(row["origin"], row["destination"]) for row in results} == {("JFK", "LHR"), ("LGA", "CDG"), ("EWR", "LHR")}
    assert {row["availability_id"] for row in results} == {row["ID"] for row in rows}
    assert len(results) == 3 and all(row["cabin"] == "economy" for row in results)
    assert response.get_json()["message"] is None


@pytest.mark.parametrize("route", [None, {}, {"OriginAirport": "JFK"}, {"DestinationAirport": "LHR"},
                                  {"OriginAirport": ["JFK"], "DestinationAirport": "LHR"},
                                  {"OriginAirport": "JFK,LGA", "DestinationAirport": "LHR"}, "invalid"])
def test_ambiguous_provider_routes_are_upstream_errors_not_empty_results(client, monkeypatch, seats_aero_row, route):
    row = seats_aero_row("united", origin="JFK", destination="LHR", day="2026-12-01", YAvailable=True, YMileageCost="20000")
    row["Route"] = route
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    response = client.post("/api/search", json=REQUEST)
    assert response.status_code == 502
    assert response.get_json()["error"] == "Award search is unavailable right now. Please try again later."


@pytest.mark.parametrize("route", [[], False, {"OriginAirport": False}, {"OriginAirport": 0},
                                  {"OriginAirport": []}, {"DestinationAirport": {}}])
def test_malformed_route_values_do_not_use_singleton_fallback(client, monkeypatch, seats_aero_row, route):
    row = seats_aero_row("united", origin="JFK", destination="LHR", day="2026-12-01", YAvailable=True, YMileageCost="20000")
    row["Route"] = route
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    response = client.post("/api/search", json={**REQUEST, "origin": "JFK", "destination": "LHR"})
    assert response.status_code == 502


@pytest.mark.parametrize(("origins", "destinations", "reported", "expected"), [
    ("JFK", "LHR", {}, ("JFK", "LHR")),
    (["JFK", "LGA"], "LHR", {"OriginAirport": "LGA"}, ("LGA", "LHR")),
    ("JFK", ["LHR", "CDG"], {"DestinationAirport": "CDG"}, ("JFK", "CDG")),
])
def test_missing_route_side_falls_back_only_to_a_singleton(monkeypatch, seats_aero_row, origins, destinations, reported, expected):
    row = seats_aero_row("united", origin="JFK", destination="LHR", day="2026-12-01", YAvailable=True, YMileageCost="20000")
    row["Route"] = reported
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    request = StructuredSearchCriteria.model_validate({**REQUEST, "origin": origins, "destination": destinations})
    [result] = search.search_awards(request).results
    assert (result.origin, result.destination) == expected


@pytest.mark.parametrize(("origin", "destination", "day"), [
    ("SFO", "LHR", "2026-12-01"), ("JFK", "NRT", "2026-12-01"), ("JFK", "LHR", "2026-12-02"),
])
def test_unrequested_rows_do_not_affect_results_or_empty_reasons(monkeypatch, seats_aero_row, origin, destination, day):
    row = seats_aero_row("united", origin=origin, destination=destination, day=day, FAvailable=True, FMileageCost="20000")
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    response = search.search_awards(StructuredSearchCriteria.model_validate(REQUEST))
    assert response.results == []
    assert response.message == "No award availability found from JFK, LGA, EWR to LHR, CDG on 2026-12-01."


@pytest.mark.parametrize("field", ["origin", "destination"])
def test_chat_schema_and_validation_remain_single_airport(monkeypatch, field):
    provider = Mock(side_effect=AssertionError("Chat arrays must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", provider)
    args = {"origin": "JFK", "destination": "LHR", "departure_date": "2026-12-01",
            "origin_quote": "New York", "destination_quote": "London", "date_quote": "Dec 1", field: ["JFK", "LGA"]}
    assert SEARCH_AWARDS_DECLARATION["parameters_json_schema"]["properties"][field]["type"] == "string"
    with pytest.raises(ValueError):
        SearchCriteria.model_validate(args)
    payload, results = run_search_tool(args, "New York to London Dec 1")
    assert payload["error"] == "Invalid search criteria" and results == []
    provider.assert_not_called()
