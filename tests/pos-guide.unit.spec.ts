import { expect, test } from "@playwright/test";
import { crProvinces } from "../app/lib/cr-locations";
import { buildGuideRequest, code128Svg, guideLabelHtml, type GuideForm, type PosGuide } from "../app/lib/pos-guide";

const province = crProvinces[0];
const canton = province.cantons[0];
const district = canton.districts[0];
const form: GuideForm = {
  name: "Ana Mora", phone: "8888 1234", provinceCode: province.code, cantonCode: canton.code, districtCode: district.code,
  address: "200 m norte de la iglesia", weightKg: 0.8, pieces: 1, contents: "Ropa deportiva", declaredValueCrc: 19950,
};

test("buildGuideRequest maps location codes to names and uses the district code as postal code", () => {
  const body = buildGuideRequest(form, "POS-20261120-ABC123");
  expect(body.reference).toBe("POS-20261120-ABC123");
  expect(body.recipient.state).toBe(province.name);
  expect(body.recipient.city).toBe(canton.name);
  expect(body.recipient.district).toBe(district.name);
  expect(body.recipient.postalCode).toBe(district.code);
  expect(body.recipient.streetAddress).toBe("200 m norte de la iglesia");
  expect(body.weightKg).toBe(0.8);
});

test("buildGuideRequest rejects a district outside the chosen canton", () => {
  expect(() => buildGuideRequest({ ...form, districtCode: "99999" }, "R")).toThrow("INVALID_LOCATION");
  expect(() => buildGuideRequest({ ...form, provinceCode: "" }, "R")).toThrow("INVALID_LOCATION");
});

test("code128Svg draws bars and refuses unsupported characters", () => {
  const svg = code128Svg("EE123456789CR");
  expect(svg).toMatch(/^<svg /);
  expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(20);
  expect(code128Svg("ñandú")).toBe("");
});

const guide: PosGuide = {
  id: "d1", reference: "POS-20261120-ABC123", status: "ACTIVE", trackingNumber: "EE123456789CR",
  recipient: { name: "Ana <script>", phone: "+50688881234" },
  address: { streetAddress: ["200 m norte"], city: "Escazú", district: "San Rafael", state: "San José", postalCode: "10201" },
  parcel: { weightKg: 0.8, pieces: 1, contents: "Ropa deportiva", declaredValueCrc: 19950 },
  errorMessage: null,
};

test("guide label prints the tracking number as barcode and escapes recipient text", () => {
  const html = guideLabelHtml(guide, "es");
  expect(html).toContain("EE123456789CR");
  expect(html).toContain("<svg");
  expect(html).not.toContain("<script>");
  expect(html).toContain("Ana &lt;script&gt;");
  expect(html).toMatch(/Referencia: POS-20261120-ABC123/);
});

test("guide label falls back to the receipt reference before there is a tracking number", () => {
  const html = guideLabelHtml({ ...guide, trackingNumber: null }, "en");
  expect(html).toContain("POS-20261120-ABC123");
  expect(html).not.toContain("Reference:");
  expect(html).toMatch(/Recipient/);
});
