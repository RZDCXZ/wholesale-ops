CREATE TABLE "payment_reversal" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amountFen" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,

    CONSTRAINT "payment_reversal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_reversal_amount_positive" CHECK ("amountFen" > 0),
    CONSTRAINT "payment_reversal_reason_not_blank" CHECK (length(btrim("reason")) > 0)
);

CREATE UNIQUE INDEX "payment_reversal_paymentId_key" ON "payment_reversal"("paymentId");
CREATE UNIQUE INDEX "payment_reversal_idempotencyKey_key" ON "payment_reversal"("idempotencyKey");
CREATE INDEX "payment_reversal_receivableId_reversedAt_idx" ON "payment_reversal"("receivableId", "reversedAt");
CREATE INDEX "payment_reversal_actorId_idx" ON "payment_reversal"("actorId");

ALTER TABLE "payment_reversal"
ADD CONSTRAINT "payment_reversal_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_reversal"
ADD CONSTRAINT "payment_reversal_receivableId_fkey"
FOREIGN KEY ("receivableId") REFERENCES "receivable"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_reversal"
ADD CONSTRAINT "payment_reversal_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- 撤销收款同样是经营事实，只允许追加，禁止原地修改或删除。
CREATE FUNCTION reject_payment_reversal_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'payment reversal is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_reversal_append_only
BEFORE UPDATE OR DELETE ON "payment_reversal"
FOR EACH ROW EXECUTE FUNCTION reject_payment_reversal_mutation();
