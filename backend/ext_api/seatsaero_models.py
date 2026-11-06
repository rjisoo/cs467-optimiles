from datetime import date as Date
from datetime import datetime
from typing import Any, ClassVar, TypeAlias
from pydantic import BaseModel, ConfigDict, Field, model_validator

RawNumber: TypeAlias = int | float | str | None


class SeatsAeroModel(BaseModel):
    """Base model for SeatsAero API responses."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)


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

        def parse_airlines(value: str|list|None) -> list[str]:
            if isinstance(value, str):
                return [airline.strip() for airline in value.split(",") if airline.strip()]
            if isinstance(value, list):
                return [str(airline).strip() for airline in value if str(airline).strip()]
            return []

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

        def validate_availability_on_value(value: RawNumber, available: bool | None) -> RawNumber:
            """Returns None if the cabin is not available or the value is 0."""
            if not available or not value:
                return None
            return value

        results = []
        for record in self.data:
            raw_fields = record.model_extra or {}
            cabins = {}
            for cabin, prefix in RawAvailabilityRecord.prefixes_cabin.items():
                available = getattr(record, f"{cabin}_available")
                direct_available = getattr(record, f"{cabin}_available_direct")
                cabins[cabin] = {
                    "available": available,
                    "airlines": parse_airlines(raw_fields.get(f"{prefix}Airlines")),
                    "remaining_seats": validate_availability_on_value(
                        parse_number(raw_fields.get(f"{prefix}RemainingSeats")),
                        available,
                    ),
                    "from_points": validate_availability_on_value(
                        parse_number(raw_fields.get(f"{prefix}MileageCost")), available
                    ),
                    "taxes_fees": validate_availability_on_value(
                        parse_number(raw_fields.get(f"{prefix}TotalTaxes")),
                        available,
                    ),
                    "direct_available": direct_available,
                    "direct_airlines": parse_airlines(
                        raw_fields.get(f"{prefix}DirectAirlines")
                    ),
                    "direct_remaining_seats": validate_availability_on_value(
                        parse_number(raw_fields.get(f"{prefix}DirectRemainingSeats")),
                        direct_available,
                    ),
                    "direct_from_points": validate_availability_on_value(
                        parse_number(raw_fields.get(f"{prefix}DirectMileageCost")),
                        direct_available,
                    ),
                    "direct_tax_fees": validate_availability_on_value(
                        parse_number(raw_fields.get(f"{prefix}DirectTotalTaxes")),
                        direct_available,
                    ),
                }

            results.append(
                {
                    "availability_id": record.availability_id,
                    "date": record.date.isoformat(),
                    "origin_airport": record.route.origin_airport,
                    "destination_airport": record.route.destination_airport,
                    "taxes_currency": record.taxes_currency,
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


# Get Trip Endpoint
# Fallback names for common US carriers; response metadata takes precedence.
# https://aspmhelp.faa.gov/index/ASQP__Carrier_Codes_and_Names.html
_CARRIER_NAMES = {
    "AA": "American Airlines",
    "AS": "Alaska Airlines",
    "B6": "JetBlue",
    "DL": "Delta Air Lines",
    "F9": "Frontier Airlines",
    "HA": "Hawaiian Airlines",
    "NK": "Spirit Airlines",
    "UA": "United Airlines",
    "WN": "Southwest Airlines",
}


def airport_local_time(value: str | None) -> str | None:
    """Seats.aero flight times are airport-local wall clocks despite the Z suffix.

    Remove the misleading UTC marker without shifting the local date or time.
    Provider update timestamps are UTC and must not use this normalization.
    """
    return value.removesuffix("Z") if value is not None else None


class RawGetTripCoordinates(SeatsAeroModel):
    """Represents airport coordinates from the SeatsAero get trip endpoint."""

    lat: float | None = Field(default=None, alias="Lat")
    lon: float | None = Field(default=None, alias="Lon")


class RawGetTripBookingLink(SeatsAeroModel):
    """Represents a booking link from the SeatsAero get trip endpoint."""

    label: str | None = None
    url: str | None = Field(default=None, alias="link")
    primary: bool = False


class RawGetTripSegment(SeatsAeroModel):
    """Represents a flight segment from the SeatsAero get trip endpoint."""

    flight_number: str | None = Field(default=None, alias="FlightNumber")
    carrier: str | None = Field(default=None, alias="Carrier")
    carrier_name: str | None = Field(default=None, alias="CarrierName")
    origin_airport: str | None = Field(default=None, alias="OriginAirport")
    destination_airport: str | None = Field(default=None, alias="DestinationAirport")
    departs_at_local: str | None = Field(default=None, alias="DepartsAt")
    arrives_at_local: str | None = Field(default=None, alias="ArrivesAt")


class RawGetTripFlights(SeatsAeroModel):
    """Represents an availability trip from the SeatsAero get trip endpoint."""

    trip_id: str = Field(alias="ID")
    availability_id: str
    source: str
    cabin: str
    points: RawNumber
    taxes_minor: RawNumber = None
    taxes_currency: str | None = None
    reported_seats: RawNumber
    departs_at_local: str
    arrives_at_local: str
    duration_minutes: int
    stops: int
    carriers: list[str]
    provider_updated_at: str | None = None
    flight_numbers: list[str]
    segments: list[RawGetTripSegment] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_upstream_fields(cls, value: Any) -> Any:
        """Map SeatsAero trip fields to the normalized model field names."""
        if not isinstance(value, dict):
            return value

        result = dict(value)
        aliases = {
            "availability_id": "AvailabilityID",
            "source": "Source",
            "cabin": "Cabin",
            "points": "MileageCost",
            "taxes_minor": "TotalTaxes",
            "taxes_currency": "TaxesCurrency",
            "reported_seats": "RemainingSeats",
            "departs_at_local": "DepartsAt",
            "arrives_at_local": "ArrivesAt",
            "duration_minutes": "TotalDuration",
            "stops": "Stops",
            "carriers": "Carriers",
            "provider_updated_at": "UpdatedAt",
            "flight_numbers": "FlightNumbers",
            "segments": "AvailabilitySegments",
        }
        for field_name, upstream_name in aliases.items():
            if field_name not in result and upstream_name in result:
                result[field_name] = result[upstream_name]

        for field_name in ("carriers", "flight_numbers"):
            field_value = result.get(field_name)
            if isinstance(field_value, str):
                result[field_name] = [
                    item.strip() for item in field_value.split(",") if item.strip()
                ]

        return result


class RawGetTripResponse(SeatsAeroModel):
    """Represents the raw get trip response from the SeatsAero API."""

    trips: list[RawGetTripFlights] = Field(alias="data")
    booking_links: list[RawGetTripBookingLink] = Field(default_factory=list)
    carriers: dict[str, str | None] = Field(default_factory=dict)

    def _carrier_name(self, code: str | None) -> str | None:
        if not code:
            return None
        return self.carriers.get(code) or _CARRIER_NAMES.get(code) or code

    def _segment_to_client_json(self, segment: RawGetTripSegment, carriers: list[str]) -> dict:
        unique_carriers = list(dict.fromkeys(carriers))
        # A mixed-carrier trip does not identify each segment's carrier. Flight
        # number prefixes can refer to codeshares, so do not infer one from them.
        carrier = segment.carrier or (unique_carriers[0] if len(unique_carriers) == 1 else None)
        return {
            "flight_number": segment.flight_number,
            "carrier": carrier,
            "carrier_name": segment.carrier_name or self._carrier_name(carrier),
            "origin_airport": segment.origin_airport,
            "destination_airport": segment.destination_airport,
            "departs_at_local": airport_local_time(segment.departs_at_local),
            "arrives_at_local": airport_local_time(segment.arrives_at_local),
        }

    def to_client_json(self) -> dict[str, Any]:
        """Convert the raw get trip response to a client-facing API format."""
        return {
            "booking_links": [
                {
                    "label": link.label,
                    "url": link.url,
                    "primary": link.primary,
                }
                for link in self.booking_links
            ],
            "trips": [
                {
                    "trip_id": trip.trip_id,
                    "availability_id": trip.availability_id,
                    "source": trip.source,
                    "cabin": trip.cabin,
                    "points": trip.points,
                    "taxes_minor": trip.taxes_minor,
                    "taxes_currency": trip.taxes_currency,
                    "reported_seats": trip.reported_seats,
                    "departs_at_local": airport_local_time(trip.departs_at_local),
                    "arrives_at_local": airport_local_time(trip.arrives_at_local),
                    "duration_minutes": trip.duration_minutes,
                    "stops": trip.stops,
                    "carriers": trip.carriers,
                    "carrier_names": [self._carrier_name(code) for code in dict.fromkeys(trip.carriers)],
                    "provider_updated_at": trip.provider_updated_at,
                    "flight_numbers": trip.flight_numbers,
                    "segments": [
                        self._segment_to_client_json(segment, trip.carriers)
                        for segment in trip.segments
                    ],
                }
                for trip in self.trips
            ],
        }
