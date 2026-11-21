import { encodeCode128, isCode128Encodable } from "./barcode-labels/code128";
import { findCanton, findDistrict, findProvince } from "./cr-locations";
import { escapeHtml } from "./pos-receipt";

export type GuideForm = {
  name: string;
  phone: string;
  provinceCode: string;
  cantonCode: string;
  districtCode: string;
  address: string;
  weightKg: number;
  pieces: number;
  contents: string;
  declaredValueCrc: number;
  notes?: string;
};

export type PosGuide = {
  id: string;
  reference: string | null;
  status: string;
  trackingNumber: string | null;
  recipient: { name: string; phone: string };
  address: { streetAddress: string[]; city: string; district: string; state: string; postalCode: string };
  parcel: { weightKg: number; pieces: number; contents: string; declaredValueCrc: number };
  errorMessage: string | null;
  gatewayConfigured?: boolean;
};

// Turns the cashier's form into the API payload; the district code doubles as the postal code.
export function buildGuideRequest(form: GuideForm, reference: string) {
  const province = findProvince(form.provinceCode);
  const canton = findCanton(form.provinceCode, form.cantonCode);
  const district = findDistrict(form.provinceCode, form.cantonCode, form.districtCode);
  if (!province || !canton || !district) throw new Error("INVALID_LOCATION");
  return {
    reference,
    weightKg: form.weightKg,
    pieces: form.pieces,
    contents: form.contents,
    declaredValueCrc: form.declaredValueCrc,
    recipient: {
      name: form.name,
      phone: form.phone,
      streetAddress: form.address,
      city: canton.name,
      district: district.name,
      state: province.name,
      postalCode: district.code,
      notes: form.notes ?? "",
    },
  };
}

export function code128Svg(value: string, moduleWidth = 2, height = 64) {
  if (!isCode128Encodable(value)) return "";
  const widths = encodeCode128(value);
  let x = 0;
  const bars: string[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push(`<rect x="${x * moduleWidth}" y="0" width="${width * moduleWidth}" height="${height}"/>`);
    x += width;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x * moduleWidth}" height="${height}" viewBox="0 0 ${x * moduleWidth} ${height}" fill="#000">${bars.join("")}</svg>`;
}

// 10x15 cm shipping label. The barcode carries the Correos tracking number, or our receipt reference until it exists.
export function guideLabelHtml(guide: PosGuide, locale: "es" | "en") {
  const es = locale === "es";
  const code = guide.trackingNumber || guide.reference || "";
  const lines = [...guide.address.streetAddress, [guide.address.district, guide.address.city].filter(Boolean).join(", "), guide.address.state, guide.address.postalCode].filter(Boolean);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(code)}</title>
<style>
  @page{size:100mm 150mm;margin:6mm}
  body{font-family:Arial,sans-serif;width:88mm;margin:0 auto;color:#000}
  h1{font-size:15px;margin:0 0 6px}
  .box{border:2px solid #000;padding:8px;margin-bottom:8px}
  .big{font-size:18px;font-weight:bold}
  .bar{text-align:center;margin-top:10px}
  small{display:block;color:#333}
</style></head><body>
  <div class="box"><h1>${es ? "Correos de Costa Rica" : "Correos de Costa Rica"}</h1>
    <small>${es ? "Remitente" : "Sender"}</small><b>Slow Fit CR</b></div>
  <div class="box"><small>${es ? "Destinatario" : "Recipient"}</small>
    <div class="big">${escapeHtml(guide.recipient.name)}</div>
    <div>${escapeHtml(guide.recipient.phone)}</div>
    ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
  <div class="box"><small>${es ? "Paquete" : "Parcel"}</small>
    ${guide.parcel.pieces} × ${escapeHtml(guide.parcel.contents)} · ${guide.parcel.weightKg} kg
    ${guide.parcel.declaredValueCrc ? `<div>${es ? "Valor declarado" : "Declared value"}: ₡${new Intl.NumberFormat("es-CR").format(guide.parcel.declaredValueCrc)}</div>` : ""}</div>
  <div class="bar">${code128Svg(code)}<div>${escapeHtml(code)}</div>
    ${guide.reference && guide.trackingNumber ? `<small>${es ? "Referencia" : "Reference"}: ${escapeHtml(guide.reference)}</small>` : ""}</div>
</body></html>`;
}
