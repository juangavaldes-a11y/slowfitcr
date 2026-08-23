ALTER TABLE "Product"
ADD COLUMN "minPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "inventoryTotal" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product" AS product
SET
  "minPrice" = COALESCE(summary."minPrice", 0),
  "inventoryTotal" = COALESCE(summary."inventoryTotal", 0)
FROM (
  SELECT
    "productId",
    MIN("price") AS "minPrice",
    SUM("inventoryQuantity")::INTEGER AS "inventoryTotal"
  FROM "ProductVariant"
  GROUP BY "productId"
) AS summary
WHERE product."id" = summary."productId";

CREATE INDEX "Product_title_idx" ON "Product"("title");
CREATE INDEX "Product_minPrice_idx" ON "Product"("minPrice");
CREATE INDEX "Product_inventoryTotal_idx" ON "Product"("inventoryTotal");
CREATE INDEX "Product_tags_idx" ON "Product" USING GIN ("tags");

CREATE TABLE "ProductMetric" (
  "productId" TEXT NOT NULL,
  "searchImpressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "unitsSold" INTEGER NOT NULL DEFAULT 0,
  "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductMetric_pkey" PRIMARY KEY ("productId")
);

CREATE INDEX "ProductMetric_searchImpressions_idx" ON "ProductMetric"("searchImpressions");
CREATE INDEX "ProductMetric_clicks_idx" ON "ProductMetric"("clicks");
CREATE INDEX "ProductMetric_unitsSold_idx" ON "ProductMetric"("unitsSold");

ALTER TABLE "ProductMetric"
ADD CONSTRAINT "ProductMetric_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProductMetric" ("productId", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP FROM "Product";

WITH sales AS (
  SELECT
    variant."productId",
    SUM((item.value->>'quantity')::INTEGER)::INTEGER AS "unitsSold",
    SUM(COALESCE(NULLIF(item.value->>'unitPrice', '')::DECIMAL, variant."price")
      * (item.value->>'quantity')::INTEGER) AS "revenue"
  FROM "Order" AS customer_order
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(customer_order."items") = 'array' THEN customer_order."items" ELSE '[]'::jsonb END
  ) AS item(value)
  INNER JOIN "ProductVariant" AS variant ON variant."id" = item.value->>'variantId'
  WHERE customer_order."inventoryAdjustedAt" IS NOT NULL
    AND (item.value->>'quantity') ~ '^[1-9][0-9]*$'
  GROUP BY variant."productId"
)
UPDATE "ProductMetric" AS metric
SET
  "unitsSold" = sales."unitsSold",
  "revenue" = sales."revenue",
  "updatedAt" = CURRENT_TIMESTAMP
FROM sales
WHERE metric."productId" = sales."productId";