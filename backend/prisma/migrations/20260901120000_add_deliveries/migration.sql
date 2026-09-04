-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUOTED', 'PAYMENT_PENDING', 'READY_TO_DISPATCH', 'DISPATCHING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentReference" TEXT,
    "provider" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUOTED',
    "externalQuoteId" TEXT NOT NULL,
    "externalDeliveryId" TEXT,
    "feeMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "pickup" JSONB NOT NULL,
    "dropoff" JSONB NOT NULL,
    "contact" JSONB NOT NULL,
    "manifest" JSONB NOT NULL,
    "dropoffEta" TIMESTAMP(3),
    "trackingUrl" TEXT,
    "rawQuote" JSONB,
    "rawDelivery" JSONB,
    "errorMessage" TEXT,
    "approvedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_paymentReference_key" ON "Delivery"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_externalDeliveryId_key" ON "Delivery"("externalDeliveryId");

-- CreateIndex
CREATE INDEX "Delivery_status_createdAt_idx" ON "Delivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_provider_createdAt_idx" ON "Delivery"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;