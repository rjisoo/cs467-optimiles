"""Award search service failures mapped to HTTP status codes and messages that are
safe to show users. No Flask imports, so the chat tool uses the same messages."""

from backend.ext_api.api_exceptions import (
    APIQuotaExceeded,
    APIRouterError,
    APIStatusError,
    APITimeout,
    RateLimiterDailyQuotaExceeded,
    RateLimiterError,
    RateLimiterMonthlyQuotaExceeded,
    RateLimiterTimeout,
)

# Checked in order: the timeout and quota errors subclass RateLimiterError.
_UPSTREAM_ERRORS = [
    ((APITimeout, RateLimiterTimeout), 504, "Award search timed out. Please try again."),
    (
        (APIQuotaExceeded, RateLimiterDailyQuotaExceeded, RateLimiterMonthlyQuotaExceeded),
        503,
        "Award search has reached its usage limit. Please try again later.",
    ),
    (
        (APIStatusError, APIRouterError, RateLimiterError),
        502,
        "Award search is unavailable right now. Please try again later.",
    ),
]

UPSTREAM_ERRORS = tuple(cls for classes, _, _ in _UPSTREAM_ERRORS for cls in classes)
UPSTREAM_STATUS_MESSAGES = {status: message for _, status, message in _UPSTREAM_ERRORS}


def describe_upstream_error(error: Exception) -> tuple[int, str]:
    """Return (HTTP status, user-facing message) for an award search failure."""
    for classes, status, message in _UPSTREAM_ERRORS:
        if isinstance(error, classes):
            return status, message
    return 502, UPSTREAM_STATUS_MESSAGES[502]
