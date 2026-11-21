"""Tools the LLM may call. Pure Python: no Flask or Gemini imports.

The LLM only chooses arguments. Code validates them with SearchCriteria and
runs the search; every number the user sees comes from search.py."""

import json
import logging
import re
from datetime import date, datetime
from typing import get_args

from pydantic import BaseModel, Field, ValidationError, field_validator

from backend.airports import airport_today
from backend.errors import UPSTREAM_ERRORS, describe_upstream_error
from backend.models import Cabin, ChatCriteria, Result, SearchResponse, StructuredSearchCriteria
from backend.search import search_awards

logger = logging.getLogger(__name__)

SEARCH_AWARDS = "search_awards"
CLARIFY_TRIP = "clarify_trip"
CLARIFY_TRIP_DECLARATION = {
    "name": CLARIFY_TRIP,
    "description": "Ask all missing or unsupported trip details together. No search runs.",
    "parameters_json_schema": {
        "type": "object", "properties": {
            "question": {"type": "string"},
            "missing_fields": {"type": "array", "items": {"type": "string"}},
        }, "required": ["question", "missing_fields"],
    },
}

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
_MONTH = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
)
_DATE_QUOTE = re.compile(
    rf"\b(?:\d{{4}}-\d{{2}}-\d{{2}}|(?:{_MONTH}\s+\d{{1,2}}(?:st|nd|rd|th)?|"
    rf"\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTH})(?:,?\s+\d{{4}})?)\b"
    r"(?![\w]|\s*[,./-]?\s*\d)", re.I,
)

# Refinement arguments. They only narrow results the search already returned, so
# code does the filtering and the model never compares numbers itself.
FILTER_ARGS = ("programs", "max_points")


class ResultFilters(BaseModel):
    programs: list[str] = Field(default=[], description="Keep programs whose name contains one of these")
    max_points: int | None = Field(default=None, ge=1, description="Keep results costing at most this many points")

    @field_validator("programs")
    @classmethod
    def drop_blank_programs(cls, names: list[str]) -> list[str]:
        return [name.strip() for name in names if name.strip()]

    def apply(self, results: list[Result]) -> list[Result]:
        wanted = [_normalize(name) for name in self.programs]
        return [
            result for result in results
            if (not wanted or any(name in _normalize(result.program) for name in wanted))
            and (self.max_points is None or result.points_cost <= self.max_points)
        ]

    def describe(self) -> str:
        parts = []
        if self.programs:
            parts.append("programs " + ", ".join(self.programs))
        if self.max_points is not None:
            parts.append(f"at most {self.max_points} points")
        return " and ".join(parts)


SEARCH_AWARDS_DECLARATION = {
    "name": SEARCH_AWARDS,
    "description": (
        "Search one-way award flight availability for one route and date. Round-trip "
        "searches are unsupported. Returns the points "
        "cost, cash fees, seats and redemption value (cents per point) for each "
        "loyalty program. This is the only source of availability and prices."
    ),
    "parameters_json_schema": {
        "type": "object",
        "properties": {
            "origin": {"anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]},
            "destination": {"anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]},
            "departure_date": {"type": "string", "description": "Departure date, YYYY-MM-DD"},
            "departure_date_end": {"type": "string", "description": "Inclusive requested range end, YYYY-MM-DD"},
            "cabin": {
                "type": "string", "enum": list(get_args(Cabin)),
                "description": "Only set when the user explicitly requests a cabin. Omit to search all cabins.",
            },
            "cabin_quote": {
                "type": "string",
                "description": _QUOTE_DESCRIPTION.format(
                    detail="requested cabin", example='"business" or "first class"'
                ),
            },
            "cabins": {"type": "array", "items": {"type": "string", "enum": list(get_args(Cabin))}},
            "passengers": {"type": "integer", "minimum": 1, "maximum": 9},
            "programs": {
                "type": "array", "items": {"type": "string"},
                "description": "Only set when the user asks for specific loyalty programs or "
                "airlines' programs, e.g. [\"United\"]. Omit to include every program.",
            },
            "max_points": {
                "type": "integer", "minimum": 1,
                "description": "Only set when the user gives a points limit, e.g. 60000 for "
                "\"under 60k points\". Omit for no limit.",
            },
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
        "required": list(QUOTE_ARGS),
    },
}


def _normalize(text: str) -> str:
    return " ".join(text.casefold().split())


def _explicit_date(quote: str, expected: str, today: date) -> bool:
    if re.search(rf"\b{re.escape(expected)}\b", quote):
        return True
    normalized = _normalize(quote).strip(_QUOTE_STRIP).removeprefix("on ").replace(",", "")
    normalized = re.sub(r"\b(\d{1,2})(?:st|nd|rd|th)\b", r"\1", normalized)
    for pattern in ("%B %d %Y", "%b %d %Y", "%d %B %Y", "%d %b %Y"):
        try:
            if datetime.strptime(normalized, pattern).date().isoformat() == expected:
                return True
        except ValueError:
            pass
    for pattern in ("%B %d", "%b %d", "%d %B", "%d %b"):
        for year in (today.year, today.year + 1):
            try:
                candidate = datetime.strptime(f"{normalized} {year}", f"{pattern} %Y").date()
            except ValueError:
                continue
            if candidate >= today:
                return candidate.isoformat() == expected
    return False


def missing_details(args: dict, user_text: str) -> list[str]:
    """Details whose quote is empty or doesn't appear in what the user wrote."""
    said = _normalize(user_text)
    missing = []
    for arg, detail in QUOTE_ARGS.items():
        quote = _normalize(str(args.get(arg) or "")).strip(_QUOTE_STRIP)
        if not quote or quote not in said:
            missing.append(detail)
    return missing


def _recover_quotes(args: dict, user_text: str) -> None:
    """Recover omitted evidence only from literal airport codes and a single date."""
    missing = missing_details(args, user_text)
    for field in ("origin", "destination"):
        code = args.get(field)
        if field in missing and isinstance(code, str) and re.fullmatch(r"[A-Za-z]{3}", code):
            match = re.search(rf"\b{code}\b", user_text, re.I)
            if match:
                args[f"{field}_quote"] = match[0]
    if "departure date" in missing:
        dates = {match[0] for match in _DATE_QUOTE.finditer(user_text)}
        if len(dates) == 1:
            args["date_quote"] = dates.pop()


def run_search_tool(
    args: dict, user_text: str, context: StructuredSearchCriteria | None = None,
    *, require_confirmation: bool = False, confirmed: bool = False,
) -> tuple[dict, list[Result]]:
    """Validate the LLM's arguments and run the search.

    user_text is everything the user has written in this chat. The origin,
    destination and date must be grounded in it (see QUOTE_ARGS); otherwise no
    search runs and the LLM is told to ask the user.

    Returns (payload sent back to the LLM, results shown to the user). Invalid
    arguments produce an error payload instead of raising, so the LLM can ask
    the user to clarify. Award search failures also produce an error payload,
    so the LLM can tell the user instead of the whole chat request failing."""
    args = dict(args)
    _recover_quotes(args, user_text)
    base = context.model_dump(mode="json", exclude_none=True) if context else {}
    evidence = dict(args)
    for quote, field in QUOTE_ARGS.items():
        key = "departure_date" if field == "departure date" else field
        if key in base and (key not in args or args[key] == base[key]):
            evidence[quote] = str(base[key])
            user_text += "\n" + str(base[key])
    missing = [] if confirmed else missing_details(evidence, user_text)
    if missing:
        return {
            "error": "Missing trip details",
            "missing": missing,
            "instruction": (
                "These details have no matching evidence. If the user supplied them, retry "
                "with quotes copied exactly from their words. Otherwise ask for them in one "
                "short question. Do not guess them or use today's date."
            ),
        }, []

    search_args = {**base, **{key: value for key, value in args.items() if key not in QUOTE_ARGS and key != "cabin_quote"}}
    if "cabin" in args:
        search_args.pop("cabins", None)
    if "cabins" in args:
        search_args.pop("cabin", None)
    if "departure_date" in args and args["departure_date"] != base.get("departure_date") and "departure_date_end" not in args:
        search_args.pop("departure_date_end", None)
    cabin_quote = _normalize(str(args.get("cabin_quote") or "")).strip(_QUOTE_STRIP)
    if not confirmed and (not cabin_quote or cabin_quote not in _normalize(user_text)):
        search_args.pop("cabins", None)
        search_args["cabin"] = None
        if context:
            search_args.update({key: base[key] for key in ("cabin", "cabins") if key in base})
    try:
        criteria = ChatCriteria.model_validate(search_args)
        if criteria.cabin:
            criteria = criteria.model_copy(update={"cabins": [criteria.cabin], "cabin": None})
        filters = ResultFilters.model_validate({key: search_args[key] for key in FILTER_ARGS if search_args.get(key) is not None})
    except ValidationError as error:
        details = json.loads(error.json(include_url=False, include_input=False))
        return {"error": "Invalid search criteria", "details": details,
                "missing": list(dict.fromkeys(str(item["loc"][0]) if item["loc"] else "trip details" for item in details))}, []

    normalized = criteria.model_dump(mode="json", exclude_none=True)
    uncertain = []
    if require_confirmation and not confirmed:
        today = max(airport_today(origin) for origin in criteria.origin_codes)
        for quote, field in QUOTE_ARGS.items():
            key = "departure_date" if field == "departure date" else field
            if key in base and (key not in args or args[key] == base[key]):
                continue
            quoted = str(args.get(quote, ""))
            codes = getattr(criteria, f"{key}_codes", [])
            if (codes and any(not re.search(rf"\b{code}\b", quoted, re.I) for code in codes)) or (
                key == "departure_date" and not _explicit_date(quoted, normalized["departure_date"], today)
            ):
                uncertain.append(field)
        end = normalized.get("departure_date_end")
        if end and end != normalized["departure_date"] and end != base.get("departure_date_end") and end not in str(args.get("date_quote", "")):
            uncertain.append("departure date range")
    if uncertain:
        return {"confirmation": True, "criteria": normalized, "missing": uncertain,
                "message": "Please confirm the proposed airports and dates before searching."}, []

    try:
        response = search_awards(criteria)
    except UPSTREAM_ERRORS as error:
        logger.warning("Award search failed", exc_info=error)
        status, message = describe_upstream_error(error)
        return {"error": message, "criteria": normalized, "failure": {
            "code": {504: "tool_timeout", 503: "tool_quota"}.get(status, "tool_unavailable"), "retryable": True,
        }}, []
    except (ValidationError, ValueError, TypeError):
        logger.exception("Award search returned unusable data")
        return {"error": "Award search returned unusable data.", "criteria": normalized,
                "failure": {"code": "malformed_upstream", "retryable": True}}, []
    response = _filter_response(response, filters)
    payload: dict = {
        "criteria": normalized,
        "count": len(response.results),
        "results": [result.model_dump(mode="json") for result in response.results],
        "partial": response.partial,
        "warnings": response.warnings,
    }
    if response.message:
        payload["message"] = response.message
    return payload, response.results


def _filter_response(response: SearchResponse, filters: ResultFilters) -> SearchResponse:
    """Apply the user's refinements; explain when they remove every result."""
    if not response.results or not filters.describe():
        return response
    kept = filters.apply(response.results)
    if kept:
        return response.model_copy(update={"results": kept, "message": None})
    return response.model_copy(update={"results": [], "message": (
        f"{len(response.results)} award options were found, but none match "
        f"{filters.describe()}."
    )})
