-- CreateTable
CREATE TABLE "business_audit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceCode" TEXT,
    "reason" TEXT,
    "summary" TEXT,

    CONSTRAINT "business_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_audit_actorId_idx" ON "business_audit"("actorId");

-- CreateIndex
CREATE INDEX "business_audit_occurredAt_idx" ON "business_audit"("occurredAt");

-- AddForeignKey
ALTER TABLE "business_audit" ADD CONSTRAINT "business_audit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep business audit append-only even when accessed outside the application service.
CREATE FUNCTION prevent_business_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'business_audit is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_audit_append_only
BEFORE UPDATE OR DELETE ON "business_audit"
FOR EACH ROW EXECUTE FUNCTION prevent_business_audit_mutation();
