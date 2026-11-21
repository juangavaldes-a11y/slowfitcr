import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, receiptHtml, type PosReceipt } from "../app/lib/pos-receipt.ts";

const receipt: PosReceipt = {
  receipt: "POS-20261120-ABC123",
  soldAt: "2026-11-20T15:30:00.000Z",
  paymentMethod: "Efectivo",
  totalCrc: 38900,
  items: [{ sku: "SLWA17-ROSA-M", name: "Aura <b>x</b>", color: "Rosa", size: "M", quantity: 2, unitPriceCrc: 19950, discountCrc: 1000, lineTotalCrc: 38900 }],
};

describe("receipt", () => {
  it("escapes HTML special characters", () => {
    assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    assert.equal(escapeHtml(null), "");
  });

  it("never injects catalog text as markup", () => {
    const html = receiptHtml(receipt, "es");
    assert.ok(!html.includes("<b>x</b>"));
    assert.ok(html.includes("Aura &lt;b&gt;x&lt;/b&gt;"));
  });

  it("shows the receipt number, line details, discount, total and payment in Spanish", () => {
    const html = receiptHtml(receipt, "es");
    assert.ok(html.includes("POS-20261120-ABC123"));
    assert.ok(html.includes("SLWA17-ROSA-M"));
    assert.match(html, /2 × /);
    assert.match(html, /Pago: Efectivo/);
    assert.match(html, /gracias/i);
  });

  it("renders English labels", () => {
    const html = receiptHtml(receipt, "en");
    assert.match(html, /Payment: Efectivo/);
    assert.match(html, /Thank you/);
  });
});
