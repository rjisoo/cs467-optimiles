import pytest

from backend.value import rate_value

# Baseline is 1.0 cent, so cpp maps straight onto the tiers.
# Each row exists to catch one specific mistake.


@pytest.mark.parametrize(
    "cash, fees, points, expected_rating, expect_warning",
    [
        # Normal cases (one per tier)
        (300, 5.60, 30_000, "bad", False),  # 0.98 cpp
        (1200, 5.60, 60_000, "great", False),  # 1.99 cpp
        (5000, 200, 70_000, "exceptional", False),  # 6.86 cpp
        (100, 150, 10_000, "bad", False),  # -0.50 cpp: fees exceed the fare
        # Tier boundaries (a tier starts at its lower number)
        (305.60, 5.60, 30_000, "fair", False),  # exactly 1.00
        (395.60, 5.60, 30_000, "good", False),  # exactly 1.30
        (515.60, 5.60, 30_000, "great", False),  # exactly 1.70
        (755.60, 5.60, 30_000, "exceptional", False),  # exactly 2.50
        # Rounding (compare the rounded value)
        (394.40, 5.60, 30_000, "good", False),  # 1.296 rounds to 1.30
        (393.80, 5.60, 30_000, "fair", False),  # 1.294 rounds to 1.29
        # Unreported fees: keep the tier, add a warning
        (1200, None, 60_000, "great", True),  # 2.00 cpp
        (390, None, 30_000, "good", True),  # 1.30 cpp, near a boundary
        (1200, 0, 60_000, "great", False),  # fees reported as $0, no warning
        # No rating
        (None, 5.60, 60_000, None, False),  # no cash fare
        (0, 5.60, 30_000, None, False),  # $0 fare = bad data
        (-100, 5.60, 30_000, None, False),  # negative fare
        (1200, 5.60, 0, None, False),  # 0 points
        (1200, 5.60, -1_000, None, False),  # negative points
        (None, None, 60_000, None, False),  # nothing to compare
    ],
)
def test_rate_value(cash, fees, points, expected_rating, expect_warning):
    rating, warning = rate_value(cash, fees, points)
    assert rating == expected_rating
    assert (warning is not None) == expect_warning
