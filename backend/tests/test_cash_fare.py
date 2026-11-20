"""Tests for backend/cash_fare.py.

The inline fixtures follow the shape in SerpApi's Google Flights docs. The JSON in
tests/fixtures/ is a recorded live response (api_key and account links removed).
"""

import json
import logging
from pathlib import Path

import httpx
import pytest

from backend import cash_fare
from backend.cash_fare import build_params, cheapest_cash_fare

FIXTURES = Path(__file__).parent / "fixtures"

# Captured at import, before the autouse no_cash_fares fixture replaces it.
REAL_LOOKUP = cash_fare.lookup_cash_fare


@pytest.mark.parametrize("price", [float("inf"), float("nan"), 90071992547410])
def test_nonfinite_or_unsafe_prices_are_not_cash_fares(price):
    assert cheapest_cash_fare({"best_flights": [{"price": price}]}, "economy") is None


def live_fixture():
    return json.loads((FIXTURES / "serpapi_ord_nrt_business_2026-12-01.json").read_text(encoding="utf-8"))


class FakeReply:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@pytest.fixture
def fake_get(monkeypatch):
    """Replace httpx.get; set .reply (FakeReply or exception) and read .calls."""

    class FakeGet:
        reply = FakeReply(body=live_fixture())
        calls = []

        def __call__(self, url, params, timeout):
            self.calls.append(params)
            if isinstance(self.reply, Exception):
                raise self.reply
            return self.reply

    fake = FakeGet()
    fake.calls = []
    monkeypatch.setattr(cash_fare.httpx, "get", fake)
    monkeypatch.setenv("SERPAPI_KEY", "test-key")
    return fake


def test_lookup_without_key_makes_no_request(fake_get, monkeypatch):
    monkeypatch.delenv("SERPAPI_KEY")
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") is None
    assert fake_get.calls == []


def test_lookup_sends_params_with_key_and_caches(fake_get):
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") == 3480.0
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") == 3480.0
    assert fake_get.calls == [{**build_params("ORD", "NRT", "2026-12-01", "business"), "api_key": "test-key"}]


def test_lookup_caches_no_fare(fake_get):
    fake_get.reply = FakeReply(body={"search_parameters": {"currency": "USD"}, "error": "No results."})
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") is None
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") is None
    assert len(fake_get.calls) == 1


@pytest.mark.parametrize(
    "reply",
    [
        FakeReply(status_code=429, body={"error": "Your account has run out of searches."}),
        FakeReply(status_code=401, body={"error": "Invalid API key."}),
        FakeReply(body=ValueError("not JSON")),
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("offline"),
    ],
)
def test_lookup_failures_return_none_and_are_retried(fake_get, reply):
    fake_get.reply = reply
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") is None
    assert REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business") is None
    assert len(fake_get.calls) == 2  # failures are not cached


def test_cache_expires(fake_get, monkeypatch):
    REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business")
    later = cash_fare.monotonic() + cash_fare.CACHE_TTL_SECONDS + 1
    monkeypatch.setattr(cash_fare, "monotonic", lambda: later)
    REAL_LOOKUP("ORD", "NRT", "2026-12-01", "business")
    assert len(fake_get.calls) == 2


def test_httpx_request_logs_hide_the_key(caplog):
    caplog.set_level(logging.INFO, logger="httpx")
    logging.getLogger("httpx").info(
        'HTTP Request: %s %s "%s"', "GET",
        "https://serpapi.com/search?engine=google_flights&api_key=secret123&hl=en", "HTTP/1.1 200 OK",
    )
    assert "secret123" not in caplog.text
    assert "api_key=REDACTED&hl=en" in caplog.text


def test_live_response_ord_nrt_business():
    """Recorded 2026-11-19: ORD-NRT business, one way, 2026-12-01. Google's lowest_price was 3480."""
    body = live_fixture()
    assert cheapest_cash_fare(body, "business") == 3480.0
    assert cheapest_cash_fare(body, "economy") is None  # no economy segments in a business search


def itinerary(price, *classes):
    """One itinerary with a segment per travel_class (no classes = one unlabeled segment)."""
    segments = [{"travel_class": c} for c in classes] or [{}]
    return {"price": price, "type": "One way", "flights": segments}


def response(best=None, other=None, currency="USD", **extra):
    body = {"search_metadata": {"status": "Success"}, "search_parameters": {"currency": currency}}
    if best is not None:
        body["best_flights"] = best
    if other is not None:
        body["other_flights"] = other
    body.update(extra)
    return body


@pytest.mark.parametrize(
    "body, cabin, expected",
    [
        # Normal cases
        (response(best=[itinerary(900, "Business")], other=[itinerary(750, "Business")]), "business", 750.0),
        (response(best=[itinerary(520, "Economy")]), "economy", 520.0),
        (response(other=[itinerary(1100, "Business"), itinerary(980, "Business")]), "business", 980.0),  # no best_flights
        (response(best=[itinerary(450.5, "Economy")]), "economy", 450.5),  # float price kept
        # Cabin matching
        (response(best=[itinerary(1500, "Business Class")]), "business", 1500.0),  # " Class" suffix
        (response(best=[itinerary(800, "Premium economy")]), "premium_economy", 800.0),
        (response(best=[itinerary(3000, "First Class")]), "first", 3000.0),
        (response(best=[itinerary(400, "Economy", "Business"), itinerary(1200, "Business")]), "business", 1200.0),  # lower-cabin leg skipped
        (response(best=[itinerary(1000, "First Class", "Business Class")]), "business", 1000.0),  # higher-cabin leg counts
        (response(best=[itinerary(2000, "First Class", "Business Class")]), "first", None),  # downgrade leg skipped
        (response(best=[itinerary(900, "Business", "Sleeper pod"), itinerary(1300, "Business")]), "business", 1300.0),  # unknown label skipped
        (response(best=[itinerary(700)]), "business", 700.0),  # cabin not reported: accepted
        # Invalid prices are skipped
        (response(best=[{"type": "One way"}, itinerary(650, "Economy")]), "economy", 650.0),  # missing price
        (response(best=[itinerary(None, "Economy"), itinerary(600, "Economy")]), "economy", 600.0),
        (response(best=[itinerary(0, "Economy"), itinerary(610, "Economy")]), "economy", 610.0),
        (response(best=[itinerary(-5, "Economy"), itinerary(620, "Economy")]), "economy", 620.0),
        (response(best=[itinerary("$500", "Economy"), itinerary(630, "Economy")]), "economy", 630.0),
        (response(best=[itinerary(True, "Economy"), itinerary(640, "Economy")]), "economy", 640.0),  # bool is not a price
        # No usable fare
        (response(best=[itinerary(0, "Economy")]), "economy", None),  # every price invalid
        (response(best=[itinerary(400, "Economy")]), "business", None),  # only the wrong cabin
        (response(best=[], other=[]), "economy", None),
        (response(error="Google Flights hasn't returned any results for this query."), "economy", None),
        (response(best=[itinerary(450, "Economy")], currency="EUR"), "economy", None),  # not USD
        ({"error": "Invalid API key."}, "economy", None),
        (None, "economy", None),
        ("not json", "economy", None),
        (response(best="oops"), "economy", None),  # wrong type for the list
    ],
)
def test_cheapest_cash_fare(body, cabin, expected):
    assert cheapest_cash_fare(body, cabin) == expected


@pytest.mark.parametrize("echoed, expected", [(3, 900.0), ("3", 900.0), (1, None), (None, 900.0)])
def test_echoed_travel_class_must_match(echoed, expected):
    body = response(best=[itinerary(900, "Business")])
    if echoed is not None:
        body["search_parameters"]["travel_class"] = echoed
    assert cheapest_cash_fare(body, "business") == expected


def test_currency_defaults_to_usd_when_not_echoed():
    assert cheapest_cash_fare({"best_flights": [itinerary(500, "Economy")]}, "economy") == 500.0


@pytest.mark.parametrize(
    "cabin, travel_class",
    [("economy", "1"), ("premium_economy", "2"), ("business", "3"), ("first", "4")],
)
def test_build_params_maps_cabin(cabin, travel_class):
    assert build_params("ORD", "NRT", "2026-12-01", cabin)["travel_class"] == travel_class


def test_build_params_one_way_one_adult_usd():
    params = build_params("ORD", "NRT", "2026-12-01", "business")
    assert params == {
        "engine": "google_flights",
        "departure_id": "ORD",
        "arrival_id": "NRT",
        "outbound_date": "2026-12-01",
        "type": "2",
        "travel_class": "3",
        "adults": "1",
        "currency": "USD",
        "hl": "en",
        "gl": "us",
    }
    assert "return_date" not in params  # SerpApi rejects return_date on one-way searches
    assert "api_key" not in params  # added by the caller, never stored here
