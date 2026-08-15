CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "WebhookStatus" AS ENUM ('PROCESSED', 'FAILED');

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "email" TEXT,
    "content" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" TEXT,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderWebhookEvent" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PROCESSED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "replayedAt" TIMESTAMP(3),
    CONSTRAINT "OrderWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Review_productHandle_locale_status_idx" ON "Review"("productHandle", "locale", "status");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE UNIQUE INDEX "OrderWebhookEvent_idempotencyKey_key" ON "OrderWebhookEvent"("idempotencyKey");
CREATE INDEX "OrderWebhookEvent_createdAt_idx" ON "OrderWebhookEvent"("createdAt");
CREATE INDEX "OrderWebhookEvent_topic_idx" ON "OrderWebhookEvent"("topic");
CREATE INDEX "OrderWebhookEvent_status_idx" ON "OrderWebhookEvent"("status");
