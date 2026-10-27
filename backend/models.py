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
        default=None, ge=0, description="Taxes and fees per passenger; null when not reported"
    )
    seats_available: int | None = Field(
        default=None, ge=0, description="Seats left; null when the program doesn't report a count"
    )
    cents_per_point: float | None = Field(
        default=None,
        description="Redemption value; null when no cash price data exists",
    )


class SearchResponse(BaseModel):
    results: list[Result]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    results: list[Result] = []
