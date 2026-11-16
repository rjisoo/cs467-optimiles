"""Pinned airport reference data shared by discovery and search validation."""

from datetime import date, datetime, timezone
from functools import cache
from zoneinfo import ZoneInfo

import airportsdata
from pydantic import BaseModel, Field, field_validator


class Airport(BaseModel):
    code: str = Field(pattern=r"^[A-Z]{3}$")
    name: str = Field(min_length=1)
    city: str
    country: str = Field(min_length=2, max_length=2)
    timeZone: str

    @field_validator("timeZone")
    @classmethod
    def check_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value


class AirportCatalog(BaseModel):
    version: str
    airports: list[Airport]


@cache
def get_airport_catalog() -> AirportCatalog:
    airports = [
        Airport(code=code, name=row["name"], city=row["city"],
                country=row["country"], timeZone=row["tz"])
        for code, row in sorted(airportsdata.load("IATA").items())
    ]
    return AirportCatalog(version=f"airportsdata-{airportsdata.__version__}", airports=airports)


@cache
def airport_index() -> dict[str, Airport]:
    return {airport.code: airport for airport in get_airport_catalog().airports}


def get_airport(code: str) -> Airport | None:
    return airport_index().get(code)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def airport_today(code: str, now: datetime | None = None) -> date:
    airport = airport_index()[code]
    return (now or utc_now()).astimezone(ZoneInfo(airport.timeZone)).date()
