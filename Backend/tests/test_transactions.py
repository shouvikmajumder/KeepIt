import unittest
from unittest.mock import MagicMock

from db_case import settings  # Initialize isolated settings before app imports.
from app.transactions import store_transaction


class TransactionNormalizationTests(unittest.TestCase):
    def test_prefers_clean_merchant_and_does_not_store_raw_fields(self):
        db = MagicMock()
        connection = {"id": "connection"}
        result = store_transaction(db, connection, {
            "transaction_id": "transaction", "account_id": "card", "date": "2026-09-01",
            "name": "RAW BANK DESCRIPTION 92837", "merchant_name": "  Local   Market ",
            "amount": 21.456, "iso_currency_code": "USD", "pending": False,
            "personal_finance_category": {"primary": "GENERAL_MERCHANDISE",
                "detailed": "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "confidence_level": "HIGH"},
            "location": {"address": "private"},
        }, {"card": {"label": "Card ••1234", "iso_currency_code": "USD"}})
        self.assertTrue(result)
        arguments = db.execute.call_args.args[1]
        self.assertIn("Local Market", arguments)
        self.assertNotIn("RAW BANK DESCRIPTION 92837", arguments)
        self.assertNotIn({"address": "private"}, arguments)

    def test_rejects_incomplete_and_keeps_unofficial_currency_out_of_usd(self):
        db = MagicMock()
        self.assertFalse(store_transaction(db, {"id": "connection"}, {}, {}))
        store_transaction(db, {"id": "connection"}, {
            "transaction_id": "transaction", "account_id": "card", "date": "2026-09-01",
            "name": "Crypto", "amount": 1, "unofficial_currency_code": "BTC",
        }, {"card": {"label": "Card", "iso_currency_code": "USD"}})
        self.assertIsNone(db.execute.call_args.args[1][9])
