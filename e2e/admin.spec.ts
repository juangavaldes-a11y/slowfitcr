import { expect, test } from "@playwright/test";

test("catalog admin shows public navigation and pagination", async ({ page }) => {
  const catalogRequests: string[] = [];
  await page.route("**/api/admin/catalog/products**", (route) => {
    catalogRequests.push(route.request().url());
    return route.fulfill({
    json: {
      products: [{
        id: "catalog-product-1",
        title: "Core Training Tee",
        handle: "core-training-tee",
        description: "Lightweight training shirt",
        status: "ACTIVE",
        published: true,
        preorderEnabled: false,
        tags: ["training", "women"],
        minPrice: 48,
        inventoryTotal: 7,
        metric: { searchImpressions: 12, clicks: 3, unitsSold: 2, revenue: 96 },
        images: [],
        variants: [{
          id: "catalog-variant-1",
          title: "M",
          size: "M",
          color: null,
          colorHex: null,
          sku: "CORE-M",
          price: 48,
          compareAtPrice: null,
          inventoryQuantity: 7,
        }],
        updatedAt: "2026-08-22T12:00:00.000Z",
      }],
      total: 101,
      page: 1,
      pageSize: 100,
      tags: ["training", "women"],
    },
    });
  });

  await page.goto("/en/admin/catalog");

  for (const name of ["Shop", "Collections", "Why Slow", "Contact", "Account"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await expect(page.locator(".ant-pagination-item-1")).toBeVisible();
  await expect(page.locator(".ant-pagination-item-2")).toBeVisible();
  await expect(page.getByRole("cell", { name: "12" })).toBeVisible();

  await page.getByRole("combobox").first().click();
  await page.locator(".ant-select-item-option").filter({ hasText: "training" }).click();
  await page.locator(".ant-select-item-option").filter({ hasText: "women" }).click();
  await expect.poll(() => catalogRequests.at(-1)).toContain("tag=training&tag=women");

  await page.getByRole("columnheader", { name: "Clicks" }).click();
  await expect.poll(() => catalogRequests.at(-1)).toContain("sortBy=clicks");
});

test("moderator session persists across review and operations pages", async ({ page, request }) => {
  test.setTimeout(60_000);
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

  await page.getByRole("article").filter({ hasText: author }).getByRole("button", { name: "Approve", exact: true }).click();
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
    topic: "payment.paid",
    provider: "test-bank",
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
  await page.route("**/api/admin/webhooks/payments**", (route) =>
    route.fulfill({ json: { events: [event], total: 1, page: 1, pageSize: 8 } }),
  );
  await page.route("**/api/admin/webhooks/payments/replay", async (route) => {
    replayCount += 1;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/en/admin/ops");
  await expect(page.getByText("payment.paid", { exact: true })).toBeVisible();
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
