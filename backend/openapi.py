"""OpenAPI metadata, using the same Pydantic schemas as the API routes."""

from pydantic.json_schema import models_json_schema

from backend.airports import AirportCatalog
from backend.errors import UPSTREAM_STATUS_MESSAGES
from backend.models import (
    CachedSearchResponse,
    ChatRequest,
    ChatResponse,
    GetTripResponse,
    SearchCriteria,
    SearchResponse,
    StructuredSearchCriteria,
)


def _error_response(description, message):
    return {
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ErrorResponse"},
                "example": {"error": message},
            }
        },
    }


# Award search failures; /api/chat reports these in the reply instead.
_UPSTREAM_RESPONSES = {
    "502": _error_response(
        "Award search service failed", UPSTREAM_STATUS_MESSAGES[502]
    ),
    "503": _error_response(
        "Award search usage limit reached", UPSTREAM_STATUS_MESSAGES[503]
    ),
    "504": _error_response("Award search timed out", UPSTREAM_STATUS_MESSAGES[504]),
}


def _post_operation(
    summary, description, request_schema, response_schema, example, extra_responses=None
):
    return {
        "summary": summary,
        "description": description,
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {"schema": request_schema, "example": example}
            },
        },
        "responses": {
            "200": {
                "description": "Successful response",
                "content": {"application/json": {"schema": response_schema}},
            },
            "400": {
                "description": "Invalid or missing JSON request body",
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": "#/components/schemas/ValidationErrorResponse"
                        }
                    }
                },
            },
            **(extra_responses or {}),
            "500": _error_response("Unexpected server error", "Internal server error"),
        },
    }


def build_openapi(server_url: str = "/") -> dict:
    refs, definitions = models_json_schema(
        [
            (SearchCriteria, "validation"),
            (StructuredSearchCriteria, "validation"),
            (ChatRequest, "validation"),
            (SearchResponse, "serialization"),
            (ChatResponse, "serialization"),
            (CachedSearchResponse, "serialization"),
            (GetTripResponse, "serialization"),
            (AirportCatalog, "serialization"),
        ],
        ref_template="#/components/schemas/{model}",
    )
    schemas = definitions["$defs"]
    schemas["ErrorResponse"] = {
        "type": "object",
        "required": ["error"],
        "properties": {
            "error": {"type": "string", "description": "Message safe to show users"}
        },
    }
    schemas["ValidationErrorResponse"] = {
        "type": "object",
        "required": ["error", "details"],
        "properties": {
            "error": {"type": "string", "const": "Invalid request"},
            "details": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["type", "loc", "msg"],
                    "properties": {
                        "type": {"type": "string"},
                        "loc": {
                            "type": "array",
                            "items": {
                                "anyOf": [{"type": "string"}, {"type": "integer"}]
                            },
                        },
                        "msg": {"type": "string"},
                        "input": {},
                        "ctx": {"type": "object"},
                    },
                },
            },
        },
    }
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "OptiMiles API",
            "version": "0.1.0",
            "description": "Award flight search, chat and trip details using seats.aero cached provider data.",
        },
        # Relative to the current origin, so Try it out works on custom ports too.
        "servers": [{"url": server_url}],
        "paths": {
            "/api/health": {
                "get": {
                    "summary": "Check API health",
                    "responses": {
                        "200": {
                            "description": "The API is running",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "required": ["status"],
                                        "properties": {
                                            "status": {"type": "string", "const": "ok"}
                                        },
                                    },
                                    "example": {"status": "ok"},
                                }
                            },
                        }
                    },
                }
            },
            "/banks": {
                "get": {
                    "summary": "List available rewards programs",
                    "description": "Returns bank names with their display names and logo URLs.",
                    "responses": {
                        "200": {
                            "description": "Available rewards programs",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "additionalProperties": {
                                            "type": "object",
                                            "required": ["full_name", "logo_url"],
                                            "properties": {
                                                "full_name": {"type": "string"},
                                                "logo_url": {"type": "string"},
                                            },
                                        },
                                    },
                                    "example": {
                                        "Amex": {
                                            "full_name": "American Express",
                                            "logo_url": "https://example.com/amex.png",
                                        }
                                    },
                                }
                            },
                        },
                        "500": _error_response(
                            "Unexpected server error", "Internal server error"
                        ),
                    },
                }
            },
            "/api/airports": {
                "get": {
                    "summary": "List the versioned airport reference catalog",
                    "description": "Worldwide individual IATA airports with IANA timezones. "
                    "Reference identity does not establish provider coverage. No provider request is made.",
                    "responses": {
                        "200": {
                            "description": "Versioned airport catalog",
                            "content": {"application/json": {"schema": refs[AirportCatalog, "serialization"]}},
                        },
                        "500": _error_response("Catalog unavailable", "Internal server error"),
                    },
                }
            },
            "/api/search": {
                "post": _post_operation(
                    "Search award flights",
                    "origin and destination each accept one IATA code or 1–6 distinct codes. "
                    "Airport codes are trimmed, uppercased and checked against /api/airports. "
                    "Selections must not overlap. departure_date_end is optional; omitted or null "
                    "means departure_date. The ordered range includes both endpoints. "
                    "Both endpoints must be between every origin's local "
                    "today and today +365 days, inclusive, using one validation instant. "
                    "Only one-way searches are supported; return_date must be omitted or null. Supply cabin for "
                    "one class or cabins for 1–4 distinct alternatives, never both. Omit both "
                    "or send null to search all available cabins. Searches retrieve up to three "
                    "cached pages of 500 records, at most 1500 raw records and 20 seconds per award search. "
                    "Pages reuse the first cursor and advance skip by raw records received; repeated "
                    "IDs are deduplicated. No per-day, per-route or per-cabin fan-out is used. "
                    "Limits, non-advancing pages and later-page failures return collected results "
                    "with partial=true and plain-text warnings. First-page failures use existing errors. "
                    "Results retain concrete routes, reported dates and availability IDs. "
                    "Out-of-range rows are excluded; malformed usable dates/routes reject the page, "
                    "using upstream errors for the first page or partial reporting after earlier valid pages. "
                    "Chat still uses one airport per endpoint and one departure date. When no flights match, "
                    "results is empty and message says why; partial empty results do not establish absence. "
                    "Even complete pagination does not guarantee provider coverage or current availability. "
                    "cash_fare_usd is an estimated Google Flights cash fare (SerpApi), looked up for at most "
                    "SERPAPI_LOOKUPS_PER_SEARCH distinct route/date/cabin groups (default 4, cheapest "
                    "points first); it is null when no fare was looked up or found. Summary minimum points "
                    "and fees may belong to different flights, so cents_per_point and value_rating remain null. "
                    "Exact-trip value requires matched trip points and verified USD fees. source and "
                    "search_passengers preserve booking-program identity and requested seat requirements.",
                    refs[StructuredSearchCriteria, "validation"],
                    refs[SearchResponse, "serialization"],
                    {
                        "origin": "SFO",
                        "destination": "NRT",
                        "departure_date": "2026-12-01",
                        "departure_date_end": "2026-12-07",
                        "cabins": ["premium_economy", "business"],
                        "passengers": 2,
                    },
                    _UPSTREAM_RESPONSES,
                )
            },
            "/api/chat": {
                "post": _post_operation(
                    "Chat about award flights",
                    "Uses Gemini when a server-side API key is configured. Without a key, "
                    "returns status=failed with failure.code=not_configured. Send earlier messages "
                    "in history (only the last 20 nonblank messages are used) and normalized context "
                    "for follow-ups. Explicit changes override context, which overrides old history. "
                    "Clarification and confirmation do not search; confirmed=true searches the supplied "
                    "context exactly once. searches captures every distinct executed search, including "
                    "empty and failed searches. status, missing_fields and failure are machine-readable; "
                    "HTTP 200 alone does not indicate search success. Later failures preserve completed "
                    "groups with status=partial. partial and warnings describe bounded search coverage.",
                    refs[ChatRequest, "validation"],
                    refs[ChatResponse, "serialization"],
                    {
                        "message": "Try December 3 instead, United only",
                        "history": [
                            {"role": "user", "content": "Business class from SFO to Tokyo on December 1, 2026"},
                            {"role": "assistant", "content": "SFO to HND, Dec 1, business, 1 passenger: 2 options found."},
                        ],
                    },
                )
            },
            "/api/availability/{availability_id}/trips": {
                "get": {
                    "summary": "Load trip details for an availability record",
                    "description": "Uses the provider availability_id returned by search/chat. "
                    "Returns all reported cabins; an empty trips array is a successful response. "
                    "Fees retain their currency and minor units; timestamps retain provider text.",
                    "parameters": [{
                        "name": "availability_id", "in": "path", "required": True,
                        "schema": {
                            "type": "string", "pattern": "^[A-Za-z0-9_-]+$",
                            "minLength": 1, "maxLength": 200,
                        },
                    }],
                    "responses": {
                        "200": {
                            "description": "Reported trip details",
                            "content": {"application/json": {
                                "schema": refs[GetTripResponse, "serialization"],
                            }},
                        },
                        "400": _error_response("Invalid availability ID", "Bad request"),
                        **_UPSTREAM_RESPONSES,
                        "500": _error_response("Unexpected server error", "Internal server error"),
                    },
                },
            },
        },
        "components": {"schemas": schemas},
    }
