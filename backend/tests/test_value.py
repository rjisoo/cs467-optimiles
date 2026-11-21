import pytest

from backend.value import cents_per_point, rate_value

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
        # Unreported fees must remain unrated
        (1200, None, 60_000, None, False),
        (390, None, 30_000, None, False),
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


@pytest.mark.parametrize("cash,fees,points", [
    (True, 0, 100), (100, False, 100), (100, 0, True),
    (float("inf"), 0, 100), (100, float("nan"), 100), (100, -1, 100),
    (100, 0, 10.5), (100, 0, 9007199254740992), (100, 0, float("inf")),
])
def test_invalid_enrichment_inputs_are_unrated(cash, fees, points):
    assert cents_per_point(cash, fees, points) is None
    assert rate_value(cash, fees, points) == (None, None)


@pytest.mark.parametrize("cash, fees, points, cpp", [
    (245.60, 5.60, 15000, 1.60), (245.60, 5.60, 16000, 1.50),
    (245.60, 5.60, 20000, 1.20), (129.5, 0, 10000, 1.30),
    (1, 130.5, 10000, -1.30),
])
def test_cpp_uses_decimal_half_up(cash, fees, points, cpp):
    assert cents_per_point(cash, fees, points) == cpp
