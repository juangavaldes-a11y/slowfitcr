export type PosReceiptItem = {
  sku?: string | null;
  name: string;
  color: string;
  size: string;
  quantity: number;
  unitPriceCrc: number;
  discountCrc: number;
  lineTotalCrc: number;
};

export type PosReceipt = {
  receipt: string;
  soldAt: string;
  paymentMethod: string;
  items: PosReceiptItem[];
  totalCrc: number;
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);

const crc = (value: number, locale: "es" | "en") =>
  new Intl.NumberFormat(locale === "es" ? "es-CR" : "en-US", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(value);

// Printable 80mm receipt. Every dynamic value is escaped because product names come from the catalog.
export function receiptHtml(receipt: PosReceipt, locale: "es" | "en") {
  const es = locale === "es";
  const rows = receipt.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}<br><small>${escapeHtml(item.color)} · ${escapeHtml(item.size)}${item.sku ? ` · ${escapeHtml(item.sku)}` : ""}</small></td>
      <td class="n">${item.quantity} × ${crc(item.unitPriceCrc, locale)}${item.discountCrc ? `<br><small>-${crc(item.discountCrc, locale)}</small>` : ""}</td>
      <td class="n">${crc(item.lineTotalCrc, locale)}</td>
    </tr>`).join("");
  const date = new Date(receipt.soldAt).toLocaleString(es ? "es-CR" : "en-US");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(receipt.receipt)}</title>
<style>
  body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:8px;font-size:12px;color:#000}
  h1{font-size:16px;text-align:center;margin:4px 0}
  p{margin:2px 0;text-align:center}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  td{padding:3px 0;vertical-align:top;border-bottom:1px dashed #999}
  .n{text-align:right;white-space:nowrap}
  .total{font-size:15px;font-weight:bold;text-align:right;margin-top:8px}
  small{color:#444}
</style></head><body>
  <h1>Slow Fit CR</h1>
  <p>${escapeHtml(receipt.receipt)}</p>
  <p>${escapeHtml(date)}</p>
  <table>${rows}</table>
  <p class="total">${es ? "Total" : "Total"}: ${crc(receipt.totalCrc, locale)}</p>
  <p>${es ? "Pago" : "Payment"}: ${escapeHtml(receipt.paymentMethod)}</p>
  <p>${es ? "¡Gracias por tu compra!" : "Thank you for your purchase!"}</p>
</body></html>`;
}
