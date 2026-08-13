-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "responsibleSalesId" TEXT NOT NULL,
    "paymentTermDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_payment_term_nonnegative" CHECK ("paymentTermDays" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_customerCode_key" ON "customer"("customerCode");

-- CreateIndex
CREATE INDEX "customer_name_idx" ON "customer"("name");

-- CreateIndex
CREATE INDEX "customer_responsibleSalesId_idx" ON "customer"("responsibleSalesId");

-- CreateIndex
CREATE INDEX "customer_enabled_idx" ON "customer"("enabled");

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_responsibleSalesId_fkey" FOREIGN KEY ("responsibleSalesId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Report whether any current or future business table has a foreign-key row
-- that references the customer. The responsible-sales relation points outward
-- from customer and is therefore intentionally not part of this check.
CREATE FUNCTION customer_has_business_references(target_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    reference RECORD;
    referenced BOOLEAN;
BEGIN
    FOR reference IN
        SELECT
            constraint_record.conrelid::regclass AS relation_name,
            referencing_attribute.attname AS column_name
        FROM pg_constraint AS constraint_record
        JOIN pg_attribute AS referencing_attribute
          ON referencing_attribute.attrelid = constraint_record.conrelid
         AND referencing_attribute.attnum = constraint_record.conkey[1]
        WHERE constraint_record.contype = 'f'
          AND constraint_record.confrelid = 'public.customer'::regclass
          AND cardinality(constraint_record.conkey) = 1
          AND cardinality(constraint_record.confkey) = 1
    LOOP
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
            reference.relation_name,
            reference.column_name
        ) INTO referenced USING target_id;

        IF referenced THEN
            RETURN TRUE;
        END IF;
    END LOOP;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;
