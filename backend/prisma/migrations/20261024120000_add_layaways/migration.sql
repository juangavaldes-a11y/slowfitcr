-- CreateEnum
CREATE TYPE "LayawayStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'RELEASED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateTable
CREATE TABLE "Layaway" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "unitPriceCrc" DECIMAL(14,2) NOT NULL,
    "depositCrc" DECIMAL(14,2) NOT NULL,
    "status" "LayawayStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "source" TEXT NOT NULL,
    "paymentReference" TEXT,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "holdExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "warnedAt" TIMESTAMP(3),
    "expiredNotifiedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "customerId" TEXT,
    "kind" TEXT NOT NULL,
    "layawayId" TEXT,
    "params" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Layaway_paymentReference_key" ON "Layaway"("paymentReference");

-- CreateIndex
CREATE INDEX "Layaway_status_expiresAt_idx" ON "Layaway"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Layaway_lineId_status_idx" ON "Layaway"("lineId", "status");

-- CreateIndex
CREATE INDEX "Layaway_customerId_createdAt_idx" ON "Layaway"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_layawayId_kind_audience_key" ON "Notification"("layawayId", "kind", "audience");

-- CreateIndex
CREATE INDEX "Notification_audience_customerId_readAt_createdAt_idx" ON "Notification"("audience", "customerId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Layaway" ADD CONSTRAINT "Layaway_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "InventoryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layaway" ADD CONSTRAINT "Layaway_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "Layaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
