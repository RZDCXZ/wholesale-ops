CREATE TYPE "InventoryMovementType" AS ENUM (
    'OPENING',
    'RESERVATION',
    'RELEASE',
    'OUTBOUND'
);

CREATE TABLE "inventory_balance" (
    "skuId" TEXT NOT NULL,
    "onHandQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balance_pkey" PRIMARY KEY ("skuId"),
    CONSTRAINT "inventory_balance_on_hand_nonnegative" CHECK ("onHandQuantity" >= 0),
    CONSTRAINT "inventory_balance_reserved_nonnegative" CHECK ("reservedQuantity" >= 0),
    CONSTRAINT "inventory_balance_available_nonnegative" CHECK ("onHandQuantity" >= "reservedQuantity")
);

CREATE TABLE "inventory_movement" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "onHandDelta" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL,
    "onHandAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "relatedReference" TEXT,
    "dataImportId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_movement_on_hand_after_nonnegative" CHECK ("onHandAfter" >= 0),
    CONSTRAINT "inventory_movement_reserved_after_nonnegative" CHECK ("reservedAfter" >= 0),
    CONSTRAINT "inventory_movement_available_after_nonnegative" CHECK ("onHandAfter" >= "reservedAfter")
);

CREATE INDEX "inventory_movement_skuId_occurredAt_idx" ON "inventory_movement"("skuId", "occurredAt");
CREATE INDEX "inventory_movement_movementType_occurredAt_idx" ON "inventory_movement"("movementType", "occurredAt");
CREATE INDEX "inventory_movement_occurredAt_idx" ON "inventory_movement"("occurredAt");
CREATE INDEX "inventory_movement_relatedType_relatedId_idx" ON "inventory_movement"("relatedType", "relatedId");
CREATE INDEX "inventory_movement_dataImportId_idx" ON "inventory_movement"("dataImportId");
CREATE INDEX "inventory_movement_actorId_idx" ON "inventory_movement"("actorId");

CREATE UNIQUE INDEX "data_import_single_opening_inventory"
ON "data_import" ("importType")
WHERE "importType" = 'OPENING_INVENTORY';

ALTER TABLE "inventory_balance"
ADD CONSTRAINT "inventory_balance_skuId_fkey"
FOREIGN KEY ("skuId") REFERENCES "sku"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movement"
ADD CONSTRAINT "inventory_movement_skuId_fkey"
FOREIGN KEY ("skuId") REFERENCES "sku"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movement"
ADD CONSTRAINT "inventory_movement_dataImportId_fkey"
FOREIGN KEY ("dataImportId") REFERENCES "data_import"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movement"
ADD CONSTRAINT "inventory_movement_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_inventory_movement_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'inventory_movement is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movement_append_only
BEFORE UPDATE OR DELETE ON "inventory_movement"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
