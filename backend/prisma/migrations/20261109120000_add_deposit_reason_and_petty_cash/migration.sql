-- AlterTable
ALTER TABLE "Layaway" ADD COLUMN "suggestedDepositCrc" DECIMAL(14,2),
ADD COLUMN "lowDepositReason" TEXT,
ADD COLUMN "lowDepositNote" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PettyCashEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "amountCrc" DECIMAL(14,2) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "recurringId" TEXT,
    "recurringMonth" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashRecurring" (
    "id" TEXT NOT NULL,
    "amountCrc" DECIMAL(14,2) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashRecurring_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashEntry_recurringId_recurringMonth_key" ON "PettyCashEntry"("recurringId", "recurringMonth");

-- CreateIndex
CREATE INDEX "PettyCashEntry_date_idx" ON "PettyCashEntry"("date");

-- AddForeignKey
ALTER TABLE "PettyCashEntry" ADD CONSTRAINT "PettyCashEntry_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "PettyCashRecurring"("id") ON DELETE SET NULL ON UPDATE CASCADE;
