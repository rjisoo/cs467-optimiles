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
- `chat.py`: `handle_chat()` (stubbed until the LLM loop is built)
- `tests/`: pytest tests

Award search returns fake data for now.
`cents_per_point` is `null` when there is no cash price to compare against.
