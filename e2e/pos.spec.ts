import { expect, test, type Page } from "@playwright/test";

async function mockPos(page: Page) {
  const checkouts: unknown[] = [];
  await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/admin/inventory", (route) =>
    route.fulfill({ json: { paymentMethods: [{ id: "pm1", name: "Efectivo", active: true }, { id: "pm2", name: "Tarjeta", active: true }, { id: "pm3", name: "Cheque", active: false }] } }));
  await page.route("**/api/admin/pos/lookup**", (route) => {
    const code = new URL(route.request().url()).searchParams.get("code");
    if (code === "SLWA17-ROSA-M") {
      return route.fulfill({ json: { variantId: "var-1", sku: "SLWA17-ROSA-M", productTitle: "Aura", title: "Rosa / M", size: "M", color: "Rosa", price: 19950, inventoryQuantity: 2, image: null } });
    }
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
  await page.route("**/api/admin/catalog/products**", (route) => route.fulfill({ json: { products: [], total: 0, page: 1, pageSize: 24, tags: [] } }));
  await page.route("**/api/admin/pos/checkout", async (route) => {
    checkouts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        receipt: "POS-20261120-ABC123", soldAt: "2026-11-20T15:30:00.000Z", paymentMethod: "Efectivo", totalCrc: 39900,
        items: [{ saleId: "s1", sku: "SLWA17-ROSA-M", name: "Aura", color: "Rosa", size: "M", quantity: 2, unitPriceCrc: 19950, discountCrc: 0, lineTotalCrc: 39900 }],
      },
    });
  });
  return checkouts;
}

test("POS: scanning a SKU adds it to the cart, repeats merge, and checkout shows the receipt", async ({ page }) => {
  const checkouts = await mockPos(page);
  await page.goto("/en/admin/pos");

  const search = page.getByPlaceholder("Scan the code or search by name");
  await expect(search).toBeVisible();
  await search.fill("SLWA17-ROSA-M");
  await search.press("Enter");
  await expect(page.getByText("Aura", { exact: true })).toBeVisible();
  await expect(page.getByText(/Rosa · M · SLWA17-ROSA-M/)).toBeVisible();

  // A hardware scanner types the same code again: the line grows to the available stock (2), never beyond.
  await search.fill("SLWA17-ROSA-M");
  await search.press("Enter");
  await expect(page.getByText(/39,900/).first()).toBeVisible();
  await search.fill("SLWA17-ROSA-M");
  await search.press("Enter");
  await expect(page.getByText("No more stock for that variant.")).toBeVisible();

  await page.getByRole("button", { name: "Charge" }).click();
  await expect(page.getByText("POS-20261120-ABC123")).toBeVisible();
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0]).toMatchObject({ paymentMethod: "Efectivo", items: [{ variantId: "var-1", quantity: 2, unitPriceCrc: 19950 }] });
});

test("POS: an unknown code reports not found and leaves the cart empty", async ({ page }) => {
  await mockPos(page);
  await page.goto("/en/admin/pos");
  const search = page.getByPlaceholder("Scan the code or search by name");
  await search.fill("NOPE-123");
  await search.press("Enter");
  await expect(page.getByText("We could not find that code.")).toBeVisible();
  await expect(page.getByText("Scan or search a product to start the sale.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Charge" })).toBeDisabled();
});
