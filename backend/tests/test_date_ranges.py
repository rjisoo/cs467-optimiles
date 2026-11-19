from datetime import date, datetime
from unittest.mock import Mock

import pytest

from backend.models import SearchResponse

REQUEST = {"origin": "JFK", "destination": "SEA", "departure_date": "2026-12-01"}


@pytest.mark.parametrize("fields", [{}, {"departure_date_end": None}, {"departure_date_end": "2026-12-01"}])
def test_direct_search_keeps_exact_date_compatibility(client, monkeypatch, fields):
    search = Mock(return_value=SearchResponse(results=[]))
    monkeypatch.setattr("backend.app.search_awards", search)
    assert client.post("/api/search", json={**REQUEST, **fields}).status_code == 200
    criteria = search.call_args.args[0]
    assert criteria.departure_end == criteria.departure_date == date(2026, 12, 1)
    assert criteria.return_date is None


@pytest.mark.parametrize(("start", "end", "days"), [
    ("2026-12-01", "2027-11-26", 361),
    ("2026-12-01", "2027-12-01", 366),
    ("2026-12-28", "2027-01-03", 7),
    ("2028-02-28", "2028-03-01", 3),
])
def test_ranges_count_inclusive_calendar_days(client, monkeypatch, start, end, days):
    monkeypatch.setattr("backend.airports.utc_now", lambda: datetime.fromisoformat(f"{start}T12:00:00+00:00"))
    search = Mock(return_value=SearchResponse(results=[]))
    monkeypatch.setattr("backend.app.search_awards", search)
    response = client.post("/api/search", json={**REQUEST, "departure_date": start, "departure_date_end": end})
    assert response.status_code == 200
    criteria = search.call_args.args[0]
    assert criteria.departure_end == date.fromisoformat(end)
    assert (criteria.departure_end - criteria.departure_date).days + 1 == days


@pytest.mark.parametrize(("start", "end", "message"), [
    ("2026-11-01", "2027-11-02", "origin-local"),
    ("2026-12-01", "2026-11-30", "on or after"),
    ("2026-12-01", "2026-12-32", None),
    ("2026-12-01", "invalid", None),
    ("2027-02-28", "2027-02-29", None),
])
def test_invalid_ranges_never_search(client, monkeypatch, start, end, message):
    search = Mock(side_effect=AssertionError("Invalid ranges must not search"))
    monkeypatch.setattr("backend.app.search_awards", search)
    response = client.post("/api/search", json={**REQUEST, "departure_date": start, "departure_date_end": end})
    assert response.status_code == 400
    body = response.get_json()
    assert body["error"] == "Invalid request"
    if message:
        assert message in body["details"][0]["msg"]
    else:
        assert body["details"][0]["loc"] == ["departure_date_end"]
    search.assert_not_called()


@pytest.mark.parametrize("origins", [["HNL", "HND"], ["HND", "HNL"]])
@pytest.mark.parametrize(("start", "end", "status"), [
    ("2028-02-29", "2028-03-02", 400),
    ("2028-03-01", "2028-03-02", 200),
    ("2029-02-20", "2029-02-28", 200),
    ("2029-02-20", "2029-03-01", 400),
])
def test_both_range_endpoints_fit_every_origin_at_one_instant(client, monkeypatch, origins, start, end, status):
    clock = Mock(return_value=datetime.fromisoformat("2028-03-01T00:30:00+00:00"))
    search = Mock(return_value=SearchResponse(results=[]))
    monkeypatch.setattr("backend.airports.utc_now", clock)
    monkeypatch.setattr("backend.app.search_awards", search)
    response = client.post("/api/search", json={**REQUEST, "origin": origins,
                                              "departure_date": start, "departure_date_end": end})
    assert response.status_code == status
    clock.assert_called_once_with()
    if status == 400:
        assert "every origin" in response.get_json()["details"][0]["msg"]
        search.assert_not_called()
    else:
        search.assert_called_once()
