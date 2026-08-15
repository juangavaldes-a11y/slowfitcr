import { expect, test } from "@playwright/test";

test("moderator session persists across review and operations pages", async ({ page, request }) => {
  const suffix = Date.now();
  const author = `E2E Reviewer ${suffix}`;
  const content = `Excellent end-to-end review content ${suffix}`;

  const submission = await request.post("/api/reviews/submit", {
    data: {
      productHandle: "performance-collection-1",
      locale: "en",
      rating: 5,
      author,
      email: `e2e-${suffix}@example.com`,
      content,
    },
  });
  expect(submission.ok()).toBeTruthy();

  await page.goto("/en/admin/reviews");
  await page.getByLabel("Moderation token").fill("e2e-token");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByPlaceholder("Search product, customer, or content").fill(author);
  await page.getByRole("button", { name: "search" }).click();
  await expect(page.getByText(author)).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(author)).not.toBeVisible();

  await page.getByRole("combobox").first().click();
  await page.getByText("Approved", { exact: true }).click();
  await expect(page.getByText(author)).toBeVisible();
  const approvedReview = page.getByRole("article").filter({ hasText: author });
  await expect(approvedReview.getByText("APPROVED", { exact: true })).toBeVisible();

  await page.goto("/en/admin/ops");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});

test("operator inspects and replays a failed webhook", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const event = {
    id: "webhook-failed-1",
    topic: "orders/paid",
    shop: "slow-fit.myshopify.com",
    orderId: "1042",
    payload: { id: 1042, name: "#1042", total_price: "89.00" },
    status: "FAILED",
    errorMessage: "CRM endpoint timed out",
    createdAt: "2026-08-15T18:00:00.000Z",
    processedAt: null,
    replayedAt: null,
  };
  let replayCount = 0;

  await page.route("**/api/admin/audit-logs**", (route) =>
    route.fulfill({ json: { logs: [], total: 0, page: 1, pageSize: 8 } }),
  );
  await page.route("**/api/admin/webhooks/orders**", (route) =>
    route.fulfill({ json: { events: [event], total: 1, page: 1, pageSize: 8 } }),
  );
  await page.route("**/api/admin/webhooks/orders/replay", async (route) => {
    replayCount += 1;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/en/admin/ops");
  await expect(page.getByText("orders/paid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View details" }).click();

  const drawer = page.getByRole("dialog", { name: "Webhook details" });
  await expect(drawer.getByText("CRM endpoint timed out")).toBeVisible();
  await expect(drawer.getByText('"total_price": "89.00"')).toBeVisible();
  await expect(drawer.getByText("Not available")).toHaveCount(2);

  await drawer.getByRole("button", { name: "Replay" }).click();
  await page.getByRole("button", { name: "Replay", exact: true }).last().click();
  await expect(page.getByText("Webhook replayed")).toBeVisible();
  expect(replayCount).toBe(1);
});
