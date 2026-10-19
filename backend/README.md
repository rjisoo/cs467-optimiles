# OptiMiles Backend

Flask REST API for award flight search and the chat interface.

## Setup

Requires Python 3.12+. Run every command from the repo root; code imports through the `backend` package
(`from backend.models import ...`).

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1                # macOS/Linux: source backend/.venv/bin/activate
pip install -r backend\requirements.txt
copy backend\.env.example backend\.env            # macOS/Linux: cp backend/.env.example backend/.env
```

## Run

```powershell
flask --app backend.app run --debug
```

The server runs at http://localhost:5000. Check it with
http://localhost:5000/api/health.

## Test

```powershell
pytest
```

## Chat / LLM

`/api/chat` uses Google Gemini (`google-genai` SDK) with tool calling. The model turns the
message into `search_awards` arguments; code validates them with `SearchCriteria`, runs the
search and computes `cents_per_point`. The model only summarizes the tool output and is told
never to invent numbers. Each message is capped at 3 model calls (`MAX_TOOL_ROUNDS`).

1. Create an API key in Google AI Studio (https://aistudio.google.com/apikey).
2. Put it in `backend\.env` as `GEMINI_API_KEY=...`. Optionally set `GEMINI_MODEL` to override
   the default in `llm/gemini_chat.py`.

Without a key, `/api/chat` still works and replies that chat isn't connected yet.

Try it from the command line:

```powershell
python -m backend.llm.demo "Business class from Chicago to Tokyo on Dec 1"
python -m backend.llm.demo                     # interactive; keeps history for follow-ups
python -m backend.llm.demo --model <model-name> "..."
```

Tests use a fake Gemini client, so `pytest` needs no key or network.

## Endpoints

| Method | Path          | Body                     | Returns                 |
| ------ | ------------- | ------------------------ | ----------------------- |
| GET    | `/api/health` | none                     | `{"status": "ok"}`      |
| POST   | `/api/search` | `SearchCriteria`         | `{"results": [Result]}` |
| POST   | `/api/chat`   | `{"message", "history"}` | `{"reply", "results"}`  |

Request and response shapes are defined in `models.py`. Invalid input returns
`400` with `{"error": "Invalid request", "details": [...]}`.

## Layout

- `app.py`: Flask routes only (validate, call a function, return JSON)
- `models.py`: Pydantic models for the API contract
- `search.py`: `search_awards()` (stubbed with fake data) and redemption value math
- `chat.py`: `handle_chat()`, which delegates to the Gemini loop
- `llm/tools.py`: the `search_awards` tool declaration and `run_search_tool()` (no Gemini imports)
- `llm/gemini_chat.py`: Gemini client setup and the tool-calling loop
- `llm/demo.py`: command-line demo against the real API
- `tests/`: pytest tests

Award search returns fake data for now.
`cents_per_point` is `null` when there is no cash price to compare against.
