import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Expense } from "../src/lib/expenses";
import type { Subscription } from "../src/lib/subscriptions";

const user = {
  id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
  email: "test@example.invalid", user_metadata: { display_name: "Taylor" }, app_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const session = () => ({ access_token: "test-access-token", token_type: "bearer",
  refresh_token: "test-refresh-token", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user });
const month = new Date().toISOString().slice(0, 7);

function subscription(changes: Partial<Subscription> = {}): Subscription {
  return { id: "sub-1", name: "Netflix", cost: "15.00", currency: "USD",
    billing_interval: "monthly", next_renewal_date: `${month}-28`, recurrence_anchor: `${month}-28`,
    created_at: "2026-01-01T00:00:00Z", source: "plaid", status: "active",
    payment_type: "subscription", hidden: false, account_label: "Card ••1234", ...changes };
}

function expense(changes: Partial<Expense> = {}): Expense {
  return { id: "11111111-1111-4111-8111-111111111112", date: `${month}-05`, merchant: "Local Market",
    amount: "20.00", currency: "USD", pending: false, hidden: false,
    category: "GENERAL_MERCHANDISE", category_label: "Shopping", account_id: "card",
    account_label: "Card ••1234", ...changes };
}

async function setup(page: Page, signedIn = true) {
  const state = {
    rows: [] as Subscription[], expenses: [] as Expense[], creates: 0, deletes: 0,
    accountDeletes: 0, failList: false, failConnections: false, subscriptionReads: 0,
    connections: [] as Array<{ id: string; institution_name: string;
      accounts: { id: string; label: string }[]; sync_status: string; last_synced_at: string | null }>,
  };
  if (signedIn) await page.addInitScript((value) => localStorage.setItem(
    "sb-keepit-test-auth-token", JSON.stringify(value)), session());
  await page.route("https://keepit-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/token")) return route.fulfill({ json: session() });
    if (url.pathname.endsWith("/signup")) return route.fulfill({ json: { ...user, identities: [] } });
    if (url.pathname.endsWith("/recover")) return route.fulfill({ json: {} });
    return route.fulfill({ json: user });
  });
  await page.route("http://127.0.0.1:8001/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBe("Bearer test-access-token");
    if (url.pathname === "/account") { state.accountDeletes++; return route.fulfill({ status: 204 }); }
    if (url.pathname === "/connections") return state.failConnections
      ? route.fulfill({ status: 503, json: { detail: "Unavailable" } })
      : route.fulfill({ json: state.connections });
    if (url.pathname === "/dashboard") {
      const selectedMonth = url.searchParams.get("month") || month;
      const selectedAccount = url.searchParams.get("account_id");
      const visible = state.expenses.filter((row) => row.date.startsWith(selectedMonth) &&
        !row.pending && !row.hidden && (!selectedAccount || row.account_id === selectedAccount));
      const total = visible.reduce((sum, row) => sum + Number(row.amount), 0);
      const categoryMap = new Map<string, { key: string; label: string; amount: number }>();
      visible.forEach((row) => { const current = categoryMap.get(row.category) ||
        { key: row.category, label: row.category_label, amount: 0 };
        current.amount += Number(row.amount); categoryMap.set(row.category, current); });
      const active = state.rows.filter((row) => row.status === "active" && !row.hidden);
      const estimate = (kind: Subscription["payment_type"]) => active.filter((row) => row.payment_type === kind)
        .reduce((sum, row) => sum + Number(row.cost) / (row.billing_interval === "annual" ? 12 : 1), 0);
      return route.fulfill({ json: { month: selectedMonth, spending_total: total.toFixed(2),
        previous_month_total: "0.00", change_amount: total.toFixed(2), currency: "USD",
        categories: [...categoryMap.values()].map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
        subscription_monthly_estimate: estimate("subscription").toFixed(2),
        bill_monthly_estimate: estimate("bill").toFixed(2), upcoming: active.slice(0, 5),
        accounts: state.connections.flatMap((row) => row.accounts), last_synced_at: "2026-09-13T12:00:00Z",
        syncing: state.connections.some((row) => row.sync_status === "syncing") } });
    }
    if (url.pathname === "/expenses" && request.method() === "GET") {
      const selectedMonth = url.searchParams.get("month") || month;
      const account = url.searchParams.get("account_id");
      const category = url.searchParams.get("category");
      const hidden = url.searchParams.get("visibility") === "hidden";
      const rows = state.expenses.filter((row) => row.date.startsWith(selectedMonth) && row.hidden === hidden &&
        (!account || row.account_id === account) && (!category || row.category === category));
      return route.fulfill({ json: { transactions: rows, next_cursor: null } });
    }
    if (url.pathname.startsWith("/expenses/") && request.method() === "PATCH") {
      const row = state.expenses.find((item) => item.id === url.pathname.split("/").pop())!;
      Object.assign(row, request.postDataJSON());
      return route.fulfill({ json: row });
    }
    if (url.pathname.startsWith("/subscriptions")) {
      if (request.method() === "GET") {
        state.subscriptionReads++;
        if (state.failList) return route.fulfill({ status: 503, json: { detail: "Tracking is temporarily unavailable." } });
        return route.fulfill({ json: state.rows });
      }
      if (request.method() === "POST") {
        state.creates++; const input = request.postDataJSON();
        const row = subscription({ ...input, id: `sub-${state.creates}`, source: "manual" });
        state.rows.push(row); return route.fulfill({ status: 201, json: row });
      }
      const id = url.pathname.split("/")[2];
      if (request.method() === "PATCH") {
        const row = state.rows.find((item) => item.id === id)!;
        Object.assign(row, request.postDataJSON()); return route.fulfill({ json: row });
      }
      state.deletes++; state.rows = state.rows.filter((item) => item.id !== id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  return state;
}

async function add(page: Page, name = "Netflix", type = "subscription") {
  await page.goto("/subscriptions/new");
  await page.getByLabel("Payment type").selectOption(type);
  await page.getByLabel("Payment name").fill(name);
  await page.getByLabel("Cost (USD)").fill("12.00");
  await page.getByLabel("Next renewal (estimate)").fill(`${month}-28`);
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page).toHaveURL(/\/subscriptions$/);
}

test("signed-out routes redirect and login opens subscriptions", async ({ page }) => {
  await setup(page, false); await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();
});

test("connected expenses appear automatically and totals exclude pending charges", async ({ page }) => {
  const state = await setup(page);
  state.connections.push({ id: "bank", institution_name: "Sandbox Bank",
    accounts: [{ id: "card", label: "Card ••1234" }], sync_status: "ready", last_synced_at: "2026-09-13T12:00:00Z" });
  state.expenses.push(expense(), expense({ id: "22222222-2222-4222-8222-222222222222",
    merchant: "Refund", amount: "-5.00" }), expense({ id: "33333333-3333-4333-8333-333333333333",
    merchant: "Pending cafe", amount: "8.00", pending: true, category: "FOOD_AND_DRINK", category_label: "Food & drink" }));
  await page.goto("/overview");
  await expect(page.locator(".metric.featured strong")).toHaveText("$15.00");
  await expect(page.getByText("Pending · excluded from totals")).toBeVisible();
  const market = page.getByRole("row").filter({ hasText: "Local Market" });
  await market.getByRole("button", { name: "Hide" }).click();
  await expect(page.locator(".metric.featured strong")).toHaveText("-$5.00");
  await page.getByRole("button", { name: "Show hidden" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Local Market" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator(".metric.featured strong")).toHaveText("$15.00");
});

test("subscriptions and bills are separated automatically and can be hidden", async ({ page }) => {
  const state = await setup(page);
  state.rows.push(subscription({ detection: { source: "history", confidence: "strong", payment_count: 24, reason_codes: ["regular_cadence", "stable_price"] } }), subscription({ id: "bill", name: "Electricity", cost: "90.00", payment_type: "bill", detection: null }));
  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: /Subscriptions 1/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Bills 1/ })).toBeVisible();
  await expect(page.getByText("Monthly pattern · 24 payments")).toBeVisible();
  await expect(page.getByText("$15.00 / month · est.", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link").first()).toHaveText("≡Subscriptions");
  const netflix = page.getByRole("row").filter({ hasText: "Netflix" });
  await netflix.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Netflix" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show hidden" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Netflix" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  expect(state.rows[0].hidden).toBe(false);
});

test("manual entry remains available as a fallback", async ({ page }) => {
  const state = await setup(page); await add(page, "Cash rent", "bill");
  await expect(page.getByRole("link", { name: "Cash rent" })).toBeVisible();
  await page.getByRole("link", { name: "Cash rent" }).click();
  await page.getByLabel("Payment name").fill("Apartment rent");
  await page.getByRole("button", { name: "Save payment" }).click();
  expect(state.rows[0].name).toBe("Apartment rent");
});

test("newly detected subscriptions appear without a manual refresh", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/subscriptions$/);
  await expect(page.getByText("No subscriptions found.")).toBeVisible();
  state.rows.push(subscription({ detection: { source: "history", confidence: "strong", payment_count: 3, reason_codes: ["regular_cadence", "stable_price"] } }));
  await page.clock.fastForward(10000);
  await expect(page.getByRole("row").filter({ hasText: "Netflix" })).toBeVisible();
  await page.getByRole("link", { name: "Spending", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Spending", exact: true })).toBeVisible();
});

test("connections describe automatic organization", async ({ page }) => {
  const state = await setup(page);
  state.connections.push({ id: "bank", institution_name: "Sandbox Bank",
    accounts: [{ id: "card", label: "Card ••1234" }], sync_status: "ready", last_synced_at: "2026-09-13T12:00:00Z" });
  await page.goto("/connections");
  await expect(page.getByText(/organize your posted expenses/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  await expect(page.getByText("Sandbox Bank")).toBeVisible();
});

test("bank import shows activity and completes automatically", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page);
  state.connections.push({ id: "bank", institution_name: "Sandbox Bank", accounts: [], sync_status: "syncing", last_synced_at: null });
  await page.goto("/connections");
  await expect(page.getByRole("status")).toContainText("Retrieving your bank activity");
  await expect(page.getByText(/You can leave this page/)).toBeVisible();
  await expect(page.locator(".sync-indicator .spinner")).toBeVisible();
  state.connections[0].sync_status = "ready";
  state.connections[0].last_synced_at = "2026-09-13T12:00:00Z";
  await page.clock.fastForward(10000);
  await expect(page.getByRole("status")).toHaveText("Bank activity updated");
  await expect(page.locator("time")).toHaveAttribute("datetime", "2026-09-13T12:00:00Z");
  await expect(page.locator(".sync-indicator .spinner")).toHaveCount(0);
});

test("subscription import refreshes results on completion and dismisses success", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page);
  state.connections.push({ id: "bank", institution_name: "Bank", accounts: [], sync_status: "syncing", last_synced_at: null });
  await page.goto("/subscriptions");
  await expect(page.getByText("Your subscriptions will appear here as we find them.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("1 bank updating");
  const reads = state.subscriptionReads;
  state.connections[0].sync_status = "ready";
  state.rows.push(subscription());
  // Visibility refresh checks bank status without waiting for the subscription timer.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("row").filter({ hasText: "Netflix" })).toBeVisible();
  expect(state.subscriptionReads).toBeGreaterThan(reads);
  await expect(page.getByRole("status")).toHaveText("Bank activity updated. Your subscriptions are up to date.");
  await page.clock.fastForward(8000);
  await expect(page.locator(".subscription-sync-banner")).toHaveCount(0);
});

test("mixed bank states keep existing subscriptions visible and identify attention needed", async ({ page }) => {
  const state = await setup(page);
  state.rows.push(subscription());
  for (const [id, status] of [["One", "syncing"], ["Two", "syncing"], ["Three", "needs_reconnect"], ["Four", "error"]]) {
    state.connections.push({ id, institution_name: id, accounts: [], sync_status: status, last_synced_at: null });
  }
  await page.goto("/subscriptions");
  await expect(page.getByRole("row").filter({ hasText: "Netflix" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("2 banks updating");
  await expect(page.getByRole("status")).toContainText("2 banks also need attention.");
  await page.getByRole("link", { name: "View bank connections" }).click();
  await expect(page.getByText("Your bank needs to reconnect")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible();
  await expect(page.getByText("Updates are delayed", { exact: true })).toBeVisible();
});

test("status failures preserve content and recover without manual refresh", async ({ page }) => {
  await page.clock.install();
  const state = await setup(page);
  state.rows.push(subscription());
  state.failConnections = true;
  await page.goto("/subscriptions");
  await expect(page.getByRole("status")).toContainText("Unable to check update status.");
  await expect(page.getByRole("row").filter({ hasText: "Netflix" })).toBeVisible();
  state.failConnections = false;
  state.connections.push({ id: "bank", institution_name: "Bank", accounts: [], sync_status: "syncing", last_synced_at: null });
  await page.clock.fastForward(10000);
  await expect(page.getByRole("status")).toContainText("1 bank updating");
  await page.getByRole("link", { name: "View bank connections" }).click();
  await expect(page.getByText("Retrieving your bank activity")).toBeVisible();
  state.failConnections = true;
  await page.clock.fastForward(10000);
  await expect(page.getByRole("alert")).toContainText("Unable to check update status.");
  await expect(page.getByRole("heading", { name: "Bank", exact: true })).toBeVisible();
});

test("sync indicators fit mobile and respect reduced motion", async ({ page }, testInfo) => {
  const state = await setup(page);
  state.connections.push({ id: "bank", institution_name: "A bank with a longer institution name", accounts: [], sync_status: "syncing", last_synced_at: null });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/connections", "/subscriptions"]) {
    await page.goto(route);
    await expect(page.locator(".sync-indicator .spinner")).toBeVisible();
    await expect(page.locator(".sync-indicator .spinner")).toHaveCSS("animation-name", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-mobile.png`), fullPage: true });
  }
});

for (const width of [1024, 1440]) {
  test(`spending workspace fits at ${width}px`, async ({ page }) => {
    const state = await setup(page);
    state.connections.push({ id: "bank", institution_name: "Bank", accounts: [{ id: "card", label: "Card" }], sync_status: "ready", last_synced_at: null });
    state.expenses.push(expense());
    await page.setViewportSize({ width, height: 1000 }); await page.goto("/overview");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
