ALTER TABLE "Order" RENAME COLUMN "shopifyOrderId" TO "externalPaymentId";
ALTER TABLE "Order" RENAME COLUMN "shopifyCreatedAt" TO "paymentCreatedAt";
ALTER INDEX "Order_shopifyOrderId_key" RENAME TO "Order_externalPaymentId_key";

ALTER TABLE "OrderWebhookEvent" RENAME TO "PaymentWebhookEvent";
ALTER TABLE "PaymentWebhookEvent" RENAME COLUMN "shop" TO "provider";
ALTER INDEX "OrderWebhookEvent_pkey" RENAME TO "PaymentWebhookEvent_pkey";
ALTER INDEX "OrderWebhookEvent_idempotencyKey_key" RENAME TO "PaymentWebhookEvent_idempotencyKey_key";
ALTER INDEX "OrderWebhookEvent_createdAt_idx" RENAME TO "PaymentWebhookEvent_createdAt_idx";
ALTER INDEX "OrderWebhookEvent_topic_idx" RENAME TO "PaymentWebhookEvent_topic_idx";
ALTER INDEX "OrderWebhookEvent_status_idx" RENAME TO "PaymentWebhookEvent_status_idx";