-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invoiceDate" DATE,
    "hkShippingUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceAdjustmentUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customizationPerPieceUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "logoPrintingUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sizePrintingUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packagingUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "crShippingUsd" DECIMAL(14,2),
    "nationalizationCrc" DECIMAL(14,2),
    "otherImportCrc" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryLine" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryLine_batchId_idx" ON "InventoryLine"("batchId");

-- AddForeignKey
ALTER TABLE "InventoryLine" ADD CONSTRAINT "InventoryLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The existing inventory was one purchase whose costs lived in the global settings: move them into its own batch.
INSERT INTO "InventoryBatch" ("id", "name", "hkShippingUsd", "invoiceAdjustmentUsd", "customizationPerPieceUsd", "crShippingUsd", "nationalizationCrc", "otherImportCrc", "updatedAt")
SELECT gen_random_uuid()::text, 'Sammy 2026-09-18',
       COALESCE(s."hkShippingUsd", 0), COALESCE(s."invoiceAdjustmentUsd", 0), COALESCE(s."customizationPerPieceUsd", 0),
       s."crShippingUsd", s."nationalizationCrc", s."otherImportCrc", CURRENT_TIMESTAMP
FROM (SELECT 1) AS one
LEFT JOIN "InventorySettings" s ON s."id" = 'default'
WHERE EXISTS (SELECT 1 FROM "InventoryLine");

UPDATE "InventoryLine" SET "batchId" = (SELECT "id" FROM "InventoryBatch" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "batchId" IS NULL AND EXISTS (SELECT 1 FROM "InventoryBatch");
