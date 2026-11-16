from unittest.mock import Mock

import pytest

from backend import search
from backend.ext_api import APIRouterError, APITimeout
from backend.models import StructuredSearchCriteria

REAL_FETCH = search._fetch_availability


def criteria():
    return StructuredSearchCriteria(origin=["JFK", "LGA"], destination=["LHR", "CDG"],
                                    departure_date="2026-12-01", departure_date_end="2026-12-03")


def row(identifier):
    return {"ID": identifier, "Date": "2026-12-01", "Route": {"OriginAirport": "JFK", "DestinationAirport": "LHR"},
            "YAvailable": True, "YMileageCost": "10000", "JAvailable": True, "JMileageCost": "20000"}


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setenv("SEATSAERO_TOKEN", "test-token")
    provider = Mock()
    monkeypatch.setattr(search, "_fetch_availability", REAL_FETCH)
    monkeypatch.setattr(search.seatsaero_api, "cached_search", provider)
    return provider


def test_reuses_first_cursor_counts_raw_skip_and_deduplicates_before_mapping(provider):
    anonymous = row(None)
    provider.side_effect = [
        {"data": [row("a"), row("a"), anonymous], "hasMore": True, "cursor": 123, "moreURL": "https://untrusted.invalid"},
        {"data": [row("b"), {**row("a"), "YMileageCost": "99999"}, dict(reversed(list(anonymous.items())))],
         "hasMore": True, "cursor": 456},
        {"data": [row("c")], "hasMore": False},
    ]
    response = search.search_awards(criteria())
    assert not response.partial and response.warnings == []
    assert len(response.results) == 8
    assert {(item.availability_id, item.cabin) for item in response.results} == {
        (identifier, cabin) for identifier in ("a", "b", "c", None) for cabin in ("economy", "business")}
    assert next(item.points_cost for item in response.results if item.availability_id == "a" and item.cabin == "economy") == 10000
    base = {"origin_airport": "JFK,LGA", "destination_airport": "LHR,CDG",
            "start_date": "2026-12-01", "end_date": "2026-12-03", "take": 500}
    assert [call.args[0] for call in provider.call_args_list] == [base, {**base, "cursor": 123, "skip": 3},
                                                               {**base, "cursor": 123, "skip": 6}]
    timeouts = [call.kwargs["timeout"] for call in provider.call_args_list]
    assert all(0 < timeout <= 20 for timeout in timeouts) and timeouts == sorted(timeouts, reverse=True)


@pytest.mark.parametrize("failure", [None, [], {}, {"data": None}, {"data": []}, {"data": [None]},
                                    {"data": [], "hasMore": "yes"}, APIRouterError("failed"), APITimeout("slow"),
                                    ValueError("Invalid JSON"),
                                    {"data": [row("b"), {**row("bad"), "Date": None}], "hasMore": False}])
@pytest.mark.parametrize("later", [False, True])
def test_first_page_failures_raise_and_later_failures_preserve_collected_rows(provider, failure, later):
    provider.side_effect = ([{"data": [row("a")], "hasMore": True, "cursor": "123"}] if later else []) + [failure]
    if later:
        response = REAL_FETCH(criteria())
        assert response["partial"] and response["warnings"] and response["data"] == [row("a")]
    else:
        with pytest.raises((APIRouterError, APITimeout)):
            REAL_FETCH(criteria())
    assert provider.call_count == (2 if later else 1)


def test_partial_empty_response_does_not_claim_no_awards_exist(client, provider):
    provider.side_effect = [{"data": [{**row("outside"), "Date": "2026-12-04"}], "hasMore": True, "cursor": 123},
                            APITimeout("slow")]
    response = client.post("/api/search", json=criteria().model_dump(mode="json"))
    assert response.status_code == 200
    body = response.get_json()
    assert body["results"] == [] and body["partial"] and body["warnings"]
    assert "search is incomplete" in body["message"]


@pytest.mark.parametrize(("kind", "calls", "ids"), [
    ("pages", 3, {"a", "b", "c"}), ("rows", 1, {"a", "b"}),
    ("repeat", 2, {"a"}), ("empty", 1, set()), ("cursor", 1, {"a"}),
])
def test_budgets_and_nonadvancing_pages_stop_with_partial_metadata(monkeypatch, provider, kind, calls, ids):
    pages = [{"data": [row(identifier)], "hasMore": True, "cursor": 123} for identifier in "abc"]
    if kind == "rows":
        monkeypatch.setattr(search, "SEARCH_MAX_ROWS", 2)
        pages = [{"data": [row(identifier) for identifier in "abc"], "hasMore": False}]
    elif kind == "repeat":
        pages = [pages[0], pages[0]]
    elif kind == "empty":
        pages = [{"data": [], "hasMore": True, "cursor": 123}]
    elif kind == "cursor":
        pages = [{"data": [row("a")], "hasMore": True, "cursor": True}]
    provider.side_effect = pages
    response = search.search_awards(criteria())
    assert response.partial and response.warnings
    assert {item.availability_id for item in response.results} == ids
    assert provider.call_count == calls
    if kind == "rows":
        assert provider.call_args.args[0]["take"] == 2
    if not ids:
        assert response.message == "No matching awards were found in the pages retrieved; the search is incomplete."


@pytest.mark.parametrize("before_first", [True, False])
def test_total_deadline_prevents_calls_or_preserves_completed_pages(monkeypatch, provider, before_first):
    clock = Mock(side_effect=[0, 21] if before_first else None, return_value=0)
    monkeypatch.setattr(search, "monotonic", clock)

    def complete_page(*args, **kwargs):
        clock.return_value = 21
        return {"data": [row("a")], "hasMore": True, "cursor": 123}

    provider.side_effect = complete_page
    if before_first:
        with pytest.raises(APITimeout):
            REAL_FETCH(criteria())
        provider.assert_not_called()
    else:
        response = REAL_FETCH(criteria())
        assert response["partial"] and response["warnings"] and response["data"] == [row("a")]
        provider.assert_called_once()
