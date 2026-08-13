CREATE TYPE "SalesOrderStatus" AS ENUM (
    'DRAFT',
    'CONFIRMED',
    'OUTBOUND',
    'CANCELLED'
);

CREATE SEQUENCE "sales_order_number_seq";

CREATE TABLE "sales_order" (
    "id" TEXT NOT NULL,
    "salesOrderNumber" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "customerCodeSnapshot" TEXT NOT NULL,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerContactNameSnapshot" TEXT NOT NULL,
    "customerPhoneSnapshot" TEXT NOT NULL,
    "customerAddressSnapshot" TEXT NOT NULL,
    "responsibleSalesIdSnapshot" TEXT NOT NULL,
    "responsibleSalesNameSnapshot" TEXT NOT NULL,
    "paymentTermDaysSnapshot" INTEGER NOT NULL,
    "totalAmountFen" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_order_payment_term_nonnegative" CHECK ("paymentTermDaysSnapshot" >= 0),
    CONSTRAINT "sales_order_total_nonnegative" CHECK ("totalAmountFen" >= 0)
);

CREATE TABLE "sales_order_item" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "skuCodeSnapshot" TEXT NOT NULL,
    "skuNameSnapshot" TEXT NOT NULL,
    "inventoryUnitSnapshot" TEXT NOT NULL,
    "referencePriceFenSnapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "transactionPriceFen" INTEGER NOT NULL,
    "subtotalFen" INTEGER NOT NULL,

    CONSTRAINT "sales_order_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_order_item_position_nonnegative" CHECK ("position" >= 0),
    CONSTRAINT "sales_order_item_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "sales_order_item_reference_price_nonnegative" CHECK ("referencePriceFenSnapshot" >= 0),
    CONSTRAINT "sales_order_item_transaction_price_nonnegative" CHECK ("transactionPriceFen" >= 0),
    CONSTRAINT "sales_order_item_subtotal_nonnegative" CHECK ("subtotalFen" >= 0)
);

CREATE UNIQUE INDEX "sales_order_salesOrderNumber_key" ON "sales_order"("salesOrderNumber");
CREATE INDEX "sales_order_customerId_idx" ON "sales_order"("customerId");
CREATE INDEX "sales_order_creatorId_idx" ON "sales_order"("creatorId");
CREATE INDEX "sales_order_responsibleSalesIdSnapshot_idx" ON "sales_order"("responsibleSalesIdSnapshot");
CREATE INDEX "sales_order_status_updatedAt_idx" ON "sales_order"("status", "updatedAt");
CREATE INDEX "sales_order_createdAt_idx" ON "sales_order"("createdAt");
CREATE UNIQUE INDEX "sales_order_item_salesOrderId_position_key" ON "sales_order_item"("salesOrderId", "position");
CREATE UNIQUE INDEX "sales_order_item_salesOrderId_skuId_key" ON "sales_order_item"("salesOrderId", "skuId");
CREATE INDEX "sales_order_item_skuId_idx" ON "sales_order_item"("skuId");

ALTER TABLE "sales_order"
ADD CONSTRAINT "sales_order_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order"
ADD CONSTRAINT "sales_order_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_item"
ADD CONSTRAINT "sales_order_item_salesOrderId_fkey"
FOREIGN KEY ("salesOrderId") REFERENCES "sales_order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_order_item"
ADD CONSTRAINT "sales_order_item_skuId_fkey"
FOREIGN KEY ("skuId") REFERENCES "sku"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
