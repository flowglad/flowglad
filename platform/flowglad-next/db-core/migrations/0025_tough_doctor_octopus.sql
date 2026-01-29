DROP INDEX IF EXISTS "Variants_priceMode_idx";--> statement-breakpoint
ALTER TABLE "Variants" ALTER COLUMN "priceType" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Variants_priceType_idx" ON "Variants" USING btree ("priceType");--> statement-breakpoint
ALTER TABLE "Variants" DROP COLUMN IF EXISTS "priceMode";