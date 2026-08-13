CREATE TYPE "ReceivableStatus" AS ENUM (
    'PENDING',
    'PARTIAL',
    'SETTLED'
);

CREATE SEQUENCE "receivable_number_seq";

CREATE TABLE "receivable" (
    "id" TEXT NOT NULL,
    "receivableNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerCodeSnapshot" TEXT NOT NULL,
    "customerNameSnapshot" TEXT NOT NULL,
    "responsibleSalesIdSnapshot" TEXT NOT NULL,
    "originalAmountFen" INTEGER NOT NULL,
    "receivedAmountFen" INTEGER NOT NULL DEFAULT 0,
    "remainingAmountFen" INTEGER NOT NULL,
    "paymentTermDaysSnapshot" INTEGER NOT NULL,
    "outboundAt" TIMESTAMP(3) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivable_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receivable_original_amount_nonnegative" CHECK ("originalAmountFen" >= 0),
    CONSTRAINT "receivable_received_amount_nonnegative" CHECK ("receivedAmountFen" >= 0),
    CONSTRAINT "receivable_remaining_amount_nonnegative" CHECK ("remainingAmountFen" >= 0),
    CONSTRAINT "receivable_received_not_above_original" CHECK ("receivedAmountFen" <= "originalAmountFen"),
    CONSTRAINT "receivable_remaining_matches_amounts" CHECK ("remainingAmountFen" = "originalAmountFen" - "receivedAmountFen"),
    CONSTRAINT "receivable_payment_term_nonnegative" CHECK ("paymentTermDaysSnapshot" >= 0)
);

CREATE UNIQUE INDEX "receivable_receivableNumber_key" ON "receivable"("receivableNumber");
CREATE UNIQUE INDEX "receivable_salesOrderId_key" ON "receivable"("salesOrderId");
CREATE INDEX "receivable_customerId_idx" ON "receivable"("customerId");
CREATE INDEX "receivable_responsibleSalesIdSnapshot_idx" ON "receivable"("responsibleSalesIdSnapshot");
CREATE INDEX "receivable_status_dueDate_idx" ON "receivable"("status", "dueDate");
CREATE INDEX "receivable_outboundAt_idx" ON "receivable"("outboundAt");

ALTER TABLE "receivable"
ADD CONSTRAINT "receivable_salesOrderId_fkey"
FOREIGN KEY ("salesOrderId") REFERENCES "sales_order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivable"
ADD CONSTRAINT "receivable_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
