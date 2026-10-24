# OptiMiles Backend

Flask REST API for award flight search and the chat interface.

## Setup

Requires Python 3.12+. Run every command from the repo root; code imports through the `backend` package
(`from backend.models import ...`).

### macOS/Linux (bash or zsh)

```bash
python -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
cp -n backend/.env.example backend/.env
```

`cp -n` preserves an existing `.env` file.

### Windows (PowerShell)

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

## API documentation

Open [Swagger UI](http://localhost:5000/docs) to browse all three API endpoints,
inspect request and response schemas, and send requests with **Try it out**.
The backend root URL redirects here. The [OpenAPI JSON](http://localhost:5000/openapi.json)
is also available for API clients and tooling.

Schemas are generated from the existing Pydantic models in `models.py`.
Update route descriptions and examples in `openapi.py` when adding or changing endpoints.
Requests from Swagger UI use the same host and port as the documentation page.
Swagger UI assets load from a pinned CDN version and require internet access;
the JSON schema itself is served locally. No additional Python packages are needed.

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
`400` with `{"error": "Invalid request", "details": [...]}`. Every other error is
JSON with a user-facing `error` message: `404`/`405` for unknown routes or methods,
`500` for unexpected server errors, and, from `/api/search`, `502`/`503`/`504` when
the award search service fails, hits its usage limit, or times out (mapped in
`errors.py`). In `/api/chat`, award search failures come back in the reply instead.

## Layout

- `app.py`: Flask routes only (validate, call a function, return JSON)
- `models.py`: Pydantic models for the API contract
- `errors.py`: award search failures mapped to HTTP status codes and user-facing messages
- `openapi.py`: OpenAPI route metadata and generated model schemas
- `templates/swagger_ui.html`: Swagger UI documentation page
- `search.py`: `search_awards()` (stubbed with fake data) and redemption value math
- `chat.py`: `handle_chat()`, which delegates to the Gemini loop
- `llm/tools.py`: the `search_awards` tool declaration and `run_search_tool()` (no Gemini imports)
- `llm/gemini_chat.py`: Gemini client setup and the tool-calling loop
- `llm/demo.py`: command-line demo against the real API
- `tests/`: pytest tests

Award search returns fake data for now.
`cents_per_point` is `null` when there is no cash price to compare against.

## ext_api Module
This module manages external API requests and provide configurable quota tracking and limiting

### api_template submodule
This class creates and manages an httpx.AsyncClient for outbound calls, manages default headers and automatically attaches to the live client when submitting a request, and provides a small request wrapper for GET, POST, and PUT methods. This module supports context manager for safe termination.

### api_ratelimiter submodule
This module manage API quotas and track usage. This module is managed by api_template by default, therefore no implementation of this module is needed. 

### Integration
#### Setting Up Authentication
Adopting the api_template requires overriding one or two authentication methods.
- `_auth` (Basic Auth): This method should make sure that default_headers has the correct credentials, it only gets called once in the constructor.
- `_async_auth` (OAuth): This method should fetch and set bearer token to the default_headers, it gets called everytime `_request` is called.
- `_fetch_token` (OAuth): This is a optional wrapper method to fetch bearer tokens to be used in `_async_auth`.
#### Configuring Rate Limiter
Each sub-class should be given a name with legal characters for a file, as it is used to identify rate limiter configuration files. The configurations are currently stored as json files in the `./config/rate_limiter/` directory by default. The default configurations directory and file extension can be overriden in the class variables `rate_limiter_config_dir` for directory & `rate_limiter_config_ext` for file extention.
To accuire a template configuration file for setting up a new API, you can use the `generate_default_config` class method to generate a template file, or if the rate limiter fails to find a suitable file, it throws a FileNotFoundError and creates a template using the api name it was received.

#### Example:
Here is an example of implementing an API with basic auth.

`exampleapi.json`
```json
{
    "name": "exampleapi",
    "settings":{
        "backup_interval": 30,
    },
    "limit_per_month": {
        "enabled": false,
        "max_requests": 10000,
        "current_quota": 0
    },
    "limit_per_day": {
        "enabled": true,
        "max_requests": 1000,
        "current_quota": 0,
        "current_day": "1970-01-01",
        "reset_time": "00:00:00+00:00",
        "soft_retry": false
    },
    "limit_per_second": {
        "enabled": false,
        "max_requests": 10,
        "mode": "strict"
    },
    "usage": {}
}
```
`example_api.py`
``` python
from .api_template import APIRouterTemplate
import dotenv
import os

class ExampleAPI(APIRouterTemplate):
    async def _auth(self):
        if "Authorization" not in self.default_headers:
            self.default_headers["Authorization"] = os.getenv("SOME_TOKEN")

```

`main.py`
``` python
import asyncio
from ext_api.example_api import ExampleAPI

example_api = ExampleAPI("exampleapi", "example.com/api/")
results = asyncio.run(example_api.get("/some_endpoint"))
asyncio.run(example_api.close())
```

