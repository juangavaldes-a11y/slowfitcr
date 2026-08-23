ALTER TABLE "ProductVariant"
ADD COLUMN "size" TEXT,
ADD COLUMN "color" TEXT,
ADD COLUMN "colorHex" TEXT;

UPDATE "ProductVariant"
SET "size" = "title"
WHERE "size" IS NULL;