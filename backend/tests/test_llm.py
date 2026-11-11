"""Tests for the LLM tool layer and chat loop, using a fake Gemini client."""

from datetime import date
from types import SimpleNamespace

import pytest
from google.genai import errors, types

from backend.llm import gemini_chat
from backend.llm.gemini_chat import (
    MAX_HISTORY_MESSAGES,
    MAX_TOOL_ROUNDS,
    ROUND_LIMIT_REPLY,
    UNAVAILABLE_REPLY,
    build_contents,
    run_chat,
)
from backend.llm.tools import run_search_tool
from backend.models import ChatMessage, ChatRequest, SearchCriteria
from backend.search import search_awards

USER_TEXT = "Business class from Chicago to Tokyo on Dec 1"
SEARCH_ARGS = {
    "origin": "ORD",
    "destination": "HND",
    "departure_date": "2026-12-01",
    "cabin": "business",
    "cabin_quote": "Business class",
    "origin_quote": "Chicago",
    "destination_quote": "Tokyo",
    "date_quote": "Dec 1",
}
CRITERIA = SearchCriteria.model_validate(SEARCH_ARGS)


def text_response(text):
    return SimpleNamespace(function_calls=None, text=text, candidates=[])


def tool_response(args, name="search_awards"):
    return tool_calls_response(args, name=name)


def tool_calls_response(*args_list, name="search_awards"):
    """One model response that asks for several tool calls at once."""
    calls = [
        types.FunctionCall(id=f"call-{index}", name=name, args=args)
        for index, args in enumerate(args_list, start=1)
    ]
    content = types.Content(role="model", parts=[types.Part(function_call=call) for call in calls])
    return SimpleNamespace(
        function_calls=calls, text=None, candidates=[SimpleNamespace(content=content)]
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


def chat(client, message=USER_TEXT, history=()):
    return run_chat(ChatRequest(message=message, history=list(history)), client, "test-model")


def test_run_search_tool_returns_results_from_code():
    payload, results = run_search_tool(SEARCH_ARGS, USER_TEXT)
    expected = search_awards(CRITERIA).results
    assert results == expected
    assert payload["count"] == len(expected)
    assert [r["cents_per_point"] for r in payload["results"]] == [
        r.cents_per_point for r in expected
    ]


def test_run_search_tool_reports_invalid_args():
    payload, results = run_search_tool({**SEARCH_ARGS, "origin": "Chicago"}, USER_TEXT)
    assert payload["error"] == "Invalid search criteria"
    assert payload["details"]
    assert results == []


@pytest.mark.parametrize(("message", "cabin", "quote", "expected"), [
    ("sea to jfk dec 6", None, None, {"economy", "premium_economy", "business", "first"}),
    ("sea to jfk dec 6 business", "business", "business", {"business"}),
    ("first class sea to jfk dec 6", "first", "first class", {"first"}),
    ("sea to jfk dec 6 premium economy", "premium_economy", "premium economy", {"premium_economy"}),
    ("economy sea to jfk dec 6", "economy", "economy", {"economy"}),
    ("sea to jfk dec 6", "economy", None, {"economy", "premium_economy", "business", "first"}),
    ("sea to jfk dec 6", "economy", "economy", {"economy", "premium_economy", "business", "first"}),
])
def test_chat_only_filters_explicit_cabins(monkeypatch, seats_aero_row, message, cabin, quote, expected):
    row = seats_aero_row("alaska", origin="SEA", destination="JFK", day="2026-12-06")
    for prefix, points in zip("YWJF", (12500, 20000, 30000, 50000)):
        row.update({f"{prefix}Available": True, f"{prefix}MileageCost": str(points)})
    monkeypatch.setattr("backend.search._fetch_availability", lambda criteria: {"data": [row]})
    args = {"origin": "SEA", "destination": "JFK", "departure_date": "2026-12-06",
            "origin_quote": "sea", "destination_quote": "jfk", "date_quote": "dec 6"}
    if cabin is not None:
        args["cabin"] = cabin
    if quote is not None:
        args["cabin_quote"] = quote
    client = FakeClient(tool_response(args), text_response("Available awards."))
    response = chat(client, message)
    assert {result.cabin for result in response.results} == expected
    assert sent_function_response(client, 1)["count"] == len(expected)


def test_run_search_tool_reports_no_results():
    payload, results = run_search_tool({**SEARCH_ARGS, "passengers": 9}, USER_TEXT)
    assert results == []
    assert payload["count"] == 0
    assert payload["message"] == (
        "Business award seats exist from ORD to HND on 2026-12-01, "
        "but no program reports 9 seats available."
    )


def test_run_search_tool_rejects_date_the_user_never_gave():
    args = {**SEARCH_ARGS, "date_quote": ""}
    payload, results = run_search_tool(args, "Business class from Chicago to Tokyo")
    assert payload["error"] == "Missing trip details"
    assert payload["missing"] == ["departure date"]
    assert "today's date" in payload["instruction"]
    assert results == []


def test_run_search_tool_rejects_quotes_not_in_user_text():
    args = {**SEARCH_ARGS, "origin_quote": "New York", "date_quote": "today"}
    payload, results = run_search_tool(args, "Flights to Tokyo")
    assert payload["missing"] == ["origin", "departure date"]
    assert results == []


def test_run_search_tool_quotes_ignore_case_spacing_and_punctuation():
    args = {**SEARCH_ARGS, "origin_quote": "chicago", "date_quote": " DEC  1. "}
    payload, results = run_search_tool(args, USER_TEXT)
    assert "error" not in payload
    assert results


def test_missing_date_is_sent_back_and_model_asks():
    client = FakeClient(
        tool_response({**SEARCH_ARGS, "departure_date": "2026-11-03", "date_quote": ""}),
        text_response("What date would you like to fly?"),
    )
    response = chat(client, "Business class from Chicago to Tokyo")
    assert response.reply == "What date would you like to fly?"
    assert response.results == []
    assert sent_function_response(client, 1)["missing"] == ["departure date"]


def test_details_from_earlier_user_messages_count():
    history = [
        ChatMessage(role="user", content="Business class from Chicago to Tokyo"),
        ChatMessage(role="assistant", content="What date would you like to fly?"),
    ]
    client = FakeClient(tool_response(SEARCH_ARGS), text_response("Here are 3 options."))
    response = chat(client, "Dec 1", history)
    assert response.results == search_awards(CRITERIA).results


def test_assistant_messages_do_not_count_as_user_details():
    history = [
        ChatMessage(role="user", content="Business class from Chicago to Tokyo"),
        ChatMessage(role="assistant", content="Did you mean Dec 1?"),
    ]
    client = FakeClient(tool_response(SEARCH_ARGS), text_response("What date?"))
    response = chat(client, "Not sure", history)
    assert response.results == []
    assert sent_function_response(client, 1)["missing"] == ["departure date"]


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
    assert response.results == search_awards(CRITERIA).results
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
    assert "9 seats" in sent_function_response(client, 1)["message"]


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


# Follow-ups and refinements. History carries text only, so each follow-up runs a
# fresh search; the user's earlier messages still ground the quote arguments.
FIRST_TURN = [
    ChatMessage(role="user", content=USER_TEXT),
    ChatMessage(role="assistant", content="ORD to HND, Dec 1, business, 1 passenger: 2 options."),
]


def test_follow_up_changes_the_date_and_sends_history():
    args = {**SEARCH_ARGS, "departure_date": "2026-12-03", "date_quote": "Dec 3"}
    client = FakeClient(tool_response(args), text_response("ORD to HND, Dec 3: 2 options."))
    response = chat(client, "Try Dec 3 instead", FIRST_TURN)
    assert response.results
    assert {result.departure_date.isoformat() for result in response.results} == {"2026-12-03"}
    assert [content.role for content in client.calls[0]] == ["user", "model", "user"]


def test_follow_up_changes_the_cabin():
    args = {**SEARCH_ARGS, "cabin": "economy", "cabin_quote": "economy"}
    client = FakeClient(tool_response(args), text_response("Economy options."))
    response = chat(client, "Make it economy", FIRST_TURN)
    assert {result.cabin for result in response.results} == {"economy"}


def test_program_filter_keeps_matching_programs_in_code():
    args = {**SEARCH_ARGS, "cabin": None, "cabin_quote": "", "programs": ["united"]}
    payload, results = run_search_tool(args, USER_TEXT)
    assert {result.program for result in results} == {"United MileagePlus"}
    assert {result.cabin for result in results} == {"economy", "business"}
    assert payload["count"] == len(results) == 2


def test_points_limit_keeps_cheaper_results():
    payload, results = run_search_tool({**SEARCH_ARGS, "max_points": 80000}, USER_TEXT)
    assert [(result.program, result.points_cost) for result in results] == [
        ("Air Canada Aeroplan", 75000)
    ]
    assert payload["count"] == 1


def test_filters_that_match_nothing_explain_why():
    args = {**SEARCH_ARGS, "programs": ["Delta"], "max_points": 50000}
    payload, results = run_search_tool(args, USER_TEXT)
    assert results == []
    assert payload["count"] == 0
    assert payload["message"] == (
        "2 award options were found, but none match programs Delta and at most 50000 points."
    )


def test_filters_keep_the_original_no_availability_message():
    payload, results = run_search_tool({**SEARCH_ARGS, "passengers": 9, "programs": ["United"]}, USER_TEXT)
    assert results == []
    assert "no program reports 9 seats" in payload["message"]


@pytest.mark.parametrize("bad", [{"max_points": 0}, {"programs": "United"}])
def test_invalid_filters_are_sent_back_to_model(bad):
    payload, results = run_search_tool({**SEARCH_ARGS, **bad}, USER_TEXT)
    assert payload["error"] == "Invalid search criteria"
    assert results == []


def test_two_searches_in_one_turn_are_combined():
    dec_3 = {**SEARCH_ARGS, "departure_date": "2026-12-03", "date_quote": "Dec 3"}
    client = FakeClient(tool_calls_response(SEARCH_ARGS, dec_3), text_response("Both dates."))
    response = chat(client, "Dec 1 or Dec 3?", FIRST_TURN[:1])
    dates = [result.departure_date.isoformat() for result in response.results]
    assert dates.count("2026-12-01") == dates.count("2026-12-03") == 2
    sent = client.calls[1][-1].parts
    assert [part.function_response.response["count"] for part in sent] == [2, 2]


def test_repeated_search_does_not_duplicate_results():
    client = FakeClient(tool_response(SEARCH_ARGS), tool_response(SEARCH_ARGS), text_response("Done."))
    response = chat(client)
    assert response.results == search_awards(CRITERIA).results


def test_history_is_trimmed_to_recent_non_blank_messages():
    history = [
        ChatMessage(role="user" if index % 2 == 0 else "assistant", content=f"message {index}")
        for index in range(MAX_HISTORY_MESSAGES + 5)
    ]
    history.insert(-2, ChatMessage(role="assistant", content="  "))
    contents = build_contents(ChatRequest(message="Latest", history=history))
    texts = [content.parts[0].text for content in contents]
    assert contents[0].role == "user"
    assert len(contents) <= MAX_HISTORY_MESSAGES + 1
    assert "  " not in texts
    assert texts[-2:] == [f"message {MAX_HISTORY_MESSAGES + 4}", "Latest"]


def test_details_only_in_trimmed_history_are_not_used():
    history = [ChatMessage(role="user", content="From Chicago")] + [
        ChatMessage(role="assistant" if index % 2 == 0 else "user", content="ok")
        for index in range(MAX_HISTORY_MESSAGES)
    ]
    client = FakeClient(tool_response(SEARCH_ARGS), text_response("Where from?"))
    response = chat(client, "Business class to Tokyo on Dec 1", history)
    assert response.results == []
    assert sent_function_response(client, 1)["missing"] == ["origin"]
