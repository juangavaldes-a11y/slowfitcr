import { expect, test } from "@playwright/test";

test("customer can add a product to cart and request checkout", async ({ page, request }) => {
  await page.goto("/en/product/slow-core-training-tee");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Slow Core Training Tee");
  await expect(page.getByText("The relaxed fit works well for training")).toBeVisible();

  await page.getByRole("combobox").click();
  await page.getByText("M - $48.00", { exact: true }).click();

  await page.getByRole("button", { name: "Add to cart" }).click();
  const cartButton = page.getByRole("button", { name: "Cart (1)" });
  await expect(cartButton).toBeVisible();
  await cartButton.click();

  await expect(page.getByText(/Slow Core Training Tee - M/)).toBeVisible();
  await expect(page.getByText("$48.00", { exact: true }).first()).toBeVisible();

  const checkout = await request.post("/api/cart/checkout", {
    data: {
      locale: "en",
      lines: [{ variantId: "slow-core-training-tee-m", quantity: 1 }],
    },
  });
  expect(checkout.ok()).toBeTruthy();
  const payload = await checkout.json();
  expect(payload.checkout.cartId).toBe("fallback");
  expect(payload.checkout.checkoutUrl).toBeTruthy();
});
