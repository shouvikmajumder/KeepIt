import unittest
from unittest.mock import patch
from uuid import uuid4

from db_case import settings
from app.routers.plaid_link import LinkRequest, link_token


class LinkTokenTests(unittest.TestCase):
    def test_new_connection_requests_transactions_without_recurring_product(self):
        user_id = str(uuid4())
        with (
            patch.object(settings, "plaid_webhook_url", ""),
            patch.object(settings, "plaid_redirect_uri", ""),
            patch("app.routers.plaid_link.plaid", return_value={"link_token": "test-link-token"}) as client,
        ):
            result = link_token(LinkRequest(), user_id)

        self.assertEqual(result, {"link_token": "test-link-token"})
        client.assert_called_once_with(
            "/link/token/create",
            user={"client_user_id": user_id},
            client_name="KeepIt",
            country_codes=["US"],
            language="en",
            products=["transactions"],
            transactions={"days_requested": 730},
        )
