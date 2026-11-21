import { expect, test, type Page } from "@playwright/test";

const emptySizes = { S: 0, M: 0, L: 0, XL: 0, OS: 0 };
const view = {
  settings: { fxRate: 466, cardCommissionRate: 0.0195 },
  crReady: true,
  totals: { quantity: 3, paidInvestmentUsd: 100, totalInventoryCostCrc: 90000, expectedSalesCrc: 150000, totalContributionCrc: 50000, contributionMargin: 0.33 },
  paymentMethods: [{ id: "pm1", name: "Cash", active: true }],
  lines: [{
    id: "line-1", code: "SLWA17", productName: "Aura", color: "Rosa",
    sizes: { ...emptySizes, M: 3 }, remaining: { ...emptySizes, M: 3 }, soldQuantity: 0, remainingQuantity: 3, layaways: [], layawayPhase: null, batchId: null,
    unitPriceUsd: 9.8, piecesPerGarment: 1,
    cost: { paidInvestmentUsd: 30, totalInventoryCostCrc: 30000, costPerUnitCrc: 10000, salePriceCrc: 50000, contributionPerUnitCrc: 39000, contributionMargin: 0.78 },
  }],
};

async function mockInventory(page: Page) {
  const applied: Array<{ mode: string; items: Array<{ lineId: string; size: string; quantity: number }> }> = [];
  await page.route("**/api/admin/inventory/exchange-rate", (route) => route.fulfill({ json: { date: "2026-10-02", buyRate: 456, sellRate: 462.29, stale: false } }));
  await page.route("**/api/admin/inventory/scan?**", (route) => {
    const code = new URL(route.request().url()).searchParams.get("code");
    if (code === "SLWA17-ROSA-M") {
      return route.fulfill({ json: { code, sku: "SLWA17-ROSA-M", lineId: "line-1", size: "M", productName: "Aura", color: "Rosa", received: 3, sold: 0, held: 0, remaining: 3 } });
    }
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
  await page.route("**/api/admin/inventory/scan/apply", async (route) => {
    const body = route.request().postDataJSON();
    applied.push(body);
    await route.fulfill({ json: { mode: body.mode, applied: [{ lineId: "line-1", code: "SLWA17", color: "Rosa", size: "M", before: 3, after: body.mode === "receive" ? 5 : 1, delta: body.mode === "receive" ? 2 : -2 }] } });
  });
  await page.route("**/api/admin/inventory", (route) => route.fulfill({ json: view }));
  return applied;
}

test("inventory scanner: receiving stock adds one unit per scan and applies the total", async ({ page }) => {
  const applied = await mockInventory(page);
  await page.goto("/en/admin/inventory");
  await page.getByTestId("open-scanner").click();
  const drawer = page.getByRole("dialog", { name: "Inventory scanner" });
  const input = drawer.getByPlaceholder("Scan or type the code (SKU)");

  await input.fill("SLWA17-ROSA-M");
  await input.press("Enter");
  await expect(drawer.getByText("Rosa · M · SLWA17-ROSA-M")).toBeVisible();
  await input.fill("SLWA17-ROSA-M");
  await input.press("Enter");
  await expect(drawer.getByRole("spinbutton")).toHaveValue("2");

  await drawer.getByTestId("scan-apply").click();
  await page.getByRole("button", { name: "Apply", exact: true }).last().click();
  await expect(drawer.getByText("Changes applied").first()).toBeVisible();
  expect(applied).toEqual([{ mode: "receive", note: "", items: [{ lineId: "line-1", size: "M", quantity: 2 }] }]);
});

test("inventory scanner: a physical count shows the difference and sets the counted number", async ({ page }) => {
  const applied = await mockInventory(page);
  await page.goto("/en/admin/inventory");
  await page.getByTestId("open-scanner").click();
  const drawer = page.getByRole("dialog", { name: "Inventory scanner" });
  await drawer.getByText("Physical count").click();

  const input = drawer.getByPlaceholder("Scan or type the code (SKU)");
  await input.fill("SLWA17-ROSA-M");
  await input.press("Enter");
  await drawer.getByRole("spinbutton").fill("1");
  await expect(drawer.getByText("-2", { exact: true })).toBeVisible();

  await drawer.getByTestId("scan-apply").click();
  await page.getByRole("button", { name: "Apply", exact: true }).last().click();
  await expect.poll(() => applied.length).toBe(1);
  expect(applied[0]).toMatchObject({ mode: "count", items: [{ lineId: "line-1", size: "M", quantity: 1 }] });
});

test("inventory scanner: an unknown code is reported and nothing is added", async ({ page }) => {
  await mockInventory(page);
  await page.goto("/en/admin/inventory");
  await page.getByTestId("open-scanner").click();
  const drawer = page.getByRole("dialog", { name: "Inventory scanner" });
  const input = drawer.getByPlaceholder("Scan or type the code (SKU)");
  await input.fill("NOPE-123");
  await input.press("Enter");
  await expect(page.getByText("We could not find that code.")).toBeVisible();
  await expect(drawer.getByText("Nothing scanned yet.")).toBeVisible();
});
