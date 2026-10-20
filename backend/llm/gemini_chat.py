"""Gemini tool-calling loop for the chat endpoint.

The model turns a message into search_awards arguments and summarizes the
results. It never searches or computes values itself."""

import logging
import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

from backend.llm.tools import SEARCH_AWARDS, SEARCH_AWARDS_DECLARATION, run_search_tool
from backend.models import ChatRequest, ChatResponse, Result

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3.5-flash-lite"
# Each round is one model call; caps how much quota a tool-call loop can use.
MAX_TOOL_ROUNDS = 3

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

ROUND_LIMIT_REPLY = (
    "Sorry, I couldn't finish that search. Try rephrasing, or use the search form."
)
UNAVAILABLE_REPLY = "The assistant is unavailable right now. Please try the search form."

SYSTEM_PROMPT = """You help travelers find award flights and understand what their points are worth.
Today's date is {today}.

Rules:
- Use the search_awards tool for any availability, points or price question. Never invent flights,
  points costs, fees, seat counts or values.
- If the origin, destination or departure date is missing or ambiguous, ask the user instead of
  guessing. Convert city names to the main IATA airport code and relative dates to YYYY-MM-DD.
- Only quote numbers that appear in the tool results. Do not do your own math.
- If cents_per_point is null, say there is no value data for that option.
- If the tool returns no results, say plainly that no availability was found.
- If the tool returns an error, explain what needs fixing and ask the user.
- Keep replies short and friendly; the user may be new to points programs."""


class LLMNotConfigured(RuntimeError):
    """Raised when no Gemini API key is available."""


def get_client() -> genai.Client:
    load_dotenv(ENV_FILE)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LLMNotConfigured("GEMINI_API_KEY is not set")
    return genai.Client(api_key=api_key)


def get_model() -> str:
    load_dotenv(ENV_FILE)
    return os.getenv("GEMINI_MODEL") or DEFAULT_MODEL


def build_contents(request: ChatRequest) -> list[types.Content]:
    """Convert API chat history plus the new message into Gemini contents."""
    contents = [
        types.Content(
            role="model" if message.role == "assistant" else "user",
            parts=[types.Part(text=message.content)],
        )
        for message in request.history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=request.message)]))
    return contents


def run_chat(
    request: ChatRequest, client: genai.Client | None = None, model: str | None = None
) -> ChatResponse:
    """Answer one chat message, running award searches the model asks for."""
    client = client or get_client()
    model = model or get_model()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT.format(today=date.today().isoformat()),
        tools=[types.Tool(function_declarations=[SEARCH_AWARDS_DECLARATION])],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    contents = build_contents(request)
    results: list[Result] = []

    try:
        for _ in range(MAX_TOOL_ROUNDS):
            response = client.models.generate_content(
                model=model, contents=contents, config=config
            )
            calls = response.function_calls
            if not calls:
                return ChatResponse(reply=response.text or "", results=results)

            contents.append(response.candidates[0].content)
            response_parts = []
            for call in calls:
                payload, call_results = _run_tool(call)
                if call_results:
                    results = call_results
                response_parts.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call.id, name=call.name, response=payload
                        )
                    )
                )
            contents.append(types.Content(role="user", parts=response_parts))
    except errors.APIError:
        logger.exception("Gemini API call failed")
        return ChatResponse(reply=UNAVAILABLE_REPLY, results=[])

    logger.warning("Chat stopped after %d tool rounds", MAX_TOOL_ROUNDS)
    return ChatResponse(reply=ROUND_LIMIT_REPLY, results=results)


def _run_tool(call: types.FunctionCall) -> tuple[dict, list[Result]]:
    if call.name != SEARCH_AWARDS:
        return {"error": f"Unknown tool: {call.name}"}, []
    return run_search_tool(dict(call.args or {}))
