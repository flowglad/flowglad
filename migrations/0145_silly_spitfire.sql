ALTER TABLE "Products" DROP CONSTRAINT "Products_defaultStripePriceId_unique";--> statement-breakpoint
ALTER TABLE "ApiKeys" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "FeeCalculations" ADD COLUMN "internalNotes" text;--> statement-breakpoint
ALTER TABLE "Products" DROP COLUMN IF EXISTS "defaultStripePriceId";