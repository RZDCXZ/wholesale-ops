CREATE TYPE "PaymentMethod" AS ENUM (
    'CASH',
    'BANK_TRANSFER',
    'WECHAT',
    'ALIPAY',
    'OTHER'
);

CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_amount_positive" CHECK ("amountFen" > 0)
);

CREATE UNIQUE INDEX "payment_idempotencyKey_key" ON "payment"("idempotencyKey");
CREATE INDEX "payment_receivableId_recordedAt_idx" ON "payment"("receivableId", "recordedAt");
CREATE INDEX "payment_paymentDate_idx" ON "payment"("paymentDate");
CREATE INDEX "payment_actorId_idx" ON "payment"("actorId");

ALTER TABLE "payment"
ADD CONSTRAINT "payment_receivableId_fkey"
FOREIGN KEY ("receivableId") REFERENCES "receivable"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment"
ADD CONSTRAINT "payment_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
