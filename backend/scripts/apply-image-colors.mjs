import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const colorsUrl = new URL("../data/catalog-image-colors.json", import.meta.url);

// Sets ProductImage.color from data/catalog-image-colors.json ({ handle: { imageUrl: color } }); safe to re-run.
async function main() {
  const byHandle = JSON.parse(await readFile(colorsUrl, "utf8"));
  let updated = 0;
  let missing = 0;
  for (const [handle, images] of Object.entries(byHandle)) {
    for (const [url, color] of Object.entries(images)) {
      const { count } = await prisma.productImage.updateMany({ where: { url, product: { handle } }, data: { color } });
      if (count) updated += count;
      else missing += 1;
    }
  }
  console.log(`Colored ${updated} images; ${missing} entries matched no image (product or image not imported).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
