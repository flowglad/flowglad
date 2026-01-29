ALTER TABLE "Purchases" DROP CONSTRAINT "Purchases_DiscountId_Discounts_id_fk";
--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" ADD COLUMN "duration" "DiscountDuration" NOT NULL;--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" ADD COLUMN "numberOfPayments" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "DiscountRedemptions_PurchaseId_unique_idx" ON "DiscountRedemptions" USING btree ("PurchaseId");--> statement-breakpoint
ALTER TABLE "DiscountRedemptions" DROP COLUMN IF EXISTS "amount";--> statement-breakpoint
ALTER TABLE "Purchases" DROP COLUMN IF EXISTS "DiscountId";