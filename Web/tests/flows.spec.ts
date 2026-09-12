import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Subscription } from "../src/lib/subscriptions";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  user_metadata: { display_name: "Taylor" },
  app_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const session = () => ({
  access_token: "test-access-token",
  token_type: "bearer",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
});

async function setup(page: Page, signedIn = true) {
  const state = {
    rows: [] as Subscription[],
    failList: false,
    failDelete: false,
    creates: 0,
    deletes: 0,
    accountDeletes: 0,
    callbacks: 0,
    failCallback: false,
    failReview: false,
    listReads: 0,
    reviewGates: new Map<string, Promise<void>>(),
    connections: [] as Array<{ id: string; institution_name: string; accounts: { id: string; label: string }[]; sync_status: string; last_synced_at: string | null }>,
    candidates: [] as Array<{ id: string; connection_id: string; decision: string; subscription_id: string | null; observation: Record<string, unknown> }>,
  };
  if (signedIn)
    await page.addInitScript(
      (value) =>
        localStorage.setItem(
          "sb-keepit-test-auth-token",
          JSON.stringify(value),
        ),
      session(),
    );
  await page.route("https://keepit-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/token")) {
      if (url.searchParams.get("grant_type") === "pkce") state.callbacks++;
      if (state.failCallback)
        return route.fulfill({
          status: 400,
          json: { error_code: "bad_code_verifier", msg: "Invalid code" },
        });
      return route.fulfill({ json: session() });
    }
    if (url.pathname.endsWith("/signup"))
      return route.fulfill({ json: { ...user, identities: [] } });
    if (url.pathname.endsWith("/recover")) return route.fulfill({ json: {} });
    return route.fulfill({ json: user });
  });
  await page.route("http://127.0.0.1:8001/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && ["/subscriptions", "/subscription-candidates"].includes(url.pathname)) state.listReads++;
    expect(request.headers().authorization).toBe("Bearer test-access-token");
    if (url.pathname === "/account") {
      state.accountDeletes++;
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === "/dashboard") {
      const active = state.rows.filter((row) => row.status === "active");
      const total = active.reduce(
        (sum, row) =>
          sum + Number(row.cost) / (row.billing_interval === "annual" ? 12 : 1),
        0,
      );
      return route.fulfill({
        json: {
          monthly_equivalent: total.toFixed(2),
          active_count: active.length,
          pending_review_count: state.rows.filter((row) => row.status === "pending_review").length,
          currency: "USD",
          upcoming: active.slice(0, 5),
        },
      });
    }
    if (url.pathname === "/connections")
      return route.fulfill({ json: state.connections });
    if (url.pathname === "/subscription-candidates")
      return route.fulfill({ json: state.candidates });
    if (url.pathname.startsWith("/subscription-candidates/") && request.method() === "POST") {
      await state.reviewGates.get(url.pathname.split("/")[2]);
      if (state.failReview) return route.fulfill({ status: 503, json: { detail: "Could not save your choice. Please retry." } });
      const candidate = state.candidates.find((item) => item.id === url.pathname.split("/")[2])!;
      const action = request.postDataJSON().action;
      expect(["confirm", "ignore"]).toContain(action);
      candidate.decision = action === "ignore" ? "ignored" : "confirmed";
      if (action === "ignore") {
        state.rows = state.rows.filter((row) => row.id !== candidate.subscription_id);
        candidate.subscription_id = null;
      } else {
        state.rows.find((row) => row.id === candidate.subscription_id)!.status = "active";
      }
      return route.fulfill({ json: { decision: candidate.decision, subscription_id: candidate.subscription_id } });
    }
    if (request.method() === "GET") {
      if (state.failList)
        return route.fulfill({
          status: 503,
          json: { detail: "Tracking is temporarily unavailable." },
        });
      return route.fulfill({ json: state.rows });
    }
    if (request.method() === "POST") {
      state.creates++;
      const input = request.postDataJSON();
      expect(input).not.toHaveProperty("user_id");
      expect(input).not.toHaveProperty("status");
      const row = {
        ...input,
        id: `sub-${state.creates}`,
        status: "active",
        source: "manual",
        recurrence_anchor: input.next_renewal_date,
        created_at: "2026-01-01T00:00:00Z",
      };
      state.rows.push(row);
      return route.fulfill({ status: 201, json: row });
    }
    const id = url.pathname.split("/").pop();
    if (request.method() === "PATCH") {
      const row = state.rows.find((row) => row.id === id)!;
      Object.assign(row, request.postDataJSON());
      return route.fulfill({ json: row });
    }
    state.deletes++;
    if (state.failDelete)
      return route.fulfill({
        status: 503,
        json: { detail: "Could not remove subscription. Please retry." },
      });
    state.rows = state.rows.filter((row) => row.id !== id);
    return route.fulfill({ status: 204 });
  });
  return state;
}

async function add(
  page: Page,
  name = "Netflix",
  cost = "12.00",
  billing = "monthly",
) {
  await page.goto("/subscriptions/new");
  await page.getByLabel("Subscription name").fill(name);
  await page.getByLabel("Cost (USD)").fill(cost);
  await page.getByLabel("Billing interval").selectOption(billing);
  await page.getByLabel("Next renewal (estimate)").fill("2027-01-31");
  await page.getByRole("button", { name: "Save subscription" }).click();
  await expect(page).toHaveURL(/\/subscriptions$/);
}

test("signed-out routes redirect and login opens the workspace", async ({
  page,
}) => {
  await setup(page, false);
  await page.goto("/subscriptions/new");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});

test("create monthly and annual subscriptions, edit status, and refresh totals", async ({
  page,
}) => {
  const state = await setup(page);
  await add(page);
  await add(page, "Annual plan", "120.00", "annual");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText("$22.00", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Netflix/ }).click();
  await page.getByLabel("Subscription name").fill("Netflix family");
  await page.getByLabel("Actively tracking").uncheck();
  await page.getByRole("button", { name: "Save subscription" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText("$10.00", { exact: true })).toBeVisible();
  expect(state.creates).toBe(2);
  expect(state.rows[0].status).toBe("inactive");
});

test("removal supports cancellation, errors, retry, and focus restoration", async ({
  page,
}) => {
  const state = await setup(page);
  await add(page);
  await page.getByRole("link", { name: /Netflix/ }).click();
  const remove = page.getByRole("button", {
    name: "Remove subscription",
    exact: true,
  });
  await remove.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  expect(state.deletes).toBe(0);
  await remove.click();
  state.failDelete = true;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove subscription" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not remove");
  state.failDelete = false;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove subscription" })
    .click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await expect(
    page.getByRole("heading", { name: "Make room for clarity" }),
  ).toBeVisible();
});

test("list retry and missing detail states work on direct loads", async ({
  page,
}) => {
  const state = await setup(page);
  state.failList = true;
  await page.goto("/subscriptions");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  state.failList = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Make room for clarity" }),
  ).toBeVisible();
  await page.goto("/subscriptions/nonexistent");
  await expect(
    page.getByRole("heading", { name: "Subscription not found" }),
  ).toBeVisible();
});

test("invalid costs do not create records; account deletion can be cancelled", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/subscriptions/new");
  await page.getByLabel("Subscription name").fill("Netflix");
  await page.getByLabel("Cost (USD)").fill("-10");
  await page.getByRole("button", { name: "Save subscription" }).click();
  await expect(page.getByRole("alert")).toContainText("positive USD");
  expect(state.creates).toBe(0);
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  expect(state.accountDeletes).toBe(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("test@example.invalid", { exact: true }),
  ).toHaveCount(0);
});

test("keep and dismiss discoveries directly in subscriptions, preserving totals and retries", async ({ page }) => {
  const state = await setup(page);
  state.connections.push({
    id: "connection-1", institution_name: "Sandbox Bank", accounts: [{ id: "card", label: "Card ••1234" }],
    sync_status: "ready", last_synced_at: "2026-01-01T00:00:00Z",
  });
  state.candidates.push({
    id: "candidate-1", connection_id: "connection-1", decision: "pending", subscription_id: "provisional-1",
    observation: { name: "Netflix", cost: "15.00", currency: "USD", billing_interval: "monthly", next_renewal_date: "2027-01-31", account_label: "Card ••1234", eligible: true, reason: null },
  });
  state.rows.push({
    id: "provisional-1", name: "Netflix", cost: "15.00", currency: "USD", billing_interval: "monthly",
    next_renewal_date: "2027-01-31", recurrence_anchor: "2027-01-31", created_at: "2026-01-01T00:00:00Z",
    source: "plaid", status: "pending_review",
  });
  state.rows.push({ ...state.rows[0], id: "provisional-2", name: "Spotify" });
  state.candidates.push({ ...state.candidates[0], id: "candidate-2", subscription_id: "provisional-2", observation: { ...state.candidates[0].observation, name: "Spotify" } });
  state.candidates.push({ ...state.candidates[0], id: "unsupported", subscription_id: null, observation: { ...state.candidates[0].observation, name: "Unsupported payment", eligible: false, reason: "Payment currency is unavailable." } });
  await page.goto("/overview");
  await expect(page.locator(".metric.featured strong")).toHaveText("$0.00");
  await page.goto("/connections");
  await expect(page.getByRole("heading", { name: "Connected accounts" })).toBeVisible();
  await expect(page.getByText("Sandbox Bank")).toBeVisible();
  await page.getByRole("link", { name: "View subscriptions" }).click();
  const discoveries = page.getByRole("table", { name: "Discovered recurring payments" });
  await expect(discoveries.getByRole("row")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "1 discovered payment is not ready to track" })).toBeVisible();
  await expect(page.getByText("Payment currency is unavailable.", { exact: true })).toBeVisible();
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/subscriptions-${width}.png`, fullPage: true });
  }
  await expect(page.getByText("Unsupported payment")).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Review", exact: true })).toHaveCount(0);
  const netflix = discoveries.getByRole("row").filter({ hasText: "Netflix" });
  state.failReview = true;
  await netflix.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(netflix.getByRole("alert")).toContainText("Could not save your choice");
  expect(state.rows[0].status).toBe("pending_review");
  state.failReview = false;
  await netflix.getByRole("button", { name: "Keep", exact: true }).click();
  const tracked = page.getByRole("table", { name: "Your tracked subscriptions" });
  await expect(tracked.getByRole("link", { name: "Netflix" })).toBeVisible();
  await expect(discoveries.getByRole("link", { name: "Netflix" })).toHaveCount(0);
  await discoveries.getByRole("row").filter({ hasText: "Spotify" }).getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(discoveries).toHaveCount(0);
  await page.reload();
  await expect(tracked.getByRole("link", { name: "Netflix" })).toBeVisible();
  await expect(page.getByText("Spotify")).toHaveCount(0);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.locator(".metric.featured strong")).toHaveText("$15.00");
  await page.goto("/discoveries");
  await expect(page).toHaveURL(/\/subscriptions$/);
});

test("decisions update rows in place without refetching and preserve concurrent changes and focus", async ({ page }) => {
  const state = await setup(page);
  for (const [index, name] of ["Netflix", "Spotify", "Adobe"].entries()) {
    const row: Subscription = {
      id: `pending-${index}`, name, cost: "15.00", currency: "USD", billing_interval: "monthly",
      next_renewal_date: "2027-01-31", recurrence_anchor: "2027-01-31", created_at: "2026-01-01T00:00:00Z",
      source: "plaid", status: "pending_review",
    };
    state.rows.push(row);
    state.candidates.push({
      id: `candidate-${index}`, connection_id: "bank", subscription_id: row.id, decision: "pending",
      observation: { ...row, eligible: true, account_label: "Card", reason: null },
    });
  }
  // Keep enough content below the action rows to detect unwanted scroll jumps.
  for (let index = 0; index < 12; index++) {
    state.rows.push({ ...state.rows[0], id: `manual-${index}`, name: `Manual ${index}`, source: "manual", status: "active" });
  }
  let releaseKeep!: () => void;
  let releaseDismiss!: () => void;
  state.reviewGates.set("candidate-0", new Promise<void>((resolve) => { releaseKeep = resolve; }));
  state.reviewGates.set("candidate-1", new Promise<void>((resolve) => { releaseDismiss = resolve; }));
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/subscriptions");
  const discoveries = page.getByRole("table", { name: "Discovered recurring payments" });
  const tracked = page.getByRole("table", { name: "Your tracked subscriptions" });
  const netflix = discoveries.getByRole("row").filter({ hasText: "Netflix" });
  const spotify = discoveries.getByRole("row").filter({ hasText: "Spotify" });
  const adobe = discoveries.getByRole("row").filter({ hasText: "Adobe" });
  await expect(adobe).toBeVisible();
  const originalTable = await tracked.elementHandle();
  const originalDiscoveries = await discoveries.elementHandle();
  const reads = state.listReads;
  await page.evaluate(() => window.scrollTo(0, 100));
  await netflix.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(netflix.getByRole("button", { name: "Dismiss" })).toBeDisabled();
  await expect(spotify.getByRole("button", { name: "Dismiss" })).toBeEnabled();
  await spotify.getByRole("button", { name: "Dismiss" }).focus();
  await page.keyboard.press("Enter");
  await expect(spotify.getByRole("button", { name: "Keep", exact: true })).toBeDisabled();
  await expect(adobe.getByRole("button", { name: "Keep", exact: true })).toBeEnabled();
  await expect(page.locator(".loading")).toHaveCount(0);
  const scroll = await page.evaluate(() => window.scrollY);
  releaseDismiss();
  await expect(spotify).toHaveCount(0);
  await expect(adobe.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  releaseKeep();
  await expect(tracked.getByRole("link", { name: "Netflix" })).toBeVisible();
  await expect(netflix).toHaveCount(0);
  await expect(adobe.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
  expect(await originalTable!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await originalDiscoveries!.evaluate((element) => element.isConnected)).toBe(true);
  expect(state.listReads).toBe(reads);
  await expect(page.getByRole("heading", { name: "Tracked subscriptions 13", exact: true })).toBeVisible();
  await adobe.getByRole("button", { name: "Keep", exact: true }).press("Enter");
  await expect(discoveries).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tracked subscriptions 14", exact: true })).toBeFocused();
  expect(state.listReads).toBe(reads);
  await expect(tracked.getByRole("link", { name: "Adobe" })).toBeVisible();
  await page.reload();
  await expect(tracked.getByRole("link", { name: "Netflix" })).toBeVisible();
  await expect(tracked.getByRole("link", { name: "Adobe" })).toBeVisible();
  await expect(page.getByText("Spotify", { exact: true })).toHaveCount(0);
});

test("incomplete discoveries are explained even without subscription rows", async ({ page }) => {
  const state = await setup(page);
  state.candidates.push({
    id: "incomplete", connection_id: "connection", subscription_id: null, decision: "pending",
    observation: { name: "Incomplete payment", eligible: true, next_renewal_date: null, reason: null },
  });
  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "1 discovered payment is not ready to track" })).toBeVisible();
  await expect(page.getByText("Payment details or the next renewal date are incomplete.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep", exact: true })).toHaveCount(0);
});

test("recovery callback exchanges once and saves the password", async ({
  page,
}) => {
  const state = await setup(page, false);
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("test@example.invalid");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link");
  await page.goto("/auth-callback?code=test-code&flow=recovery");
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(state.callbacks).toBe(1);
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-test-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("new-test-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test("expired email callbacks explain how to retry", async ({ page }) => {
  const state = await setup(page, false);
  state.failCallback = true;
  await page.goto("/auth-callback?code=expired");
  await expect(page.getByRole("alert")).toContainText("different browser");
  await expect(
    page.getByRole("link", { name: "Request a new link" }),
  ).toHaveAttribute("href", "/signup");
});

for (const width of [1024, 1440]) {
  test(`desktop workspace fits at ${width}px`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await add(page);
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Coming up next" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/overview-${width}.png`,
      fullPage: true,
    });
  });
}
