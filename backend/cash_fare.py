"""Cash fares from SerpApi's Google Flights engine, for comparing against award costs.

- build_params(): the query for one one-way, one-adult search (pure).
- cheapest_cash_fare(): the lowest valid USD price in a response, or None (pure).
- lookup_cash_fare(): one cached network lookup; None on any failure.

The fare is the cheapest cash ticket for the same route, date and cabin, not
necessarily the same flight as the award, so callers should present it as an estimate.
Response shape follows https://serpapi.com/google-flights-api (checked 2026-11-19 and
against a live response, tests/fixtures/serpapi_ord_nrt_business_2026-12-01.json).

SerpApi's free plan allows 250 searches a month. Successful responses are cached in
memory for CACHE_TTL_SECONDS, and search.py caps lookups per search.
"""

import logging
import math
import os
import re
import threading
from pathlib import Path
from time import monotonic

import httpx
from dotenv import load_dotenv

from backend.models import Cabin

logger = logging.getLogger(__name__)


class _RedactApiKey(logging.Filter):
    """httpx logs each request URL at INFO, and SerpApi takes the key as a URL parameter;
    the root logger writes INFO to backend/logs, so strip the key before it gets there."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "api_key=" in message:
            record.msg = re.sub(r"api_key=[^&\s\"']+", "api_key=REDACTED", message)
            record.args = ()
        return True


logging.getLogger("httpx").addFilter(_RedactApiKey())

load_dotenv(Path(__file__).resolve().parent / ".env")

SERPAPI_URL = "https://serpapi.com/search"
LOOKUP_TIMEOUT_SECONDS = 10.0
CACHE_TTL_SECONDS = 6 * 60 * 60

# (origin, destination, date, cabin) -> (stored at, fare or None for "no fare found")
_cache: dict[tuple[str, str, str, str], tuple[float, float | None]] = {}
_cache_lock = threading.Lock()

# SerpApi travel_class values.
_TRAVEL_CLASS: dict[Cabin, str] = {
    "economy": "1",
    "premium_economy": "2",
    "business": "3",
    "first": "4",
}

# Segment travel_class text (e.g. "Business Class"), normalized by _normalize_class(),
# ranked low to high. US airlines sell the domestic front cabin as "First", so a
# business itinerary often has a First leg; higher cabins count as the requested one.
_CLASS_RANK: dict[str, int] = {
    "economy": 0,
    "premium economy": 1,
    "business": 2,
    "first": 3,
}
_CABIN_RANK: dict[Cabin, int] = {
    "economy": 0,
    "premium_economy": 1,
    "business": 2,
    "first": 3,
}


def build_params(origin: str, destination: str, departure_date: str, cabin: Cabin) -> dict:
    """Query parameters for a one-way search (api_key is added by the caller).

    Always one adult: award points are quoted per person, so the cash fare must be too.
    """
    return {
        "engine": "google_flights",
        "departure_id": origin,
        "arrival_id": destination,
        "outbound_date": departure_date,
        "type": "2",  # one way
        "travel_class": _TRAVEL_CLASS[cabin],
        "adults": "1",
        "currency": "USD",
        "hl": "en",
        "gl": "us",
    }


def lookup_cash_fare(origin: str, destination: str, departure_date: str, cabin: Cabin) -> float | None:
    """Cheapest cash fare from SerpApi, or None without a key, on failure, or with no fare.

    Never raises: the value rating is extra information, so a failed lookup must not
    break the award search. Only successful responses are cached (including "no fare"),
    so a timeout or quota error is retried on a later search."""
    api_key = os.getenv("SERPAPI_KEY")
    if not api_key:
        return None
    key = (origin, destination, departure_date, cabin)
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None and monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    params = {**build_params(origin, destination, departure_date, cabin), "api_key": api_key}
    try:
        reply = httpx.get(SERPAPI_URL, params=params, timeout=LOOKUP_TIMEOUT_SECONDS)
        if reply.status_code != 200:
            # Never log the URL: it contains the api_key.
            logger.warning("SerpApi returned HTTP %s for %s-%s %s %s",
                           reply.status_code, origin, destination, departure_date, cabin)
            return None
        body = reply.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.warning("SerpApi lookup failed for %s-%s %s %s: %s",
                       origin, destination, departure_date, cabin, type(error).__name__)
        return None

    fare = cheapest_cash_fare(body, cabin)
    with _cache_lock:
        _cache[key] = (monotonic(), fare)
    return fare


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def cheapest_cash_fare(response: object, cabin: Cabin) -> float | None:
    """Lowest valid USD price across best_flights and other_flights, or None.

    Skips itineraries with a missing or non-positive price, and itineraries with any
    segment in a different cabin (Google sometimes mixes cabins). Returns None for
    error responses, non-USD responses, or anything that isn't the documented shape.
    """
    if not isinstance(response, dict):
        return None
    params = response.get("search_parameters")
    params = params if isinstance(params, dict) else {}
    if params.get("currency", "USD") != "USD":
        return None
    # SerpApi echoes travel_class (as an int); a response for another cabin doesn't count.
    echoed_class = params.get("travel_class")
    if echoed_class is not None and str(echoed_class) != _TRAVEL_CLASS[cabin]:
        return None

    prices = [
        itinerary["price"]
        for key in ("best_flights", "other_flights")
        for itinerary in _as_list(response.get(key))
        if _valid_price(itinerary) and _all_segments_in_cabin(itinerary, cabin)
    ]
    return float(min(prices)) if prices else None


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _valid_price(itinerary: object) -> bool:
    if not isinstance(itinerary, dict):
        return False
    price = itinerary.get("price")
    # bool is a subclass of int in Python, so exclude it explicitly.
    return (isinstance(price, (int, float)) and not isinstance(price, bool)
            and 0 < price <= 90071992547409.91 and math.isfinite(price))


def _all_segments_in_cabin(itinerary: dict, cabin: Cabin) -> bool:
    """True unless a segment reports a lower or unrecognized cabin.

    Segments in a higher cabin count (a First domestic leg on a business trip), and
    segments with no reported cabin are accepted."""
    wanted = _CABIN_RANK[cabin]
    for segment in _as_list(itinerary.get("flights")):
        travel_class = segment.get("travel_class") if isinstance(segment, dict) else None
        if not isinstance(travel_class, str):
            continue
        rank = _CLASS_RANK.get(_normalize_class(travel_class))
        if rank is None or rank < wanted:
            return False
    return True


def _normalize_class(text: str) -> str:
    """'Business Class' -> 'business', 'Premium economy' -> 'premium economy'."""
    text = text.strip().lower()
    return text.removesuffix(" class").strip()
