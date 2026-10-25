import pytest

from backend.errors import UPSTREAM_STATUS_MESSAGES
from backend.ext_api.api_exceptions import (
    APIQuotaExceeded,
    APIRouterError,
    APIStatusError,
    APITimeout,
    RateLimiterDailyQuotaExceeded,
    RateLimiterError,
    RateLimiterMonthlyQuotaExceeded,
    RateLimiterTimeout,
)
from backend.llm.tools import run_search_tool

VALID_SEARCH = {"origin": "SFO", "destination": "NRT", "departure_date": "2026-12-01"}

UPSTREAM_CASES = [
    (APITimeout(), 504),
    (RateLimiterTimeout(), 504),
    (APIQuotaExceeded(), 503),
    (RateLimiterDailyQuotaExceeded(), 503),
    (RateLimiterMonthlyQuotaExceeded(), 503),
    (APIStatusError("Server error", 500, "https://seats.aero", "/partnerapi/search"), 502),
    (APIRouterError(), 502),
    (RateLimiterError(), 502),
]


def _raise(error):
    def fake_search(criteria):
        raise error

    return fake_search


def test_unknown_route_returns_json_404(client):
    response = client.get("/api/missing")
    assert response.status_code == 404
    assert response.get_json() == {"error": "Not found"}


def test_wrong_method_returns_json_405_with_allow_header(client):
    response = client.get("/api/search")
    assert response.status_code == 405
    assert response.get_json() == {"error": "Method not allowed"}
    assert "POST" in response.headers["Allow"]


def test_unexpected_error_returns_json_500_without_details(client, monkeypatch):
    # TESTING re-raises unhandled exceptions; turn that off to see the real response.
    client.application.config["PROPAGATE_EXCEPTIONS"] = False
    monkeypatch.setattr("backend.app.search_awards", _raise(RuntimeError("secret detail")))
    response = client.post("/api/search", json=VALID_SEARCH)
    assert response.status_code == 500
    assert response.get_json() == {"error": "Internal server error"}
    assert "secret detail" not in response.get_data(as_text=True)


@pytest.mark.parametrize(("error", "status"), UPSTREAM_CASES)
def test_search_maps_upstream_errors_to_documented_status(client, monkeypatch, error, status):
    monkeypatch.setattr("backend.app.search_awards", _raise(error))
    response = client.post("/api/search", json=VALID_SEARCH)
    assert response.status_code == status
    assert response.get_json() == {"error": UPSTREAM_STATUS_MESSAGES[status]}

    responses = client.get("/openapi.json").get_json()["paths"]["/api/search"]["post"]["responses"]
    documented = responses[str(status)]["content"]["application/json"]["example"]
    assert documented == response.get_json()


@pytest.mark.parametrize(("error", "status"), UPSTREAM_CASES)
def test_chat_tool_reports_upstream_errors_to_llm(monkeypatch, error, status):
    monkeypatch.setattr("backend.llm.tools.search_awards", _raise(error))
    payload, results = run_search_tool(VALID_SEARCH)
    assert payload == {"error": UPSTREAM_STATUS_MESSAGES[status]}
    assert results == []
