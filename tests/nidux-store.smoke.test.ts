// Smoke tests against the live Nidux store. Run on demand: npm run test:smoke
// They only read public pages; no credentials or writes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const STORE = (process.env.NIDUX_STORE_URL ?? "https://slow.minidux.com").replace(/\/+$/, "");
const SITE = process.env.SMOKE_SITE_URL ?? "https://slowfitcr.com";

// The store answers 403 to Node's default user agent, so identify the test explicitly.
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; SlowFitSmokeTest/1.0)", "Accept-Language": "es" };

async function page(path: string) {
  const response = await fetch(`${STORE}${path}`, { redirect: "follow", headers: HEADERS });
  return { status: response.status, html: await response.text() };
}

describe("old site root", () => {
  it("redirects slowfitcr.com/ to the Nidux store", async () => {
    const response = await fetch(`${SITE}/`, { redirect: "manual", headers: HEADERS });
    assert.ok([307, 308].includes(response.status), `unexpected status ${response.status}`);
    assert.equal(response.headers.get("location"), `${STORE}/`);
  });
});

describe("store pages", () => {
  it("home loads with the Slow branding and the collections section", async () => {
    const { status, html } = await page("/");
    assert.equal(status, 200);
    assert.match(html, /Train with Purpose/);
    assert.match(html, /Colecciones/);
  });

  it("lists the footer legal pages", async () => {
    const { html } = await page("/");
    for (const slug of [
      "politica-de-envios",
      "politica-de-cambios-y-devoluciones",
      "politica-de-privacidad",
      "terminos-y-condiciones",
      "politica-de-eliminacion-de-datos",
    ]) {
      assert.ok(html.includes(`/contents/${slug}`), `footer is missing ${slug}`);
    }
  });

  it("terms page includes security systems plus privacy and data deletion at the end", async () => {
    const { status, html } = await page("/contents/terminos-y-condiciones");
    assert.equal(status, 200);
    const security = html.indexOf("Sistemas de seguridad");
    const privacy = html.indexOf("Política de Privacidad y Protección de Datos");
    const deletion = html.indexOf("Política de Eliminación de Datos");
    assert.ok(security > 0, "missing security section");
    assert.ok(privacy > security, "privacy policy must come after the terms");
    assert.ok(deletion > privacy, "data deletion policy must close the page");
    assert.match(html, /PCI DSS/);
  });
});

describe("catalog", () => {
  it("women's category shows many products with prices", async () => {
    const { status, html } = await page("/categories/1/performance-collection");
    assert.equal(status, 200);
    const products = new Set(html.match(/\/products\/\d+/g) ?? []);
    assert.ok(products.size >= 20, `expected at least 20 products, found ${products.size}`);
    assert.match(html, /₡\s*[\d,]+<sup>\.\d{2}<\/sup>/);
  });

  it("a product page exposes stock, colors and sizes", async () => {
    const { status, html } = await page("/products/43");
    assert.equal(status, 200);
    assert.match(html, /SLWA17/);
    assert.match(html, /Existencias/);
    assert.match(html, /Talla/);
    assert.match(html, /Color/);
  });
});
