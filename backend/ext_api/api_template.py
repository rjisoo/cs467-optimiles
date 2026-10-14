import logging
from .api_exceptions import APIRouterError, APIStatusError, APITimeout
import httpx
import time

# Set current module name for logging
logger = logging.getLogger(__name__)


class APIRouterTemplate:
    """Async HTTP template for external API clients.

    This class creates and manages an ``httpx.AsyncClient`` for outbound calls,
    keeps default headers synchronized with the live client, and provides a
    small request wrapper for GET, POST, and PUT methods.

    Attributes:
        base_url (str): Base URL used for all requests.
        default_headers (dict): Default headers sent with every request.
        timeout (float): Timeout, in seconds, for each request.
        client (httpx.AsyncClient | None): Active HTTPX client instance.
        client_id (str | None): Optional client identifier for auth flows.
        client_secret (str | None): Optional client secret for auth flows.
        oauth (bool): Whether auth should be applied before requests.
    """

    def __init__(
        self,
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
        self.base_url = base_url
        self.default_headers = headers.copy() if headers else {}
        self.timeout = timeout
        self.client = None
        self.client_id = client_id
        self.client_secret = client_secret
        self.oauth = oauth
        if not self.oauth:
            self._auth()

    async def __aenter__(self):
        """Initialize the async HTTPX client for the context manager.

        Raises:
            httpx.HTTPError: If the HTTPX client cannot be created.
        """
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.default_headers.copy(),
            timeout=self.timeout,
        )
        self.sync_default_header_with_httpx_client()
        logging.debug("Async httpx client initialized")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Safely terminate async client when exiting.

        Args:
            exc_type: Exception type causing context exit, if any.
            exc_val: Exception value causing context exit, if any.
            exc_tb: Exception traceback causing context exit, if any.

        Raises:
            None
        """
        if self.client:
            await self.client.aclose()
            self.client = None

    def sync_default_header_with_httpx_client(self):
        """Sync the live HTTPX client headers with the configured default headers.

        This should be called whenever the default headers are changed or when an
        auth flow updates the token values.
        """
        if self.client is not None:
            self.client.headers.update(self.default_headers)

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

    async def _request(
        self,
        method: str,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
        headers_override: dict | None = None,
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
            raise APIRouterError("Uninitialized Async HTTPX Client")

        # If OAuth is enabled or headers are overridden, perform authentication
        # Meant for Oauth requests
        if self.oauth or headers_override:
            await self._auth()
            self.sync_default_header_with_httpx_client()

        try:
            logging.debug("Sending %s request to %s", method, self.base_url+endpoint)
            start_time = time.perf_counter()
            response = await self.client.request(
                method,
                endpoint,
                params=params,
                headers=headers_override if headers_override else None,
            )
            response.raise_for_status()
            end_time = time.perf_counter()
            duration_ms = (end_time - start_time) * 1000
            logging.debug("%s %s completed in %.2f ms", method, self.base_url+endpoint, duration_ms)

            return response.json()

        except httpx.HTTPStatusError as e:
            logging.error(
                "HTTP Error: %s for URL %s", e.response.status_code, e.request.url
            )
            logging.error("Response body: %s", e.response.text)
            raise APIStatusError(
                "API Status Code Error",
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
        return await self._request("GET", endpoint, payload, params)

    async def post(
        self,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
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
        return await self._request("POST", endpoint, payload, params)

    async def put(
        self,
        endpoint: str,
        payload: dict | None = None,
        params: dict | None = None,
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
        return await self._request("PUT", endpoint, payload, params)
