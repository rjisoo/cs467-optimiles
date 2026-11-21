"""Award search backed by the seats.aero Partner API (cached search endpoint).

search_awards() is the single entry point for both /api/search and the chat tool."""

import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from time import monotonic

from pydantic import ValidationError

from backend import cash_fare
from backend.errors import UPSTREAM_ERRORS, describe_upstream_error
from backend.ext_api import APIRouterError, APITimeout, seatsaero_api
from backend.models import Cabin, GetTripResponse, Result, SearchCriteria, SearchResponse
from backend.value import SUMMARY_VALUE_WARNING, whole_number
from backend.value import cents_per_point as cents_per_point

DEFAULT_LOOKUPS_PER_SEARCH = 4
SEARCH_MAX_PAGES = 3
SEARCH_PAGE_SIZE = 500
SEARCH_MAX_ROWS = 1500
SEARCH_TIMEOUT_SECONDS = 20


def get_availability_trips(availability_id: str) -> GetTripResponse:
    """Load and validate trip details for one provider availability record."""
    if not os.getenv("SEATSAERO_TOKEN"):
        raise APIRouterError("SEATSAERO_TOKEN is not set in backend/.env")
    payload = seatsaero_api.get_trip_to_client_json(availability_id, {"min_cabin_pct": 100})
    try:
        response = GetTripResponse.model_validate({**payload, "availability_id": availability_id})
        if any(trip.availability_id != availability_id for trip in response.trips):
            raise ValueError("Trip availability ID does not match the requested record")
        for trip in response.trips:
            currency = (trip.taxes_currency or "").strip().upper()
            taxes = whole_number(trip.taxes_minor)
            trip.cash_fees_usd = (taxes / 100 if taxes is not None and currency == "USD"
                                  and trip.source not in {"qatar", "turkish", "singapore"} else None)
        return response
    except (ValidationError, TypeError, ValueError) as error:
        raise APIRouterError("Invalid trip details returned by the provider") from error


def _lookups_per_search() -> int:
    """SERPAPI_LOOKUPS_PER_SEARCH (default 4 = every cabin of one route and date); 0 disables."""
    try:
        return max(0, int(os.getenv("SERPAPI_LOOKUPS_PER_SEARCH", DEFAULT_LOOKUPS_PER_SEARCH)))
    except ValueError:
        return DEFAULT_LOOKUPS_PER_SEARCH


def add_value_ratings(results: list[Result]) -> list[Result]:
    """Attach a cash fare benchmark without rating independent summary minima.

    One cash-fare lookup per distinct (route, date, cabin), in the order the results come
    (cheapest points first), capped per search to protect the SerpApi monthly quota.
    Results past the cap, or whose lookup finds nothing, keep null value fields."""
    keys: list[tuple[str, str, str, Cabin]] = []
    for result in results:
        key = (result.origin, result.destination, result.departure_date.isoformat(), result.cabin)
        if key not in keys:
            keys.append(key)
    keys = keys[:_lookups_per_search()]
    if not keys:
        return results
    with ThreadPoolExecutor(max_workers=len(keys)) as pool:
        fares = dict(zip(keys, pool.map(lambda key: cash_fare.lookup_cash_fare(*key), keys)))

    rated = []
    for result in results:
        fare = fares.get((result.origin, result.destination, result.departure_date.isoformat(), result.cabin))
        if (isinstance(fare, bool) or not isinstance(fare, (int, float))
                or not 0 < fare <= 90071992547409.91 or not math.isfinite(fare)):
            rated.append(result)
            continue
        rated.append(result.model_copy(update={
            "cash_fare_usd": fare,
            "cents_per_point": None,
            "value_rating": None,
            "value_warning": SUMMARY_VALUE_WARNING,
        }))
    return rated


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
    "ethiopian": "Ethiopian ShebaMiles",
    "flyingblue": "Air France-KLM Flying Blue",
    "jal": "JAL Mileage Bank",
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
        results = add_value_ratings(sorted(results, key=lambda r: r.points_cost))
        return SearchResponse(results=results, partial=partial, warnings=warnings)
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
    points_cost = whole_number(row.get(f"{prefix}MileageCost"))
    if not points_cost:
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
    if isinstance(seats, bool):
        seats = None
    if seats is not None and seats < criteria.passengers:
        return None
    source = row.get("Source") or route.get("Source") or ""
    return Result(
        availability_id=row.get("ID") if isinstance(row.get("ID"), str) else None,
        program=_PROGRAM_NAMES.get(source, source),
        source=source or None,
        search_passengers=criteria.passengers,
        airline=row.get(f"{prefix}Airlines") or "Not reported",
        origin=origin,
        destination=destination,
        departure_date=departure,
        cabin=cabin,
        points_cost=points_cost,
        cash_fees_usd=_fees_usd(row, prefix),
        seats_available=seats,
        # Value fields are filled later by add_value_ratings() (one cash-fare lookup per route).
    )


def _fees_usd(row: dict, prefix: str) -> float | None:
    """Taxes in dollars, or None when unreported (0) or not in USD (no conversion).

    seats.aero reports {c}TotalTaxes in cents of TaxesCurrency (US departure fee = 560)."""
    taxes = whole_number(row.get(f"{prefix}TotalTaxes"))
    if row.get("TaxesCurrency") != "USD" or not taxes:
        return None
    return taxes / 100
