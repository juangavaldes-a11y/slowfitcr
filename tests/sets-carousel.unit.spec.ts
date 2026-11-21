import { expect, test } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { SET_IMAGE_SIZE, setSlides, slideHref, slideIsExternal } from "../app/data/sets-carousel";

test("every set slide has a unique id, a name and an existing image under public/", () => {
  expect(setSlides.length).toBe(10);
  expect(new Set(setSlides.map((slide) => slide.id)).size).toBe(setSlides.length);
  for (const slide of setSlides) {
    expect(slide.name.length).toBeGreaterThan(2);
    const file = join(process.cwd(), "public", slide.image);
    expect(existsSync(file), `${slide.image} is missing`).toBe(true);
    // Keep the carousel light: mosaics are ~90 KB each.
    expect(statSync(file).size, `${slide.image} is too heavy`).toBeLessThan(200_000);
  }
});

test("slides link to the site's product page, or to the Nidux store when the product only exists there", () => {
  const marea = setSlides.find((slide) => slide.id === "marea")!;
  expect(slideHref(marea, "es")).toBe(`/es/shop/${marea.handle}`);
  expect(slideHref(marea, "en")).toBe(`/en/shop/${marea.handle}`);
  expect(slideIsExternal(marea)).toBe(false);
  const calma = setSlides.find((slide) => slide.id === "calma")!;
  expect(slideHref(calma, "es")).toBe("https://slow.minidux.com/products/29");
  expect(slideIsExternal(calma)).toBe(true);
});

test("every slide has exactly one destination and the image size matches the 4:5 mosaics", () => {
  for (const slide of setSlides) {
    expect(Boolean(slide.handle) !== Boolean(slide.externalUrl), `${slide.id} needs a handle or an externalUrl`).toBe(true);
  }
  expect(SET_IMAGE_SIZE.width / SET_IMAGE_SIZE.height).toBeCloseTo(0.8, 5);
});
