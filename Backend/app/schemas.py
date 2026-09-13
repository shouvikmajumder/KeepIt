"""Request/response shapes for the subscriptions API.

These mirror the `NewSubscription` and `Subscription` TypeScript types in
src/lib/subscriptions.ts. FastAPI uses them to validate incoming JSON and to
serialize rows back out (dates become ISO strings, matching what the app reads).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SubscriptionCreate(BaseModel):
    """The fields the user types in; user_id/id/created_at are set server-side."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    cost: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    next_renewal_date: date
    billing_interval: Literal["monthly", "annual"] = "monthly"
    currency: Literal["USD"] = "USD"
    payment_type: Literal["subscription", "bill", "unknown"] = "subscription"

    @field_validator("next_renewal_date")
    @classmethod
    def supported_date(cls, value: date) -> date:
        if not 2000 <= value.year <= 2100:
            raise ValueError("Choose a date between 2000 and 2100")
        return value


class SubscriptionOut(BaseModel):
    """One subscription row, exactly as the app reads it back."""

    id: UUID
    name: str
    cost: Decimal
    next_renewal_date: date
    created_at: datetime
    billing_interval: Literal["monthly", "annual"]
    currency: Literal["USD"]
    status: Literal["active", "inactive", "pending_review"]
    source: Literal["manual", "plaid"]
    recurrence_anchor: date
    payment_type: Literal["subscription", "bill", "unknown"]


class SubscriptionUpdate(SubscriptionCreate):
    # Older clients must not silently relabel an existing bill on unrelated edits.
    payment_type: Literal["subscription", "bill", "unknown"] | None = None
    # Send a complete editable form; ownership and provider fields stay server-side.
    status: Literal["active", "inactive", "pending_review"] = "active"
