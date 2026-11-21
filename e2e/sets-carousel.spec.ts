import { expect, test } from "@playwright/test";

test("home: the sets carousel lists the 10 mosaics, scrolls with the arrows and links to products", async ({ page }) => {
  await page.goto("/en");
  const section = page.locator("#sets");
  await expect(section.getByRole("heading", { name: "Sets" })).toBeVisible();
  const slides = section.locator("li");
  await expect(slides).toHaveCount(10);

  // Own products open the site's product page; the newest sets point to the Nidux store.
  await expect(slides.nth(0).getByRole("link")).toHaveAttribute("href", /^\/en\/shop\/mige-fgbtz4549/);
  await expect(slides.nth(7).getByRole("link")).toHaveAttribute("href", "https://slow.minidux.com/products/29");

  const track = section.getByTestId("sets-track");
  const prev = section.getByTestId("sets-prev");
  const next = section.getByTestId("sets-next");
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  const before = await track.evaluate((element) => element.scrollLeft);
  await next.click();
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  await expect(prev).toBeEnabled();

  // Reaching the end disables "next".
  await track.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(next).toBeDisabled();
});

test("home: the sets carousel fits a phone screen without horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es");
  await expect(page.locator("#sets").getByRole("heading", { name: "Conjuntos" })).toBeVisible();
  // The track scrolls inside its own box: the section must never be wider than the screen.
  const sectionRight = await page.locator("#sets").evaluate((element) => element.getBoundingClientRect().right - window.innerWidth);
  expect(sectionRight).toBeLessThanOrEqual(0);
  const trackScrolls = await page.getByTestId("sets-track").evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(trackScrolls).toBe(true);
  const slideWidth = await page.locator("#sets li").first().evaluate((element) => element.getBoundingClientRect().width);
  expect(slideWidth).toBeGreaterThan(250);
  expect(slideWidth).toBeLessThan(390);
});
