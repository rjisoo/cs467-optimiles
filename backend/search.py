"""Award search backed by the seats.aero Partner API (cached search endpoint).

search_awards() is the single entry point for both /api/search and the chat tool."""

import json
import os
import re
from datetime import date
from time import monotonic

from pydantic import ValidationError

from backend.errors import UPSTREAM_ERRORS, describe_upstream_error
from backend.ext_api import APIRouterError, APITimeout, seatsaero_api
from backend.models import Cabin, GetTripResponse, Result, SearchCriteria, SearchResponse

SEARCH_MAX_PAGES = 3
SEARCH_PAGE_SIZE = 500
SEARCH_MAX_ROWS = 1500
SEARCH_TIMEOUT_SECONDS = 20


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
    partial = response.get("partial", False)
    warnings = response.get("warnings", [])
    rows = response.get("data") or []
    results = []
    cabins = criteria.cabins or ((criteria.cabin,) if criteria.cabin is not None else tuple(_CABIN_PREFIX))
    for row in rows:
        for cabin in cabins:
            result = _to_result(row, criteria, cabin)
            if result is not None:
                results.append(result)
    if results:
        return SearchResponse(results=sorted(results, key=lambda r: r.points_cost), partial=partial, warnings=warnings)
    message = ("No matching awards were found in the pages retrieved; the search is incomplete."
               if partial else _empty_message(rows, criteria))
    return SearchResponse(results=[], message=message, partial=partial, warnings=warnings)


def _empty_message(rows: list[dict], criteria: SearchCriteria) -> str:
    """Say why nothing matched: too few seats, wrong cabin, or no availability at all."""
    dates = (f"on {criteria.departure_date}" if criteria.departure_end == criteria.departure_date
             else f"between {criteria.departure_date} and {criteria.departure_end}")
    trip = f"from {', '.join(criteria.origin_codes)} to {', '.join(criteria.destination_codes)} {dates}"
    cabins = criteria.cabins or ((criteria.cabin,) if criteria.cabin is not None else tuple(_CABIN_PREFIX))
    cabin_name = (
        " or ".join(cabin.replace("_", " ") for cabin in cabins)
        if criteria.cabins is not None or criteria.cabin is not None else None
    )
    one_seat = criteria.model_copy(update={"passengers": 1})
    if any(_to_result(row, one_seat, cabin) for row in rows for cabin in cabins):
        seat_label = f"{cabin_name.capitalize()} award seats" if cabin_name else "Award seats"
        return (
            f"{seat_label} exist {trip}, but no program reports "
            f"{criteria.passengers} seats available."
        )
    if cabin_name and any(
        _to_result(row, one_seat, cabin)
        for row in rows for cabin in _CABIN_PREFIX if cabin not in cabins
    ):
        return f"No {cabin_name} award seats {trip}. Other cabins have availability."
    return f"No award availability found {trip}."


def _fetch_availability(criteria: SearchCriteria) -> dict:
    """Bounded cached pages for one combined route/date window; first valid record ID wins."""
    if not os.getenv("SEATSAERO_TOKEN"):
        raise APIRouterError("SEATSAERO_TOKEN is not set in backend/.env")
    params = {"origin_airport": ",".join(criteria.origin_codes),
              "destination_airport": ",".join(criteria.destination_codes),
              "start_date": criteria.departure_date.isoformat(),
              "end_date": criteria.departure_end.isoformat()}
    deadline = monotonic() + SEARCH_TIMEOUT_SECONDS
    rows, warnings, seen = [], [], set()
    one_seat = criteria.model_copy(update={"passengers": 1})
    received = 0
    for page_index in range(SEARCH_MAX_PAGES):
        take = min(SEARCH_PAGE_SIZE, SEARCH_MAX_ROWS - received)
        if take <= 0:
            warnings.append("Search reached its row limit. More cached availability may exist.")
            break
        try:
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise APITimeout()
            page = seatsaero_api.cached_search({**params, "take": take}, timeout=remaining)
            if (not isinstance(page, dict) or not isinstance(page.get("data"), list)
                    or not isinstance(page.get("hasMore"), bool)):
                raise APIRouterError("Invalid availability page returned by the provider")
            new_rows, new_keys = [], set()
            skipped_rows = 0
            for row in page["data"][:take]:
                try:
                    if not isinstance(row, dict):
                        raise APIRouterError("Invalid availability record returned by the provider")
                    key = ("id", row["ID"]) if isinstance(row.get("ID"), str) and row["ID"] else (
                        "row", json.dumps(row, sort_keys=True))
                    if key in seen or key in new_keys:
                        continue
                    for cabin in _CABIN_PREFIX:
                        _to_result(row, one_seat, cabin)
                except (APIRouterError, TypeError, ValueError):
                    skipped_rows += 1
                    continue
                new_keys.add(key)
                new_rows.append(row)
        except (*UPSTREAM_ERRORS, TypeError, ValueError) as error:
            if page_index == 0:
                if isinstance(error, (TypeError, ValueError)):
                    raise APIRouterError("Invalid availability data returned by the provider") from error
                raise
            warnings.append("Search is incomplete. " + describe_upstream_error(error)[1])
            break
        if skipped_rows:
            warnings.append(f"Search skipped {skipped_rows} malformed availability records on page {page_index + 1}.")
        rows.extend(new_rows)
        seen.update(new_keys)
        received += min(len(page["data"]), take)
        if len(page["data"]) > take:
            warnings.append("Search stopped at its row limit because the provider exceeded the page size.")
            break
        if not page["hasMore"]:
            break
        if not new_rows and not skipped_rows:
            warnings.append("Search stopped because the provider returned a non-advancing page. More cached availability may exist.")
            break
        if page_index == 0:
            cursor = page.get("cursor")
            if not ((type(cursor) is int and cursor >= 0)
                    or (isinstance(cursor, str) and cursor.isascii() and cursor.isdigit())):
                warnings.append("Search stopped because the provider returned an invalid pagination cursor.")
                break
            params["cursor"] = cursor
        params["skip"] = received
    else:
        warnings.append("Search reached its page limit. More cached availability may exist.")
    return {"data": rows, "partial": bool(warnings), "warnings": warnings}


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
    route = row.get("Route")
    if route is None:
        route = {}
    if not isinstance(route, dict):
        raise APIRouterError("Invalid route returned by the provider")
    origins, destinations = criteria.origin_codes, criteria.destination_codes
    origin, destination = route.get("OriginAirport"), route.get("DestinationAirport")
    if origin is None or origin == "":
        origin = origins[0] if len(origins) == 1 else None
    if destination is None or destination == "":
        destination = destinations[0] if len(destinations) == 1 else None
    if (not isinstance(origin, str) or not re.fullmatch(r"[A-Z]{3}", origin)
            or not isinstance(destination, str) or not re.fullmatch(r"[A-Z]{3}", destination)):
        raise APIRouterError("Missing or invalid route returned by the provider")
    if origin not in origins or destination not in destinations:
        return None
    departure = row.get("Date")
    try:
        if not isinstance(departure, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", departure):
            raise ValueError("Expected YYYY-MM-DD")
        departure = date.fromisoformat(departure)
    except ValueError as error:
        raise APIRouterError("Missing or invalid departure date returned by the provider") from error
    if not criteria.departure_date <= departure <= criteria.departure_end:
        return None
    # 0 seats on an available cabin means the program didn't report a count.
    seats = row.get(f"{prefix}RemainingSeats") or None
    if seats is not None and seats < criteria.passengers:
        return None
    source = row.get("Source") or route.get("Source") or ""
    return Result(
        availability_id=row.get("ID") if isinstance(row.get("ID"), str) else None,
        program=_PROGRAM_NAMES.get(source, source),
        airline=row.get(f"{prefix}Airlines") or "Not reported",
        origin=origin,
        destination=destination,
        departure_date=departure,
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
