import { expect, test } from "@playwright/test";

const product = {
  id: "catalog-product-1",
  title: "Core Training Tee",
  handle: "core-training-tee",
  description: "Lightweight training shirt",
  status: "ACTIVE",
  published: true,
  preorderEnabled: false,
  tags: ["training"],
  minPrice: 48,
  inventoryTotal: 7,
  metric: { searchImpressions: 0, clicks: 0, unitsSold: 0, revenue: 0 },
  images: [
    { id: "i1", url: "https://images.example.com/front.webp", altText: "front", color: null },
    { id: "i2", url: "https://images.example.com/back.webp", altText: "back", color: null },
    { id: "i3", url: "https://images.example.com/mosaic.jpg", altText: "mosaic", color: null },
  ],
  variants: [{ id: "v1", title: "M", size: "M", color: null, colorHex: null, sku: "CORE-M", price: 48, compareAtPrice: null, inventoryQuantity: 7 }],
  updatedAt: "2026-08-22T12:00:00.000Z",
};

test("catalog admin: make an image the main one and save the new order", async ({ page }) => {
  const saves: Array<{ images: Array<{ url: string }> }> = [];
  await page.route("**/api/admin/catalog/products", (route) =>
    route.fulfill({ json: { products: [product], total: 1, page: 1, pageSize: 100, tags: ["training"] } }));
  await page.route("**/api/admin/catalog/products?**", (route) =>
    route.fulfill({ json: { products: [product], total: 1, page: 1, pageSize: 100, tags: ["training"] } }));
  await page.route("**/api/admin/catalog/products/catalog-product-1", async (route) => {
    saves.push(route.request().postDataJSON());
    await route.fulfill({ json: { ...product } });
  });

  await page.goto("/en/admin/catalog");
  await page.getByRole("button", { name: "Edit" }).click();

  const first = page.getByTestId("product-image-0");
  await expect(first.getByText("Main")).toBeVisible();
  await expect(first.locator("input").first()).toHaveValue("https://images.example.com/front.webp");

  // The mosaic is third; promote it to the main image.
  await page.getByTestId("product-image-2").getByRole("button", { name: "Make main image" }).click();
  await expect(page.getByTestId("product-image-0").locator("input").first()).toHaveValue("https://images.example.com/mosaic.jpg");
  await expect(page.getByTestId("product-image-0").getByText("Main")).toBeVisible();

  // Move the old main image later and confirm the order before saving.
  await page.getByTestId("product-image-1").getByRole("button", { name: "Move later" }).click();
  await expect(page.getByTestId("product-image-2").locator("input").first()).toHaveValue("https://images.example.com/front.webp");

  await page.getByRole("button", { name: "Save product" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].images.map((image) => image.url)).toEqual([
    "https://images.example.com/mosaic.jpg",
    "https://images.example.com/back.webp",
    "https://images.example.com/front.webp",
  ]);
});
