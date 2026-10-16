"""Award search. Stubbed until the team picks a real award data source."""

from backend.models import Result, SearchCriteria


def cents_per_point(
    cash_price_usd: float | None, cash_fees_usd: float, points_cost: int
) -> float | None:
    """Value of each point in cents, or None when there is no cash price to compare."""
    if cash_price_usd is None or points_cost <= 0:
        return None
    return round((cash_price_usd - cash_fees_usd) * 100 / points_cost, 2)


# Fake (program, airline, points_cost, cash_fees_usd, seats, cash_price_usd) rows.
# cash_price_usd of None shows how missing price data surfaces to the client.
# To be replaced by actual reward information or by using a database
_STUB_ROWS = [
    ("United MileagePlus", "United", 30000, 5.60, 4, 420.00),
    ("Air Canada Aeroplan", "Air Canada", 25000, 38.20, 2, 410.00),
    ("Flying Blue", "KLM", 28000, 92.10, 7, None),
]

_CABIN_MULTIPLIER = {"economy": 1, "premium_economy": 1.6, "business": 2.8, "first": 4}


def search_awards(criteria: SearchCriteria) -> list[Result]:
    """Return award availability matching the criteria (fake data for now)."""
    multiplier = _CABIN_MULTIPLIER[criteria.cabin]
    results = []
    for program, airline, points, fees, seats, cash_price in _STUB_ROWS:
        if seats < criteria.passengers:
            continue
        points_cost = int(points * multiplier)
        cash = cash_price * multiplier if cash_price is not None else None
        results.append(
            Result(
                program=program,
                airline=airline,
                origin=criteria.origin,
                destination=criteria.destination,
                departure_date=criteria.departure_date,
                cabin=criteria.cabin,
                points_cost=points_cost,
                cash_fees_usd=fees,
                seats_available=seats,
                cents_per_point=cents_per_point(cash, fees, points_cost),
            )
        )
    return results
