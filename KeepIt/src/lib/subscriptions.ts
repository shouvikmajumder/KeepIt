import { supabase } from "@/lib/supabase";

/**
 * Data-access layer for the `subscriptions` table (see supabase/schema.sql).
 *
 * Every function here goes through the shared `supabase` client, so each request
 * carries the signed-in user's JWT. That's what lets Row Level Security scope
 * things automatically: the queries below never mention user_id, yet the
 * database only ever returns / accepts the current user's rows.
 */

/** One subscription row, exactly as the app reads it back. */
export type Subscription = {
  id: string;
  name: string;
  cost: number;
  next_renewal_date: string; // ISO date, e.g. "2026-09-01"
  created_at: string;
};

/** The fields the user actually types in — everything else the DB fills in. */
export type NewSubscription = {
  name: string;
  cost: number;
  next_renewal_date: string;
};

/**
 * Fetches the current user's subscriptions, soonest renewal first. RLS limits
 * the rows to this user, so there's no `where user_id = ...` here on purpose.
 */
export async function listSubscriptions() {
  return supabase
    .from("subscriptions")
    .select("id, name, cost, next_renewal_date, created_at")
    .order("next_renewal_date", { ascending: true })
    .returns<Subscription[]>();
}

/**
 * Inserts a new subscription for the current user. We deliberately don't send
 * `user_id`: the column defaults to auth.uid(), so Postgres stamps it from the
 * caller's session. `.select().single()` returns the created row back.
 */
export async function addSubscription(input: NewSubscription) {
  return supabase
    .from("subscriptions")
    .insert(input)
    .select("id, name, cost, next_renewal_date, created_at")
    .single<Subscription>();
}

/** Removes one of the current user's subscriptions by id (RLS blocks others'). */
export async function deleteSubscription(id: string) {
  return supabase.from("subscriptions").delete().eq("id", id);
}