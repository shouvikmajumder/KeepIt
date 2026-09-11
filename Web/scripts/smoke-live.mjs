import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:5173/login");
  await page.getByLabel("Email address").fill(process.env.KEEPIT_SMOKE_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.KEEPIT_SMOKE_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 20000 });
  await page.getByRole("link", { name: "Subscriptions", exact: true }).click();
  await page
    .getByRole("link", { name: "Add subscription", exact: true })
    .first()
    .click();
  await page.getByLabel("Subscription name").fill("Browser smoke subscription");
  await page.getByLabel("Cost (USD)").fill("18.00");
  await page.getByLabel("Next renewal (estimate)").fill("2027-02-28");
  await page.getByRole("button", { name: "Save subscription" }).click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await page.reload();
  await page.getByRole("link", { name: /Browser smoke subscription/ }).click();
  await page.getByLabel("Cost (USD)").fill("20.00");
  await page.getByRole("button", { name: "Save subscription" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText("$20.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: /Browser smoke subscription/ }).click();
  await page
    .getByRole("button", { name: "Remove subscription", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove subscription" })
    .click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  console.log(
    "PASS: live browser login, create, reload persistence, edit, dashboard, delete, and sign-out",
  );
} finally {
  await browser.close();
}
