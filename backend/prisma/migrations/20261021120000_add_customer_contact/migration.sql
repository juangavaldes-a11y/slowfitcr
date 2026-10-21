CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "firstOrderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOrderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerContact_email_key" ON "CustomerContact"("email");

CREATE INDEX "CustomerContact_lastOrderAt_idx" ON "CustomerContact"("lastOrderAt");
