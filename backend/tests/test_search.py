from datetime import date

from backend.models import SearchCriteria
from backend.search import cents_per_point, search_awards


def test_cents_per_point():
    assert cents_per_point(420.00, 5.60, 30000) == 1.38


def test_cents_per_point_is_none_without_cash_price():
    assert cents_per_point(None, 5.60, 30000) is None


def test_search_filters_by_seats():
    criteria = SearchCriteria(
        origin="SFO", destination="NRT", departure_date=date(2026, 12, 1), passengers=5
    )
    results = search_awards(criteria)
    assert all(r.seats_available >= 5 for r in results)


def test_missing_cash_price_gives_null_value():
    criteria = SearchCriteria(origin="SFO", destination="NRT", departure_date=date(2026, 12, 1))
    values = {r.program: r.cents_per_point for r in search_awards(criteria)}
    assert values["Flying Blue"] is None
