class APIRouterError(Exception):
    """Raised for general router-level failures in the external API client.

    This exception is used when the underlying HTTP client is not initialized,
    a request cannot be sent, or an unexpected request error occurs.
    """


class APIStatusError(Exception):
    """Raised when an external API returns a non-success HTTP status code.

    Attributes:
        status_code (int): The HTTP response status code returned by the API.
        base_url (str): Base URL configured for the request.
        endpoint (str): API endpoint that triggered the error.
        response_body (dict | str | None): Response payload or raw body associated
            with the failed API call.
        request_header (dict | None): Headers included in the outgoing request.
        request_body (dict | None): JSON payload included in the request.
        params (dict | None): Query parameters sent with the request.
    """

    def __init__(
        self,
        msg,
        status_code,
        base_url: str,
        endpoint: str,
        response_body: dict | None = None,
        params: dict | None = None,
        request_body: dict | None = None,
        request_header: dict | None = None,
    ):
        """Initialize an error for a failed HTTP status response.

        Args:
            msg (str): A human-readable error message.
            status_code (int): HTTP status code returned by the external API.
            base_url (str): Base URL used to construct the request.
            endpoint (str): API endpoint used for the request.
            response_body (dict | None, optional): Response payload or raw text.
            params (dict | None, optional): Query parameters sent with the request.
            request_body (dict | None, optional): Request body sent to the API.
            request_header (dict | None, optional): Request headers sent to the API.

        Raises:
            None: This constructor does not raise exceptions.
        """
        super().__init__(self, msg)
        self.status_code = status_code
        self.base_url = base_url
        self.endpoint = endpoint
        self.response_body = response_body
        self.request_header = request_header
        self.request_body = request_body
        self.params = params


class APITimeout(Exception):
    """Raised when an outbound request exceeds the configured timeout."""


class APIQuotaExceeded(Exception):
    """Raised when an external API returns a quota exceeded error."""


class RateLimiterError(Exception):
    """Raised when the rate limiter encounters an error."""

class RateLimiterTimeout(RateLimiterError):
    """Raised when Ratelimiter wait times out."""

class RateLimiterDailyQuotaExceeded(RateLimiterError):
    """Raised when an external API returns a daily quota exceeded error."""


class RateLimiterMonthlyQuotaExceeded(RateLimiterError):
    """Raised when an external API returns a monthly quota exceeded error."""
