import { expect, test } from "@playwright/test";

test("customer can add an internal product to cart and request payment", async ({ page, request }) => {
  const login = await request.post("/api/admin/login", { data: { token: "e2e-token" } });
  expect(login.ok()).toBeTruthy();
  const created = await request.post("/api/admin/catalog/products", {
    data: {
      title: "Slow Core Training Tee",
      handle: "slow-core-training-tee",
      description: "A lightweight training tee with a relaxed fit.",
      status: "ACTIVE",
      tags: ["training"],
      images: [{ url: "https://images.example.com/training-tee.jpg", altText: "Training tee" }],
      variants: [{ title: "M", sku: "E2E-TEE-M", price: 48, compareAtPrice: 56, inventoryQuantity: 5 }],
    },
  });
  const productResponse = created.status() === 409
    ? await request.get("/api/catalog/products/slow-core-training-tee")
    : created;
  expect(productResponse.ok()).toBeTruthy();
  const product = (await productResponse.json()).product;

  await page.goto("/en/product/slow-core-training-tee");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Slow Core Training Tee");
  await expect(page.getByText("The relaxed fit works well for training")).toBeVisible();

  await page.getByRole("button", { name: "Add to cart" }).click();
  const cartButton = page.getByRole("button", { name: "Cart (1)" });
  await expect(cartButton).toBeVisible();
  await cartButton.click();

  await expect(page.getByText(/Slow Core Training Tee - M/)).toBeVisible();
  await expect(page.getByText("$48.00", { exact: true }).first()).toBeVisible();

  const checkout = await request.post("/api/cart/checkout", {
    data: {
      locale: "en",
      lines: [{ variantId: product.variants[0].id, quantity: 1 }],
    },
  });
  expect(checkout.status()).toBe(503);
  const payload = await checkout.json();
  expect(payload.error).toBe("Payment provider is not configured");
});
