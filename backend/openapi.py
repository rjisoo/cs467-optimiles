"""OpenAPI metadata, using the same Pydantic schemas as the API routes."""

from pydantic.json_schema import models_json_schema

from backend.errors import UPSTREAM_STATUS_MESSAGES
from backend.models import ChatRequest, ChatResponse, SearchCriteria, SearchResponse


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
    "502": _error_response("Award search service failed", UPSTREAM_STATUS_MESSAGES[502]),
    "503": _error_response("Award search usage limit reached", UPSTREAM_STATUS_MESSAGES[503]),
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
            "content": {"application/json": {"schema": request_schema, "example": example}},
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
                        "schema": {"$ref": "#/components/schemas/ValidationErrorResponse"}
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
        ],
        ref_template="#/components/schemas/{model}",
    )
    schemas = definitions["$defs"]
    schemas["ErrorResponse"] = {
        "type": "object",
        "required": ["error"],
        "properties": {"error": {"type": "string", "description": "Message safe to show users"}},
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
                            "items": {"anyOf": [{"type": "string"}, {"type": "integer"}]},
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
            "description": "Award flight search and chat. Award results currently use fake data.",
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
                                        "properties": {"status": {"type": "string", "const": "ok"}},
                                    },
                                    "example": {"status": "ok"},
                                }
                            },
                        }
                    },
                }
            },
            "/api/search": {
                "post": _post_operation(
                    "Search award flights",
                    "Airport codes are trimmed and uppercased. Origin and destination must "
                    "differ; return_date must be on or after departure_date.",
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
                    {"message": "Business class from SFO to Tokyo on December 1, 2026", "history": []},
                )
            },
        },
        "components": {"schemas": schemas},
    }
