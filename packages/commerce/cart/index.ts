export type CartLine = {
  productId: string;
  variantId: string;
  title: string;
  handle: string;
  image: string;
  price: number;
  currencyCode: string;
  preorder?: boolean;
  quantity: number;
};

export type PersistedCart = {
  lines: CartLine[];
  cartId?: string;
};

export function readPersistedCart(storageKey: string): PersistedCart {
  if (typeof window === "undefined") return { lines: [] };

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { lines: [] };
    const parsed = JSON.parse(raw) as CartLine[] | PersistedCart;
    return Array.isArray(parsed) ? { lines: parsed } : { lines: parsed.lines ?? [], cartId: parsed.cartId };
  } catch {
    return { lines: [] };
  }
}

export function mergeCartLines(remoteLines: CartLine[], localLines: CartLine[]) {
  const merged = new Map(remoteLines.map((line) => [line.variantId, line]));
  localLines.forEach((line) => merged.set(line.variantId, line));
  return Array.from(merged.values());
}

export function currencyFormatter(currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  });
}
