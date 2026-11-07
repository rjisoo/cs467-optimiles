"""OpenAPI metadata, using the same Pydantic schemas as the API routes."""

from pydantic.json_schema import models_json_schema

from backend.errors import UPSTREAM_STATUS_MESSAGES
from backend.models import (
    CachedSearchResponse,
    ChatRequest,
    ChatResponse,
    GetTripResponse,
    SearchCriteria,
    SearchResponse,
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
            (ChatRequest, "validation"),
            (SearchResponse, "serialization"),
            (ChatResponse, "serialization"),
            (CachedSearchResponse, "serialization"),
            (GetTripResponse, "serialization"),
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
            "/api/search": {
                "post": _post_operation(
                    "Search award flights",
                    "Airport codes are trimmed and uppercased. Origin and destination must "
                    "differ; return_date must be on or after departure_date. Omit cabin or "
                    "send null to search all available cabins; a supplied cabin filters results. When no flights "
                    "match, results is empty and message says why.",
                    refs[SearchCriteria, "validation"],
                    refs[SearchResponse, "serialization"],
                    {
                        "origin": "SFO",
                        "destination": "NRT",
                        "departure_date": "2026-12-01",
                        "cabin": "business",
                        "passengers": 2,
                    },
                    _UPSTREAM_RESPONSES,
                )
            },
            "/api/chat": {
                "post": _post_operation(
                    "Chat about award flights",
                    "Uses Gemini when a server-side API key is configured. Without a key, "
                    "returns a message that chat is not connected yet.",
                    refs[ChatRequest, "validation"],
                    refs[ChatResponse, "serialization"],
                    {
                        "message": "Business class from SFO to Tokyo on December 1, 2026",
                        "history": [],
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
