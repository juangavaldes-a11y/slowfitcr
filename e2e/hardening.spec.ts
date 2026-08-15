import { expect, test, type Page } from "@playwright/test";

async function expectKeyboardFocus(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.press("Tab");
    const appHasFocus = await page.evaluate(() => {
      const main = document.querySelector("main");
      return Boolean(main && document.activeElement && main.contains(document.activeElement));
    });
    if (appHasFocus) break;
  }
  await expect(page.locator("main :focus")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("not-found recovery is localized and keyboard accessible", async ({ page }) => {
  await page.goto("/en/product/missing-product");
  await expect(page.getByRole("heading", { name: "This page is not available." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/en");
  await expectKeyboardFocus(page);

  await page.goto("/es/product/producto-inexistente");
  await expect(page.getByRole("heading", { name: "Esta página no está disponible." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/es");
});

test("account reports API failures without breaking its mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );

  await page.goto("/en/account");
  await expect(page.getByRole("alert").filter({ hasText: "We could not load your account. Try again." })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectKeyboardFocus(page);
});

test("expired moderation session returns the operator to sign in", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const review = {
    id: "pending-review-1",
    productHandle: "performance-collection-1",
    locale: "en",
    rating: 5,
    author: "Session Test",
    email: "session@example.com",
    content: "Review awaiting moderation.",
    createdAt: "2026-08-15T18:00:00.000Z",
    status: "PENDING",
    moderatedAt: null,
    moderatedBy: null,
  };

  await page.route("**/api/reviews/pending**", (route) =>
    route.fulfill({ json: { reviews: [review], total: 1 } }),
  );
  await page.route("**/api/reviews/moderate", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );

  await page.goto("/en/admin/reviews");
  await expect(page.getByText("Session Test")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectKeyboardFocus(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Moderation access" })).toBeVisible();
  await expect(page.getByText("Your session expired. Sign in again.")).toBeVisible();
});

test("failed webhook replay preserves event details and reports the error", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const event = {
    id: "webhook-failed-replay",
    topic: "orders/paid",
    shop: "slow-fit.myshopify.com",
    orderId: "1042",
    payload: { id: 1042 },
    status: "FAILED",
    errorMessage: "CRM endpoint timed out",
    createdAt: "2026-08-15T18:00:00.000Z",
    processedAt: null,
    replayedAt: null,
  };

  await page.route("**/api/admin/audit-logs**", (route) =>
    route.fulfill({ json: { logs: [], total: 0 } }),
  );
  await page.route("**/api/admin/webhooks/orders**", (route) =>
    route.fulfill({ json: { events: [event], total: 1 } }),
  );
  await page.route("**/api/admin/webhooks/orders/replay", (route) =>
    route.fulfill({ status: 502, json: { error: "Downstream unavailable" } }),
  );

  await page.goto("/en/admin/ops");
  await expectNoHorizontalOverflow(page);
  await expectKeyboardFocus(page);
  await page.getByRole("button", { name: "View details" }).click();
  const drawer = page.getByRole("dialog", { name: "Webhook details" });
  await drawer.getByRole("button", { name: "Replay" }).click();
  await page.getByRole("button", { name: "Replay", exact: true }).last().click();

  await expect(page.getByText("Could not replay webhook")).toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("CRM endpoint timed out")).toBeVisible();
});