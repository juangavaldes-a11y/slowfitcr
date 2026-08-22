-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "preorderEnabled" BOOLEAN NOT NULL DEFAULT false;
