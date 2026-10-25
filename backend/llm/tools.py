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
        },
        "required": ["origin", "destination", "departure_date"],
    },
}

NO_RESULTS_MESSAGE = "No award availability found for these criteria."


def run_search_tool(args: dict) -> tuple[dict, list[Result]]:
    """Validate the LLM's arguments and run the search.

    Returns (payload sent back to the LLM, results shown to the user). Invalid
    arguments produce an error payload instead of raising, so the LLM can ask
    the user to clarify. Award search failures also produce an error payload,
    so the LLM can tell the user instead of the whole chat request failing."""
    try:
        criteria = SearchCriteria.model_validate(args)
    except ValidationError as error:
        details = json.loads(error.json(include_url=False, include_input=False))
        return {"error": "Invalid search criteria", "details": details}, []

    try:
        results = search_awards(criteria)
    except UPSTREAM_ERRORS as error:
        logger.warning("Award search failed", exc_info=error)
        return {"error": describe_upstream_error(error)[1]}, []
    payload: dict = {
        "count": len(results),
        "results": [result.model_dump(mode="json") for result in results],
    }
    if not results:
        payload["message"] = NO_RESULTS_MESSAGE
    return payload, results
