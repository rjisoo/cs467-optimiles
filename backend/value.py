"""Rate an award redemption against paying cash for the same trip.

cents per point (cpp) = (cash fare - award fees) * 100 / points. The rating compares
cpp with a baseline: what a point is reliably worth elsewhere. Below the baseline, the
user should pay cash and keep the points.

Pure logic: no Flask, no network.
"""

from typing import Literal

ValueRating = Literal["bad", "fair", "good", "great", "exceptional"]

# Cents a point is reliably worth elsewhere (one fixed baseline for version 1).
BASELINE_CENTS = 1.0

# (minimum cpp / baseline, tier), highest first. Each tier starts at its lower number.
_TIERS: tuple[tuple[float, ValueRating], ...] = (
    (2.5, "exceptional"),
    (1.7, "great"),
    (1.3, "good"),
    (1.0, "fair"),
)

FEES_NOT_REPORTED = "Fees not reported; actual value may be lower."


def rate_value(
    cash_fare_usd: float | None,
    fees_usd: float | None,
    points: int,
    baseline_cents: float = BASELINE_CENTS,
) -> tuple[ValueRating | None, str | None]:
    """Return (rating, warning). Rating is None when there is nothing valid to compare.

    Unreported fees (None) are counted as $0 and add a warning, since real fees can
    only lower the value. A null rating never carries a warning.
    """
    if cash_fare_usd is None or cash_fare_usd <= 0 or points <= 0:
        return None, None

    # Compare the rounded value so the number shown always matches the label.
    cpp = round((cash_fare_usd - (fees_usd or 0)) * 100 / points, 2)
    rating: ValueRating = "bad"
    for minimum, tier in _TIERS:
        if cpp >= round(minimum * baseline_cents, 2):
            rating = tier
            break

    warning = FEES_NOT_REPORTED if fees_usd is None else None
    return rating, warning
