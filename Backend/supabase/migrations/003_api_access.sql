-- Provider references and overrides are managed only by the authenticated API.
-- RLS stays enabled, but mobile clients must not bypass the API's field checks.
revoke all on public.subscriptions from anon, authenticated;
