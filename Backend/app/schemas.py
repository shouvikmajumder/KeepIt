"""Request/response shapes for the subscriptions API.

These mirror the `NewSubscription` and `Subscription` TypeScript types in
src/lib/subscriptions.ts. FastAPI uses them to validate incoming JSON and to
serialize rows back out (dates become ISO strings, matching what the app reads).
"""

from datetime import date, datetime

from pydantic import BaseModel, Field


class SubscriptionCreate(BaseModel):
    """The fields the user types in; user_id/id/created_at are set server-side."""

    name: str = Field(min_length=1)
    cost: float = Field(gt=0)
    next_renewal_date: date


class SubscriptionOut(BaseModel):
    """One subscription row, exactly as the app reads it back."""

    id: str
    name: str
    cost: float
    next_renewal_date: date
    created_at: datetime
