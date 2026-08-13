-- Record only confirmed imports. Parsed rows and original files are intentionally
-- excluded; the primary key also makes a preview confirmation one-time-use.
CREATE TABLE "data_import" (
    "id" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_import_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_import_row_count_positive" CHECK ("rowCount" > 0)
);

CREATE INDEX "data_import_actorId_idx" ON "data_import"("actorId");
CREATE INDEX "data_import_confirmedAt_idx" ON "data_import"("confirmedAt");

ALTER TABLE "data_import"
ADD CONSTRAINT "data_import_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
