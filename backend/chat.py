"""Chat handling: delegates to the Gemini tool-calling loop."""

from backend.llm.gemini_chat import LLMNotConfigured, run_chat
from backend.models import ChatRequest, ChatResponse

NOT_CONFIGURED_REPLY = "Chat isn't connected to the LLM yet. Try the search form for now."


def handle_chat(request: ChatRequest) -> ChatResponse:
    """Reply to a chat message, running award searches as needed."""
    try:
        return run_chat(request)
    except LLMNotConfigured:
        return ChatResponse(reply=NOT_CONFIGURED_REPLY, results=[])
