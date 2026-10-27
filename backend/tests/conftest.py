import logging
import os

import pytest

# backend.ext_api builds the seats.aero client on import and needs a base URL;
# tests never reach the network (see fake_seats_aero below).
os.environ.setdefault("SEATSAERO_BASE_URL", "https://seats.aero.invalid/partnerapi")

from backend import search  # noqa: E402
from backend.app import create_app  # noqa: E402


def seats_aero_row(source, *, origin, destination, day, **cabin_fields):
    """One availability row shaped like the seats.aero cached search response."""
    row = {
        "ID": f"{source}-{origin}-{destination}-{day}",
        "Date": day,
        "Source": source,
        "Route": {"OriginAirport": origin, "DestinationAirport": destination, "Source": source},
        "TaxesCurrency": "USD",
    }
    for prefix in "YWJF":
        row[f"{prefix}Available"] = False
        row[f"{prefix}MileageCost"] = "0"
        row[f"{prefix}RemainingSeats"] = 0
        row[f"{prefix}TotalTaxes"] = 0
        row[f"{prefix}Airlines"] = ""
    row.update(cabin_fields)
    return row


def fake_availability(criteria):
    """Canned seats.aero response for whatever route and date was requested."""
    route = {
        "origin": criteria.origin,
        "destination": criteria.destination,
        "day": criteria.departure_date.isoformat(),
    }
    return {
        "data": [
            seats_aero_row(
                "united", **route, JAvailable=True, JMileageCost="88000",
                JRemainingSeats=4, JTotalTaxes=560, JAirlines="UA", YAvailable=True,
                YMileageCost="35000", YRemainingSeats=7, YAirlines="UA",
            ),
            seats_aero_row(
                "aeroplan", **route, JAvailable=True, JMileageCost="75000",
                JRemainingSeats=2, JAirlines="NH", YAvailable=True,
                YMileageCost="40000", YRemainingSeats=0, YAirlines="AC",
            ),
            seats_aero_row(
                "flyingblue", **route, YAvailable=True, YMileageCost="30000",
                YRemainingSeats=3, YAirlines="AF, KL",
            ),
        ],
        "count": 3,
        "hasMore": False,
    }


@pytest.fixture(name="seats_aero_row")
def seats_aero_row_fixture():
    return seats_aero_row


@pytest.fixture(autouse=True)
def fake_seats_aero(monkeypatch):
    monkeypatch.setattr(search, "_fetch_availability", fake_availability)


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()

def pytest_configure():
    for handler in logging.getLogger().handlers:
        if isinstance(handler, logging.StreamHandler) and not isinstance(
            handler, logging.FileHandler
        ):
            handler.setLevel(logging.CRITICAL + 1)
