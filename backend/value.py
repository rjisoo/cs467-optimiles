"""Rate a known award cost against an estimated comparable cash fare.

cents per point (cpp) = (cash fare - award fees) * 100 / points. The rating compares
cpp with fixed display thresholds, not a loyalty program's published valuation.

Pure logic: no Flask, no network.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, localcontext
from typing import Literal

ValueRating = Literal["bad", "fair", "good", "great", "exceptional"]

# Fixed display baseline for version 1; not a guaranteed cash-out value.
BASELINE_CENTS = 1.0
MAX_SAFE_INTEGER = 9007199254740991

# (minimum cpp / baseline, tier), highest first. Each tier starts at its lower number.
_TIERS: tuple[tuple[float, ValueRating], ...] = (
    (2.5, "exceptional"),
    (1.7, "great"),
    (1.3, "good"),
    (1.0, "fair"),
)

SUMMARY_VALUE_WARNING = "Load trip details to compare value using the same flight's points and fees."


def _decimal(value: object) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        return None
    try:
        amount = Decimal(str(value))
        return amount if amount.is_finite() and abs(amount) <= MAX_SAFE_INTEGER else None
    except InvalidOperation:
        return None


def whole_number(value: object) -> int | None:
    """Normalize exact provider numeric strings without truncation or bool coercion."""
    amount = _decimal(value)
    return int(amount) if amount is not None and amount >= 0 and amount == amount.to_integral_value() else None


def cents_per_point(
    cash_fare_usd: float | None, fees_usd: float | None, points: int
) -> float | None:
    """Value of each point in cents (rounded to 2 places), or None without valid inputs.

    Fees must be known; a verified zero remains valid."""
    cash, fees, count = _decimal(cash_fare_usd), _decimal(fees_usd), whole_number(points)
    if cash is None or cash <= 0 or fees is None or fees < 0 or not count:
        return None
    with localcontext() as context:
        context.prec = 40
        cpp = ((cash - fees) * 100 / count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(cpp) if abs(cpp) <= MAX_SAFE_INTEGER else None


def rate_value(
    cash_fare_usd: float | None,
    fees_usd: float | None,
    points: int,
    baseline_cents: float = BASELINE_CENTS,
) -> tuple[ValueRating | None, str | None]:
    """Return (rating, warning). Rating is None when there is nothing valid to compare.

    Unknown fees are unrated. A null rating never carries a warning.
    """
    # Compare the rounded value so the number shown always matches the label.
    cpp = cents_per_point(cash_fare_usd, fees_usd, points)
    baseline = _decimal(baseline_cents)
    if cpp is None or baseline is None or baseline <= 0:
        return None, None
    rating: ValueRating = "bad"
    for minimum, tier in _TIERS:
        if Decimal(str(cpp)) >= (Decimal(str(minimum)) * baseline).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP):
            rating = tier
            break

    return rating, None
