CREATE TABLE "LoyverseStockLedger" (
    "key" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyverseStockLedger_pkey" PRIMARY KEY ("key")
);
