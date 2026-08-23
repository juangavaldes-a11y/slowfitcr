import { expect, test } from "@playwright/test";

test("shop refreshes after hydration and shows active preorder products", async ({ page }) => {
  await page.route("**/api/catalog/products?**", (route) => route.fulfill({
    json: {
      products: [{
        id: "preorder-product",
        handle: "preorder-jumpsuit",
        title: "Preorder Jumpsuit",
        description: "Available to reserve before inventory arrives.",
        status: "ACTIVE",
        published: true,
        preorderEnabled: true,
        currencyCode: "USD",
        tags: ["jumpsuit"],
        images: [{ id: "preorder-image", url: "https://images.example.com/preorder.jpg", altText: "Preorder jumpsuit" }],
        variants: [{
          id: "preorder-variant",
          title: "M",
          size: "M",
          color: null,
          colorHex: null,
          price: 45,
          compareAtPrice: null,
          inventoryQuantity: 0,
          currencyCode: "USD",
          availableForSale: true,
          preorder: true,
        }],
      }],
      total: 1,
      page: 1,
      pageSize: 24,
    },
  }));

  await page.goto("/en/shop");
  await expect(page.getByRole("heading", { name: "Preorder Jumpsuit" })).toBeVisible();
  await expect(page.getByText("Pre-order", { exact: true })).toBeVisible();
});

test("shop card opens product details and supports quick add", async ({ page }) => {
  await page.route("**/api/catalog/products?**", (route) => route.fulfill({
    json: {
      products: [{
        id: "quick-add-product",
        handle: "quick-add-leggings",
        title: "Quick Add Leggings",
        description: "Training leggings with color and size options.",
        status: "ACTIVE",
        published: true,
        preorderEnabled: false,
        currencyCode: "USD",
        tags: ["women", "leggings"],
        images: [{ id: "quick-add-image", url: "https://images.example.com/leggings.jpg", altText: "Blue leggings" }],
        variants: [
          { id: "black-small", title: "S / Black", size: "S", color: "Black", colorHex: "#111111", price: 42, compareAtPrice: null, inventoryQuantity: 3, currencyCode: "USD", availableForSale: true, preorder: false },
          { id: "blue-medium", title: "M / Blue", size: "M", color: "Blue", colorHex: "#3267A8", price: 44, compareAtPrice: null, inventoryQuantity: 3, currencyCode: "USD", availableForSale: true, preorder: false },
        ],
      }, {
        id: "single-color-product",
        handle: "single-color-shorts",
        title: "Single Color Shorts",
        description: "Training shorts available in one color.",
        status: "ACTIVE",
        published: true,
        preorderEnabled: false,
        currencyCode: "USD",
        tags: ["women", "shorts"],
        images: [{ id: "single-color-image", url: "https://images.example.com/shorts.jpg", altText: "Olive shorts" }],
        variants: [
          { id: "olive-small", title: "S / Olive", size: "S", color: "Olive", colorHex: "#74734A", price: 36, compareAtPrice: null, inventoryQuantity: 3, currencyCode: "USD", availableForSale: true, preorder: false },
        ],
      }],
      total: 2,
      page: 1,
      pageSize: 24,
    },
  }));

  await page.goto("/en/shop");
  await page.getByRole("button", { name: "Add: Quick Add Leggings", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/shop$/);
  await expect(page.getByRole("dialog", { name: /Add to cart: Quick Add Leggings/ })).toBeVisible();
  await page.getByRole("button", { name: "Blue", exact: true }).click();
  await expect(page.getByText("M - $44.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cart (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Add: Single Color Shorts", exact: true }).click();
  const singleColorDialog = page.getByRole("dialog", { name: /Add to cart: Single Color Shorts/ });
  await expect(singleColorDialog.getByText(/^Color:/)).toHaveCount(0);
  await expect(singleColorDialog.getByText("Size", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: "View: Quick Add Leggings", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/product\/quick-add-leggings$/);
});

test("customer can add an internal product to cart and request payment", async ({ page, request }) => {
  const login = await request.post("/api/admin/login", { data: { token: "e2e-token" } });
  expect(login.ok()).toBeTruthy();
  const created = await request.post("/api/admin/catalog/products", {
    data: {
      title: "Slow Core Training Tee",
      handle: "slow-core-training-tee",
      description: "A lightweight training tee with a relaxed fit.",
      status: "ACTIVE",
      published: true,
      tags: ["training"],
      images: [{ url: "https://images.example.com/training-tee.jpg", altText: "Training tee" }],
      variants: [
        { title: "M / Black", size: "M", color: "Black", colorHex: "#111111", sku: "E2E-TEE-M-BLK", price: 48, compareAtPrice: 56, inventoryQuantity: 5 },
        { title: "L / Blue", size: "L", color: "Blue", colorHex: "#3267A8", sku: "E2E-TEE-L-BLU", price: 48, compareAtPrice: 56, inventoryQuantity: 5 },
      ],
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

  await page.getByRole("button", { name: "Blue" }).click();
  await expect(page.getByText("L - $48.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  const cartButton = page.getByRole("button", { name: "Cart (1)" });
  await expect(cartButton).toBeVisible();
  await cartButton.click();

  await expect(page.getByText(/Slow Core Training Tee - L \/ Blue/)).toBeVisible();
  await expect(page.getByText("$48.00", { exact: true }).first()).toBeVisible();

  const checkout = await request.post("/api/cart/checkout", {
    data: {
      locale: "en",
      lines: [{ variantId: product.variants[1].id, quantity: 1 }],
    },
  });
  expect(checkout.status()).toBe(503);
  const payload = await checkout.json();
  expect(payload.error).toBe("Payment provider is not configured");
});
