-- Preserve paid purchases and allow complimentary usernames issued by admins.
ALTER TABLE "UsernamePurchase"
  DROP CONSTRAINT "UsernamePurchase_price_check",
  ADD CONSTRAINT "UsernamePurchase_price_check" CHECK ("price" >= 0),
  ADD COLUMN "grantedById" INTEGER;

ALTER TABLE "UsernamePurchase" ADD CONSTRAINT "UsernamePurchase_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
