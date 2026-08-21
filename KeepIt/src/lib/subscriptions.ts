import { apiFetch } from "@/lib/api";

/**
 * Data-access layer for subscriptions.
 *
 * These used to hit Supabase directly; now they go through our FastAPI backend
 * (see backend/). `apiFetch` attaches the signed-in user's access-token, and the
 * backend verifies it and scopes every query to that user — so, like before,
 * these calls never mention user_id and only ever touch the current user's rows.
 *
 * Every function returns `{ data, error }` where `error` is a string message
 * (or null on success), matching what `apiFetch` returns.
 */

/** One subscription row, exactly as the app reads it back. */
export type Subscription = {
  id: string;
  name: string;
  cost: number;
  next_renewal_date: string; // ISO date, e.g. "2026-09-01"
  created_at: string;
};

/** The fields the user actually types in — everything else the backend fills in. */
export type NewSubscription = {
  name: string;
  cost: number;
  next_renewal_date: string;
};

/** Fetches the current user's subscriptions, soonest renewal first. */
export async function listSubscriptions() {
  return apiFetch<Subscription[]>("/subscriptions");
}

/** Creates a new subscription for the current user; returns the created row. */
export async function addSubscription(input: NewSubscription) {
  return apiFetch<Subscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Removes one of the current user's subscriptions by id. */
export async function deleteSubscription(id: string) {
  return apiFetch<null>(`/subscriptions/${id}`, { method: "DELETE" });
}