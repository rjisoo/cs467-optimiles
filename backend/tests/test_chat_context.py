"""Context, clarification and failure behavior with offline model/provider clients."""

from datetime import datetime, timezone
from unittest.mock import Mock

import httpx
import pytest
from google.genai import errors
from pydantic import ValidationError

from backend.chat import handle_chat
from backend.ext_api.api_exceptions import APITimeout
from backend.llm.gemini_chat import LLMNotConfigured, run_chat
from backend.models import ChatCriteria, ChatRequest, SearchResponse, StructuredSearchCriteria
from backend.search import search_awards
from backend.tests.test_llm import FakeClient, text_response, tool_calls_response, tool_response


EXPLICIT = {
    "origin": "ORD", "destination": "HND", "departure_date": "2026-12-01",
    "origin_quote": "ORD", "destination_quote": "HND", "date_quote": "2026-12-01",
}
MESSAGE = "ORD to HND on 2026-12-01"


def run(client, message=MESSAGE, **kwargs):
    return run_chat(ChatRequest(message=message, **kwargs), client, "test-model")


def context(**changes):
    return ChatCriteria.model_validate({
        "origin": ["ORD", "MDW"], "destination": ["HND", "NRT"],
        "departure_date": "2026-12-01", "departure_date_end": "2026-12-03",
        "cabins": ["economy", "business"], "passengers": 2, **changes,
    })


def test_followup_retains_structured_alternatives_range_and_cabins(monkeypatch):
    search = Mock(return_value=SearchResponse(results=[], message="No matches."))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    saved = context()
    client = FakeClient(tool_response({"passengers": 3}), text_response("No matches."))
    response = run(client, "Make it 3 adults", context=saved)
    actual = search.call_args.args[0]
    assert actual.origin == ["ORD", "MDW"]
    assert actual.destination == ["HND", "NRT"]
    assert actual.departure_end == saved.departure_end
    assert actual.cabins == ["economy", "business"]
    assert actual.passengers == 3
    assert response.criteria == actual
    assert response.searches[0].criteria == actual
    assert response.status == "empty"
    assert '"passengers":2' in client.calls[0][-2].parts[0].text


def test_new_exact_date_replaces_saved_range(monkeypatch):
    search = Mock(return_value=SearchResponse(results=[], message="No matches."))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    client = FakeClient(tool_response({"departure_date": "2026-12-06", "date_quote": "2026-12-06"}), text_response("No matches."))
    response = run(client, "Try 2026-12-06", context=context())
    actual = search.call_args.args[0]
    assert actual.departure_date.isoformat() == "2026-12-06"
    assert actual.departure_date_end is None
    assert actual.passengers == 2
    assert response.searches[0].criteria.departure_date == actual.departure_date


def test_clarification_takes_precedence_over_search_in_same_batch(monkeypatch):
    search = Mock(side_effect=AssertionError("Clarification must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    combined = tool_response(EXPLICIT)
    clarification = tool_response({"question": "Which airport and date?", "missing_fields": ["origin", "departure_date"]}, name="clarify_trip")
    combined.function_calls.extend(clarification.function_calls)
    response = run(FakeClient(combined))
    assert response.status == "clarification"
    assert response.missing_fields == ["origin", "departure_date"]
    assert response.reply == "Which airport and date?"
    assert response.results == response.searches == []
    search.assert_not_called()


def test_missing_quotes_do_not_authorize_invented_details(monkeypatch):
    search = Mock(side_effect=AssertionError("Missing details must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    client = FakeClient(tool_response(EXPLICIT), text_response("Where and when?"))
    response = run(client, "Help me find awards")
    assert response.status == "clarification"
    assert response.missing_fields == ["origin", "destination", "departure date"]
    assert response.searches == []
    search.assert_not_called()


@pytest.mark.parametrize("quoted", [
    "2026-12-06", "December 6, 2026", "on December 6th, 2026",
    "Dec 6", "December 6th", "6 December", "on Dec 6.",
])
@pytest.mark.parametrize("same_end", [False, True])
def test_complete_trip_searches_once_without_confirmation(monkeypatch, quoted, same_end):
    search = Mock(wraps=search_awards)
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    args = {
        "origin": "JFK", "destination": "LAX", "departure_date": "2026-12-06",
        "origin_quote": "JFK", "destination_quote": "LAX", "date_quote": quoted,
    }
    if same_end:
        args["departure_date_end"] = "2026-12-06"
    response = run(FakeClient(tool_response(args), text_response("Available awards.")),
                   f"JFK to LAX {quoted}, one way, 1 adult, all cabins")
    search.assert_called_once()
    actual = search.call_args.args[0]
    assert actual.departure_date.isoformat() == "2026-12-06"
    assert actual.passengers == 1
    assert actual.cabin is None and actual.cabins is None
    assert response.status == "results"
    assert response.missing_fields == []
    assert len(response.searches) == 1


@pytest.mark.parametrize("quotes", [
    {},
    {"origin_quote": "", "destination_quote": "", "date_quote": ""},
    {"origin_quote": "Los Angeles", "destination_quote": "New York", "date_quote": "December 6, 2026"},
])
def test_complete_lowercase_request_recovers_missing_or_reworded_quotes(monkeypatch, quotes):
    search = Mock(wraps=search_awards)
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    args = {"origin": "LAX", "destination": "JFK", "departure_date": "2026-12-06", **quotes}
    response = run(FakeClient(tool_response(args), text_response("Available awards.")),
                   "lax to jfk dec 6")
    search.assert_called_once()
    actual = search.call_args.args[0]
    assert (actual.origin, actual.destination) == ("LAX", "JFK")
    assert actual.departure_date.isoformat() == "2026-12-06"
    assert actual.passengers == 1 and actual.cabin is None and actual.cabins is None
    assert response.status == "results"
    assert response.missing_fields == []


@pytest.mark.parametrize("message", ["relax to jfk dec 6", "lax to jfk", "help me find awards"])
def test_quote_recovery_does_not_invent_missing_details(monkeypatch, message):
    search = Mock(side_effect=AssertionError("Missing details must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    args = {"origin": "LAX", "destination": "JFK", "departure_date": "2026-12-06"}
    response = run(FakeClient(tool_response(args), text_response("Which trip details?")), message)
    assert response.status == "clarification"
    assert response.missing_fields
    search.assert_not_called()


def test_recovered_date_quote_still_checks_the_proposed_date(monkeypatch):
    search = Mock(side_effect=AssertionError("Mismatched date must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    args = {"origin": "LAX", "destination": "JFK", "departure_date": "2026-12-07"}
    response = run(FakeClient(tool_response(args)), "lax to jfk dec 6")
    assert response.status == "confirmation"
    assert response.missing_fields == ["departure date"]
    search.assert_not_called()


def test_yearless_date_uses_next_occurrence(monkeypatch):
    search = Mock(wraps=search_awards)
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    args = {**EXPLICIT, "departure_date": "2027-01-06", "date_quote": "Jan 6"}
    response = run(FakeClient(tool_response(args), text_response("Available awards.")),
                   "ORD to HND Jan 6")
    search.assert_called_once()
    assert response.status == "results"
    assert response.criteria.departure_date.isoformat() == "2027-01-06"


@pytest.mark.parametrize(("day", "status"), [
    ("2026-12-06", "results"), ("2027-12-06", "confirmation"),
])
def test_yearless_date_uses_origin_local_today(monkeypatch, day, status):
    monkeypatch.setattr("backend.airports.utc_now",
                        lambda: datetime(2026, 12, 7, 3, tzinfo=timezone.utc))
    search = Mock(wraps=search_awards)
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    args = {**EXPLICIT, "origin": "JFK", "origin_quote": "JFK",
            "departure_date": day, "date_quote": "Dec 6"}
    response = run(FakeClient(tool_response(args), text_response("Available awards.")),
                   "JFK to HND Dec 6")
    assert response.status == status
    assert search.call_count == (1 if status == "results" else 0)


def test_ambiguous_airports_require_confirmation_before_one_search(monkeypatch):
    search = Mock(wraps=search_awards)
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    proposed = {**EXPLICIT, "origin_quote": "Chicago", "destination_quote": "Tokyo", "date_quote": "Dec 1"}
    first = run(FakeClient(tool_response(proposed)), "Chicago to Tokyo on Dec 1")
    assert first.status == "confirmation"
    assert first.missing_fields == ["origin", "destination"]
    assert first.criteria.origin == "ORD"
    assert first.searches == []
    search.assert_not_called()
    unused_model = FakeClient()
    confirmed = run(unused_model, "Confirm this trip.", context=first.criteria, confirmed=True)
    search.assert_called_once()
    assert confirmed.status == "results"
    assert confirmed.searches[0].criteria == first.criteria
    assert unused_model.calls == []


def test_confirmation_retains_requested_program_and_points_limit():
    proposed = {
        **EXPLICIT, "origin_quote": "Chicago", "destination_quote": "Tokyo",
        "date_quote": "Dec 1", "programs": ["United"], "max_points": 90000,
    }
    first = run(FakeClient(tool_response(proposed)), "Chicago to Tokyo on Dec 1, United under 90000 points")
    assert first.status == "confirmation"
    assert first.criteria.programs == ["United"]
    assert first.criteria.max_points == 90000
    confirmed = run(FakeClient(), "Confirm this trip.", context=first.criteria, confirmed=True)
    assert confirmed.status == "results"
    assert confirmed.results
    assert all("United" in result.program and result.points_cost <= 90000 for result in confirmed.results)


def test_confirmed_context_normalizes_programs_to_applied_filters():
    saved = context(origin="ORD", destination="HND", departure_date_end=None,
                    programs=["", "  United  ", "\t"], max_points=90000)
    response = run(FakeClient(), "Confirm this trip.", context=saved, confirmed=True)
    assert response.criteria.programs == ["United"]
    assert response.searches[0].criteria.programs == ["United"]
    assert response.results and all("United" in result.program for result in response.results)


@pytest.mark.parametrize("quoted", ["01/02/2027", "December 1, 2027", "Dec 2"])
def test_ambiguous_or_mismatched_dates_require_confirmation(monkeypatch, quoted):
    search = Mock(side_effect=AssertionError("Uncertain date must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    response = run(FakeClient(tool_response({**EXPLICIT, "date_quote": quoted})), f"ORD to HND {quoted}")
    assert response.status == "confirmation"
    assert response.missing_fields == ["departure date"]
    search.assert_not_called()


@pytest.mark.parametrize("later", [
    tool_response({"question": "Which date?", "missing_fields": ["departure date"]}, name="clarify_trip"),
    tool_response({**EXPLICIT, "departure_date": "2026-12-04", "date_quote": "Dec 3"}),
])
def test_later_clarification_preserves_completed_search_as_partial(later):
    response = run(FakeClient(tool_response(EXPLICIT), later), "ORD to HND on 2026-12-01 or Dec 3")
    assert response.status == "partial"
    assert response.results
    assert len(response.searches) == 1
    assert response.searches[0].status == "results"
    assert response.partial and response.missing_fields and response.warnings


@pytest.mark.parametrize("message", ["Only nonstop", "Round trip ORD to HND", "One stop only"])
def test_unsupported_constraints_do_not_silently_search(monkeypatch, message):
    search = Mock(side_effect=AssertionError("Unsupported constraints must not search"))
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    response = run(FakeClient(), message, context=context())
    assert response.status == "clarification"
    assert response.missing_fields == ["unsupported request"]
    search.assert_not_called()


@pytest.mark.parametrize(("error", "code"), [
    (httpx.ReadTimeout("late"), "model_timeout"),
    (httpx.ConnectError("offline"), "model_unavailable"),
    (errors.ServerError(503, {"error": {"message": "high demand"}}), "model_unavailable"),
    (errors.APIError(429, {"error": {"message": "quota"}}), "model_quota"),
])
def test_model_failure_preserves_completed_group(error, code):
    response = run(FakeClient(tool_response(EXPLICIT), error))
    assert response.status == "partial"
    assert response.partial
    assert response.failure.code == code
    assert response.failure.retryable
    assert response.results == response.searches[0].results
    assert response.searches[0].status == "results"


@pytest.mark.parametrize(("later", "status", "failure"), [
    (SearchResponse(results=[], message="No matches."), "empty", None),
    (APITimeout(), "failed", "tool_timeout"),
    (ValueError("unusable provider payload"), "failed", "malformed_upstream"),
])
def test_later_empty_or_failed_search_keeps_earlier_results(monkeypatch, later, status, failure):
    first_results = search_awards(StructuredSearchCriteria.model_validate(EXPLICIT)).results
    search = Mock(side_effect=[SearchResponse(results=first_results), later])
    monkeypatch.setattr("backend.llm.tools.search_awards", search)
    second = {**EXPLICIT, "departure_date": "2026-12-02", "date_quote": "2026-12-02"}
    response = run(FakeClient(tool_calls_response(EXPLICIT, second), text_response("Search completed.")), MESSAGE + " and 2026-12-02")
    assert [group.status for group in response.searches] == ["results", status]
    assert response.searches[1].criteria.departure_date.isoformat() == "2026-12-02"
    assert response.results == first_results
    assert response.status == ("partial" if failure else "results")
    if failure:
        assert response.failure.code == failure
        assert response.searches[1].failure.code == failure


@pytest.mark.parametrize(("name", "args"), [
    ("unknown_tool", {}), ("clarify_trip", {"question": "", "missing_fields": [9]}),
])
def test_invalid_model_operation_is_structured_failure(name, args):
    response = run(FakeClient(tool_response(args, name=name)))
    assert response.status == "failed"
    assert response.failure.code == "interpretation"
    assert response.searches == []


def test_missing_configuration_is_nonretryable_failure(monkeypatch):
    monkeypatch.setattr("backend.llm.gemini_chat.get_client", Mock(side_effect=LLMNotConfigured()))
    response = handle_chat(ChatRequest(message=MESSAGE))
    assert response.status == "failed"
    assert response.failure.code == "not_configured"
    assert response.failure.retryable is False


def test_confirmation_requires_normalized_context():
    with pytest.raises(ValidationError, match="Confirmation requires trip context"):
        ChatRequest(message="Confirm this trip.", confirmed=True)
