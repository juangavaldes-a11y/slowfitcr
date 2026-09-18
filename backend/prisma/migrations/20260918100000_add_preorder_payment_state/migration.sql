-- CreateEnum
CREATE TYPE "PreorderStatus" AS ENUM ('DEPOSIT_PAID', 'STOCK_AVAILABLE', 'FINAL_PAYMENT_PENDING', 'COMPLETE');

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "finalPaymentReference" TEXT,
ADD COLUMN "preorderStatus" "PreorderStatus",
ADD COLUMN "depositPaidAmount" TEXT,
ADD COLUMN "totalOrderAmount" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_finalPaymentReference_key" ON "Order"("finalPaymentReference");