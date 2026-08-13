-- CreateTable
CREATE TABLE "sku" (
    "id" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "inventoryUnit" TEXT NOT NULL,
    "referencePriceFen" INTEGER NOT NULL,
    "warningThreshold" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sku_reference_price_nonnegative" CHECK ("referencePriceFen" >= 0),
    CONSTRAINT "sku_warning_threshold_nonnegative" CHECK ("warningThreshold" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "sku_skuCode_key" ON "sku"("skuCode");

-- CreateIndex
CREATE INDEX "sku_name_idx" ON "sku"("name");

-- CreateIndex
CREATE INDEX "sku_category_idx" ON "sku"("category");

-- CreateIndex
CREATE INDEX "sku_enabled_idx" ON "sku"("enabled");
