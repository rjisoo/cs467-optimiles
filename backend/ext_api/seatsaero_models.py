from datetime import date as Date
from datetime import datetime
from typing import Any, ClassVar, TypeAlias
from pydantic import BaseModel, ConfigDict, Field, model_validator

RawNumber: TypeAlias = int | float | str | None


class SeatsAeroModel(BaseModel):
    """Base model for SeatsAero API responses."""

    model_config = ConfigDict(extra="allow")


class RawCabinAvailability(SeatsAeroModel):
    """Represents raw cabin availability information from the SeatsAero API."""

    available: bool | None = None
    available_raw: bool | str | None = None
    available_direct: bool | None = None
    available_direct_raw: bool | str | None = None
    airlines: str | list[str] | None = None
    airlines_direct: str | list[str] | None = None
    remaining_seats: RawNumber = None
    remaining_seats_direct: RawNumber = None
    from_points: RawNumber = None
    from_points_direct: RawNumber = None
    taxes_fees: RawNumber = None
    taxes_fees_direct: RawNumber = None


class RawRoute(SeatsAeroModel):
    """Represents a raw route from the SeatsAero API."""

    route_id: str = Field(alias="ID")
    origin_airport: str = Field(alias="OriginAirport")
    origin_region: str = Field(alias="OriginRegion")
    destination_airport: str = Field(alias="DestinationAirport")
    destination_region: str = Field(alias="DestinationRegion")
    distance: int = Field(alias="Distance")
    source: str = Field(alias="Source")
    connecting: bool = Field(alias="Connecting")


class RawAvailabilityRecord(SeatsAeroModel):
    """Represents a raw availability record from the SeatsAero API."""

    prefixes_cabin: ClassVar[dict[str, str]] = {
        "economy": "Y",
        "premium": "W",
        "business": "J",
        "first": "F",
    }
    cabin_fields: ClassVar[list[str]] = [
        "Available",
        "MileageCost",
        "TotalTaxes",
        "RemainingSeats",
        "Airlines",
        "Direct",
    ]

    availability_id: str = Field(alias="ID")

    route_id: str = Field(alias="RouteID")
    date: Date = Field(alias="Date")
    parsed_date: datetime = Field(alias="ParsedDate")
    route: RawRoute = Field(alias="Route")
    source: str = Field(alias="Source")
    created_at: datetime = Field(alias="CreatedAt")
    provider_updated_at: datetime = Field(alias="UpdatedAt")
    taxes_currency: str = Field(alias="TaxesCurrency")
    raw_cabins: dict[str, RawCabinAvailability]
    # Availability Fields
    economy_available: bool = Field(alias="YAvailable")
    economy_available_direct: bool = Field(alias="YDirect")
    premium_available: bool = Field(alias="WAvailable")
    premium_available_direct: bool = Field(alias="WDirect")
    business_available: bool = Field(alias="JAvailable")
    business_available_direct: bool = Field(alias="JDirect")
    first_available: bool = Field(alias="FAvailable")
    first_available_direct: bool = Field(alias="FDirect")

    @model_validator(mode="before")
    @classmethod
    def collect_cabin_fields(cls, value: dict) -> Any:
        """This method extracts cabin availability information from the raw response
        Args:
            value (dict): The raw response from cached search endpoint.
        Returns:
            dict: The modified input dictionary with organized cabin fields.
        """
        result = dict(value)
        cabins: dict[str, dict[str, Any]] = {}
        for cabin, prefix in cls.prefixes_cabin.items():
            cabins[cabin] = {
                "available": value.get(f"{prefix}Available"),
                "available_raw": value.get(f"{prefix}AvailableRaw"),
                "available_direct": value.get(f"{prefix}Direct"),
                "available_direct_raw": value.get(f"{prefix}DirectRaw"),
                "airlines": value.get(f"{prefix}Airlines"),
                "airlines_direct": value.get(f"{prefix}DirectAirlines"),
                "remaining_seats": value.get(f"{prefix}RemainingSeats"),
                "remaining_seats_direct": value.get(f"{prefix}DirectRemainingSeats"),
                "from_points": value.get(f"{prefix}MileageCost"),
                "from_points_direct": value.get(f"{prefix}DirectMileageCost"),
                "taxes_fees": value.get(f"{prefix}TotalTaxes"),
                "taxes_fees_direct": value.get(f"{prefix}DirectTotalTaxes"),
            }

        result["raw_cabins"] = cabins
        return result


class RawCachedSearchResponse(SeatsAeroModel):
    """Represents the raw cached search response from the SeatsAero API."""

    data: list[RawAvailabilityRecord]
    count: int = Field(ge=0)
    has_more: bool = Field(alias="hasMore")
    more_url: str | None = Field(default=None, alias="moreURL")
    cursor: int | str | None = None

    def to_client_json(self) -> dict[str, Any]:
        """Convert the raw cached search response to a client-facing API format."""

        def parse_airlines(value: str) -> list[str]:
            return [airline.strip() for airline in value.split(",") if airline.strip()]

        def parse_number(value: RawNumber) -> RawNumber:
            """Parse a raw number value, converting it to int or float if possible."""
            if isinstance(value, str):
                try:
                    return int(value)
                except ValueError:
                    try:
                        return float(value)
                    except ValueError:
                        return value
            return value

        results = []
        for record in self.data:
            raw_fields = record.model_extra or {}
            cabins = {}
            for cabin, prefix in RawAvailabilityRecord.prefixes_cabin.items():
                cabins[cabin] = {
                    "available": getattr(record, f"{cabin}_available"),
                    "airlines": parse_airlines(raw_fields.get(f"{prefix}Airlines")),
                    "remaining_seats": parse_number(
                        raw_fields.get(f"{prefix}RemainingSeats")
                    ),
                    "from_points": parse_number(raw_fields.get(f"{prefix}MileageCost")),
                    "taxes_fees": raw_fields.get(f"{prefix}TotalTaxes"),
                    "direct_available": getattr(record, f"{cabin}_available_direct"),
                    "direct_airlines": parse_airlines(
                        raw_fields.get(f"{prefix}DirectAirlines")
                    ),
                    "direct_remaining_seats": parse_number(
                        raw_fields.get(f"{prefix}DirectRemainingSeats")
                    ),
                    "direct_from_points": parse_number(
                        raw_fields.get(f"{prefix}DirectMileageCost")
                    ),
                    "direct_tax_fees": raw_fields.get(f"{prefix}DirectTotalTaxes"),
                }

            results.append(
                {
                    "availability_id": record.availability_id,
                    "date": record.date.isoformat(),
                    "origin_airport": record.route.origin_airport,
                    "destination_airport": record.route.destination_airport,
                    "source": record.source,
                    "provider_updated_at": (
                        record.provider_updated_at.isoformat()
                        if record.provider_updated_at
                        else None
                    ),
                    "cabins": cabins,
                }
            )

        return {
            "results": results,
            "has_more": self.has_more,
            "cursor": self.cursor,
            "count": len(results),
        }
