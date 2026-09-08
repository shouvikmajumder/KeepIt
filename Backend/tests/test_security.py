import hashlib
import time
import unittest
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import patch
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from db_case import settings
from app.auth import get_current_user_id
from app.plaid_client import encrypt, decrypt
from app.routers.plaid_webhook import verify


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.claims = {"sub": str(uuid4()), "iat": int(time.time()), "exp": int(time.time()) + 600,
                       "aud": "authenticated", "iss": f"{settings.supabase_url}/auth/v1"}

    def authenticate(self, claims):
        token = jwt.encode(claims, self.key, algorithm="ES256", headers={"kid": "test"})
        with patch("app.auth._jwks_client.get_signing_key_from_jwt", return_value=SimpleNamespace(key=self.key.public_key())):
            return get_current_user_id(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))

    def test_access_token_claims_are_required_and_checked(self):
        self.assertEqual(self.authenticate(self.claims), self.claims["sub"])
        for field in ("sub", "iat", "exp", "aud", "iss"):
            claims = {key: value for key, value in self.claims.items() if key != field}
            with self.subTest(missing=field), self.assertRaises(HTTPException):
                self.authenticate(claims)
        for patch_claim in ({"iss": "https://other.invalid"}, {"aud": "other"}, {"sub": "not-a-uuid"}, {"exp": 1}):
            with self.subTest(claim=patch_claim), self.assertRaises(HTTPException):
                self.authenticate({**self.claims, **patch_claim})

    def test_webhook_rejects_modified_stale_and_wrongly_signed_bodies(self):
        raw = b'{"item_id":"test"}'
        claims = {"iat": int(time.time()), "request_body_sha256": hashlib.sha256(raw).hexdigest()}
        public = jwt.algorithms.ECAlgorithm.to_jwk(self.key.public_key(), as_dict=True)
        with patch("app.routers.plaid_webhook.plaid", return_value={"key": public}):
            token = jwt.encode(claims, self.key, algorithm="ES256", headers={"kid": "test"})
            verify(raw, token)
            with self.assertRaises(HTTPException):
                verify(raw + b" ", token)
            stale = jwt.encode({**claims, "iat": int(time.time())-301}, self.key, algorithm="ES256", headers={"kid": "test"})
            with self.assertRaises(HTTPException):
                verify(raw, stale)
            wrong = jwt.encode(claims, ec.generate_private_key(ec.SECP256R1()), algorithm="ES256", headers={"kid": "test"})
            with self.assertRaises(HTTPException):
                verify(raw, wrong)

    def test_token_encryption_does_not_store_plaintext(self):
        with patch.object(settings, "token_encryption_key", Fernet.generate_key().decode()):
            ciphertext = encrypt("private-plaid-token")
            self.assertNotIn("private-plaid-token", ciphertext)
            self.assertEqual(decrypt(ciphertext), "private-plaid-token")
