import assert from "node:assert/strict";
import test from "node:test";
import { parseInvoiceItems } from "../../app/lib/inventory-pdf.ts";

// Builds the text items of one invoice page: header cells plus rows, every text centered in its column like the real PDFs.
function invoicePage({ columns, rows, extraHeaders = [] }) {
  const item = (str, center, y) => {
    const width = str.length * 5;
    return { str, x: center - width / 2, y, width };
  };
  const items = [
    item("No:", columns.number, 600), item("Pictures", columns.pictures, 600), item("Product Code", columns.code, 600),
    item("Color/Qty/Size", columns.color, 600), item("Qty", columns.qty, 600), item("Unit Price", columns.price, 600), item("Sub_total", columns.total, 600),
    ...extraHeaders.map(([text, center]) => item(text, center, 600)),
  ];
  let top = 560;
  rows.forEach((row, index) => {
    const middle = top - 40;
    items.push(item(String(index + 1), columns.number, middle));
    row.code.forEach((text, line) => items.push(item(text, columns.code, middle + 15 - line * 10)));
    row.colors.forEach((text, line) => items.push(item(text, columns.color, middle + 25 - line * 14)));
    items.push(item(String(row.qty), columns.qty, middle), item(row.price, columns.price, middle), item(row.total ?? "US$0.00", columns.total, middle));
    top -= 110;
  });
  return items;
}

const SHIFTED = { number: 44, pictures: 120, code: 190, color: 310, qty: 403, price: 455, total: 520 };
const WIDE = { number: 44, pictures: 112, code: 190, color: 350, qty: 430, price: 490, total: 540 };

const rows = [
  { code: ["FGBTZ8455 -", "3/4 Length sleeves", "2 logos"], colors: ["Cherry S-1 M-1 L-1 -3", "Grape M-1", "(M-L-XL)"], qty: 4, price: "US$20.20" },
  { code: ["FGBAG004 -", "Shorts - Free size"], colors: ["Black -40"], qty: 40, price: "US$5.30" },
  { code: ["FGBYEL-12131", "1 logo", "no wash label"], colors: ["Blue", "S-1 M-1 L-1 -3"], qty: 3, price: "US$7.00" },
];

const sizesOf = (line) => Object.fromEntries(Object.entries(line.sizes).filter(([, quantity]) => quantity));

test("each column is found from its header, whatever the layout", () => {
  for (const columns of [SHIFTED, WIDE]) {
    const lines = parseInvoiceItems([invoicePage({ columns, rows })]);
    assert.deepEqual(lines.map((line) => [line.code, line.color, sizesOf(line), line.unitPriceUsd]), [
      ["FGBTZ8455", "Cherry", { S: 1, M: 1, L: 1 }, 20.2],
      ["FGBTZ8455", "Grape", { M: 1 }, 20.2],
      ["FGBAG004", "Black", { OS: 40 }, 5.3],
      ["FGBYEL-12131", "Blue", { S: 1, M: 1, L: 1 }, 7],
    ]);
  }
});

test("production notes are dropped from the name and a missing description falls back to the code", () => {
  const lines = parseInvoiceItems([invoicePage({ columns: SHIFTED, rows })]);
  assert.equal(lines[0].productName, "3/4 Length sleeves");
  assert.equal(lines[2].productName, "Shorts - Free size");
  assert.equal(lines[3].productName, "FGBYEL-12131");
});

test("an extra header column such as Logo Design does not leak into the product name", () => {
  const page = invoicePage({ columns: WIDE, rows: rows.slice(0, 1), extraHeaders: [["Logo Design", 262]] });
  page.push({ str: "Logo A", x: 250, y: 535, width: 30 });
  const [first] = parseInvoiceItems([page]);
  assert.equal(first.productName, "3/4 Length sleeves");
});

test("one code reused by two garments gets a suffix so code and color stay unique", () => {
  const twice = [
    { code: ["FGB2455 -", "Jackets"], colors: ["Black", "S-1 M-1 -2"], qty: 2, price: "US$15.00" },
    { code: ["FGB2455 -", "Pants - Pockets"], colors: ["Black", "S-1 M-1 -2"], qty: 2, price: "US$15.30" },
  ];
  const lines = parseInvoiceItems([invoicePage({ columns: SHIFTED, rows: twice })]);
  assert.deepEqual(lines.map((line) => line.code), ["FGB2455-JACKETS", "FGB2455-PANTS"]);
});

test("a row whose quantity does not match its sizes is rejected", () => {
  const wrong = [{ code: ["FGBTZ8455 -", "Tops"], colors: ["Cherry S-1 M-1 L-1 -3"], qty: 9, price: "US$20.20" }];
  assert.throws(() => parseInvoiceItems([invoicePage({ columns: SHIFTED, rows: wrong })]), /PDF_QTY_MISMATCH:FGBTZ8455/);
});

test("without a recognizable header the fixed legacy positions are used", () => {
  const items = [
    { str: "1", x: 37, y: 500 }, { str: "FGBTZ8455 -", x: 156, y: 505 }, { str: "Tops", x: 170, y: 495 },
    { str: "Cherry", x: 340, y: 510 }, { str: "S-1 M-1 -2", x: 340, y: 496 }, { str: "2", x: 427, y: 500 }, { str: "US$9.80", x: 462, y: 500 },
  ];
  const [line] = parseInvoiceItems([items]);
  assert.deepEqual([line.code, line.color, sizesOf(line), line.unitPriceUsd], ["FGBTZ8455", "Cherry", { S: 1, M: 1 }, 9.8]);
});
