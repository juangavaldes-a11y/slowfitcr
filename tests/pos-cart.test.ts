import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addToCart, cartTotals, checkoutBody, looksLikeCode, setDiscount, setQuantity, shouldAcceptScan, type SellableVariant } from "../app/lib/pos-cart.ts";

const variant = (overrides: Partial<SellableVariant> = {}): SellableVariant => ({
  variantId: "v1", sku: "SLWA17-ROSA-M", name: "Aura", color: "Rosa", size: "M", unitPriceCrc: 19950, stock: 2, ...overrides,
});

describe("addToCart", () => {
  it("adds a new line and merges repeated scans of the same variant", () => {
    const first = addToCart([], variant());
    assert.equal(first.status, "added");
    const second = addToCart(first.cart, variant());
    assert.equal(second.status, "increased");
    assert.equal(second.cart.length, 1);
    assert.equal(second.cart[0].quantity, 2);
  });

  it("stops at the available stock", () => {
    let cart = addToCart([], variant()).cart;
    cart = addToCart(cart, variant()).cart;
    const third = addToCart(cart, variant());
    assert.equal(third.status, "limit_reached");
    assert.equal(third.cart[0].quantity, 2);
  });

  it("refuses variants without stock", () => {
    const result = addToCart([], variant({ stock: 0 }));
    assert.equal(result.status, "out_of_stock");
    assert.equal(result.cart.length, 0);
  });
});

describe("quantity and discount", () => {
  const cart = addToCart([], variant({ stock: 5 })).cart;

  it("clamps quantity to stock and removes the line below one", () => {
    assert.equal(setQuantity(cart, "v1", 99)[0].quantity, 5);
    assert.equal(setQuantity(cart, "v1", 0).length, 0);
    assert.equal(setQuantity(cart, "v1", Number.NaN).length, 0);
  });

  it("never lets a discount exceed the line value", () => {
    assert.equal(setDiscount(cart, "v1", 999999)[0].discountCrc, 19950);
    assert.equal(setDiscount(cart, "v1", -5)[0].discountCrc, 0);
    const discounted = setDiscount(setQuantity(cart, "v1", 3), "v1", 50000);
    assert.equal(setQuantity(discounted, "v1", 1)[0].discountCrc, 19950);
  });
});

describe("totals and checkout payload", () => {
  it("computes units, subtotal, discount and total", () => {
    let cart = addToCart([], variant({ stock: 5 })).cart;
    cart = setQuantity(cart, "v1", 2);
    cart = setDiscount(cart, "v1", 1000);
    cart = addToCart(cart, variant({ variantId: "v2", sku: "SLW001-NEGRO-L", unitPriceCrc: 18950 })).cart;
    assert.deepEqual(cartTotals(cart), { units: 3, subtotalCrc: 39900 + 18950, discountCrc: 1000, totalCrc: 39900 + 18950 - 1000 });
    const body = checkoutBody(cart, "Efectivo", "venta mostrador");
    assert.equal(body.paymentMethod, "Efectivo");
    assert.deepEqual(body.items[0], { variantId: "v1", quantity: 2, unitPriceCrc: 19950, discountCrc: 1000 });
  });
});

describe("scanner helpers", () => {
  it("tells barcodes from search text", () => {
    assert.equal(looksLikeCode("SLWA17-ROSA-M"), true);
    assert.equal(looksLikeCode("  SLW001  "), true);
    assert.equal(looksLikeCode("aura rosa"), false);
    assert.equal(looksLikeCode("aura"), false);
    assert.equal(looksLikeCode("12"), false);
  });

  it("debounces the same code but accepts a different one immediately", () => {
    assert.equal(shouldAcceptScan(null, "A1", 0), true);
    assert.equal(shouldAcceptScan({ code: "A1", at: 0 }, "A1", 500), false);
    assert.equal(shouldAcceptScan({ code: "A1", at: 0 }, "A1", 1600), true);
    assert.equal(shouldAcceptScan({ code: "A1", at: 0 }, "B2", 100), true);
    assert.equal(shouldAcceptScan(null, "", 0), false);
  });
});
