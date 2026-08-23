import { expect, test, type Page } from "@playwright/test";

async function expectKeyboardFocus(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

test("language switch completes and persists through navigation", async ({ page }) => {
  await page.goto("/es?campaign=test#why-slow");
  await page.locator(".slowfit-locale-switcher .ant-segmented-item").filter({ hasText: "EN" }).click();

  await expect(page).toHaveURL(/\/en\?campaign=test#why-slow$/);
  await expect(page.getByText("We do not believe in quick results", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Shop", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/shop$/);
  await expect(page.getByRole("heading", { name: "Activewear designed for training and purposeful living." })).toBeVisible();
});

test("global navigation exposes public routes and gates admin routes", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/en/shop");

  for (const name of ["Home", "Shop", "Collections", "Why SLOW?", "Contact"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Shop", exact: true })).toHaveClass(/is-active/);
  await expect(page.getByRole("link", { name: "Contact", exact: true })).not.toHaveClass(/is-active/);
  await expect(page.getByRole("button", { name: /Account/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Administration/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Information/ }).click();
  const publicRoutes = [
    ["Shipping", "/en/shipping"],
    ["Returns", "/en/returns"],
    ["Privacy", "/en/privacy"],
    ["Terms", "/en/terms"],
  ];
  for (const [name, href] of publicRoutes) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Account/ }).click();
  await expect(page.getByRole("menuitem", { name: "Sign in" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Staff access" }).click();
  await page.getByLabel("Administration token").fill("e2e-token");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/admin\/catalog$/, { timeout: 20_000 });

  await expect(page.getByRole("button", { name: /Administration/ })).toHaveClass(/is-active/);
  await page.getByRole("button", { name: /Administration/ }).click();
  const adminRoutes = [
    ["Catalog", "/en/admin/catalog"],
    ["Reviews", "/en/admin/reviews"],
    ["Operations", "/en/admin/ops"],
  ];
  const adminMenu = page.getByRole("menu");
  for (const [name, href] of adminRoutes) {
    await expect(adminMenu.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
});

test("authenticated customer signs out from the Account submenu", async ({ page }) => {
  const suffix = Date.now();
  await page.goto("/en/account");
  await page.getByRole("tab", { name: "Create account" }).click();
  const registration = page.getByRole("tabpanel", { name: "Create account" });
  await registration.locator("#firstName").fill("Navigation");
  await registration.locator("#email").fill(`nav-${suffix}@example.com`);
  await registration.locator("#password").fill("secure-pass-123");
  await registration.getByRole("button", { name: "Create my account" }).click();

  await expect(page.getByRole("button", { name: /My account/ })).toBeVisible();
  await page.getByRole("button", { name: /My account/ }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: /Sign out/ }).click();

  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole("button", { name: /Account/ }).click();
  await expect(page.getByRole("menuitem", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: /Sign out/ })).toHaveCount(0);
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

test("account login remains available while session restoration is stalled", async ({ page }) => {
  await page.route("**/api/auth/session", () => new Promise(() => {}));

  await page.goto("/en/account");
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("account formats rate-limit errors consistently", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 429, json: { error: "Rate limit exceeded" } }),
  );

  await page.goto("/en/account");
  await page.getByLabel("Email").fill("customer@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts. Wait a moment and try again." })).toBeVisible();
});

test("customer requests and completes password recovery", async ({ page }) => {
  let requestedEmail = "";
  let submittedToken = "";
  await page.route("**/api/auth/password/forgot", async (route) => {
    const payload = route.request().postDataJSON();
    requestedEmail = payload.email;
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route("**/api/auth/password/reset", async (route) => {
    const payload = route.request().postDataJSON();
    submittedToken = payload.token;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/en/account");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill("recover@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "If an account exists" })).toBeVisible();
  expect(requestedEmail).toBe("recover@example.com");

  const resetToken = "test-reset-token-that-is-long-enough";
  await page.goto(`/en/account?resetToken=${resetToken}`);
  await expect(page.getByRole("heading", { name: "Create new password" })).toBeVisible();
  await page.getByLabel("Password").fill("new-password-456");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your password was updated" })).toBeVisible();
  expect(submittedToken).toBe(resetToken);
});

test("operator filters and inspects audit details on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const audit = {
    id: "audit-customer-registered",
    action: "customer.registered",
    actor: "customer@example.com",
    details: { customerId: "customer-1042" },
    createdAt: "2026-08-15T18:00:00.000Z",
  };

  await page.route("**/api/admin/audit-logs**", (route) =>
    route.fulfill({ json: { logs: [audit], total: 1 } }),
  );
  await page.route("**/api/admin/webhooks/payments**", (route) =>
    route.fulfill({ json: { events: [], total: 0 } }),
  );

  await page.goto("/en/admin/ops");
  const auditRow = page.getByRole("article").filter({ hasText: "customer.registered" });
  await expect(auditRow).toBeVisible();
  await auditRow.getByRole("button", { name: "View details" }).click();

  const drawer = page.getByRole("dialog", { name: "Audit details" });
  await expect(drawer.getByText("customer@example.com")).toBeVisible();
  await expect(drawer.getByText('"customerId": "customer-1042"')).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await page.getByRole("combobox").nth(1).click();
  await expect(page.getByText("customer.registered", { exact: true }).last()).toBeVisible();
  await expectNoHorizontalOverflow(page);
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
    topic: "payment.paid",
    provider: "test-bank",
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
  await page.route("**/api/admin/webhooks/payments**", (route) =>
    route.fulfill({ json: { events: [event], total: 1 } }),
  );
  await page.route("**/api/admin/webhooks/payments/replay", (route) =>
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