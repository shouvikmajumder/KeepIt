import unittest
from datetime import date
from decimal import Decimal
from app.recurrence import monthly_total, next_occurrence
from app.schemas import SubscriptionCreate
from pydantic import ValidationError


class RecurrenceTests(unittest.TestCase):
    def test_short_month_preserves_anchor(self):
        anchor = date(2025, 1, 31)
        self.assertEqual(next_occurrence(anchor, "monthly", date(2025, 2, 1)), date(2025, 2, 28))
        self.assertEqual(next_occurrence(anchor, "monthly", date(2025, 3, 1)), date(2025, 3, 31))

    def test_leap_year_and_due_today(self):
        anchor = date(2024, 2, 29)
        self.assertEqual(next_occurrence(anchor, "annual", date(2025, 2, 28)), date(2025, 2, 28))
        self.assertEqual(next_occurrence(anchor, "annual", date(2028, 2, 1)), date(2028, 2, 29))

    def test_totals_round_once_and_exclude_inactive(self):
        rows = [{"cost": "1", "billing_interval": "annual", "status": "active"}] * 12
        rows += [{"cost": "99", "billing_interval": "monthly", "status": "inactive"}]
        self.assertEqual(monthly_total(rows), Decimal("1.00"))

    def test_invalid_money_and_dates(self):
        for cost in ("NaN", "Infinity", "-1", "0", "1.001"):
            with self.assertRaises(ValidationError):
                SubscriptionCreate(name="Netflix", cost=cost, next_renewal_date="2026-01-01")
        with self.assertRaises(ValidationError):
            SubscriptionCreate(name=" ", cost="1", next_renewal_date="2026-02-30")
