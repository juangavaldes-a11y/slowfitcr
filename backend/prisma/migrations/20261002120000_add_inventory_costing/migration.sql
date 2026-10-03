CREATE TABLE "InventorySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hkShippingUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceAdjustmentUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fxRate" DECIMAL(12,4),
    "crShippingUsd" DECIMAL(14,2),
    "nationalizationCrc" DECIMAL(14,2),
    "otherImportCrc" DECIMAL(14,2),
    "extraUnitCrc" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cardCommissionRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "customizationPerPieceUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventorySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryLine" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "productHandle" TEXT,
    "sizes" JSONB NOT NULL,
    "piecesPerGarment" INTEGER NOT NULL DEFAULT 1,
    "unitPriceUsd" DECIMAL(12,2) NOT NULL,
    "salePriceCrc" DECIMAL(14,2),
    "supplierEquivalence" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySale" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCrc" DECIMAL(14,2) NOT NULL,
    "discountCrc" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "orderId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExchangeRate" (
    "date" DATE NOT NULL,
    "buyRate" DECIMAL(12,4) NOT NULL,
    "sellRate" DECIMAL(12,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BCCR',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("date")
);

CREATE UNIQUE INDEX "InventoryLine_code_color_key" ON "InventoryLine"("code", "color");
CREATE INDEX "InventoryLine_productHandle_idx" ON "InventoryLine"("productHandle");
CREATE INDEX "InventorySale_soldAt_idx" ON "InventorySale"("soldAt");
CREATE INDEX "InventorySale_lineId_voidedAt_idx" ON "InventorySale"("lineId", "voidedAt");
CREATE INDEX "InventorySale_paymentMethod_idx" ON "InventorySale"("paymentMethod");
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");

ALTER TABLE "InventorySale" ADD CONSTRAINT "InventorySale_lineId_fkey"
FOREIGN KEY ("lineId") REFERENCES "InventoryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PaymentMethod" ("id", "name", "position") VALUES
  (gen_random_uuid()::text, 'Cash', 0),
  (gen_random_uuid()::text, 'SINPE Movil', 1),
  (gen_random_uuid()::text, 'Card', 2),
  (gen_random_uuid()::text, 'Bank transfer', 3),
  (gen_random_uuid()::text, 'Website checkout', 4),
  (gen_random_uuid()::text, 'Other', 5);
