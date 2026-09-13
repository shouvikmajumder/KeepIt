import unittest
from unittest.mock import MagicMock, patch

from db_case import settings  # Initialize isolated test settings before app imports.
from app.discovery import observation
from app.worker import sync


class CurrencyTests(unittest.TestCase):
    def setUp(self):
        self.stream = {"account_id": "card", "is_active": True, "frequency": "MONTHLY",
                       "last_amount": {"amount": 15}, "predicted_next_date": "2027-01-31"}
        self.account = {"id": "card", "label": "Card", "iso_currency_code": "USD"}

    def test_missing_payment_currency_uses_matching_account(self):
        for fields in ({}, {"iso_currency_code": None, "unofficial_currency_code": None}):
            with self.subTest(fields=fields):
                stream = {**self.stream, "last_amount": {"amount": 15, **fields}}
                result = observation(stream, [{"id": "other", "iso_currency_code": "EUR"}, self.account])
                self.assertEqual(result["currency"], "USD")
                self.assertTrue(result["eligible"])

    def test_explicit_payment_currency_takes_precedence(self):
        for fields, eligible in (({"iso_currency_code": "USD"}, True),
                                 ({"iso_currency_code": "EUR"}, False),
                                 ({"unofficial_currency_code": "BTC"}, False)):
            with self.subTest(fields=fields):
                result = observation({**self.stream, "last_amount": {"amount": 15, **fields}},
                                     [{**self.account, "iso_currency_code": "CAD"}])
                self.assertEqual(result["currency"], fields.get("iso_currency_code"))
                self.assertEqual(result["eligible"], eligible)

    def test_unresolved_or_unsupported_account_currency_stays_ineligible(self):
        for fields in ({"iso_currency_code": None}, {"iso_currency_code": "EUR"},
                       {"iso_currency_code": None, "unofficial_currency_code": "BTC"}):
            with self.subTest(fields=fields):
                result = observation(self.stream, [{**self.account, **fields}])
                self.assertFalse(result["eligible"])
        result = observation(self.stream, [{**self.account, "id": "other"}])
        self.assertFalse(result["eligible"])
        self.assertIsNone(result["currency"])

    def test_worker_passes_currency_to_discovery_without_persisting_extra_account_data(self):
        db = MagicMock()
        connection = {"id": "connection", "token_ciphertext": "encrypted",
                      "institution_id": None, "institution_name": "Bank"}
        responses = {
            "/accounts/get": {"accounts": [{"account_id": "card", "name": "Card", "mask": "1234",
                "type": "credit", "balances": {"iso_currency_code": "USD", "current": 123}}], "item": {}},
            "/transactions/sync": {"added": [], "modified": [], "removed": [],
                "next_cursor": "cursor", "has_more": False},
            "/transactions/recurring/get": {"outflow_streams": [self.stream]},
        }
        observations = []
        with (patch("app.worker.decrypt", return_value="token"),
              patch("app.worker.plaid", side_effect=lambda path, **_: responses[path]) as provider,
              patch("app.worker.store_stream", side_effect=lambda db, conn, stream:
                    observations.append(observation(stream, conn["accounts"])))):
            sync(db, connection)
        self.assertTrue(observations[0]["eligible"])
        provider.assert_any_call("/transactions/recurring/get", access_token="token",
                                 options={"personal_finance_category_version": "v2"})
        self.assertEqual(observations[0]["currency"], "USD")
        saved_accounts = db.execute.call_args_list[0].args[1][0].obj
        self.assertEqual(saved_accounts, [{"id": "card", "label": "Card ••1234"}])
