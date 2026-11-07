"""Award search backed by the seats.aero Partner API (cached search endpoint).

search_awards() is the single entry point for both /api/search and the chat tool."""

import logging
import os

from pydantic import ValidationError

from backend.ext_api import APIRouterError, seatsaero_api
from backend.models import Cabin, GetTripResponse, Result, SearchCriteria, SearchResponse

logger = logging.getLogger(__name__)


def get_availability_trips(availability_id: str) -> GetTripResponse:
    """Load and validate trip details for one provider availability record."""
    if not os.getenv("SEATSAERO_TOKEN"):
        raise APIRouterError("SEATSAERO_TOKEN is not set in backend/.env")
    payload = seatsaero_api.get_trip_to_client_json(availability_id, {})
    try:
        response = GetTripResponse.model_validate({**payload, "availability_id": availability_id})
        if any(trip.availability_id != availability_id for trip in response.trips):
            raise ValueError("Trip availability ID does not match the requested record")
        for trip in response.trips:
            # Blank trip currency follows the provider's USD default. Explicit
            # foreign currencies require an exchange rate and stay unconverted.
            currency = (trip.taxes_currency or "USD").strip().upper() or "USD"
            if trip.taxes_minor is not None and currency == "USD":
                trip.cash_fees_usd = trip.taxes_minor / 100
        return response
    except (ValidationError, TypeError, ValueError) as error:
        raise APIRouterError("Invalid trip details returned by the provider") from error


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
    "lifemiles": "Avianca LifeMiles",
    "qantas": "Qantas Frequent Flyer",
    "qatar": "Qatar Privilege Club",
    "singapore": "Singapore KrisFlyer",
    "smiles": "GOL Smiles",
    "turkish": "Turkish Miles&Smiles",
    "united": "United MileagePlus",
    "velocity": "Virgin Australia Velocity",
    "virginatlantic": "Virgin Atlantic Flying Club",
}


def search_awards(criteria: SearchCriteria) -> SearchResponse:
    """Return award availability matching the criteria, with a message when there is none.

    Raises the ext_api errors (APITimeout, APIStatusError, ...) on upstream failure;
    the route and the chat tool map those to user-facing messages (backend/errors.py)."""
    response = _fetch_availability(criteria)
    if response.get("hasMore"):
        logger.info("seats.aero returned more pages; only the first is used")
    rows = response.get("data") or []
    results = []
    cabins = (criteria.cabin,) if criteria.cabin is not None else tuple(_CABIN_PREFIX)
    for row in rows:
        for cabin in cabins:
            result = _to_result(row, criteria, cabin)
            if result is not None:
                results.append(result)
    if results:
        return SearchResponse(results=sorted(results, key=lambda r: r.points_cost))
    return SearchResponse(results=[], message=_empty_message(rows, criteria))


def _empty_message(rows: list[dict], criteria: SearchCriteria) -> str:
    """Say why nothing matched: too few seats, wrong cabin, or no availability at all."""
    trip = f"from {criteria.origin} to {criteria.destination} on {criteria.departure_date}"
    cabin_name = criteria.cabin.replace("_", " ") if criteria.cabin is not None else None
    cabins = (criteria.cabin,) if criteria.cabin is not None else tuple(_CABIN_PREFIX)
    one_seat = criteria.model_copy(update={"passengers": 1})
    if any(_to_result(row, one_seat, cabin) for row in rows for cabin in cabins):
        seat_label = f"{cabin_name.capitalize()} award seats" if cabin_name else "Award seats"
        return (
            f"{seat_label} exist {trip}, but no program reports "
            f"{criteria.passengers} seats available."
        )
    if cabin_name and any(
        _to_result(row, one_seat, cabin)
        for row in rows for cabin in _CABIN_PREFIX if cabin != criteria.cabin
    ):
        return f"No {cabin_name} award seats {trip}. Other cabins have availability."
    return f"No award availability found {trip}."


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


def _to_result(row: dict, criteria: SearchCriteria, cabin: Cabin) -> Result | None:
    """Map one cabin of a seats.aero availability row, or None if it doesn't match."""
    prefix = _CABIN_PREFIX[cabin]
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
        availability_id=row.get("ID") if isinstance(row.get("ID"), str) else None,
        program=_PROGRAM_NAMES.get(source, source),
        airline=row.get(f"{prefix}Airlines") or "Not reported",
        origin=route.get("OriginAirport") or criteria.origin,
        destination=route.get("DestinationAirport") or criteria.destination,
        departure_date=row.get("Date") or criteria.departure_date,
        cabin=cabin,
        points_cost=points_cost,
        cash_fees_usd=_fees_usd(row, prefix),
        seats_available=seats,
        # Cached search has no cash fare to compare against.
        cents_per_point=None,
    )


def _fees_usd(row: dict, prefix: str) -> float | None:
    """Taxes in dollars, or None when unreported (0) or not in USD (no conversion).

    seats.aero reports {c}TotalTaxes in cents of TaxesCurrency (US departure fee = 560)."""
    taxes = row.get(f"{prefix}TotalTaxes")
    if row.get("TaxesCurrency") != "USD" or not isinstance(taxes, int) or taxes <= 0:
        return None
    return taxes / 100
