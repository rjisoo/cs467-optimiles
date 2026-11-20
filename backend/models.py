"""Pydantic models shared by the API routes and logic modules.

These define the API contract with the frontend. The OpenAPI schemas at /docs are
generated from them; update the examples in openapi.py when changing them."""

from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from backend import airports
from backend.airports import airport_today, get_airport
from backend.value import ValueRating

Cabin = Literal["economy", "premium_economy", "business", "first"]
AirportCode = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
AirportSelection = AirportCode | Annotated[list[AirportCode], Field(min_length=1, max_length=6)]


class SearchCriteria(BaseModel):
    origin: AirportCode = Field(description="IATA airport code")
    destination: AirportCode = Field(description="IATA airport code")
    departure_date: date
    return_date: None = Field(
        default=None, description="Only one-way searches are supported; omit or send null"
    )
    cabin: Cabin | None = Field(
        default=None, description="Requested cabin; omitted or null searches all available cabins"
    )
    cabins: list[Cabin] | None = Field(
        default=None, min_length=1, max_length=4,
        description="Requested cabin alternatives; cannot be combined with cabin",
    )
    passengers: int = Field(default=1, ge=1, le=9)

    @field_validator("return_date", mode="before")
    @classmethod
    def reject_return_date(cls, value: object) -> None:
        if value is not None:
            raise ValueError("Only one-way searches are supported; omit return_date or send null")
        return None

    @field_validator("origin", "destination", mode="before")
    @classmethod
    def normalize_airport(cls, value: object) -> object:
        if isinstance(value, list):
            return [code.strip().upper() if isinstance(code, str) else code for code in value]
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("origin", "destination")
    @classmethod
    def check_airport_membership(cls, value: str | list[str]) -> str | list[str]:
        codes = [value] if isinstance(value, str) else value
        if len(codes) != len(set(codes)):
            raise ValueError("Airport selections must not contain duplicates")
        for code in codes:
            if get_airport(code) is None:
                raise ValueError("Choose an airport from the /api/airports catalog")
        return value

    @property
    def origin_codes(self) -> list[str]:
        return [self.origin] if isinstance(self.origin, str) else self.origin

    @property
    def destination_codes(self) -> list[str]:
        return [self.destination] if isinstance(self.destination, str) else self.destination

    @property
    def departure_end(self) -> date:
        return self.departure_date

    @model_validator(mode="after")
    def check_route_and_dates(self) -> "SearchCriteria":
        if self.cabins is not None:
            if self.cabin is not None:
                raise ValueError("Supply cabin or cabins, not both")
            if len(set(self.cabins)) != len(self.cabins):
                raise ValueError("cabins must not contain duplicates")
        if set(self.origin_codes) & set(self.destination_codes):
            raise ValueError("origin and destination must differ; airport selections must not overlap")
        if self.departure_end < self.departure_date:
            raise ValueError("departure_date_end must be on or after departure_date")
        now = airports.utc_now()
        for origin in self.origin_codes:
            today = airport_today(origin, now)
            if not today <= self.departure_date <= self.departure_end <= today + timedelta(days=365):
                raise ValueError("Departure dates must be between origin-local today and today +365 days for every origin")
        return self


class StructuredSearchCriteria(SearchCriteria):
    """Direct search accepts airport alternatives and a bounded departure range."""

    origin: AirportSelection = Field(description="One IATA code or 1–6 unique airport codes")
    destination: AirportSelection = Field(description="One IATA code or 1–6 unique airport codes")
    departure_date_end: date | None = Field(
        default=None,
        description="Inclusive departure range end within every origin's local today through today +365 days; omitted or null uses departure_date",
    )

    @property
    def departure_end(self) -> date:
        return self.departure_date_end or self.departure_date


class Result(BaseModel):
    availability_id: str | None = Field(
        default=None, description="Provider availability ID for loading trip details"
    )
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
    cash_fare_usd: float | None = Field(
        default=None,
        gt=0,
        description=(
            "Estimated cheapest one-way cash fare per passenger for the same route, date and "
            "cabin (Google Flights via SerpApi); not necessarily the same flight. Null when "
            "no fare was found or looked up"
        ),
    )
    cents_per_point: float | None = Field(
        default=None,
        description="(cash_fare_usd - cash_fees_usd) * 100 / points_cost; null without a cash fare",
    )
    value_rating: ValueRating | None = Field(
        default=None,
        description=(
            "cents_per_point compared with a 1.0 cent baseline: bad (below 1.0, pay cash), "
            "fair (1.0+), good (1.3+), great (1.7+), exceptional (2.5+). Null without a cash fare"
        ),
    )
    value_warning: str | None = Field(
        default=None,
        description="Caveat about value_rating, e.g. award fees not reported; null when none",
    )


class SearchResponse(BaseModel):
    results: list[Result]
    partial: bool = False
    warnings: list[str] = Field(default_factory=list)
    message: str | None = Field(
        default=None, description="Why results is empty; null when there are results"
    )


# Seats.Aero Cached Search Models
class RewardValue(BaseModel):
    full_name: str
    points: int | float
    point_value: float
    cash_value: float
    logo_url: str


class CabinAvailability(BaseModel):
    available: bool
    airlines: list[str]
    remaining_seats: int | None = Field(
        default=None, description="Seats left; null when unavailable or not reported"
    )
    from_points: int | float | None = Field(
        default=None, description="Points cost; null when unavailable or not reported"
    )
    from_points_cash_value: dict[str, RewardValue] | None = Field(
        default=None,
        description="Estimated cash value of points from each rewards program",
    )
    taxes_fees: int | float | None = Field(
        default=None,
        description="Taxes and fees in minor units; null when unavailable or not reported",
    )
    direct_available: bool
    direct_airlines: list[str]
    direct_remaining_seats: int | None = None
    direct_from_points: int | float | None = None
    direct_from_points_cash_value: dict[str, RewardValue] | None = Field(
        default=None,
        description="Estimated cash value of direct-flight points from each rewards program",
    )
    direct_taxes_fees: int | float | None = None


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
    carrier: str | None = None
    carrier_name: str | None = None
    origin_airport: str | None = None
    destination_airport: str | None = None
    departs_at_local: str | None = Field(default=None, description="Origin airport local time, without a timezone suffix")
    arrives_at_local: str | None = Field(default=None, description="Destination airport local time, without a timezone suffix")


class GetTripFlight(BaseModel):
    trip_id: str
    availability_id: str
    source: str
    cabin: str
    points: int | float | None = Field(ge=0, allow_inf_nan=False, description="Points cost")
    points_cash_value: dict[str, RewardValue] | None = Field(
        default=None,
        description="Estimated cash value of points from each rewards program",
    )
    taxes_minor: int | float | None = Field(
        default=None, ge=0, allow_inf_nan=False,
        description="Taxes and fees in minor units of taxes_currency",
    )
    taxes_currency: str | None = None
    cash_fees_usd: float | None = Field(
        default=None, ge=0, allow_inf_nan=False,
        description="Taxes and fees in USD; null when missing or explicitly non-USD",
    )
    reported_seats: int | float | None = Field(
        ge=0, allow_inf_nan=False, description="Seats reported by the provider"
    )
    departs_at_local: str = Field(description="Origin airport local time, without a timezone suffix")
    arrives_at_local: str = Field(description="Destination airport local time, without a timezone suffix")
    duration_minutes: int = Field(ge=0)
    stops: int = Field(ge=0)
    carriers: list[str]
    carrier_names: list[str] = Field(default_factory=list)
    provider_updated_at: str | None = None
    flight_numbers: list[str]
    segments: list[GetTripSegment] = Field(default_factory=list)


# Seats.Aero Get Trips Response Models
class GetTripResponse(BaseModel):
    availability_id: str
    booking_links: list[GetTripBookingLink]
    trips: list[GetTripFlight]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatCriteria(StructuredSearchCriteria):
    programs: list[str] | None = Field(default=None, description="Requested loyalty-program name filters")
    max_points: int | None = Field(default=None, ge=1, le=9007199254740991, description="Requested maximum award points")

    @field_validator("programs")
    @classmethod
    def normalize_programs(cls, names: list[str] | None) -> list[str] | None:
        return None if names is None else [name.strip() for name in names if name.strip()]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(
        default=[],
        description="Earlier messages, oldest first. Only the last 20 non-blank ones are used.",
    )
    context: ChatCriteria | None = Field(
        default=None, description="Current trip criteria. Explicit new details override these defaults."
    )
    confirmed: bool = Field(default=False, description="Search the supplied context exactly, after explicit confirmation")

    @model_validator(mode="after")
    def require_confirmation_context(self) -> "ChatRequest":
        if self.confirmed and self.context is None:
            raise ValueError("Confirmation requires trip context")
        return self


class ChatFailure(BaseModel):
    code: str
    retryable: bool


class ChatSearch(BaseModel):
    criteria: ChatCriteria
    status: Literal["results", "empty", "failed"]
    results: list[Result] = Field(default_factory=list)
    message: str | None = None
    partial: bool = False
    warnings: list[str] = Field(default_factory=list)
    failure: ChatFailure | None = None


class ChatResponse(BaseModel):
    reply: str
    results: list[Result] = []
    partial: bool = False
    warnings: list[str] = Field(default_factory=list)
    status: Literal["reply", "clarification", "confirmation", "results", "empty", "failed", "partial"] = "reply"
    criteria: ChatCriteria | None = None
    missing_fields: list[str] = Field(default_factory=list)
    failure: ChatFailure | None = None
    searches: list[ChatSearch] = Field(default_factory=list)
