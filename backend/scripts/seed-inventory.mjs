import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const seed = JSON.parse(await readFile(new URL("../data/costeo-seed.json", import.meta.url), "utf8"));
const apply = process.argv.includes("--apply");

console.log(JSON.stringify({ lines: seed.lines.length, mode: apply ? "apply" : "dry-run" }));
if (apply) {
  await prisma.inventorySettings.upsert({ where: { id: "default" }, create: { id: "default", ...seed.settings }, update: {} });
  for (const line of seed.lines) {
    await prisma.inventoryLine.upsert({
      where: { code_color: { code: line.code, color: line.color } },
      create: line,
      update: {},
    });
  }
  await prisma.auditLog.create({ data: { action: "inventory.seeded", actor: "seed-inventory", details: { lines: seed.lines.length } } });
  console.log("Seeded inventory lines (existing rows untouched).");
}
await prisma.$disconnect();
