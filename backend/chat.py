"""Chat handling skeleton. Stubbed until the LLM tool-calling loop is built."""

from backend.models import ChatRequest, ChatResponse


def handle_chat(request: ChatRequest) -> ChatResponse:
    """Reply to a chat message, running award searches as needed."""
    return ChatResponse(
        reply="Chat isn't connected to the LLM yet. Try the search form for now.",
        results=[],
    )
