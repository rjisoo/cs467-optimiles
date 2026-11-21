"""Gemini tool-calling loop for the chat endpoint.

The model turns a message into search_awards arguments and summarizes the
results. It never searches or computes values itself."""

import logging
import os
import re
import threading
from datetime import date
from pathlib import Path

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

from backend.llm.rate_limit import GeminiRateLimiter
from backend.llm.tools import CLARIFY_TRIP, CLARIFY_TRIP_DECLARATION, SEARCH_AWARDS, SEARCH_AWARDS_DECLARATION, run_search_tool
from backend.models import ChatCriteria, ChatFailure, ChatMessage, ChatRequest, ChatResponse, ChatSearch, Result

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.5-flash-lite"
# Each round is one model call; caps how much quota a tool-call loop can use.
MAX_TOOL_ROUNDS = 3
# Only the most recent history is sent, so a long chat doesn't grow every request.
MAX_HISTORY_MESSAGES = 20
# Per Gemini call. MAX_TOOL_ROUNDS calls must fit in the server's request timeout
# (Gunicorn's is 120 s in deploy/launch.sh).
DEFAULT_TIMEOUT_SECONDS = 30.0

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

ROUND_LIMIT_REPLY = (
    "Sorry, I couldn't finish that search. Try rephrasing, or use the search form."
)
UNAVAILABLE_REPLY = "The assistant is unavailable right now. Please try the search form."
OVERLOADED_REPLY = (
    "The assistant service is temporarily busy. Please wait a moment and retry, "
    "or use the search form."
)
TIMEOUT_REPLY = (
    "The assistant took too long to answer. Please try again, or use the search form."
)
BUSY_REPLY = (
    "The assistant is getting a lot of requests right now. Please wait a minute and try "
    "again, or use the search form."
)

SYSTEM_PROMPT = """You help travelers find award flights and understand what their points are worth.
Today's date is {today}.

Rules:
- Only one-way searches are supported. For round-trip or return-date requests, explain this
  limitation and ask whether the user wants a one-way search. Do not silently search the outbound leg.
- Use the search_awards tool for any availability, points or price question. Never invent flights,
  points costs, fees, seat counts or values.
- The user must give the origin, destination and departure date themselves. If any is missing or
  ambiguous, ask for everything that's missing in one short question instead of guessing. Never
  assume today's date, a default city or a nearby date. Convert city names to the main IATA
  airport code and relative dates (e.g. "tomorrow", "next Friday") to YYYY-MM-DD.
- Search all cabin classes when the user does not specify a cabin. Omit cabin and cabin_quote;
  never default to economy or ask for a cabin just to search. Only set cabin when explicitly
  requested, with cabin_quote copied from the user's words. Recognize cabin requests anywhere
  in the message: "SEA to JFK Dec 6 business" means business, and "first class SEA to JFK Dec 6"
  means first. An unqualified "SEA to JFK Dec 6" searches all cabins.
- Passengers default to 1; mention it when you use that default.
- Every search_awards call must include origin_quote, destination_quote and date_quote copied
  from the user's exact words. For "lax to jfk dec 6", use "lax", "jfk" and "dec 6";
  do not expand airport names or add the inferred year to quotes. Use empty quotes for unchanged
  details supplied by current-trip context.
- If the tool returns "Missing trip details", retry with exact quotes for details the user
  already supplied. Ask only for details actually absent from their messages and current context.
- Only quote numbers that appear in the tool results. Do not do your own math.
- cash_fare_usd is an estimated fare for the route, date and cabin; it may be a different flight.
  Quote it exactly as supplied. Summary points and fees can be independent minima, so their
  cents_per_point and value_rating remain null even with a cash fare. Repeat any value_warning.
- If value_rating is null, never rate it yourself. The frontend can show labeled before-fees
  estimates from the captured cash fare and points when fees cannot be verified. For a matched
  loaded trip, it may infer a missing fee currency from the same availability summary while
  using that trip's own fees and points. Do not claim missing fees are zero or that these estimates
  include fees. Do not imply the cash fare is missing when cash_fare_usd is supplied. Fixed display
  tiers are bad/fair/good/great/exceptional, not program-specific valuations or guaranteed cash-out values.
- If cash_fees_usd or seats_available is null, say that it wasn't reported; don't guess.
- If the tool returns partial=true, explain its warnings. No matches only means none in the searched data;
  never claim that no availability exists. Otherwise, use the tool's message to explain empty results.
- If the tool returns an error, explain what needs fixing and ask the user.
- Follow-ups: when the user changes one detail (date, cabin, passengers), search again and reuse
  the other details from earlier in the conversation. To compare dates, search each date.
- Structured current-trip context overrides older history. Pass only changed details to search_awards;
  omitted fields reuse context, including airport alternatives, date ranges, cabins and passengers.
  Include quotes for changed details. Explicit new details override context.
- When details are missing or a request is unsupported, call clarify_trip with one question and
  every missing_fields item. Never search in the same response as a clarification.
- When the route and date are clear, call search_awards immediately without asking for confirmation.
  A named month and day without a year means its next occurrence (including today).
  City names that require an airport choice and ambiguous or mismatched dates still require
  confirmation. The search tool will request it when needed; do not bypass it with another call.
- To narrow results to certain programs or a points limit, search again with programs or
  max_points. Never filter or compare results yourself.
- When you report results, first state what was searched (route, date, cabin or "all cabins",
  passengers) so later messages can refer back to it.
- Keep replies short and friendly; the user may be new to points programs."""


class LLMNotConfigured(RuntimeError):
    """Raised when no Gemini API key is available."""


def get_client() -> genai.Client:
    load_dotenv(ENV_FILE)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LLMNotConfigured("GEMINI_API_KEY is not set")
    timeout_ms = int(get_timeout_seconds() * 1000)
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=timeout_ms))


def get_model() -> str:
    load_dotenv(ENV_FILE)
    return os.getenv("GEMINI_MODEL") or DEFAULT_MODEL


def get_timeout_seconds() -> float:
    """Per-call timeout from GEMINI_TIMEOUT_SECONDS, or the default if unset or invalid."""
    load_dotenv(ENV_FILE)
    value = os.getenv("GEMINI_TIMEOUT_SECONDS", "").strip()
    if not value:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        seconds = float(value)
    except ValueError:
        seconds = 0.0
    if seconds <= 0:
        logger.warning(
            "Ignoring GEMINI_TIMEOUT_SECONDS=%r; using %s", value, DEFAULT_TIMEOUT_SECONDS
        )
        return DEFAULT_TIMEOUT_SECONDS
    return seconds


_rate_limiter: GeminiRateLimiter | None = None
_rate_limiter_lock = threading.Lock()


def get_rate_limiter() -> GeminiRateLimiter:
    """The process-wide limiter, built from GEMINI_RPM / GEMINI_RPD on first use."""
    global _rate_limiter
    with _rate_limiter_lock:
        if _rate_limiter is None:
            load_dotenv(ENV_FILE)
            _rate_limiter = GeminiRateLimiter.from_env()
        return _rate_limiter


def recent_history(request: ChatRequest) -> list[ChatMessage]:
    """The last MAX_HISTORY_MESSAGES non-blank messages, starting with a user message."""
    history = [message for message in request.history if message.content.strip()]
    history = history[-MAX_HISTORY_MESSAGES:]
    while history and history[0].role != "user":
        history = history[1:]
    return history


def build_contents(request: ChatRequest) -> list[types.Content]:
    """Convert recent chat history plus the new message into Gemini contents."""
    contents = [
        types.Content(
            role="model" if message.role == "assistant" else "user",
            parts=[types.Part(text=message.content)],
        )
        for message in recent_history(request)
    ]
    if request.context:
        contents.append(types.Content(role="user", parts=[types.Part(
            text="Current trip context (use instead of older history): " + request.context.model_dump_json()
        )]))
    contents.append(types.Content(role="user", parts=[types.Part(text=request.message)]))
    return contents


def run_chat(
    request: ChatRequest,
    client: genai.Client | None = None,
    model: str | None = None,
    rate_limiter: GeminiRateLimiter | None = None,
) -> ChatResponse:
    """Answer one chat message, running award searches the model asks for."""
    outcome = ChatResponse(reply="", criteria=request.context)

    def finish(reply: str, failure: str | None = None) -> ChatResponse:
        outcome.reply = reply
        if failure:
            outcome.failure = ChatFailure(code=failure, retryable=True)
        completed = any(group.status != "failed" for group in outcome.searches)
        if completed and outcome.status in ("clarification", "confirmation"):
            outcome.status = "partial"
            outcome.partial = True
            outcome.warnings.append("Some requested searches need more details or confirmation. Use Edit trip to review them.")
        if outcome.failure:
            outcome.status = "partial" if completed else "failed"
            outcome.partial |= completed
        elif outcome.status not in ("clarification", "confirmation") and outcome.searches:
            outcome.status = "partial" if outcome.partial else "results" if outcome.results else "empty"
        return outcome

    def collect(payload: dict, found: list[Result]) -> None:
        if payload.get("criteria"):
            outcome.criteria = ChatCriteria.model_validate(payload["criteria"])
        outcome.results = merge_results(outcome.results, found)
        outcome.partial |= payload.get("partial", False)
        outcome.warnings = list(dict.fromkeys([*outcome.warnings, *payload.get("warnings", [])]))
        if payload.get("failure"):
            outcome.failure = ChatFailure.model_validate(payload["failure"])
        if payload.get("confirmation"):
            outcome.status = "confirmation"
            outcome.missing_fields = payload.get("missing", [])
        elif payload.get("error") and not payload.get("failure"):
            outcome.status = "clarification"
            outcome.missing_fields = payload.get("missing", ["trip details"])
        elif payload.get("criteria"):
            group = ChatSearch(
                criteria=outcome.criteria, status="failed" if payload.get("failure") else "results" if found else "empty",
                results=found, message=payload.get("error") or payload.get("message"),
                partial=payload.get("partial", False), warnings=payload.get("warnings", []), failure=payload.get("failure"),
            )
            if group not in outcome.searches:
                outcome.searches.append(group)
            outcome.status = "reply"
            outcome.missing_fields = []

    if request.confirmed:
        payload, found = run_search_tool({}, "", request.context, confirmed=True)
        collect(payload, found)
        return finish(payload.get("error") or payload.get("message") or "Here are the requested award options.")
    if re.search(r"\b(non[ -]?stop|round[ -]?trip|return flight|direct flights?|(?:\d+|one|two|three) stops?)\b", request.message, re.I):
        return ChatResponse(reply="Chat supports one-way availability searches without a stops filter. Please confirm supported trip details using Edit trip.",
                            status="clarification", criteria=request.context, missing_fields=["unsupported request"])
    client = client or get_client()
    model = model or get_model()
    rate_limiter = rate_limiter or get_rate_limiter()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT.format(today=date.today().isoformat()),
        tools=[types.Tool(function_declarations=[SEARCH_AWARDS_DECLARATION, CLARIFY_TRIP_DECLARATION])],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    contents = build_contents(request)
    user_text = user_messages_text(request)
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            if not rate_limiter.try_acquire():
                logger.warning("Gemini rate limit reached; skipping the call")
                return finish(BUSY_REPLY, "model_quota")
            response = client.models.generate_content(
                model=model, contents=contents, config=config
            )
            calls = response.function_calls
            if not calls:
                if not response.text and not outcome.searches:
                    return finish("The assistant returned no usable response. Please try again.", "interpretation")
                return finish(response.text or "")

            clarification = next((call for call in calls if call.name == CLARIFY_TRIP), None)
            if clarification:
                args = dict(clarification.args or {})
                question, missing = args.get("question"), args.get("missing_fields")
                if not isinstance(question, str) or not question.strip() or not isinstance(missing, list) or not all(isinstance(field, str) for field in missing):
                    return finish("The assistant could not interpret the trip. Please try again.", "interpretation")
                outcome.status = "clarification"
                outcome.missing_fields = missing
                return finish(question)

            contents.append(response.candidates[0].content)
            response_parts = []
            for call in calls:
                if call.name != SEARCH_AWARDS:
                    return finish("The assistant requested an unsupported operation.", "interpretation")
                payload, call_results = run_search_tool(dict(call.args or {}), user_text, request.context, require_confirmation=True)
                collect(payload, call_results)
                if payload.get("confirmation"):
                    return finish(payload["message"])
                response_parts.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call.id, name=call.name, response=payload
                        )
                    )
                )
            contents.append(types.Content(role="user", parts=response_parts))
    except httpx.TimeoutException:
        logger.warning("Gemini call timed out")
        return finish(TIMEOUT_REPLY, "model_timeout")
    except httpx.HTTPError:
        logger.exception("Could not reach Gemini")
        return finish(UNAVAILABLE_REPLY, "model_unavailable")
    except errors.APIError as error:
        if error.code == 429:
            logger.warning("Gemini quota exceeded: %s", error)
            return finish(BUSY_REPLY, "model_quota")
        if error.code == 503:
            logger.warning("Gemini temporarily unavailable (HTTP 503); returning a retryable chat response")
            return finish(OVERLOADED_REPLY, "model_unavailable")
        logger.exception("Gemini API call failed")
        return finish(UNAVAILABLE_REPLY, "model_unavailable")

    logger.warning("Chat stopped after %d tool rounds", MAX_TOOL_ROUNDS)
    return finish(ROUND_LIMIT_REPLY, "round_limit")


def user_messages_text(request: ChatRequest) -> str:
    """Everything the user (not the assistant) has written in this chat."""
    said = [message.content for message in recent_history(request) if message.role == "user"]
    return "\n".join([*said, request.message])


def merge_results(earlier: list[Result], new: list[Result]) -> list[Result]:
    """Combine results from every search in one turn (e.g. comparing two dates).

    Each request starts empty, so a follow-up's results replace the previous
    turn's. Exact duplicates from repeated searches are dropped."""
    seen = {result.model_dump_json() for result in earlier}
    merged = list(earlier)
    for result in new:
        key = result.model_dump_json()
        if key not in seen:
            seen.add(key)
            merged.append(result)
    return merged
