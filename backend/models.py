"""Pydantic models shared by the API routes and logic modules.

These define the API contract with the frontend. The OpenAPI schemas at /docs are
generated from them; update the examples in openapi.py when changing them."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Cabin = Literal["economy", "premium_economy", "business", "first"]


class SearchCriteria(BaseModel):
    origin: str = Field(pattern=r"^[A-Z]{3}$", description="IATA airport code")
    destination: str = Field(pattern=r"^[A-Z]{3}$", description="IATA airport code")
    departure_date: date
    return_date: date | None = None
    cabin: Cabin = "economy"
    passengers: int = Field(default=1, ge=1, le=9)

    @field_validator("origin", "destination", mode="before")
    @classmethod
    def normalize_airport(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @model_validator(mode="after")
    def check_route_and_dates(self) -> "SearchCriteria":
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        if self.return_date and self.return_date < self.departure_date:
            raise ValueError("return_date must be on or after departure_date")
        return self


class Result(BaseModel):
    program: str = Field(description="Loyalty program the points come from")
    airline: str = Field(description="Operating airline")
    origin: str
    destination: str
    departure_date: date
    cabin: Cabin
    points_cost: int = Field(ge=0, description="Points per passenger")
    cash_fees_usd: float | None = Field(
        default=None,
        ge=0,
        description="Taxes and fees per passenger; null when not reported",
    )
    seats_available: int | None = Field(
        default=None,
        ge=0,
        description="Seats left; null when the program doesn't report a count",
    )
    cents_per_point: float | None = Field(
        default=None,
        description="Redemption value; null when no cash price data exists",
    )


class SearchResponse(BaseModel):
    results: list[Result]


# Seats.Aero Cached Search Models
class CabinAvailability(BaseModel):
    available: bool
    airlines: list[str]
    remaining_seats: int | None = Field(
        default=None, description="Seats left; null when unavailable or not reported"
    )
    from_points: int | None = Field(
        default=None, description="Points cost; null when unavailable or not reported"
    )
    taxes_fees: int | float | None = Field(
        default=None,
        description="Taxes and fees in minor units; null when unavailable or not reported",
    )
    direct_available: bool
    direct_airlines: list[str]
    direct_remaining_seats: int | None = None
    direct_from_points: int | None = None
    direct_tax_fees: int | float | None = None


class AvailabilityCabins(BaseModel):
    economy: CabinAvailability
    premium: CabinAvailability
    business: CabinAvailability
    first: CabinAvailability


class AvailabilityRecord(BaseModel):
    availability_id: str
    date: date
    origin_airport: str
    destination_airport: str
    taxes_currency: str = Field(description="Currency of taxes and fees")
    source: str = Field(description="Award program source")
    provider_updated_at: str | None = Field(
        default=None, description="ISO format timestamp of the last provider's update"
    )
    cabins: AvailabilityCabins


# Seats.Aero Cached Search Response Models
class CachedSearchResponse(BaseModel):
    results: list[AvailabilityRecord]
    has_more: bool
    cursor: int | str | None = None
    count: int = Field(ge=0)


# Seats.Aero Get Trips Models
class GetTripBookingLink(BaseModel):
    label: str | None = None
    url: str | None = None
    primary: bool = False


class GetTripSegment(BaseModel):
    flight_number: str | None = None
    origin_airport: str | None = None
    destination_airport: str | None = None
    departs_at_local: str | None = None
    arrives_at_local: str | None = None


class GetTripFlight(BaseModel):
    trip_id: str
    availability_id: str
    source: str
    cabin: str
    points: int | float | None = Field(description="Points cost")
    taxes_minor: int | float | None = Field(
        default=None, description="Taxes and fees in minor units of taxes_currency"
    )
    taxes_currency: str | None = None
    reported_seats: int | float | None = Field(
        description="Seats reported by the provider"
    )
    departs_at_local: str
    arrives_at_local: str
    duration_minutes: int
    stops: int
    carriers: list[str]
    provider_updated_at: str | None = None
    flight_numbers: list[str]
    segments: list[GetTripSegment]


# Seats.Aero Get Trips Response Models
class GetTripResponse(BaseModel):
    booking_links: list[GetTripBookingLink]
    trips: list[GetTripFlight]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    results: list[Result] = []
