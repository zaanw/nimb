ALTER TABLE "User" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Report" ADD COLUMN "resolvedAt" TIMESTAMP(3);
CREATE INDEX "Report_resolvedAt_id_idx" ON "Report"("resolvedAt", "id");
