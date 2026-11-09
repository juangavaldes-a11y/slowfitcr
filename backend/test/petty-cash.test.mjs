import assert from "node:assert/strict";
import test from "node:test";
import { createPettyCashHandlers, expenseBreakdown, monthRange, recurringDate, summarizePettyCash } from "../petty-cash.mjs";

const NOW = new Date("2026-11-09T15:00:00Z");

function fakePrisma() {
  const db = { entries: [], rules: [] };
  let sequence = 0;
  const matches = (row, where = {}) => Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("gte" in condition) return row[key] >= condition.gte && row[key] < condition.lt;
    }
    return row[key] === condition || (condition === null && row[key] == null);
  });
  const prisma = {
    pettyCashEntry: {
      findMany: async ({ where } = {}) => db.entries.filter((row) => matches(row, where)).sort((a, b) => b.date - a.date),
      findUnique: async ({ where }) => db.entries.find((row) => row.id === where.id) ?? null,
      create: async ({ data }) => { const row = { id: `e${++sequence}`, voidedAt: null, recurringId: null, recurringMonth: null, ...data }; db.entries.push(row); return row; },
      createMany: async ({ data }) => {
        let count = 0;
        for (const item of data) {
          if (db.entries.some((row) => row.recurringId && row.recurringId === item.recurringId && row.recurringMonth === item.recurringMonth)) continue;
          db.entries.push({ id: `e${++sequence}`, voidedAt: null, ...item });
          count += 1;
        }
        return { count };
      },
      update: async ({ where, data }) => Object.assign(db.entries.find((row) => row.id === where.id), data),
    },
    pettyCashRecurring: {
      findMany: async ({ where } = {}) => db.rules.filter((row) => matches(row, where)),
      findUnique: async ({ where }) => db.rules.find((row) => row.id === where.id) ?? null,
      create: async ({ data }) => { const row = { id: `r${++sequence}`, active: true, ...data }; db.rules.push(row); return row; },
      update: async ({ where, data }) => Object.assign(db.rules.find((row) => row.id === where.id), data),
    },
  };
  return { prisma, db };
}

const response = (body, status = 200) => ({ body, status });

function setup() {
  const { prisma, db } = fakePrisma();
  const state = { admin: true, body: {}, clock: NOW };
  const handlers = createPettyCashHandlers({
    prisma, jsonResponse: response, readJson: async () => state.body, isAdmin: async () => state.admin, appendAudit: async () => undefined, now: () => state.clock,
  });
  return { handlers, db, state };
}
const listRequest = (month = "") => ({ url: `http://x/api/admin/petty-cash${month ? `?month=${month}` : ""}` });

test("monthRange and recurringDate handle month lengths", () => {
  assert.equal(monthRange("2026-12").to.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(recurringDate("2026-02", 31).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(recurringDate("2026-11", 5).toISOString().slice(0, 10), "2026-11-05");
});

test("summary subtracts expenses from funds and ignores voided rows", () => {
  const rows = [
    { type: "FUND", amountCrc: 50000, category: "OTHER" },
    { type: "EXPENSE", amountCrc: 12000.5, category: "FIXED_SERVICE" },
    { type: "EXPENSE", amountCrc: 3000, category: "UNEXPECTED" },
    { type: "EXPENSE", amountCrc: 9999, category: "UNEXPECTED", voidedAt: NOW },
  ];
  assert.deepEqual(summarizePettyCash(rows), { expenses: 15000.5, funds: 50000, balance: 34999.5, byCategory: { FIXED_SERVICE: 12000.5, UNEXPECTED: 3000 } });
});

test("expenseBreakdown groups by month and category and by day", () => {
  const result = expenseBreakdown([
    { type: "EXPENSE", amountCrc: 100, category: "UNEXPECTED", date: new Date("2026-10-30T10:00:00Z") },
    { type: "EXPENSE", amountCrc: 50, category: "UNEXPECTED", date: new Date("2026-11-02T10:00:00Z") },
    { type: "EXPENSE", amountCrc: 25, category: "TECH_SERVICE", date: new Date("2026-11-02T11:00:00Z") },
    { type: "FUND", amountCrc: 999, category: "OTHER", date: new Date("2026-11-02T11:00:00Z") },
    { type: "EXPENSE", amountCrc: 7, category: "OTHER", date: new Date("2026-11-03T11:00:00Z"), voidedAt: NOW },
  ]);
  assert.deepEqual(result.byMonthCategory, [
    { month: "2026-10", category: "UNEXPECTED", amountCrc: 100 },
    { month: "2026-11", category: "TECH_SERVICE", amountCrc: 25 },
    { month: "2026-11", category: "UNEXPECTED", amountCrc: 50 },
  ]);
  assert.deepEqual(result.byDay, { "2026-10-30": 100, "2026-11-02": 75 });
});

test("entries are validated, listed by month and can be voided once", async () => {
  const { handlers, state } = setup();
  state.body = { amountCrc: 5000, category: "TECH_SERVICE", description: "Reparacion impresora" };
  const created = await handlers.createPettyCashEntry({});
  assert.equal(created.status, 201);
  assert.equal(created.body.monthSummary.expenses, 5000);
  assert.equal(created.body.cashBalance, -5000);

  state.body = { type: "FUND", amountCrc: 20000 };
  assert.equal((await handlers.createPettyCashEntry({})).body.cashBalance, 15000);

  for (const bad of [{ amountCrc: 0, category: "OTHER", description: "x" }, { amountCrc: 5, category: "NOPE", description: "x" }, { amountCrc: 5, category: "OTHER", description: "" }, { type: "X", amountCrc: 5 }, { amountCrc: 5, category: "OTHER", description: "x", date: "no" }]) {
    state.body = bad;
    assert.equal((await handlers.createPettyCashEntry({})).status, 400);
  }

  const listed = await handlers.listPettyCash(listRequest("2026-11"));
  assert.equal(listed.body.entries.length, 2);
  assert.equal((await handlers.listPettyCash(listRequest("2026-10"))).body.entries.length, 0);
  const [{ id }] = listed.body.entries.filter((entry) => entry.type === "EXPENSE");
  assert.equal((await handlers.voidPettyCashEntry({}, id)).body.cashBalance, 20000);
  assert.equal((await handlers.voidPettyCashEntry({}, id)).status, 400);
  assert.equal((await handlers.voidPettyCashEntry({}, "missing")).status, 404);
});

test("recurring charges are generated once per month and only after their day", async () => {
  const { handlers, db, state } = setup();
  state.body = { amountCrc: 30000, category: "FIXED_SERVICE", description: "Internet", dayOfMonth: 5 };
  assert.equal((await handlers.createRecurring({})).status, 201);
  assert.equal(db.entries.length, 1);
  assert.equal((await handlers.generateRecurring()), 0);

  state.body = { amountCrc: 8000, category: "FIXED_SERVICE", description: "Software", dayOfMonth: 20 };
  await handlers.createRecurring({});
  assert.equal(db.entries.length, 1);
  state.clock = new Date("2026-11-21T10:00:00Z");
  assert.equal(await handlers.generateRecurring(), 1);
  assert.equal(await handlers.generateRecurring(), 0);
  state.clock = new Date("2026-12-06T10:00:00Z");
  assert.equal(await handlers.generateRecurring(), 1);
  assert.equal(db.entries.length, 3);

  // Pausing stops future entries.
  const ruleId = db.rules[0].id;
  state.body = { active: false };
  assert.equal((await handlers.updateRecurring({}, ruleId)).status, 200);
  assert.equal(db.rules[0].active, false);
  state.clock = new Date("2027-01-06T10:00:00Z");
  assert.equal(await handlers.generateRecurring(), 0);
  state.body = { amountCrc: 1, category: "OTHER", description: "x", dayOfMonth: 40 };
  assert.equal((await handlers.updateRecurring({}, ruleId)).status, 400);
  assert.equal((await handlers.updateRecurring({}, "missing")).status, 404);
});

test("petty cash requires an administrator", async () => {
  const { handlers, state } = setup();
  state.admin = false;
  assert.equal((await handlers.listPettyCash(listRequest())).status, 401);
  assert.equal((await handlers.createPettyCashEntry({})).status, 401);
});
