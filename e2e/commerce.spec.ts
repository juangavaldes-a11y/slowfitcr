import { expect, test } from "@playwright/test";

test("customer can add a product to cart and request checkout", async ({ page, request }) => {
  await page.goto("/en/product/performance-collection-1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Performance Collection");

  await page.getByRole("button", { name: "Add to cart" }).click();
  const cartButton = page.getByRole("button", { name: "Cart (1)" });
  await expect(cartButton).toBeVisible();
  await cartButton.click();

  await expect(page.getByText(/Performance Collection Edition 1 - S/)).toBeVisible();
  await expect(page.getByText("$50.00", { exact: true }).first()).toBeVisible();

  const checkout = await request.post("/api/cart/checkout", {
    data: {
      locale: "en",
      lines: [{ variantId: "performance-collection-1-s", quantity: 1 }],
    },
  });
  expect(checkout.ok()).toBeTruthy();
  const payload = await checkout.json();
  expect(payload.checkout.cartId).toBe("fallback");
  expect(payload.checkout.checkoutUrl).toBeTruthy();
});
