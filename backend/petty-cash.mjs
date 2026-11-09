export const PETTY_CASH_CATEGORIES = ["FIXED_SERVICE", "UNEXPECTED", "TECH_SERVICE", "OTHER"];
export const PETTY_CASH_TYPES = ["EXPENSE", "FUND"];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const round = (value) => Math.round(value * 100) / 100;
export const monthKey = (date) => date.toISOString().slice(0, 7);

// First instant of a YYYY-MM month and of the next one (UTC).
export function monthRange(month) {
  const [year, number] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(year, number - 1, 1)), to: new Date(Date.UTC(year, number, 1)) };
}

// Day of the month clamped to the length of that month, so day 31 still fires in February.
export function recurringDate(month, dayOfMonth) {
  const { from, to } = monthRange(month);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), Math.min(Math.max(dayOfMonth, 1), days), 12));
}

const serializeEntry = (entry) => ({
  id: entry.id,
  date: entry.date,
  type: entry.type,
  amountCrc: Number(entry.amountCrc),
  category: entry.category,
  description: entry.description,
  recurringId: entry.recurringId ?? null,
  voidedAt: entry.voidedAt ?? null,
});

const serializeRecurring = (row) => ({
  id: row.id,
  amountCrc: Number(row.amountCrc),
  category: row.category,
  description: row.description,
  dayOfMonth: row.dayOfMonth,
  active: row.active,
});

// Pure summary used by the petty cash screen and by the analytics balance.
// Funds add to the cash, expenses take from it; voided rows are ignored.
export function summarizePettyCash(entries) {
  const byCategory = {};
  let expenses = 0;
  let funds = 0;
  for (const entry of entries) {
    if (entry.voidedAt) continue;
    const amount = Number(entry.amountCrc);
    if (entry.type === "FUND") {
      funds += amount;
    } else {
      expenses += amount;
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + amount;
    }
  }
  return {
    expenses: round(expenses),
    funds: round(funds),
    balance: round(funds - expenses),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, value]) => [key, round(value)])),
  };
}

// Expenses per month and category (for the analytics chart) plus the per-day total (for the payback projection).
export function expenseBreakdown(entries) {
  const byMonth = new Map();
  const byDay = new Map();
  for (const entry of entries) {
    if (entry.voidedAt || entry.type !== "EXPENSE") continue;
    const amount = Number(entry.amountCrc);
    const key = `${monthKey(entry.date)}|${entry.category}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + amount);
    const day = entry.date.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + amount);
  }
  return {
    byMonthCategory: [...byMonth.entries()]
      .map(([key, amount]) => ({ month: key.split("|")[0], category: key.split("|")[1], amountCrc: round(amount) }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.category.localeCompare(b.category)),
    byDay: Object.fromEntries([...byDay.entries()].map(([day, amount]) => [day, round(amount)])),
  };
}

const ERROR_STATUS = { NOT_FOUND: 404 };

export function createPettyCashHandlers({ prisma, jsonResponse, readJson, isAdmin, appendAudit, now = () => new Date() }) {
  const guard = (handler) => async (request, ...args) => {
    if (!(await isAdmin(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400);
      const message = error?.message ?? "";
      if (ERROR_STATUS[message]) return jsonResponse({ error: message }, ERROR_STATUS[message]);
      if (/^(INVALID|ALREADY)/.test(message)) return jsonResponse({ error: message }, 400);
      throw error;
    }
  };

  const parseMoney = (value) => {
    const amount = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error("INVALID_AMOUNT");
    return amount;
  };
  const parseCategory = (value) => {
    const category = String(value || "").trim();
    if (!PETTY_CASH_CATEGORIES.includes(category)) throw new Error("INVALID_CATEGORY");
    return category;
  };
  const parseText = (value) => String(value || "").trim().slice(0, 300);
  const requireText = (value) => {
    const text = parseText(value);
    if (!text) throw new Error("INVALID_DESCRIPTION");
    return text;
  };

  // Creates this month's entry for every active recurring charge whose day has arrived. The unique key
  // (recurringId, recurringMonth) makes it safe to run on every restart and on every screen load.
  const generateRecurring = async () => {
    const at = now();
    const month = monthKey(at);
    const rules = await prisma.pettyCashRecurring.findMany({ where: { active: true } });
    let created = 0;
    for (const rule of rules) {
      const date = recurringDate(month, rule.dayOfMonth);
      if (date > at) continue;
      const result = await prisma.pettyCashEntry.createMany({
        data: [{ date, type: "EXPENSE", amountCrc: rule.amountCrc, category: rule.category, description: rule.description, recurringId: rule.id, recurringMonth: month }],
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  };

  const loadMonth = async (month) => {
    const { from, to } = monthRange(month);
    // The running balance spans every month, the listing only the selected one.
    const [all, entries, recurring] = await Promise.all([
      prisma.pettyCashEntry.findMany({ where: { voidedAt: null } }),
      prisma.pettyCashEntry.findMany({ where: { date: { gte: from, lt: to } }, orderBy: { date: "desc" }, take: 500 }),
      prisma.pettyCashRecurring.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    return {
      month,
      entries: entries.map(serializeEntry),
      monthSummary: summarizePettyCash(entries),
      cashBalance: summarizePettyCash(all).balance,
      recurring: recurring.map(serializeRecurring),
      categories: PETTY_CASH_CATEGORIES,
    };
  };

  const list = guard(async (request) => {
    const requested = new URL(request.url).searchParams.get("month");
    const month = requested && MONTH_PATTERN.test(requested) ? requested : monthKey(now());
    await generateRecurring();
    return jsonResponse(await loadMonth(month));
  });

  const create = guard(async (request) => {
    const body = await readJson(request);
    const type = String(body.type || "EXPENSE");
    if (!PETTY_CASH_TYPES.includes(type)) throw new Error("INVALID_TYPE");
    const date = body.date ? new Date(body.date) : now();
    if (Number.isNaN(date.getTime())) throw new Error("INVALID_DATE");
    const data = {
      date,
      type,
      amountCrc: parseMoney(body.amountCrc),
      category: type === "FUND" ? "OTHER" : parseCategory(body.category),
      description: type === "FUND" ? parseText(body.description) : requireText(body.description),
    };
    const entry = await prisma.pettyCashEntry.create({ data });
    await appendAudit("petty_cash.created", { entryId: entry.id, type, amountCrc: data.amountCrc, category: data.category }, "admin");
    return jsonResponse(await loadMonth(monthKey(date)), 201);
  });

  const voidEntry = guard(async (request, entryId) => {
    const entry = await prisma.pettyCashEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new Error("NOT_FOUND");
    if (entry.voidedAt) throw new Error("ALREADY_VOIDED");
    await prisma.pettyCashEntry.update({ where: { id: entryId }, data: { voidedAt: now() } });
    await appendAudit("petty_cash.voided", { entryId }, "admin");
    return jsonResponse(await loadMonth(monthKey(entry.date)));
  });

  const parseRecurring = (body) => {
    const dayOfMonth = Math.trunc(Number(body.dayOfMonth ?? 1));
    if (!(dayOfMonth >= 1 && dayOfMonth <= 31)) throw new Error("INVALID_DAY");
    return { amountCrc: parseMoney(body.amountCrc), category: parseCategory(body.category), description: requireText(body.description), dayOfMonth };
  };

  const createRecurring = guard(async (request) => {
    const rule = await prisma.pettyCashRecurring.create({ data: parseRecurring(await readJson(request)) });
    await appendAudit("petty_cash.recurring_created", { recurringId: rule.id }, "admin");
    await generateRecurring();
    return jsonResponse(await loadMonth(monthKey(now())), 201);
  });

  const updateRecurring = guard(async (request, recurringId) => {
    const body = await readJson(request);
    if (!(await prisma.pettyCashRecurring.findUnique({ where: { id: recurringId } }))) throw new Error("NOT_FOUND");
    // Pausing or resuming only needs the flag; editing needs the full rule.
    const toggleOnly = Object.keys(body).length === 1 && typeof body.active === "boolean";
    const data = toggleOnly ? { active: body.active } : { ...parseRecurring(body), ...(typeof body.active === "boolean" ? { active: body.active } : {}) };
    await prisma.pettyCashRecurring.update({ where: { id: recurringId }, data });
    await appendAudit("petty_cash.recurring_updated", { recurringId, fields: Object.keys(data) }, "admin");
    await generateRecurring();
    return jsonResponse(await loadMonth(monthKey(now())));
  });

  return { generateRecurring, listPettyCash: list, createPettyCashEntry: create, voidPettyCashEntry: voidEntry, createRecurring, updateRecurring };
}
