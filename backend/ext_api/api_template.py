import logging
from .api_exceptions import APIRouterError, APIStatusError, APITimeout
import httpx
import time
from .api_ratelimiter import RateLimiter
from pathlib import Path

# Set current module name for logging
logger = logging.getLogger(__name__)


class APIRouterTemplate:
    """Async HTTP template for external API clients.

    This class creates and manages an httpx.AsyncClient for outbound calls,
    manages default headers and automatically attaches to the live client
    when submitting a request, and provides a small request wrapper for GET, POST, and PUT methods.

    Attributes:
        base_url (str): Base URL used for all requests.
        default_headers (dict): Default headers sent with every request.
        timeout (float): Timeout, in seconds, for each request.
        client (httpx.AsyncClient | None): Active HTTPX client instance.
        client_id (str | None): Optional client identifier for auth flows.
        client_secret (str | None): Optional client secret for auth flows.
        oauth (bool): Whether auth should be applied before requests.
    """

    rate_limiter_config_dir = "config/rate_limiter/"
    rate_limiter_config_ext = ".json"

    def __init__(
        self,
        api_name: str,
        base_url: str,
        headers: dict | None = None,
        timeout: float = 10.0,
        client_id: str | None = None,
        client_secret: str | None = None,
        oauth: bool = True,
    ):
        """Initialize the router template.

        Args:
            base_url (str): Base URL used for all API requests.
            headers (dict | None): Default headers to attach to every request.
            timeout (float): Timeout, in seconds, for each request.
            client_id (str | None): Optional client identifier used by auth.
            client_secret (str | None): Optional client secret used by auth.
            oauth (bool): Whether to apply the auth flow before requests.

        Raises:
            None: The constructor itself does not raise errors.
        """
        self.api_name = api_name
        self.base_url = base_url
        self.default_headers = headers.copy() if headers else {}
        self.timeout = timeout
        self.client = None
        self.client_id = client_id
        self.client_secret = client_secret
        self.oauth = oauth

        rate_limiter_config_path = Path(
            self.rate_limiter_config_dir, self.api_name + self.rate_limiter_config_ext
        )
        rate_limiter_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.rate_limiter = RateLimiter(rate_limiter_config_path)

        if not self.oauth:
            self._auth()

    @classmethod
    def generate_default_config(cls, api_name):
        """Wrapper function to generate a default config file for Rate limiter
        Raises:
            FileNotFoundError: When the directory is invalid
        """

        RateLimiter.generate_default_config(
            Path(cls.rate_limiter_config_dir, api_name + cls.rate_limiter_config_ext)
        )

    async def create_httpx_client(self) -> httpx.AsyncClient:
        """Returns a new Httpx Client"""
        client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)
        logging.debug("Async httpx client initialized")
        return client

    async def init_httpx_client(self) -> None:
        """Initialize the api client"""
        if self.client is None:
            self.client = await self.create_httpx_client()

    async def __aenter__(self):
        self.client = await self.create_httpx_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Safely terminate async client when exiting."""
        await self.close()
        return False

    async def close(self):
        """Safely terminate the API client and save the latest rate limiter config file"""
        logging.debug("%s close() is called", self.api_name)
        if self.client:
            await self.client.aclose()
            self.client = None
        await self.rate_limiter.close()

    # Deprecated! Keep httpx header clean of any authentication for easier header management.
    # def sync_default_header_with_httpx_client(self):
    #     """Sync the live HTTPX client headers with the configured default headers.
    #     This should be called whenever the default headers are changed or when an
    #     auth flow updates the token values.
    #     """
    #     if self.client is not None:
    #         self.client.headers.update(self.default_headers)

    async def _fetch_token(
        self,
        client_id: str,
        client_secret,
        client_id_key: str = "client_id",
        client_secret_key: str = "client_secret",
    ):
        """Fetch an access token for the configured API.

        Args:
            client_id (str): Client identifier for token acquisition.
            client_secret (str): Client secret for token acquisition.
            client_id_key (str, optional): Field name for the client ID in the
                token request payload. Defaults to "client_id".
            client_secret_key (str, optional): Field name for the client secret in
                the token request payload. Defaults to "client_secret".

        Raises:
            NotImplementedError: If the subclass does not implement this method.
        """
        raise NotImplementedError(
            "You forgot to implement the _fetch_token method in this subclass."
        )

    def _auth(self):
        """Perform authentication setup for outgoing requests.

        This is a template method to configure headers, refresh tokens.
        """
        raise NotImplementedError(
            "You forgot to implement the _auth method in this subclass."
        )

    async def _async_auth(self):
        """Perform authentication setup for outgoing requests.

        This is a template method to configure headers, refresh tokens.
        """
        raise NotImplementedError(
            "You forgot to implement the _auth method in this subclass."
        )

    async def record_usage(self, token):
        """Record a token use"""
        await self.rate_limiter.record_usage(token)

    async def save_rate_limiter_config(self):
        """Saves the current rate limiter configuration to the json file"""
        await self.rate_limiter.save_config()

    async def _request(
        self,
        method: str,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
        headers_override: dict | None = None,
        bypass_rate_limiter: bool = False,
    ) -> dict:
        """Send an HTTP request.

        Args:
            method (str): HTTP method to call, such as "GET", "POST", or "PUT".
            endpoint (str): API route to request.
            payload (dict | None): Request payload to send with the API call.
            params (dict | None): Query parameters to include in the request.
            headers_override (dict | None): Request headers to override,
                an overide ignores the default headers completely.

        Returns:
            dict: Parsed JSON response.

        Raises:
            APIRouterError: If the async client has not been initialized or a
                unknown failure occurs.
            APIStatusError: If the API returns a non-2xx HTTP status code.
            APITimeout: If the request exceeds the configured timeout.
        """
        if self.client is None:
            await self.init_httpx_client()

        # If OAuth is enabled or headers are overridden, perform authentication
        # Meant for Oauth requests
        if self.oauth and headers_override is None:
            await self._async_auth()

        try:
            logging.debug("Sending %s request to %s", method, self.base_url + endpoint)
            if not bypass_rate_limiter:
                await self.rate_limiter.request()

            request_header = (
                headers_override if headers_override else self.default_headers
            )
            start_time = time.perf_counter()  # Time this request
            response = await self.client.request(
                method,
                endpoint,
                params=params,
                json=payload,
                headers=request_header,
            )

            response.raise_for_status()
            end_time = time.perf_counter()
            duration_ms = (end_time - start_time) * 1000
            logging.debug(
                "%s %s completed in %.2f ms",
                method,
                self.base_url + endpoint,
                duration_ms,
            )

            return response.json()

        except httpx.HTTPStatusError as e:
            logging.error(
                "HTTP Error: %s for URL %s", e.response.status_code, e.request.url
            )
            logging.error("Response body: %s", e.response.text)
            raise APIStatusError(
                f"API Status Code Error {e.response.status_code}",
                base_url=self.base_url,
                endpoint=endpoint,
                status_code=e.response.status_code,
                request_body=payload,
                response_body=e.response.text,
            ) from e

        except httpx.TimeoutException as e:
            raise APITimeout from e

        except httpx.RequestError as e:
            logging.error("Connection error for %s: %s", e.request.url, e)
            raise APIRouterError from e

    async def get(
        self,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
        bypass_rate_limiter: bool = False,
    ):
        """Send an HTTP GET request to the provided endpoint.

        Args:
            endpoint (str): Endpoint or API route to request.
            payload (dict | None): Optional payload for the GET request.
            params (dict | None): Query-string parameters.

        Returns:
            dict: The parsed JSON response returned by the API.

        Raises:
            APIRouterError: If the request client is not initialized or the
                network layer fails.
            APIStatusError: If the API responds with a non-2xx HTTP status.
            APITimeout: If the request exceeds the configured timeout.
        """
        return await self._request(
            "GET", endpoint, payload, params, bypass_rate_limiter=bypass_rate_limiter
        )

    async def post(
        self,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
        bypass_rate_limiter: bool = False,
    ):
        """Send an HTTP POST request to the provided endpoint.

        Args:
            endpoint (str): Endpoint or API route to request.
            payload (dict | None): JSON request body to send.
            params (dict | None): Query-string parameters.

        Returns:
            dict: The parsed JSON response returned by the API.

        Raises:
            APIRouterError: If the request client is not initialized or the
                network layer fails.
            APIStatusError: If the API responds with a non-2xx HTTP status.
            APITimeout: If the request exceeds the configured timeout.
        """
        return await self._request(
            "POST", endpoint, payload, params, bypass_rate_limiter=bypass_rate_limiter
        )

    async def put(
        self,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
        bypass_rate_limiter: bool = False,
    ):
        """Send an HTTP PUT request to the provided endpoint.

        Args:
            endpoint (str): Endpoint or API route to request.
            payload (dict | None): JSON request body to send.
            params (dict | None): Query-string parameters.

        Returns:
            dict: The parsed JSON response returned by the API.

        Raises:
            APIRouterError: If the request client is not initialized or the
                network layer fails.
            APIStatusError: If the API responds with a non-2xx HTTP status.
            APITimeout: If the request exceeds the configured timeout.
        """
        return await self._request(
            "PUT", endpoint, payload, params, bypass_rate_limiter=bypass_rate_limiter
        )
