"""Award search backed by the seats.aero Partner API (cached search endpoint).

search_awards() is the single entry point for both /api/search and the chat tool."""

import logging
import os

from backend.ext_api import APIRouterError, seatsaero_api
from backend.models import Cabin, Result, SearchCriteria

logger = logging.getLogger(__name__)


def cents_per_point(
    cash_price_usd: float | None, cash_fees_usd: float | None, points_cost: int
) -> float | None:
    """Value of each point in cents, or None when there is no cash price to compare."""
    if cash_price_usd is None or points_cost <= 0:
        return None
    return round((cash_price_usd - (cash_fees_usd or 0)) * 100 / points_cost, 2)


# seats.aero prefixes each cabin's fields: YMileageCost, JRemainingSeats, ...
_CABIN_PREFIX: dict[Cabin, str] = {
    "economy": "Y",
    "premium_economy": "W",
    "business": "J",
    "first": "F",
}

# seats.aero "Source" keys to display names; unknown keys fall back to the raw key.
_PROGRAM_NAMES = {
    "aeroplan": "Air Canada Aeroplan",
    "alaska": "Alaska Mileage Plan",
    "american": "American AAdvantage",
    "delta": "Delta SkyMiles",
    "emirates": "Emirates Skywards",
    "etihad": "Etihad Guest",
    "flyingblue": "Air France-KLM Flying Blue",
    "jetblue": "JetBlue TrueBlue",
    "qantas": "Qantas Frequent Flyer",
    "qatar": "Qatar Privilege Club",
    "singapore": "Singapore KrisFlyer",
    "turkish": "Turkish Miles&Smiles",
    "united": "United MileagePlus",
    "velocity": "Virgin Australia Velocity",
    "virginatlantic": "Virgin Atlantic Flying Club",
}


def search_awards(criteria: SearchCriteria) -> list[Result]:
    """Return award availability matching the criteria.

    Raises the ext_api errors (APITimeout, APIStatusError, ...) on upstream failure;
    the route and the chat tool map those to user-facing messages (backend/errors.py)."""
    response = _fetch_availability(criteria)
    if response.get("hasMore"):
        logger.info("seats.aero returned more pages; only the first is used")
    results = []
    for row in response.get("data") or []:
        result = _to_result(row, criteria)
        if result is not None:
            results.append(result)
    return sorted(results, key=lambda r: r.points_cost)


def _fetch_availability(criteria: SearchCriteria) -> dict:
    """One cached search for the departure date. Tests replace this function."""
    if not os.getenv("SEATSAERO_TOKEN"):
        raise APIRouterError("SEATSAERO_TOKEN is not set in backend/.env")
    day = criteria.departure_date.isoformat()
    return seatsaero_api.cached_search(
        {
            "origin_airport": criteria.origin,
            "destination_airport": criteria.destination,
            "start_date": day,
            "end_date": day,
        }
    )


def _to_result(row: dict, criteria: SearchCriteria) -> Result | None:
    """Map one seats.aero availability row to a Result, or None if it doesn't match."""
    prefix = _CABIN_PREFIX[criteria.cabin]
    if not row.get(f"{prefix}Available"):
        return None
    try:
        points_cost = int(row.get(f"{prefix}MileageCost") or 0)
    except (TypeError, ValueError):
        return None
    if points_cost <= 0:
        return None
    # 0 seats on an available cabin means the program didn't report a count.
    seats = row.get(f"{prefix}RemainingSeats") or None
    if seats is not None and seats < criteria.passengers:
        return None

    route = row.get("Route") or {}
    source = row.get("Source") or route.get("Source") or ""
    return Result(
        program=_PROGRAM_NAMES.get(source, source),
        airline=row.get(f"{prefix}Airlines") or "Not reported",
        origin=route.get("OriginAirport") or criteria.origin,
        destination=route.get("DestinationAirport") or criteria.destination,
        departure_date=row.get("Date") or criteria.departure_date,
        cabin=criteria.cabin,
        points_cost=points_cost,
        # Cached search reports neither taxes nor a cash fare, so these stay unknown.
        cash_fees_usd=None,
        seats_available=seats,
        cents_per_point=None,
    )
