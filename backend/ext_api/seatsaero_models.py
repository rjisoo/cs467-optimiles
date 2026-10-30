from datetime import date as Date
from datetime import datetime
from typing import Any, ClassVar, TypeAlias
from pydantic import BaseModel, ConfigDict, Field, model_validator

RawNumber: TypeAlias = int | float | str | None


class SeatsAeroModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class RawCabinAvailability(SeatsAeroModel):
    airlines: str | list[str] | None = None
    airlines_direct: str | list[str] | None = None
    remaining_seats: RawNumber = None
    remaining_seats_direct: RawNumber = None
    from_points: RawNumber = None
    from_points_direct: RawNumber = None
    taxes_fees: RawNumber = None
    taxes_fees_direct: RawNumber = None


class RawRoute(SeatsAeroModel):
    route_id: str = Field(alias="ID")
    origin_airport: str = Field(alias="OriginAirport")
    origin_region: str = Field(alias="OriginRegion")
    destination_airport: str = Field(alias="DestinationAirport")
    destination_region: str = Field(alias="DestinationRegion")
    distance: int = Field(alias="Distance")
    source: str = Field(alias="Source")
    connecting: bool = Field(alias="Connecting")


class RawAvailabilityRecord(SeatsAeroModel):
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
        result = dict(value)
        cabins: dict[str, dict[str, Any]] = {}
        for cabin, prefix in cls.prefixes_cabin.items():
            cabin_values: dict[str, Any] = {}
            for source_suffix, model_suffix in (("", "Direct"), ("", "_direct")):
                cabin_values.update(
                    {
                        f"airlines{model_suffix}": value.get(
                            f"{prefix}{source_suffix}Airlines"
                        ),
                        f"remaining_seats{model_suffix}": value.get(
                            f"{prefix}{source_suffix}RemainingSeats"
                        ),
                        f"from_points{model_suffix}": value.get(
                            f"{prefix}{source_suffix}MileageCost"
                        ),
                        f"taxes_fees{model_suffix}": value.get(
                            f"{prefix}{source_suffix}TotalTaxes"
                        ),
                    }
                )

            cabins[cabin] = cabin_values

        result["raw_cabins"] = cabins
        return result


class RawCachedSearchResponse(SeatsAeroModel):
    data: list[RawAvailabilityRecord]
    count: int = Field(ge=0)
    has_more: bool = Field(alias="hasMore")
    more_url: str | None = Field(default=None, alias="moreURL")
    cursor: int | str | None = None
