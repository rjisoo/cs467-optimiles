"""Value ratings on search results (backend/search.py add_value_ratings).

The canned seats.aero rows (conftest.fake_availability) for SFO-NRT 2026-12-01:
business: Aeroplan 75,000 (fees not reported), United 88,000 + $5.60
economy:  Flying Blue 30,000, United 35,000, Aeroplan 40,000 (economy fees not reported)
"""

from datetime import date

import pytest

from backend import cash_fare
from backend.models import SearchCriteria
from backend.search import search_awards
from backend.value import SUMMARY_VALUE_WARNING


def criteria(**overrides):
    fields = {"origin": "SFO", "destination": "NRT", "departure_date": date(2026, 12, 1)}
    return SearchCriteria(**{**fields, **overrides})


@pytest.fixture
def fares(monkeypatch):
    """Cash fares by cabin; records every lookup."""
    table = {"business": 2000.0, "economy": 400.0}
    calls = []

    def lookup(origin, destination, day, cabin):
        calls.append((origin, destination, day, cabin))
        return table.get(cabin)

    monkeypatch.setattr(cash_fare, "lookup_cash_fare", lookup)
    return table, calls


def by_program(results):
    return {r.program: r for r in results}


def test_summary_minima_are_never_rated_even_with_known_fare_and_fees(fares):
    results = by_program(search_awards(criteria(cabin="business", passengers=2)).results)
    for program, source in [("United MileagePlus", "united"), ("Air Canada Aeroplan", "aeroplan")]:
        result = results[program]
        assert (result.cash_fare_usd, result.cents_per_point, result.value_rating, result.value_warning) == (
            2000.0, None, None, SUMMARY_VALUE_WARNING)
        assert (result.source, result.search_passengers) == (source, 2)


def test_independent_minima_do_not_invent_a_high_value_award(fares, monkeypatch, seats_aero_row):
    # Actual awards could be 60k + $600 or 100k + $50. Neither is 60k + $50.
    from backend import search
    fares[0]["business"] = 1200
    row = seats_aero_row("united", origin="SFO", destination="NRT", day="2026-12-01",
                        JAvailable=True, JMileageCost=60000, JTotalTaxes=5000)
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": [row]})
    [result] = search_awards(criteria(cabin="business")).results
    assert (result.points_cost, result.cash_fees_usd, result.cash_fare_usd) == (60000, 50, 1200)
    assert (result.cents_per_point, result.value_rating) == (None, None)


def test_one_lookup_per_route_date_cabin(fares):
    _, calls = fares
    search_awards(criteria())  # all cabins: 3 economy rows + 2 business rows
    assert sorted(calls) == [("SFO", "NRT", "2026-12-01", "business"), ("SFO", "NRT", "2026-12-01", "economy")]


def test_no_fare_leaves_value_fields_null(fares):
    fares[0].clear()
    for result in search_awards(criteria()).results:
        assert (result.cash_fare_usd, result.cents_per_point, result.value_rating, result.value_warning) == (
            None, None, None, None)


def test_lookup_cap_follows_cheapest_points_first(fares, monkeypatch):
    _, calls = fares
    monkeypatch.setenv("SERPAPI_LOOKUPS_PER_SEARCH", "1")
    results = search_awards(criteria()).results
    assert calls == [("SFO", "NRT", "2026-12-01", "economy")]  # Flying Blue 30,000 economy comes first
    assert all(r.value_rating is None for r in results if r.cabin == "business")
    assert all(r.cash_fare_usd is not None for r in results if r.cabin == "economy")


@pytest.mark.parametrize("setting", ["0", "-3"])
def test_lookups_can_be_disabled(fares, monkeypatch, setting):
    _, calls = fares
    monkeypatch.setenv("SERPAPI_LOOKUPS_PER_SEARCH", setting)
    search_awards(criteria())
    assert calls == []


def test_bad_lookup_setting_uses_default(fares, monkeypatch):
    _, calls = fares
    monkeypatch.setenv("SERPAPI_LOOKUPS_PER_SEARCH", "lots")
    search_awards(criteria())
    assert len(calls) == 2


def test_empty_results_make_no_lookups(fares, monkeypatch):
    from backend import search

    _, calls = fares
    monkeypatch.setattr(search, "_fetch_availability", lambda _: {"data": []})
    assert search_awards(criteria()).results == []
    assert calls == []


def test_api_search_returns_value_fields(client, fares):
    response = client.post(
        "/api/search", json={"origin": "SFO", "destination": "NRT", "departure_date": "2026-12-01", "cabin": "business"}
    )
    assert response.status_code == 200
    united = next(r for r in response.get_json()["results"] if r["program"] == "United MileagePlus")
    assert {k: united[k] for k in ("cash_fare_usd", "cents_per_point", "value_rating", "value_warning")} == {
        "cash_fare_usd": 2000.0, "cents_per_point": None, "value_rating": None, "value_warning": SUMMARY_VALUE_WARNING}


def test_chat_tool_passes_value_fields_to_the_llm(fares):
    from backend.llm.tools import run_search_tool

    user_text = "Business class from Chicago to Tokyo on Dec 1"
    args = {"origin": "ORD", "destination": "HND", "departure_date": "2026-12-01", "cabin": "business",
            "origin_quote": "Chicago", "destination_quote": "Tokyo", "date_quote": "Dec 1",
            "cabin_quote": "Business class"}
    payload, _ = run_search_tool(args, user_text)
    united = next(r for r in payload["results"] if r["program"] == "United MileagePlus")
    assert (united["cash_fare_usd"], united["value_rating"]) == (2000.0, None)


def test_system_prompt_forbids_inventing_ratings():
    from backend.llm.gemini_chat import SYSTEM_PROMPT

    assert "If value_rating is null" in SYSTEM_PROMPT
    assert "never rate it yourself" in SYSTEM_PROMPT


@pytest.mark.parametrize("fare", [True, float("inf"), float("nan"), -1, 0, 90071992547410])
def test_invalid_cash_fare_never_replaces_usable_award_results(fares, fare):
    fares[0]["business"] = fare
    results = search_awards(criteria(cabin="business")).results
    assert results
    assert all(r.cash_fare_usd is None and r.value_rating is None for r in results)
