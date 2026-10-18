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

## ext_api Module
This module manages external API requests and provide configurable quota tracking and limiting

### api_template submodule
This class creates and manages an httpx.AsyncClient for outbound calls, manages default headers and automatically attaches to the live client when submitting a request, and provides a small request wrapper for GET, POST, and PUT methods. This module supports context manager for safe termination as the rate limiter class

### api_ratelimiter submodule
This module manage API quotas and track usage. This module is managed by api_template by default, therefore no implementation of this module needed. 

### Integration
#### Setting Up Authentication
Adopting the api_template requires overriding several methods.
- `_auth` (Basic Auth): This method should make sure that default_headers has the correct credentials. This only gets called once in the constructor.
- `_async_auth` (OAuth): This method should fetch and set bearer token to the default_headers. This gets called everytime `_request` is called.
- `_fetch_token` (OAuth): This is a optional wrapper method to fetch bearer tokens.
#### Configuring Rate Limiter
Each sub-class should be given a name with characters allowed for a system file, as it is used to identify rate limiter configuration files. The configurations are currently stored as json files that lives in the `./config/rate_limiter/` directory by default. The default configurations directory and file extension can be overriden in the class variables `rate_limiter_config_dir` for directory & `rate_limiter_config_ext` for file extention.
To accuire a template file for setting up a new API, you can use the `generate_default_config` class method to generate a template file, or if the rate limiter fails to find a suitable file, it throws a FileNotFoundError and creates a template using the api name it was received.

#### Example:
Here is an example of implementing an API with basic auth.

`exampleapi.json`
```json
{
    "name": "exampleapi",
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
```

