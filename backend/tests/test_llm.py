"""Tests for the LLM tool layer and chat loop, using a fake Gemini client."""

from datetime import date
from types import SimpleNamespace

from google.genai import errors, types

from backend.llm import gemini_chat
from backend.llm.gemini_chat import (
    MAX_TOOL_ROUNDS,
    ROUND_LIMIT_REPLY,
    UNAVAILABLE_REPLY,
    build_contents,
    run_chat,
)
from backend.llm.tools import NO_RESULTS_MESSAGE, run_search_tool
from backend.models import ChatMessage, ChatRequest, SearchCriteria
from backend.search import search_awards

SEARCH_ARGS = {
    "origin": "ORD",
    "destination": "HND",
    "departure_date": "2026-12-01",
    "cabin": "business",
}


def text_response(text):
    return SimpleNamespace(function_calls=None, text=text, candidates=[])


def tool_response(args, name="search_awards"):
    call = types.FunctionCall(id="call-1", name=name, args=args)
    content = types.Content(role="model", parts=[types.Part(function_call=call)])
    return SimpleNamespace(
        function_calls=[call], text=None, candidates=[SimpleNamespace(content=content)]
    )


class FakeClient:
    """Returns scripted responses and records what it was sent."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.models = self

    def generate_content(self, *, model, contents, config):
        self.calls.append(list(contents))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def sent_function_response(client, call_index):
    """The function response payload included in the given model call."""
    return client.calls[call_index][-1].parts[0].function_response.response


def chat(client, message="Business class from Chicago to Tokyo on Dec 1", history=()):
    return run_chat(ChatRequest(message=message, history=list(history)), client, "test-model")


def test_run_search_tool_returns_results_from_code():
    payload, results = run_search_tool(SEARCH_ARGS)
    expected = search_awards(SearchCriteria.model_validate(SEARCH_ARGS))
    assert results == expected
    assert payload["count"] == len(expected)
    assert [r["cents_per_point"] for r in payload["results"]] == [
        r.cents_per_point for r in expected
    ]


def test_run_search_tool_reports_invalid_args():
    payload, results = run_search_tool({**SEARCH_ARGS, "origin": "Chicago"})
    assert payload["error"] == "Invalid search criteria"
    assert payload["details"]
    assert results == []


def test_run_search_tool_reports_no_results():
    payload, results = run_search_tool({**SEARCH_ARGS, "passengers": 9})
    assert results == []
    assert payload["count"] == 0
    assert payload["message"] == NO_RESULTS_MESSAGE


def test_plain_reply_without_tool_call():
    client = FakeClient(text_response("Where are you flying from, and when?"))
    response = chat(client, "flights to Tokyo")
    assert response.reply == "Where are you flying from, and when?"
    assert response.results == []
    assert len(client.calls) == 1


def test_tool_call_then_summary():
    client = FakeClient(tool_response(SEARCH_ARGS), text_response("Here are 3 options."))
    response = chat(client)
    assert response.reply == "Here are 3 options."
    assert response.results == search_awards(SearchCriteria.model_validate(SEARCH_ARGS))
    assert sent_function_response(client, 1)["count"] == len(response.results)


def test_invalid_tool_args_are_sent_back_to_model():
    client = FakeClient(
        tool_response({**SEARCH_ARGS, "origin": "Chicago"}),
        text_response("Which Chicago airport, O'Hare or Midway?"),
    )
    response = chat(client)
    assert response.reply == "Which Chicago airport, O'Hare or Midway?"
    assert response.results == []
    assert sent_function_response(client, 1)["error"] == "Invalid search criteria"


def test_no_results_message_is_sent_back_to_model():
    client = FakeClient(
        tool_response({**SEARCH_ARGS, "passengers": 9}),
        text_response("No availability found."),
    )
    response = chat(client)
    assert response.results == []
    assert sent_function_response(client, 1)["message"] == NO_RESULTS_MESSAGE


def test_unknown_tool_is_not_executed():
    client = FakeClient(tool_response({}, name="book_flight"), text_response("Sorry."))
    response = chat(client)
    assert response.results == []
    assert "Unknown tool" in sent_function_response(client, 1)["error"]


def test_tool_rounds_are_capped():
    client = FakeClient(*[tool_response(SEARCH_ARGS) for _ in range(MAX_TOOL_ROUNDS + 1)])
    response = chat(client)
    assert response.reply == ROUND_LIMIT_REPLY
    assert len(client.calls) == MAX_TOOL_ROUNDS
    assert response.results


def test_api_error_gives_friendly_reply():
    error = errors.APIError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})
    response = chat(FakeClient(error))
    assert response.reply == UNAVAILABLE_REPLY
    assert response.results == []


def test_history_maps_to_gemini_roles():
    request = ChatRequest(
        message="Make it economy",
        history=[
            ChatMessage(role="user", content="Chicago to Tokyo Dec 1"),
            ChatMessage(role="assistant", content="Here are 3 options."),
        ],
    )
    contents = build_contents(request)
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert [c.parts[0].text for c in contents] == [
        "Chicago to Tokyo Dec 1",
        "Here are 3 options.",
        "Make it economy",
    ]


def test_system_prompt_includes_today():
    client = FakeClient(text_response("Hi"))
    configs = []
    original = client.generate_content

    def capture(*, model, contents, config):
        configs.append(config)
        return original(model=model, contents=contents, config=config)

    client.generate_content = capture
    chat(client)
    assert date.today().isoformat() in configs[0].system_instruction
    assert configs[0].automatic_function_calling.disable is True


def test_missing_key_raises_not_configured(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    try:
        gemini_chat.get_client()
    except gemini_chat.LLMNotConfigured:
        return
    raise AssertionError("expected LLMNotConfigured")
