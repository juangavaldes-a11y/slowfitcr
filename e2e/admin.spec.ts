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
