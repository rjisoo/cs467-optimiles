from datetime import date, datetime, timedelta
from unittest.mock import Mock

import airportsdata
import pytest

from backend.airports import get_airport_catalog
from backend.llm.tools import run_search_tool


def test_airport_endpoint_returns_cached_catalog_without_providers(client, monkeypatch):
    provider = Mock(side_effect=AssertionError("Airport lookup must not search awards"))
    gemini = Mock(side_effect=AssertionError("Airport lookup must not call Gemini"))
    load = Mock(wraps=airportsdata.load)
    monkeypatch.setattr("backend.app.search_awards", provider)
    monkeypatch.setattr("backend.llm.gemini_chat.get_client", gemini)
    monkeypatch.setattr(airportsdata, "load", load)
    get_airport_catalog.cache_clear()
    response = client.get("/api/airports")
    assert response.status_code == 200
    body = response.get_json()
    assert body["version"] == f"airportsdata-{airportsdata.__version__}"
    assert all(set(airport) == {"code", "name", "city", "country", "timeZone"} for airport in body["airports"])
    jfk = next(airport for airport in body["airports"] if airport["code"] == "JFK")
    assert jfk["timeZone"] == "America/New_York"
    assert client.get("/api/airports").get_json() == body
    load.assert_called_once_with("IATA")
    provider.assert_not_called()
    gemini.assert_not_called()
    schema = client.get("/openapi.json").get_json()
    assert "200" in schema["paths"]["/api/airports"]["get"]["responses"]
    assert "metro" not in schema["components"]["schemas"]["Airport"]["properties"]


@pytest.mark.parametrize("field", ["origin", "destination"])
def test_unknown_airport_is_rejected_before_search(client, monkeypatch, field):
    provider = Mock(side_effect=AssertionError("Invalid airport must not search"))
    monkeypatch.setattr("backend.app.search_awards", provider)
    request = {"origin": "JFK", "destination": "SEA", "departure_date": "2026-12-01", field: " qqq "}
    response = client.post("/api/search", json=request)
    assert response.status_code == 400
    assert "catalog" in response.get_json()["details"][0]["msg"]
    provider.assert_not_called()


@pytest.mark.parametrize(("instant", "origin", "local_date"), [
    ("2028-03-01T00:30:00+00:00", "HNL", "2028-02-29"),
    ("2028-03-01T00:30:00+00:00", "HND", "2028-03-01"),
    ("2026-12-31T12:30:00+00:00", "CXI", "2027-01-01"),
    ("2026-03-08T09:30:00+00:00", "SEA", "2026-03-08"),
])
@pytest.mark.parametrize(("offset", "status"), [(-1, 400), (0, 200), (365, 200), (366, 400)])
def test_departure_horizon_uses_origin_calendar_date(client, monkeypatch, instant, origin, local_date, offset, status):
    monkeypatch.setattr("backend.airports.utc_now", lambda: datetime.fromisoformat(instant))
    departure = date.fromisoformat(local_date) + timedelta(days=offset)
    response = client.post("/api/search", json={
        "origin": origin, "destination": "JFK", "departure_date": departure.isoformat(),
    })
    assert response.status_code == status
    if status == 400:
        assert "origin-local" in response.get_json()["details"][0]["msg"]


@pytest.mark.parametrize("overrides", [{"origin": "QQQ"}, {"departure_date": "2025-12-01"}])
def test_chat_tool_uses_same_membership_and_horizon_validation(monkeypatch, overrides):
    provider = Mock(side_effect=AssertionError("Invalid criteria must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", provider)
    request = {
        "origin": "JFK", "destination": "SEA", "departure_date": "2026-12-01",
        "origin_quote": "New York", "destination_quote": "Seattle", "date_quote": "Dec 1",
    }
    payload, results = run_search_tool({**request, **overrides}, "New York to Seattle Dec 1")
    assert payload["error"] == "Invalid search criteria"
    assert results == []
    provider.assert_not_called()
