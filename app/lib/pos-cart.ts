// Pure POS logic (no React): cart math, scan handling and the checkout payload.

export type CartLine = {
  variantId: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  unitPriceCrc: number;
  quantity: number;
  discountCrc: number;
  maxQuantity: number;
};

export type SellableVariant = {
  variantId: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  unitPriceCrc: number;
  stock: number;
};

export type AddResult = { cart: CartLine[]; status: "added" | "increased" | "out_of_stock" | "limit_reached" };

export function addToCart(cart: CartLine[], item: SellableVariant): AddResult {
  if (item.stock < 1) return { cart, status: "out_of_stock" };
  const existing = cart.find((line) => line.variantId === item.variantId);
  if (!existing) {
    const line: CartLine = {
      variantId: item.variantId,
      sku: item.sku,
      name: item.name,
      color: item.color,
      size: item.size,
      unitPriceCrc: item.unitPriceCrc,
      quantity: 1,
      discountCrc: 0,
      maxQuantity: item.stock,
    };
    return { cart: [...cart, line], status: "added" };
  }
  if (existing.quantity >= existing.maxQuantity) return { cart, status: "limit_reached" };
  return {
    cart: cart.map((line) => (line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line)),
    status: "increased",
  };
}

export function setQuantity(cart: CartLine[], variantId: string, quantity: number): CartLine[] {
  if (!Number.isFinite(quantity) || quantity < 1) return cart.filter((line) => line.variantId !== variantId);
  return cart.map((line) => {
    if (line.variantId !== variantId) return line;
    const next = Math.min(Math.floor(quantity), line.maxQuantity);
    // A smaller cart line can no longer carry a discount larger than its value.
    return { ...line, quantity: next, discountCrc: Math.min(line.discountCrc, line.unitPriceCrc * next) };
  });
}

export function setDiscount(cart: CartLine[], variantId: string, discountCrc: number): CartLine[] {
  return cart.map((line) => {
    if (line.variantId !== variantId) return line;
    const clean = Number.isFinite(discountCrc) && discountCrc > 0 ? discountCrc : 0;
    return { ...line, discountCrc: Math.min(clean, line.unitPriceCrc * line.quantity) };
  });
}

export const lineTotal = (line: CartLine) => line.unitPriceCrc * line.quantity - line.discountCrc;

export function cartTotals(cart: CartLine[]) {
  const subtotalCrc = cart.reduce((total, line) => total + line.unitPriceCrc * line.quantity, 0);
  const discountCrc = cart.reduce((total, line) => total + line.discountCrc, 0);
  return { units: cart.reduce((total, line) => total + line.quantity, 0), subtotalCrc, discountCrc, totalCrc: subtotalCrc - discountCrc };
}

export function checkoutBody(cart: CartLine[], paymentMethod: string, note = "") {
  return {
    paymentMethod,
    note,
    items: cart.map((line) => ({ variantId: line.variantId, quantity: line.quantity, unitPriceCrc: line.unitPriceCrc, discountCrc: line.discountCrc })),
  };
}

// A barcode scanner types the code fast and ends with Enter; a code is something without spaces that contains a digit.
export function looksLikeCode(input: string) {
  const value = input.trim();
  return /^[A-Za-z0-9._-]{4,40}$/.test(value) && /\d/.test(value);
}

// The camera keeps seeing the same barcode for many frames; accept it once per cooldown window.
export function shouldAcceptScan(last: { code: string; at: number } | null, code: string, now: number, cooldownMs = 1500) {
  if (!code) return false;
  if (!last) return true;
  return last.code !== code || now - last.at >= cooldownMs;
}

export const BARCODE_FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "code_39", "qr_code"] as const;
