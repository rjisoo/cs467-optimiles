"""Tools the LLM may call. Pure Python: no Flask or Gemini imports.

The LLM only chooses arguments. Code validates them with SearchCriteria and
runs the search; every number the user sees comes from search.py."""

import json
import logging
from typing import get_args

from pydantic import ValidationError

from backend.errors import UPSTREAM_ERRORS, describe_upstream_error
from backend.models import Cabin, Result, SearchCriteria
from backend.search import search_awards

logger = logging.getLogger(__name__)

SEARCH_AWARDS = "search_awards"

# For each detail the user must supply, the model copies the user's own words into
# a quote argument. Code checks the quote appears in the user's messages, so the
# model can't silently fill in today's date or a default city.
QUOTE_ARGS = {
    "origin_quote": "origin",
    "destination_quote": "destination",
    "date_quote": "departure date",
}
_QUOTE_DESCRIPTION = (
    "The user's exact words for the {detail}, copied from their messages "
    "(e.g. {example}). Empty string if the user never said it."
)
_QUOTE_STRIP = " \t\n\"'.,;:!?"

SEARCH_AWARDS_DECLARATION = {
    "name": SEARCH_AWARDS,
    "description": (
        "Search award flight availability for one route and date. Returns the points "
        "cost, cash fees, seats and redemption value (cents per point) for each "
        "loyalty program. This is the only source of availability and prices."
    ),
    "parameters_json_schema": {
        "type": "object",
        "properties": {
            "origin": {"type": "string", "description": "3-letter IATA airport code, e.g. ORD"},
            "destination": {"type": "string", "description": "3-letter IATA airport code, e.g. HND"},
            "departure_date": {"type": "string", "description": "Departure date, YYYY-MM-DD"},
            "return_date": {"type": "string", "description": "Optional return date, YYYY-MM-DD"},
            "cabin": {"type": "string", "enum": list(get_args(Cabin))},
            "passengers": {"type": "integer", "minimum": 1, "maximum": 9},
            "origin_quote": {
                "type": "string",
                "description": _QUOTE_DESCRIPTION.format(detail="origin", example='"Chicago"'),
            },
            "destination_quote": {
                "type": "string",
                "description": _QUOTE_DESCRIPTION.format(
                    detail="destination", example='"Tokyo"'
                ),
            },
            "date_quote": {
                "type": "string",
                "description": _QUOTE_DESCRIPTION.format(
                    detail="departure date", example='"Dec 1" or "next Friday"'
                ),
            },
        },
        "required": ["origin", "destination", "departure_date", *QUOTE_ARGS],
    },
}


def _normalize(text: str) -> str:
    return " ".join(text.casefold().split())


def missing_details(args: dict, user_text: str) -> list[str]:
    """Details whose quote is empty or doesn't appear in what the user wrote."""
    said = _normalize(user_text)
    missing = []
    for arg, detail in QUOTE_ARGS.items():
        quote = _normalize(str(args.get(arg) or "")).strip(_QUOTE_STRIP)
        if not quote or quote not in said:
            missing.append(detail)
    return missing


def run_search_tool(args: dict, user_text: str) -> tuple[dict, list[Result]]:
    """Validate the LLM's arguments and run the search.

    user_text is everything the user has written in this chat. The origin,
    destination and date must be grounded in it (see QUOTE_ARGS); otherwise no
    search runs and the LLM is told to ask the user.

    Returns (payload sent back to the LLM, results shown to the user). Invalid
    arguments produce an error payload instead of raising, so the LLM can ask
    the user to clarify. Award search failures also produce an error payload,
    so the LLM can tell the user instead of the whole chat request failing."""
    missing = missing_details(args, user_text)
    if missing:
        return {
            "error": "Missing trip details",
            "missing": missing,
            "instruction": (
                "The user hasn't given these yet. Ask the user for them in one short "
                "question. Do not guess them or use today's date."
            ),
        }, []

    search_args = {key: value for key, value in args.items() if key not in QUOTE_ARGS}
    try:
        criteria = SearchCriteria.model_validate(search_args)
    except ValidationError as error:
        details = json.loads(error.json(include_url=False, include_input=False))
        return {"error": "Invalid search criteria", "details": details}, []

    try:
        response = search_awards(criteria)
    except UPSTREAM_ERRORS as error:
        logger.warning("Award search failed", exc_info=error)
        return {"error": describe_upstream_error(error)[1]}, []
    payload: dict = {
        "count": len(response.results),
        "results": [result.model_dump(mode="json") for result in response.results],
    }
    if response.message:
        payload["message"] = response.message
    return payload, response.results
