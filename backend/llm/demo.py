"""Try the chat loop against the real Gemini API from the command line.

    python -m backend.llm.demo "Business class from Chicago to Tokyo on Dec 1"
    python -m backend.llm.demo            # interactive; keeps history for follow-ups
"""

import argparse

from backend.llm.gemini_chat import get_client, get_model, run_chat
from backend.models import ChatMessage, ChatRequest, Result


def print_results(results: list[Result]) -> None:
    if not results:
        print("  (no results)")
        return
    for r in results:
        value = f"{r.cents_per_point:.2f}c/pt" if r.cents_per_point is not None else "no value data"
        print(
            f"  {r.program:<22} {r.airline:<12} {r.origin}-{r.destination} {r.departure_date} "
            f"{r.cabin:<15} {r.points_cost:>7,} pts  ${r.cash_fees_usd:>7.2f}  "
            f"{r.seats_available} seats  {value}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Try the Gemini chat loop.")
    parser.add_argument("message", nargs="?", help="Message to send; omit for interactive mode")
    parser.add_argument("--model", help="Gemini model (default: GEMINI_MODEL or built-in default)")
    args = parser.parse_args()

    client = get_client()
    model = args.model or get_model()
    print(f"Model: {model}")
    history: list[ChatMessage] = []

    while True:
        message = args.message or input("\nYou (blank to quit): ").strip()
        if not message:
            break
        response = run_chat(ChatRequest(message=message, history=history), client, model)
        print(f"\nAssistant: {response.reply}\nResults:")
        print_results(response.results)
        if args.message:
            break
        history += [
            ChatMessage(role="user", content=message),
            ChatMessage(role="assistant", content=response.reply),
        ]


if __name__ == "__main__":
    main()
