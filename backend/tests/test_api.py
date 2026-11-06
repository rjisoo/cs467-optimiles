from copy import deepcopy
from unittest.mock import Mock

import pytest

from backend.chat import NOT_CONFIGURED_REPLY
from backend.ext_api import APIQuotaExceeded, APIRouterError, APITimeout
from backend.models import ChatResponse, GetTripResponse, SearchCriteria
from backend.search import search_awards

VALID_SEARCH = {
    "origin": "sfo",
    "destination": "NRT",
    "departure_date": "2026-12-01",
    "cabin": "business",
    "passengers": 2,
}


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_search_returns_results(client):
    response = client.post("/api/search", json=VALID_SEARCH)
    assert response.status_code == 200
    results = response.get_json()["results"]
    assert results
    for result in results:
        assert result["origin"] == "SFO"
        assert result["cabin"] == "business"
        assert result["seats_available"] is None or result["seats_available"] >= 2
    assert response.get_json()["message"] is None


def test_search_explains_empty_results(client):
    response = client.post("/api/search", json={**VALID_SEARCH, "cabin": "first"})
    assert response.status_code == 200
    body = response.get_json()
    assert body["results"] == []
    assert body["message"].startswith("No first award seats")


def test_search_rejects_same_origin_and_destination(client):
    response = client.post("/api/search", json={**VALID_SEARCH, "destination": "SFO"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid request"


def test_search_rejects_return_before_departure(client):
    response = client.post("/api/search", json={**VALID_SEARCH, "return_date": "2026-11-01"})
    assert response.status_code == 400


def test_search_rejects_missing_body(client):
    response = client.post("/api/search")
    assert response.status_code == 400


def test_chat_returns_reply(client, monkeypatch):
    def fake_run_chat(request):
        assert request.message == "Tokyo in December?"
        return ChatResponse(reply="Where are you flying from?", results=[])

    monkeypatch.setattr("backend.chat.run_chat", fake_run_chat)
    response = client.post("/api/chat", json={"message": "Tokyo in December?", "history": []})
    assert response.status_code == 200
    assert response.get_json() == {"reply": "Where are you flying from?", "results": []}


def test_chat_without_api_key_says_not_connected(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    response = client.post("/api/chat", json={"message": "Tokyo in December?"})
    assert response.status_code == 200
    assert response.get_json() == {"reply": NOT_CONFIGURED_REPLY, "results": []}


def test_chat_rejects_empty_message(client):
    response = client.post("/api/chat", json={"message": ""})
    assert response.status_code == 400


AVAILABILITY_ID = "provider-record_123"
PATH = f"/api/availability/{AVAILABILITY_ID}/trips"
RAW_TRIP = {
    "ID": "trip-1", "AvailabilityID": AVAILABILITY_ID, "Source": "united",
    "Cabin": "economy", "MileageCost": "15000", "TotalTaxes": "0",
    "TaxesCurrency": "USD", "RemainingSeats": 0,
    "DepartsAt": "2026-12-01T09:00:00Z", "ArrivesAt": "2026-12-01T12:10:00Z",
    "TotalDuration": 370, "Stops": 0, "Carriers": "UA", "FlightNumbers": "UA123",
    "AvailabilitySegments": [{"FlightNumber": "UA123", "OriginAirport": "JFK"}],
}


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setenv("SEATSAERO_TOKEN", "test-token")
    request = Mock(return_value={"data": [deepcopy(RAW_TRIP)], "booking_links": []})
    monkeypatch.setattr("backend.search.seatsaero_api.get_trips", request)
    return request


def test_loads_one_provider_record_and_preserves_reported_data(client, provider):
    response = client.get(PATH)
    assert response.status_code == 200
    provider.assert_called_once_with(trip_id=AVAILABILITY_ID, params={})
    body = response.get_json()
    GetTripResponse.model_validate(body)
    assert body["availability_id"] == AVAILABILITY_ID
    [trip] = body["trips"]
    assert trip["availability_id"] == AVAILABILITY_ID
    assert trip["points"] == 15000
    assert trip["taxes_minor"] == 0
    assert trip["reported_seats"] == 0
    assert trip["departs_at_local"] == RAW_TRIP["DepartsAt"]
    assert trip["duration_minutes"] == 370
    assert trip["carriers"] == ["UA"]
    assert trip["segments"][0]["departs_at_local"] is None


def test_keeps_empty_trips_as_success(client, provider):
    provider.return_value = {"data": []}
    assert client.get(PATH).get_json() == {
        "availability_id": AVAILABILITY_ID, "trips": [], "booking_links": [],
    }


def test_missing_segments_and_currency_remain_unknown(client, provider):
    trip = provider.return_value["data"][0]
    del trip["AvailabilitySegments"]
    del trip["TaxesCurrency"]
    trip["TotalTaxes"] = None
    result = client.get(PATH).get_json()["trips"][0]
    assert result["segments"] == []
    assert result["taxes_currency"] is None
    assert result["taxes_minor"] is None


@pytest.mark.parametrize("value", ["bad%3Fid", "bad%20id", "a" * 201])
def test_rejects_invalid_ids_before_provider_request(client, provider, value):
    assert client.get(f"/api/availability/{value}/trips").status_code == 400
    provider.assert_not_called()


@pytest.mark.parametrize("payload", [
    {}, {"data": None}, {"data": {}}, {"data": [{"ID": "incomplete"}]},
    {"data": [{**RAW_TRIP, "MileageCost": "not a number"}]},
    {"data": [{**RAW_TRIP, "TotalTaxes": -1}]},
    {"data": [{**RAW_TRIP, "AvailabilityID": "wrong-record"}]},
])
def test_malformed_upstream_data_is_not_empty_success_or_client_error(client, provider, payload):
    provider.return_value = payload
    response = client.get(PATH)
    assert response.status_code == 502
    assert response.get_json() == {"error": "Award search is unavailable right now. Please try again later."}


@pytest.mark.parametrize(("error", "status"), [
    (APIRouterError("private diagnostic"), 502), (APIQuotaExceeded(), 503), (APITimeout(), 504),
])
def test_upstream_failures_use_documented_statuses(client, provider, error, status):
    provider.side_effect = error
    response = client.get(PATH)
    assert response.status_code == status
    assert "private diagnostic" not in response.get_data(as_text=True)
    operation = client.get("/openapi.json").get_json()["paths"][
        "/api/availability/{availability_id}/trips"
    ]["get"]
    assert operation["responses"][str(status)]["content"]["application/json"]["example"] == response.get_json()


def test_search_and_chat_expose_the_original_provider_ids(client, monkeypatch):
    criteria = SearchCriteria(origin="JFK", destination="SEA", departure_date="2026-12-01")
    expected = {f"{source}-JFK-SEA-2026-12-01" for source in ("united", "aeroplan", "flyingblue")}
    rows = client.post("/api/search", json=criteria.model_dump(mode="json")).get_json()["results"]
    assert {row["availability_id"] for row in rows} == expected
    monkeypatch.setattr("backend.chat.run_chat", lambda request: ChatResponse(
        reply="Reported options", results=search_awards(criteria).results,
    ))
    rows = client.post("/api/chat", json={"message": "JFK to SEA December 1"}).get_json()["results"]
    assert {row["availability_id"] for row in rows} == expected


def test_missing_provider_id_does_not_invent_an_expandable_identifier(monkeypatch, seats_aero_row):
    row = seats_aero_row("united", origin="JFK", destination="SEA", day="2026-12-01",
                        YAvailable=True, YMileageCost="15000")
    del row["ID"]
    monkeypatch.setattr("backend.search._fetch_availability", lambda criteria: {"data": [row]})
    criteria = SearchCriteria(origin="JFK", destination="SEA", departure_date="2026-12-01")
    assert search_awards(criteria).results[0].availability_id is None
